# Admin de Plataforma + Assinatura Mensal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar à plataforma um admin acima das organizações (papel dev + admins de plataforma), uma conta Mercado Pago geral, e um ciclo de assinatura mensal que libera ou bloqueia uma organização.

**Architecture:** Fastify + Kysely + Postgres, seguindo os módulos já existentes (`apps/api/src/modules/*`). Um módulo novo `admin-plataforma` concentra as rotas do dev/admin de plataforma. A cobrança usa a API de assinaturas recorrentes (preapproval) do Mercado Pago, chamada por um client HTTP fino e testável (`fetch` injetável). O status `organizacoes.status_assinatura` (coluna já existente) passa a ser mantido por um webhook do MP.

**Tech Stack:** TypeScript, Fastify 5, Kysely 0.27, Zod 3, Postgres, vitest, Mercado Pago REST API (preapproval).

**Spec:** `docs/superpowers/specs/2026-09-26-admin-plataforma-e-assinatura-design.md`

## Global Constraints

- Mensalidade: valor único global (não por organização, não por plano), editável só por admin de plataforma.
- Pix não entra na mensalidade — cobrança recorrente é só cartão, via preapproval do Mercado Pago.
- Organizações com `criado_em` anterior ao deploy desta feature recebem `status_assinatura = 'ativa'` (grandfathered) — não pagam.
- Dev é identificado por telefone fixo em variável de ambiente (`PLATAFORMA_DEV_TELEFONE`), nunca por linha de tabela — nunca aparece em nenhuma lista/tela de gerenciamento.
- Só o dev cadastra ou remove admins de plataforma. Entre si, admins de plataforma não removem uns aos outros. Sem limite de quantidade.
- O bloqueio de organização não-`ativa` afeta só duas ações: entrar numa organização (por qualquer via) e criar uma configuração de pelada nova. Todo o resto continua funcionando.
- `organizacoes.status_assinatura` já tem CHECK `in ('trial','ativa','inadimplente','cancelada')` desde `0001_core.sql` — não criar nenhum valor novo, não alterar a constraint.

## Review Focus

- **Segunda via de entrada numa organização sem o mesmo bloqueio:** `POST /organizacoes/:id/entrar` (link direto) faz exatamente o que `POST /organizacoes/entrar-por-codigo` faz — insere em `organizacao_membros`. O spec só citou o segundo; se só um dos dois for bloqueado, dá pra contornar o bloqueio inteiro pelo outro. Task 14 cobre os dois.
- **Webhook do Mercado Pago sem validação de assinatura:** o endpoint `/webhooks/mercadopago/assinatura` muda `status_assinatura`, que decide se uma organização paga ou não. Sem checar a assinatura HMAC do MP (`x-signature`), qualquer POST externo (mesmo sem saber o `preapproval_id` verdadeiro, se ele adivinhar/enumerar) poderia liberar ou derrubar uma organização de graça. Task 8 implementa a verificação; Task 13 recusa qualquer webhook que não bata.
- **Webhook processado mais de uma vez (retry do MP):** o Mercado Pago reenvia o mesmo evento se não receber 200 a tempo. Sem idempotência por `mp_preapproval_id` + `periodo_referencia`, a mesma cobrança vira duas linhas em `assinaturas`. Task 13 usa upsert (`on conflict`) para isso.
- **`PLATAFORMA_DEV_TELEFONE` ausente no deploy:** `env.ts` já derruba a API inteira se uma variável obrigatória faltar (foi exatamente o que quebrou a migração de banco no deploy anterior, com `DATABASE_URL`). Task 5 marca essa variável como obrigatória — **precisa estar configurada no Coolify antes do primeiro deploy desta feature**, senão a API não sobe. Isso fica registrado como aviso explícito na última task.
- **Comparação de telefone do dev sem normalizar:** `profiles.telefone` é gravado sempre no formato canônico `+55DDDXXXXXXXXX` (`normalizarTelefone`). Se `PLATAFORMA_DEV_TELEFONE` for lido cru do env sem passar pela mesma normalização, a comparação nunca bate e ninguém nunca é reconhecido como dev. Task 7 normaliza os dois lados antes de comparar.

---

## Task 1: Migration — tabelas novas + backfill

**Files:**
- Create: `db/migrations/0010_admin_plataforma.sql`

**Interfaces:**
- Produces: tabelas `plataforma_admins`, `plataforma_config`, `assinaturas`; todas as organizações existentes ganham `status_assinatura = 'ativa'`.

- [ ] **Step 1: Escrever a migration**

```sql
-- =============================================================================
-- Admin de plataforma + assinatura mensal das organizações.
-- =============================================================================
-- Dev (identificado por telefone em env, nunca em tabela) cadastra/remove
-- admins de plataforma; entre si, admins de plataforma não se removem.
-- =============================================================================

create table plataforma_admins (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid not null unique references profiles (id) on delete cascade,
  cadastrado_por uuid not null references profiles (id),
  criado_em      timestamptz not null default now()
);

-- Linha única (id fixo = 1) com a configuração global da plataforma.
create table plataforma_config (
  id                            smallint primary key default 1 check (id = 1),
  mensalidade_valor_centavos    integer not null default 4990,
  mp_geral_token_cipher         bytea,
  mp_geral_token_nonce          bytea,
  mp_geral_token_atualizado_em  timestamptz,
  atualizado_em                 timestamptz not null default now()
);
insert into plataforma_config (id) values (1);

create table assinaturas (
  id                  uuid primary key default gen_random_uuid(),
  organizacao_id      uuid not null references organizacoes (id) on delete cascade,
  mp_preapproval_id   text not null,
  mp_payment_id       text,
  periodo_referencia  date not null,
  valor_centavos      integer not null,
  status              text not null default 'pendente'
    check (status in ('pendente', 'aprovado', 'atrasado', 'cancelado')),
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now()
);

-- Idempotência do webhook: um preapproval só tem uma linha por período.
create unique index idx_assinaturas_preapproval_periodo
  on assinaturas (mp_preapproval_id, periodo_referencia);

create index idx_assinaturas_organizacao on assinaturas (organizacao_id);

-- Grandfathering: organizações já existentes não pagam por enquanto.
update organizacoes set status_assinatura = 'ativa' where status_assinatura = 'trial';
```

- [ ] **Step 2: Rodar a migration localmente**

Run: `npm run db:migrate`
Expected: saída inclui `→ 0010_admin_plataforma.sql ... ok`.

- [ ] **Step 2b: Verificar o backfill**

Run: `psql "$DATABASE_URL" -c "select status_assinatura, count(*) from organizacoes group by 1;"`
Expected: toda organização que já existia antes desta migration aparece como `ativa` (nenhuma linha com `trial` além de organizações criadas depois deste ponto, se houver).

- [ ] **Step 3: Regenerar o bootstrap**

Run: `npm run db:bootstrap:build`
Expected: `db/bootstrap.sql` é reescrito incluindo a migration nova (arquivo é gerado, não editar à mão).

- [ ] **Step 4: Commit**

```bash
git add db/migrations/0010_admin_plataforma.sql db/bootstrap.sql
git commit -m "db: tabelas de admin de plataforma e assinatura + grandfathering"
```

---

## Task 2: Tipos Kysely das tabelas novas

**Files:**
- Modify: `apps/api/src/db/schema.ts`

**Interfaces:**
- Produces: `PlataformaAdminsTable`, `PlataformaConfigTable`, `AssinaturasTable`, registradas em `Database`.

- [ ] **Step 1: Adicionar as interfaces de tabela**

Adicionar antes de `export interface Database {` (depois de `SumulaEventosTable`/`VEventosJogadorView`, mantendo a ordem em que as tabelas aparecem no arquivo):

```typescript
export interface PlataformaAdminsTable {
  id: Generated<string>;
  profile_id: string;
  cadastrado_por: string;
  criado_em: Generated<Timestamp>;
}

export interface PlataformaConfigTable {
  id: Generated<number>;
  mensalidade_valor_centavos: number;
  mp_geral_token_cipher: Buffer | null;
  mp_geral_token_nonce: Buffer | null;
  mp_geral_token_atualizado_em: Timestamp | null;
  atualizado_em: Generated<Timestamp>;
}

export interface AssinaturasTable {
  id: Generated<string>;
  organizacao_id: string;
  mp_preapproval_id: string;
  mp_payment_id: string | null;
  periodo_referencia: ColumnType<string, string, string>;
  valor_centavos: number;
  status: 'pendente' | 'aprovado' | 'atrasado' | 'cancelado';
  criado_em: Generated<Timestamp>;
  atualizado_em: Generated<Timestamp>;
}
```

- [ ] **Step 2: Registrar em `Database`**

```typescript
export interface Database {
  // ... entradas existentes ...
  plataforma_admins: PlataformaAdminsTable;
  plataforma_config: PlataformaConfigTable;
  assinaturas: AssinaturasTable;
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck --workspace @resenha05/api`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/db/schema.ts
git commit -m "api: tipos Kysely das tabelas de admin de plataforma"
```

---

## Task 3: Schemas Zod e tipos compartilhados

**Files:**
- Create: `packages/shared/src/schemas/admin-plataforma.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces: `StatusAssinatura`, `configurarMensalidadeSchema`, `conectarMercadoPagoGeralSchema`, `cadastrarAdminPlataformaSchema`.

- [ ] **Step 1: Criar o arquivo de schemas**

```typescript
// packages/shared/src/schemas/admin-plataforma.ts
import { z } from 'zod';

export const STATUS_ASSINATURA = ['trial', 'ativa', 'inadimplente', 'cancelada'] as const;
export type StatusAssinatura = (typeof STATUS_ASSINATURA)[number];

export const configurarMensalidadeSchema = z.object({
  valorCentavos: z.number().int().min(100, 'Valor mínimo de R$ 1,00.').max(1_000_000),
});

export const conectarMercadoPagoGeralSchema = z.object({
  accessToken: z
    .string()
    .trim()
    .min(20, 'O Access Token de produção parece curto demais.')
    .max(400),
});

export const cadastrarAdminPlataformaSchema = z.object({
  profileId: z.string().uuid(),
});
```

- [ ] **Step 2: Exportar no índice do pacote**

Em `packages/shared/src/index.ts`, junto das outras linhas `export * from './schemas/...'`:

```typescript
export * from './schemas/admin-plataforma.js';
```

- [ ] **Step 3: Build do pacote**

Run: `npm run build --workspace @resenha05/shared`
Expected: sem erros; `packages/shared/dist/schemas/admin-plataforma.js` existe.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/schemas/admin-plataforma.ts packages/shared/src/index.ts
git commit -m "shared: schemas e tipos de admin de plataforma/assinatura"
```

---

## Task 4: Lógica pura de assinatura (gating + interpretação de webhook)

**Files:**
- Create: `packages/shared/src/assinatura.ts`
- Test: `packages/shared/src/assinatura.test.ts`

**Interfaces:**
- Consumes: `StatusAssinatura` (Task 3).
- Produces: `organizacaoLiberada(status: StatusAssinatura): boolean`, `interpretarStatusPreapproval(statusMp: 'authorized' | 'paused' | 'cancelled' | 'pending'): { statusAssinatura: StatusAssinatura; statusCiclo: 'aprovado' | 'atrasado' | 'cancelado' }`.

- [ ] **Step 1: Escrever os testes primeiro**

```typescript
// packages/shared/src/assinatura.test.ts
import { describe, it, expect } from 'vitest';
import { organizacaoLiberada, interpretarStatusPreapproval } from './assinatura.js';

describe('organizacaoLiberada', () => {
  it('libera só quando ativa', () => {
    expect(organizacaoLiberada('ativa')).toBe(true);
    expect(organizacaoLiberada('trial')).toBe(false);
    expect(organizacaoLiberada('inadimplente')).toBe(false);
    expect(organizacaoLiberada('cancelada')).toBe(false);
  });
});

describe('interpretarStatusPreapproval', () => {
  it('authorized vira ativa/aprovado', () => {
    expect(interpretarStatusPreapproval('authorized')).toEqual({
      statusAssinatura: 'ativa',
      statusCiclo: 'aprovado',
    });
  });

  it('pending e paused viram inadimplente/atrasado', () => {
    expect(interpretarStatusPreapproval('pending')).toEqual({
      statusAssinatura: 'inadimplente',
      statusCiclo: 'atrasado',
    });
    expect(interpretarStatusPreapproval('paused')).toEqual({
      statusAssinatura: 'inadimplente',
      statusCiclo: 'atrasado',
    });
  });

  it('cancelled vira cancelada/cancelado', () => {
    expect(interpretarStatusPreapproval('cancelled')).toEqual({
      statusAssinatura: 'cancelada',
      statusCiclo: 'cancelado',
    });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm run test --workspace @resenha05/shared`
Expected: FAIL — `Cannot find module './assinatura.js'`.

- [ ] **Step 3: Implementar**

```typescript
// packages/shared/src/assinatura.ts
import type { StatusAssinatura } from './schemas/admin-plataforma.js';

/** Só organização com mensalidade em dia pode receber novos membros ou peladas. */
export function organizacaoLiberada(status: StatusAssinatura): boolean {
  return status === 'ativa';
}

export type StatusPreapprovalMp = 'authorized' | 'paused' | 'cancelled' | 'pending';
export type StatusCicloAssinatura = 'aprovado' | 'atrasado' | 'cancelado';

/**
 * Mapeia o status do preapproval do Mercado Pago pro nosso modelo. Não
 * distingue eventos de pagamento por ciclo — v1 deriva tudo do status do
 * preapproval em si (ver spec).
 */
export function interpretarStatusPreapproval(
  statusMp: StatusPreapprovalMp,
): { statusAssinatura: StatusAssinatura; statusCiclo: StatusCicloAssinatura } {
  if (statusMp === 'authorized') {
    return { statusAssinatura: 'ativa', statusCiclo: 'aprovado' };
  }
  if (statusMp === 'cancelled') {
    return { statusAssinatura: 'cancelada', statusCiclo: 'cancelado' };
  }
  // 'pending' | 'paused'
  return { statusAssinatura: 'inadimplente', statusCiclo: 'atrasado' };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm run test --workspace @resenha05/shared`
Expected: PASS, todos os testes de `assinatura.test.ts`.

- [ ] **Step 5: Exportar no índice e buildar**

Adicionar em `packages/shared/src/index.ts`: `export * from './assinatura.js';`

Run: `npm run build --workspace @resenha05/shared`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/assinatura.ts packages/shared/src/assinatura.test.ts packages/shared/src/index.ts
git commit -m "shared: lógica pura de gating e interpretação de webhook de assinatura"
```

---

## Task 5: Variáveis de ambiente

**Files:**
- Modify: `apps/api/src/env.ts`

**Interfaces:**
- Produces: `env.PLATAFORMA_DEV_TELEFONE` (obrigatória), `env.MERCADOPAGO_WEBHOOK_SECRET` (opcional). Remove `env.MERCADOPAGO_PLATAFORMA_TOKEN` (nunca foi usado em código nenhum — substituído pelo token gravado em `plataforma_config` via Task 11).

- [ ] **Step 1: Editar o schema de env**

Remover a linha:
```typescript
  MERCADOPAGO_PLATAFORMA_TOKEN: z.string().optional(),
```

Adicionar, junto das outras variáveis relacionadas a Mercado Pago:
```typescript
  // Telefone canônico (+55DDDXXXXXXXXX) da conta "dev" — único que cadastra
  // ou remove admins de plataforma. Ver apps/api/src/plugins/auth.ts.
  PLATAFORMA_DEV_TELEFONE: z.string().min(10, 'PLATAFORMA_DEV_TELEFONE é obrigatória.'),

  // Segredo do webhook de assinatura no painel do Mercado Pago — valida o
  // header x-signature. Sem isso, o endpoint de webhook recusa tudo.
  MERCADOPAGO_WEBHOOK_SECRET: z.string().optional(),
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --workspace @resenha05/api`
Expected: erro em qualquer lugar que ainda referencie `MERCADOPAGO_PLATAFORMA_TOKEN` (não deveria haver nenhum — foi confirmado sem uso antes deste plano).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/env.ts
git commit -m "api: env de admin de plataforma; remove MERCADOPAGO_PLATAFORMA_TOKEN morta"
```

---

## Task 6: `papelPlataforma` na sessão do usuário

**Files:**
- Modify: `packages/shared/src/telefone.ts`
- Test: `packages/shared/src/telefone.test.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/api/src/lib/sessao.ts`

**Interfaces:**
- Consumes: tabela `plataforma_admins` (Task 1/2), `env.PLATAFORMA_DEV_TELEFONE` (Task 5).
- Produces: `ehTelefoneDev(telefoneCanonico: string, devTelefoneEnv: string): boolean`, `SessaoUsuario.papelPlataforma: 'dev' | 'admin' | null`.

- [ ] **Step 1: Teste da comparação de telefone (a parte que pode silenciosamente nunca bater)**

`profiles.telefone` é sempre gravado no formato canônico `+55DDDXXXXXXXXX`, mas
`PLATAFORMA_DEV_TELEFONE` vem cru do `.env` — se um dos dois lados não for
normalizado antes de comparar, a igualdade nunca bate e ninguém nunca vira
dev. Testa isso isoladamente, sem precisar de banco:

```typescript
// packages/shared/src/telefone.test.ts (arquivo pode já não existir — criar)
import { describe, it, expect } from 'vitest';
import { ehTelefoneDev } from './telefone.js';

describe('ehTelefoneDev', () => {
  it('bate mesmo se o env tiver o telefone em formato solto', () => {
    expect(ehTelefoneDev('+5511912345678', '11 91234-5678')).toBe(true);
    expect(ehTelefoneDev('+5511912345678', '+5511912345678')).toBe(true);
  });

  it('não bate para telefone diferente', () => {
    expect(ehTelefoneDev('+5511912345678', '11 90000-0000')).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm run test --workspace @resenha05/shared`
Expected: FAIL — `ehTelefoneDev` não existe.

- [ ] **Step 3: Implementar `ehTelefoneDev`**

Em `packages/shared/src/telefone.ts`, junto das outras funções de telefone:

```typescript
/** Compara um telefone já canônico com o valor cru de PLATAFORMA_DEV_TELEFONE. */
export function ehTelefoneDev(telefoneCanonico: string, devTelefoneEnv: string): boolean {
  return telefoneCanonico === normalizarTelefone(devTelefoneEnv);
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm run test --workspace @resenha05/shared`
Expected: PASS.

- [ ] **Step 5: Adicionar o campo ao tipo `SessaoUsuario`**

Em `packages/shared/src/index.ts`:
```typescript
export interface SessaoUsuario {
  id: string;
  nome: string | null;
  telefone: string;
  fotoUrl: string | null;
  fotoRecortada: boolean;
  timeCoracao: string | null;
  telefoneVerificado: boolean;
  organizacoes: OrganizacaoDoUsuario[];
  papelPlataforma: 'dev' | 'admin' | null;
}
```

- [ ] **Step 6: Popular em `carregarUsuario`**

Em `apps/api/src/lib/sessao.ts`, importar `ehTelefoneDev` e `env`, e calcular o papel:

```typescript
import { ehTelefoneDev, type SessaoUsuario } from '@resenha05/shared';
import { env } from '../env.js';
// ... imports existentes continuam ...

export async function carregarUsuario(profileId: string): Promise<SessaoUsuario> {
  const p = await db
    .selectFrom('profiles')
    .select([
      'id',
      'nome',
      'telefone',
      'foto_url',
      'foto_recortada',
      'time_coracao',
      'telefone_verificado_em',
    ])
    .where('id', '=', profileId)
    .executeTakeFirst();

  if (!p) throw erro.naoAutorizado('Sessão inválida.');

  const orgs = await db
    .selectFrom('organizacao_membros as m')
    .innerJoin('organizacoes as o', 'o.id', 'm.organizacao_id')
    .select(['o.id as id', 'o.nome as nome', 'o.codigo as codigo', 'm.papel as papel', 'm.estrelas as estrelas'])
    .where('m.profile_id', '=', profileId)
    .where('m.ativo', '=', true)
    .orderBy('o.nome')
    .execute();

  const papelPlataforma = await resolverPapelPlataforma(p.telefone, profileId);

  return {
    id: p.id,
    nome: p.nome,
    telefone: p.telefone,
    fotoUrl: p.foto_url,
    fotoRecortada: p.foto_recortada,
    timeCoracao: p.time_coracao,
    telefoneVerificado: p.telefone_verificado_em != null,
    organizacoes: orgs.map((o) => ({
      id: o.id,
      nome: o.nome,
      codigo: o.codigo,
      papel: o.papel,
      estrelas: o.estrelas,
    })),
    papelPlataforma,
  };
}

/** 'dev' bate por telefone (env); 'admin' bate por linha em plataforma_admins. */
async function resolverPapelPlataforma(
  telefoneCanonico: string,
  profileId: string,
): Promise<'dev' | 'admin' | null> {
  if (ehTelefoneDev(telefoneCanonico, env.PLATAFORMA_DEV_TELEFONE)) return 'dev';
  const admin = await db
    .selectFrom('plataforma_admins')
    .select('id')
    .where('profile_id', '=', profileId)
    .executeTakeFirst();
  return admin ? 'admin' : null;
}
```

- [ ] **Step 7: Build e typecheck**

Run: `npm run build --workspace @resenha05/shared && npm run typecheck --workspace @resenha05/api`
Expected: sem erros.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/telefone.ts packages/shared/src/telefone.test.ts packages/shared/src/index.ts apps/api/src/lib/sessao.ts
git commit -m "api: resolve papelPlataforma (dev/admin) na sessão do usuário"
```

---

## Task 7: Guards de autorização (dev / admin de plataforma)

**Files:**
- Modify: `apps/api/src/plugins/auth.ts`
- Test: `apps/api/src/plugins/auth.test.ts`

**Interfaces:**
- Consumes: `SessaoUsuario.papelPlataforma` (Task 6).
- Produces: `exigirAdminPlataforma(req): void`, `exigirDev(req): void`.

- [ ] **Step 1: Escrever os testes primeiro**

Esses guards só olham `req.usuario.papelPlataforma`, então dá pra testar com um objeto `usuario` mínimo, sem subir o Fastify nem o banco:

```typescript
// apps/api/src/plugins/auth.test.ts
import { describe, it, expect } from 'vitest';
import type { FastifyRequest } from 'fastify';
import { exigirAdminPlataforma, exigirDev } from './auth.js';

function reqCom(papelPlataforma: 'dev' | 'admin' | null): FastifyRequest {
  return { usuario: { papelPlataforma } } as unknown as FastifyRequest;
}

describe('exigirAdminPlataforma', () => {
  it('passa para dev e admin', () => {
    expect(() => exigirAdminPlataforma(reqCom('dev'))).not.toThrow();
    expect(() => exigirAdminPlataforma(reqCom('admin'))).not.toThrow();
  });

  it('lança 403 para jogador comum', () => {
    expect(() => exigirAdminPlataforma(reqCom(null))).toThrow('permissão');
  });
});

describe('exigirDev', () => {
  it('passa só para dev', () => {
    expect(() => exigirDev(reqCom('dev'))).not.toThrow();
  });

  it('lança 403 para admin de plataforma comum', () => {
    expect(() => exigirDev(reqCom('admin'))).toThrow();
  });

  it('lança 403 para jogador comum', () => {
    expect(() => exigirDev(reqCom(null))).toThrow();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm run test --workspace @resenha05/api`
Expected: FAIL — `exigirAdminPlataforma`/`exigirDev` não exportados.

- [ ] **Step 3: Implementar os guards**

No fim de `apps/api/src/plugins/auth.ts`, junto de `exigirMembro`/`exigirAdmin`/`exigirDono`:

```typescript
export function exigirAdminPlataforma(req: FastifyRequest): void {
  if (req.usuario.papelPlataforma == null) {
    throw erro.proibido('Ação restrita a administradores da plataforma.');
  }
}

export function exigirDev(req: FastifyRequest): void {
  if (req.usuario.papelPlataforma !== 'dev') {
    throw erro.proibido('Ação restrita ao desenvolvedor da plataforma.');
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm run test --workspace @resenha05/api`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/plugins/auth.ts apps/api/src/plugins/auth.test.ts
git commit -m "api: guards exigirAdminPlataforma e exigirDev"
```

---

## Task 8: Cliente Mercado Pago (preapproval) + verificação de webhook

**Files:**
- Create: `apps/api/src/lib/mercadopago-preapproval.ts`
- Create: `apps/api/src/lib/mercadopago-webhook.ts`
- Test: `apps/api/src/lib/mercadopago-preapproval.test.ts`
- Test: `apps/api/src/lib/mercadopago-webhook.test.ts`

**Interfaces:**
- Produces: `criarPreapproval(input, fetchFn?)`, `buscarPreapproval(token, preapprovalId, fetchFn?)`, `verificarAssinaturaWebhook(input): boolean`.

- [ ] **Step 1: Testes do client de preapproval**

```typescript
// apps/api/src/lib/mercadopago-preapproval.test.ts
import { describe, it, expect, vi } from 'vitest';
import { criarPreapproval, buscarPreapproval } from './mercadopago-preapproval.js';

describe('criarPreapproval', () => {
  it('chama a API do MP e devolve id + link de checkout', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'pre_123', init_point: 'https://mp.example/checkout/pre_123' }),
    });

    const resultado = await criarPreapproval(
      {
        accessToken: 'token-abc',
        reason: 'Mensalidade Resenha05 - Racha do Zé',
        externalReference: 'org-1:2026-10-01',
        payerEmail: 'dono@example.com',
        valorCentavos: 4990,
        backUrl: 'https://resenha05.coffetech.com.br/org/1/assinatura/retorno',
      },
      fetchFn as unknown as typeof fetch,
    );

    expect(resultado).toEqual({ id: 'pre_123', initPoint: 'https://mp.example/checkout/pre_123' });
    const [url, opcoes] = fetchFn.mock.calls[0];
    expect(url).toBe('https://api.mercadopago.com/preapproval');
    expect(opcoes.headers.Authorization).toBe('Bearer token-abc');
    const corpo = JSON.parse(opcoes.body);
    expect(corpo.auto_recurring.transaction_amount).toBe(49.9);
    expect(corpo.auto_recurring.frequency_type).toBe('months');
  });

  it('lança erro claro quando o MP recusa', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ message: 'invalid access token' }),
    });
    await expect(
      criarPreapproval(
        {
          accessToken: 'token-invalido',
          reason: 'x',
          externalReference: 'x',
          payerEmail: 'x@x.com',
          valorCentavos: 100,
          backUrl: 'https://x.com',
        },
        fetchFn as unknown as typeof fetch,
      ),
    ).rejects.toThrow('invalid access token');
  });
});

describe('buscarPreapproval', () => {
  it('devolve o status e o valor atuais do preapproval', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'pre_123',
        status: 'authorized',
        external_reference: 'org-1:2026-10-01',
        auto_recurring: { transaction_amount: 49.9 },
      }),
    });
    const detalhe = await buscarPreapproval('token-abc', 'pre_123', fetchFn as unknown as typeof fetch);
    expect(detalhe).toEqual({
      id: 'pre_123',
      status: 'authorized',
      externalReference: 'org-1:2026-10-01',
      valorCentavos: 4990,
    });
    expect(fetchFn.mock.calls[0][0]).toBe('https://api.mercadopago.com/preapproval/pre_123');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm run test --workspace @resenha05/api`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar o client de preapproval**

```typescript
// apps/api/src/lib/mercadopago-preapproval.ts

export interface CriarPreapprovalInput {
  accessToken: string;
  reason: string;
  externalReference: string;
  payerEmail: string;
  valorCentavos: number;
  backUrl: string;
}

export interface PreapprovalCriado {
  id: string;
  initPoint: string;
}

export interface PreapprovalDetalhe {
  id: string;
  status: 'authorized' | 'paused' | 'cancelled' | 'pending';
  externalReference: string;
  valorCentavos: number;
}

const BASE_URL = 'https://api.mercadopago.com/preapproval';

async function corpoDeErro(resp: { json: () => Promise<unknown> }): Promise<string> {
  try {
    const j = (await resp.json()) as { message?: string };
    return j.message ?? 'Erro desconhecido do Mercado Pago.';
  } catch {
    return 'Erro desconhecido do Mercado Pago.';
  }
}

/** Cria uma assinatura recorrente (preapproval) no Mercado Pago. */
export async function criarPreapproval(
  input: CriarPreapprovalInput,
  fetchFn: typeof fetch = fetch,
): Promise<PreapprovalCriado> {
  const resp = await fetchFn(BASE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      reason: input.reason,
      external_reference: input.externalReference,
      payer_email: input.payerEmail,
      back_url: input.backUrl,
      status: 'pending',
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: input.valorCentavos / 100,
        currency_id: 'BRL',
      },
    }),
  });
  if (!resp.ok) throw new Error(await corpoDeErro(resp));
  const j = (await resp.json()) as { id: string; init_point: string };
  return { id: j.id, initPoint: j.init_point };
}

/** Busca o status atual de um preapproval (usado ao processar o webhook). */
export async function buscarPreapproval(
  accessToken: string,
  preapprovalId: string,
  fetchFn: typeof fetch = fetch,
): Promise<PreapprovalDetalhe> {
  const resp = await fetchFn(`${BASE_URL}/${preapprovalId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) throw new Error(await corpoDeErro(resp));
  const j = (await resp.json()) as {
    id: string;
    status: PreapprovalDetalhe['status'];
    external_reference: string;
    auto_recurring: { transaction_amount: number };
  };
  return {
    id: j.id,
    status: j.status,
    externalReference: j.external_reference,
    valorCentavos: Math.round(j.auto_recurring.transaction_amount * 100),
  };
}
```

*Nota: nomes de campo conferidos contra a documentação pública do Mercado
Pago (API de Preapproval) em set/2026 — revalide contra o painel/sandbox
real do MP antes de ativar em produção, como em qualquer integração de
pagamento nova.*

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm run test --workspace @resenha05/api`
Expected: PASS nos testes de `mercadopago-preapproval.test.ts`.

- [ ] **Step 5: Testes da verificação de webhook**

```typescript
// apps/api/src/lib/mercadopago-webhook.test.ts
import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verificarAssinaturaWebhook } from './mercadopago-webhook.js';

function assinar(secret: string, dataId: string, requestId: string, ts: string): string {
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac('sha256', secret).update(manifest).digest('hex');
  return `ts=${ts},v1=${v1}`;
}

describe('verificarAssinaturaWebhook', () => {
  it('aceita uma assinatura válida', () => {
    const xSignature = assinar('segredo-123', 'pre_1', 'req-1', '1700000000');
    expect(
      verificarAssinaturaWebhook({
        secret: 'segredo-123',
        dataId: 'pre_1',
        xRequestId: 'req-1',
        xSignature,
      }),
    ).toBe(true);
  });

  it('recusa assinatura com segredo errado', () => {
    const xSignature = assinar('segredo-errado', 'pre_1', 'req-1', '1700000000');
    expect(
      verificarAssinaturaWebhook({
        secret: 'segredo-123',
        dataId: 'pre_1',
        xRequestId: 'req-1',
        xSignature,
      }),
    ).toBe(false);
  });

  it('recusa header ausente ou mal formado', () => {
    expect(
      verificarAssinaturaWebhook({ secret: 'segredo-123', dataId: 'pre_1', xRequestId: 'req-1', xSignature: '' }),
    ).toBe(false);
    expect(
      verificarAssinaturaWebhook({
        secret: 'segredo-123',
        dataId: 'pre_1',
        xRequestId: 'req-1',
        xSignature: 'lixo-sem-formato',
      }),
    ).toBe(false);
  });
});
```

- [ ] **Step 6: Rodar e confirmar que falha**

Run: `npm run test --workspace @resenha05/api`
Expected: FAIL — módulo não existe.

- [ ] **Step 7: Implementar a verificação**

```typescript
// apps/api/src/lib/mercadopago-webhook.ts
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface VerificarAssinaturaInput {
  secret: string;
  dataId: string;
  xRequestId: string;
  xSignature: string;
}

/**
 * Valida o header x-signature do webhook de assinaturas do Mercado Pago.
 * Formato: "ts=<timestamp>,v1=<hmac-sha256 hex>", HMAC sobre
 * "id:<dataId>;request-id:<xRequestId>;ts:<ts>;" (doc pública do MP).
 */
export function verificarAssinaturaWebhook(input: VerificarAssinaturaInput): boolean {
  const partes = Object.fromEntries(
    input.xSignature.split(',').map((p) => p.trim().split('=') as [string, string]),
  );
  const ts = partes.ts;
  const v1 = partes.v1;
  if (!ts || !v1) return false;

  const manifest = `id:${input.dataId};request-id:${input.xRequestId};ts:${ts};`;
  const esperado = createHmac('sha256', input.secret).update(manifest).digest('hex');

  const a = Buffer.from(v1, 'hex');
  const b = Buffer.from(esperado, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
```

- [ ] **Step 8: Rodar e confirmar que passa**

Run: `npm run test --workspace @resenha05/api`
Expected: PASS em todos os testes de `mercadopago-webhook.test.ts`.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/lib/mercadopago-preapproval.ts apps/api/src/lib/mercadopago-preapproval.test.ts \
        apps/api/src/lib/mercadopago-webhook.ts apps/api/src/lib/mercadopago-webhook.test.ts
git commit -m "api: client de preapproval do Mercado Pago + verificação de webhook"
```

---

## Task 9: Admin de plataforma — participantes e organizações

**Files:**
- Create: `apps/api/src/modules/admin-plataforma/rotas.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Consumes: `exigirAdminPlataforma` (Task 7).
- Produces: módulo `rotasAdminPlataforma` (registrado nesta task; outras tasks do mesmo módulo adicionam rotas ao mesmo arquivo).

- [ ] **Step 1: Criar o módulo com as duas listagens**

```typescript
// apps/api/src/modules/admin-plataforma/rotas.ts
import type { FastifyPluginAsync } from 'fastify';
import { db } from '../../db/index.js';
import { exigirAdminPlataforma } from '../../plugins/auth.js';

export const rotasAdminPlataforma: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.autenticar);
  app.addHook('preHandler', async (req) => exigirAdminPlataforma(req));

  app.get('/admin/participantes', async (req) => {
    const q = ((req.query as { q?: string }).q ?? '').trim();
    const digitos = q.replace(/\D/g, '');

    let query = db
      .selectFrom('profiles')
      .select(['id as profileId', 'nome', 'telefone', 'foto_url as fotoUrl', 'created_at as criadoEm'])
      .orderBy('created_at', 'desc')
      .limit(100);

    if (q.length >= 2) {
      query = query.where((eb) => {
        const condicoes = [eb('nome', 'ilike', `%${q}%`)];
        if (digitos.length > 0) condicoes.push(eb('telefone', 'like', `%${digitos}%`));
        return eb.or(condicoes);
      });
    }

    return query.execute();
  });

  app.get('/admin/organizacoes', async (req) => {
    const q = ((req.query as { q?: string }).q ?? '').trim();

    let query = db
      .selectFrom('organizacoes')
      .select(['id', 'nome', 'codigo', 'status_assinatura as statusAssinatura', 'criado_em as criadoEm'])
      .orderBy('criado_em', 'desc')
      .limit(100);

    if (q.length >= 2) {
      query = query.where('nome', 'ilike', `%${q}%`);
    }

    return query.execute();
  });
};
```

- [ ] **Step 2: Registrar o módulo em `app.ts`**

```typescript
import { rotasAdminPlataforma } from './modules/admin-plataforma/rotas.js';
// ...
      await api.register(rotasCartinha);
      await api.register(rotasAdminPlataforma);
```

- [ ] **Step 3: Typecheck e build**

Run: `npm run typecheck --workspace @resenha05/api`
Expected: sem erros.

- [ ] **Step 4: Testar manualmente**

Suba a API localmente (`npm run dev:api`), faça login com uma conta cujo telefone bate com `PLATAFORMA_DEV_TELEFONE`, e confirme:
```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/admin/participantes
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/admin/organizacoes
```
Expected: listas JSON; com um token de usuário comum, ambos devolvem 403.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/admin-plataforma/rotas.ts apps/api/src/app.ts
git commit -m "api: rotas de admin de plataforma — participantes e organizações"
```

---

## Task 10: Admin de plataforma — configurações (mensalidade + conta MP geral)

**Files:**
- Modify: `apps/api/src/modules/admin-plataforma/rotas.ts`

**Interfaces:**
- Consumes: `configurarMensalidadeSchema`, `conectarMercadoPagoGeralSchema` (Task 3); `cifrarToken` (`apps/api/src/lib/cripto.ts`, já existe).

- [ ] **Step 1: Adicionar os imports**

```typescript
import { configurarMensalidadeSchema, conectarMercadoPagoGeralSchema } from '@resenha05/shared';
import { validar } from '../../lib/validar.js';
import { erro } from '../../lib/erros.js';
import { cifrarToken } from '../../lib/cripto.js';
```

- [ ] **Step 2: Adicionar as rotas de configuração**

```typescript
  app.get('/admin/configuracoes', async () => {
    const cfg = await db
      .selectFrom('plataforma_config')
      .select(['mensalidade_valor_centavos as mensalidadeValorCentavos', 'mp_geral_token_atualizado_em as mpGeralAtualizadoEm'])
      .where('id', '=', 1)
      .executeTakeFirstOrThrow();
    return {
      mensalidadeValorCentavos: cfg.mensalidadeValorCentavos,
      mercadoPagoConectado: cfg.mpGeralAtualizadoEm != null,
      mpGeralAtualizadoEm: cfg.mpGeralAtualizadoEm,
    };
  });

  app.put('/admin/configuracoes', async (req) => {
    const { valorCentavos } = validar(configurarMensalidadeSchema, req.body);
    await db
      .updateTable('plataforma_config')
      .set({ mensalidade_valor_centavos: valorCentavos, atualizado_em: new Date() })
      .where('id', '=', 1)
      .execute();
    return { ok: true };
  });

  app.post('/admin/mercadopago', async (req) => {
    const { accessToken } = validar(conectarMercadoPagoGeralSchema, req.body);
    let cipher: Buffer;
    let nonce: Buffer;
    try {
      ({ cipher, nonce } = cifrarToken(accessToken));
    } catch {
      throw erro.invalido('Servidor sem chave de criptografia configurada (RESENHA05_ENC_KEY).');
    }
    await db
      .updateTable('plataforma_config')
      .set({
        mp_geral_token_cipher: cipher,
        mp_geral_token_nonce: nonce,
        mp_geral_token_atualizado_em: new Date(),
        atualizado_em: new Date(),
      })
      .where('id', '=', 1)
      .execute();
    return { ok: true };
  });
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck --workspace @resenha05/api`
Expected: sem erros.

- [ ] **Step 4: Testar manualmente**

```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/admin/configuracoes
curl -X PUT -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"valorCentavos": 5990}' http://localhost:3000/api/admin/configuracoes
```
Expected: primeira chamada devolve `mensalidadeValorCentavos: 4990` (default da migration); depois do PUT, uma nova consulta devolve `5990`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/admin-plataforma/rotas.ts
git commit -m "api: rotas de configuração — mensalidade e conta MP geral"
```

---

## Task 11: Admin de plataforma — gerenciar admins de plataforma (só dev)

**Files:**
- Modify: `apps/api/src/modules/admin-plataforma/rotas.ts`

**Interfaces:**
- Consumes: `exigirDev` (Task 7), `cadastrarAdminPlataformaSchema` (Task 3).

- [ ] **Step 1: Adicionar o import**

```typescript
import { cadastrarAdminPlataformaSchema } from '@resenha05/shared';
import { exigirAdminPlataforma, exigirDev } from '../../plugins/auth.js';
```

(ajusta a importação existente de `exigirAdminPlataforma` pra incluir `exigirDev` também.)

- [ ] **Step 2: Adicionar as rotas — lista, busca, cadastro e remoção**

```typescript
  app.get('/admin/plataforma-admins', async () => {
    return db
      .selectFrom('plataforma_admins as pa')
      .innerJoin('profiles as p', 'p.id', 'pa.profile_id')
      .select(['pa.id as id', 'p.id as profileId', 'p.nome as nome', 'p.telefone as telefone', 'pa.criado_em as criadoEm'])
      .orderBy('pa.criado_em')
      .execute();
  });

  // Busca candidatos a admin de plataforma (exclui quem já é).
  app.get('/admin/plataforma-admins/buscar', async (req) => {
    exigirDev(req);
    const q = ((req.query as { q?: string }).q ?? '').trim();
    if (q.length < 2) return [];
    const digitos = q.replace(/\D/g, '');

    return db
      .selectFrom('profiles as p')
      .leftJoin('plataforma_admins as pa', 'pa.profile_id', 'p.id')
      .select(['p.id as profileId', 'p.nome as nome', 'p.telefone as telefone'])
      .where('pa.id', 'is', null)
      .where((eb) => {
        const condicoes = [eb('p.nome', 'ilike', `%${q}%`)];
        if (digitos.length > 0) condicoes.push(eb('p.telefone', 'like', `%${digitos}%`));
        return eb.or(condicoes);
      })
      .orderBy('p.nome')
      .limit(6)
      .execute();
  });

  app.post('/admin/plataforma-admins', async (req, reply) => {
    exigirDev(req);
    const { profileId } = validar(cadastrarAdminPlataformaSchema, req.body);

    const existe = await db.selectFrom('profiles').select('id').where('id', '=', profileId).executeTakeFirst();
    if (!existe) throw erro.naoEncontrado('Perfil não encontrado.');

    try {
      await db
        .insertInto('plataforma_admins')
        .values({ profile_id: profileId, cadastrado_por: req.usuario.id })
        .execute();
    } catch (e) {
      if ((e as { code?: string }).code === '23505') {
        throw erro.conflito('Essa pessoa já é admin de plataforma.');
      }
      throw e;
    }
    reply.code(201);
    return { ok: true };
  });

  app.delete('/admin/plataforma-admins/:id', async (req, reply) => {
    exigirDev(req);
    const { id } = req.params as { id: string };
    const r = await db.deleteFrom('plataforma_admins').where('id', '=', id).executeTakeFirst();
    if (r.numDeletedRows === 0n) throw erro.naoEncontrado('Admin de plataforma não encontrado.');
    reply.code(204);
  });
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck --workspace @resenha05/api`
Expected: sem erros.

- [ ] **Step 4: Testar manualmente**

Com o token do dev:
```bash
curl -H "Authorization: Bearer $TOKEN_DEV" "http://localhost:3000/api/admin/plataforma-admins/buscar?q=fulano"
curl -X POST -H "Authorization: Bearer $TOKEN_DEV" -H "Content-Type: application/json" \
  -d '{"profileId": "<uuid>"}' http://localhost:3000/api/admin/plataforma-admins
```
Com o token de um admin de plataforma que não é dev, repita o `POST` acima — espera-se 403.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/admin-plataforma/rotas.ts
git commit -m "api: cadastro/remoção de admins de plataforma (só dev)"
```

---

## Task 12: Checkout de assinatura da organização

**Files:**
- Modify: `apps/api/src/modules/organizacoes/rotas.ts`

**Interfaces:**
- Consumes: `exigirDono` (já existe), `criarPreapproval` (Task 8), `decifrarToken` (`apps/api/src/lib/cripto.ts`, já existe), `env.WEB_ORIGIN`.
- Produces: `POST /organizacoes/:id/assinatura/checkout`.

- [ ] **Step 1: Adicionar os imports**

```typescript
import { criarPreapproval } from '../../lib/mercadopago-preapproval.js';
import { decifrarToken } from '../../lib/cripto.js';
import { env } from '../../env.js';
```

- [ ] **Step 2: Adicionar a rota**

Dentro de `rotasOrganizacoes`, junto das outras rotas de `:id`:

```typescript
  // Dono inicia o pagamento da mensalidade (cria a assinatura recorrente no MP).
  app.post('/organizacoes/:id/assinatura/checkout', async (req) => {
    const { id } = req.params as { id: string };
    exigirDono(req, id);

    const org = await db
      .selectFrom('organizacoes')
      .select(['id', 'nome'])
      .where('id', '=', id)
      .executeTakeFirst();
    if (!org) throw erro.naoEncontrado('Organização não encontrada.');

    const cfg = await db
      .selectFrom('plataforma_config')
      .select(['mensalidade_valor_centavos', 'mp_geral_token_cipher', 'mp_geral_token_nonce'])
      .where('id', '=', 1)
      .executeTakeFirstOrThrow();

    if (!cfg.mp_geral_token_cipher || !cfg.mp_geral_token_nonce) {
      throw erro.invalido('Conta Mercado Pago da plataforma ainda não configurada.');
    }

    const tokenGeral = decifrarToken(cfg.mp_geral_token_cipher, cfg.mp_geral_token_nonce);
    const periodoReferencia = new Date();
    periodoReferencia.setDate(1);
    const periodoStr = periodoReferencia.toISOString().slice(0, 10);

    const preapproval = await criarPreapproval({
      accessToken: tokenGeral,
      reason: `Mensalidade Resenha05 - ${org.nome}`,
      externalReference: `${org.id}:${periodoStr}`,
      payerEmail: req.usuario.telefone.replace(/\D/g, '') + '@resenha05.invalid',
      valorCentavos: cfg.mensalidade_valor_centavos,
      backUrl: `${env.WEB_ORIGIN}/organizacoes/${org.id}`,
    });

    await db
      .insertInto('assinaturas')
      .values({
        organizacao_id: org.id,
        mp_preapproval_id: preapproval.id,
        periodo_referencia: periodoStr,
        valor_centavos: cfg.mensalidade_valor_centavos,
        status: 'pendente',
      })
      .onConflict((oc) =>
        oc.columns(['mp_preapproval_id', 'periodo_referencia']).doUpdateSet({
          valor_centavos: cfg.mensalidade_valor_centavos,
          atualizado_em: new Date(),
        }),
      )
      .execute();

    return { checkoutUrl: preapproval.initPoint };
  });
```

Nota: `payerEmail` — o Mercado Pago exige um e-mail no preapproval, mas o
cadastro do Resenha05 não coleta e-mail do dono. Usa um e-mail sintético
`<telefone>@resenha05.invalid` só para satisfazer o campo obrigatório da
API; o MP não envia nada para esse endereço nesse fluxo (quem interage é o
dono, dentro do checkout).

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck --workspace @resenha05/api`
Expected: sem erros.

- [ ] **Step 4: Testar manualmente**

Com a conta geral do MP configurada (Task 10) e uma organização em `trial`:
```bash
curl -X POST -H "Authorization: Bearer $TOKEN_DONO" \
  http://localhost:3000/api/organizacoes/<id>/assinatura/checkout
```
Expected: `{ "checkoutUrl": "https://..." }`, e uma linha nova em `assinaturas` com `status = 'pendente'`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/organizacoes/rotas.ts
git commit -m "api: checkout de assinatura da mensalidade (preapproval MP)"
```

---

## Task 13: Webhook de assinatura do Mercado Pago

**Files:**
- Create: `apps/api/src/modules/webhook-assinatura/rotas.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Consumes: `verificarAssinaturaWebhook`, `buscarPreapproval` (Task 8); `interpretarStatusPreapproval` (Task 4).
- Produces: `POST /webhooks/mercadopago/assinatura` (sem autenticação de sessão — chamado pelo MP).

- [ ] **Step 1: Criar o módulo**

```typescript
// apps/api/src/modules/webhook-assinatura/rotas.ts
import type { FastifyPluginAsync } from 'fastify';
import { interpretarStatusPreapproval } from '@resenha05/shared';
import { db } from '../../db/index.js';
import { env } from '../../env.js';
import { verificarAssinaturaWebhook } from '../../lib/mercadopago-webhook.js';
import { buscarPreapproval } from '../../lib/mercadopago-preapproval.js';
import { decifrarToken } from '../../lib/cripto.js';

export const rotasWebhookAssinatura: FastifyPluginAsync = async (app) => {
  app.post('/webhooks/mercadopago/assinatura', async (req, reply) => {
    const query = req.query as { 'data.id'?: string };
    const body = req.body as { type?: string; data?: { id?: string } };
    const dataId = query['data.id'] ?? body.data?.id;

    if (!dataId || body.type !== 'subscription_preapproval') {
      // Evento que não é de preapproval (ex: teste do painel) — confirma
      // recebimento sem processar, pra o MP não ficar reenviando à toa.
      reply.code(200);
      return { ok: true };
    }

    if (!env.MERCADOPAGO_WEBHOOK_SECRET) {
      req.log.error('MERCADOPAGO_WEBHOOK_SECRET não configurado — recusando webhook.');
      reply.code(500);
      return { erro: 'Webhook não configurado.' };
    }

    const xSignature = (req.headers['x-signature'] as string) ?? '';
    const xRequestId = (req.headers['x-request-id'] as string) ?? '';
    const valido = verificarAssinaturaWebhook({
      secret: env.MERCADOPAGO_WEBHOOK_SECRET,
      dataId,
      xRequestId,
      xSignature,
    });
    if (!valido) {
      reply.code(401);
      return { erro: 'Assinatura inválida.' };
    }

    const cfg = await db
      .selectFrom('plataforma_config')
      .select(['mp_geral_token_cipher', 'mp_geral_token_nonce'])
      .where('id', '=', 1)
      .executeTakeFirstOrThrow();
    if (!cfg.mp_geral_token_cipher || !cfg.mp_geral_token_nonce) {
      req.log.error('Webhook recebido sem conta MP geral configurada.');
      reply.code(200); // confirma recebimento; não há o que processar
      return { ok: true };
    }
    const tokenGeral = decifrarToken(cfg.mp_geral_token_cipher, cfg.mp_geral_token_nonce);

    const detalhe = await buscarPreapproval(tokenGeral, dataId);
    const [organizacaoId, periodoReferencia] = detalhe.externalReference.split(':');
    if (!organizacaoId || !periodoReferencia) {
      req.log.error(`external_reference inesperado no preapproval ${dataId}: ${detalhe.externalReference}`);
      reply.code(200);
      return { ok: true };
    }

    const { statusAssinatura, statusCiclo } = interpretarStatusPreapproval(detalhe.status);

    await db.transaction().execute(async (tx) => {
      await tx
        .insertInto('assinaturas')
        .values({
          organizacao_id: organizacaoId,
          mp_preapproval_id: dataId,
          periodo_referencia: periodoReferencia,
          valor_centavos: detalhe.valorCentavos,
          status: statusCiclo,
        })
        .onConflict((oc) =>
          oc.columns(['mp_preapproval_id', 'periodo_referencia']).doUpdateSet({
            status: statusCiclo,
            valor_centavos: detalhe.valorCentavos,
            atualizado_em: new Date(),
          }),
        )
        .execute();

      await tx
        .updateTable('organizacoes')
        .set({ status_assinatura: statusAssinatura })
        .where('id', '=', organizacaoId)
        .execute();
    });

    reply.code(200);
    return { ok: true };
  });
};
```

- [ ] **Step 2: Registrar o módulo em `app.ts`**

```typescript
import { rotasWebhookAssinatura } from './modules/webhook-assinatura/rotas.js';
// ...
      await api.register(rotasAdminPlataforma);
      await api.register(rotasWebhookAssinatura);
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck --workspace @resenha05/api`
Expected: sem erros.

- [ ] **Step 4: Testar manualmente (assinatura inválida)**

```bash
curl -X POST http://localhost:3000/api/webhooks/mercadopago/assinatura \
  -H "Content-Type: application/json" \
  -d '{"type":"subscription_preapproval","data":{"id":"pre_falso"}}'
```
Expected: `401`, corpo `{ "erro": "Assinatura inválida." }` (sem `MERCADOPAGO_WEBHOOK_SECRET` configurado, cai no `500` de "não configurado" — configure a variável localmente pra testar o caminho de assinatura inválida de fato).

- [ ] **Step 5: Testar idempotência**

Com `MERCADOPAGO_WEBHOOK_SECRET` configurado e uma assinatura válida (monte o
`x-signature` do jeito que o teste de `mercadopago-webhook.test.ts` monta),
envie o **mesmo** payload duas vezes seguidas:
```bash
psql "$DATABASE_URL" -c "select count(*) from assinaturas where mp_preapproval_id = '<id-do-teste>';"
```
Expected: `count = 1` depois das duas chamadas — a segunda atualizou a linha
existente (via `on conflict`), não criou uma segunda.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/webhook-assinatura/rotas.ts apps/api/src/app.ts
git commit -m "api: webhook de assinatura do Mercado Pago (idempotente, assinatura verificada)"
```

---

## Task 14: Gating — bloquear entrada e criação de pelada

**Files:**
- Modify: `apps/api/src/modules/organizacoes/rotas.ts`
- Modify: `apps/api/src/modules/auth/rotas.ts`
- Modify: `apps/api/src/modules/peladas/rotas.ts`

**Interfaces:**
- Consumes: `organizacaoLiberada` (Task 4).

- [ ] **Step 1: Adicionar o import nos três arquivos**

```typescript
import { organizacaoLiberada } from '@resenha05/shared';
```

- [ ] **Step 2: Bloquear `POST /organizacoes/:id/entrar`**

Em `apps/api/src/modules/organizacoes/rotas.ts`, mudar a busca da organização
para trazer `status_assinatura` e checar antes do insert:

```typescript
  app.post('/organizacoes/:id/entrar', async (req, reply) => {
    const { id } = req.params as { id: string };
    const existe = await db
      .selectFrom('organizacoes')
      .select(['id', 'status_assinatura'])
      .where('id', '=', id)
      .executeTakeFirst();
    if (!existe) throw erro.naoEncontrado('Organização não encontrada.');
    if (!organizacaoLiberada(existe.status_assinatura)) {
      throw erro.proibido('Esta organização está com a mensalidade pendente.');
    }

    await db
      .insertInto('organizacao_membros')
      .values({ organizacao_id: id, profile_id: req.usuario.id, papel: 'jogador' })
      .onConflict((oc) => oc.columns(['organizacao_id', 'profile_id']).doNothing())
      .execute();
    reply.code(201);
    return { ok: true };
  });
```

- [ ] **Step 3: Bloquear `POST /organizacoes/entrar-por-codigo`**

```typescript
  app.post('/organizacoes/entrar-por-codigo', async (req, reply) => {
    const { codigo } = validar(entrarPorCodigoSchema, req.body);
    const org = await db
      .selectFrom('organizacoes')
      .select(['id', 'nome', 'status_assinatura'])
      .where('codigo', '=', codigo)
      .executeTakeFirst();
    if (!org) throw erro.naoEncontrado('Nenhuma organização com esse código.');
    if (!organizacaoLiberada(org.status_assinatura)) {
      throw erro.proibido('Esta organização está com a mensalidade pendente.');
    }

    await db
      .insertInto('organizacao_membros')
      .values({ organizacao_id: org.id, profile_id: req.usuario.id, papel: 'jogador' })
      .onConflict((oc) => oc.columns(['organizacao_id', 'profile_id']).doNothing())
      .execute();
    reply.code(201);
    return org;
  });
```

- [ ] **Step 4: Bloquear o `codigoOrganizacao` do cadastro**

Em `apps/api/src/modules/auth/rotas.ts`, no trecho que resolve `organizacaoId`
a partir de `dados.codigoOrganizacao`:

```typescript
    let organizacaoId: string | null = null;
    if (dados.codigoOrganizacao) {
      const org = await db
        .selectFrom('organizacoes')
        .select(['id', 'status_assinatura'])
        .where('codigo', '=', dados.codigoOrganizacao)
        .executeTakeFirst();
      if (!org) throw erro.invalido('Nenhuma organização com esse código.');
      if (!organizacaoLiberada(org.status_assinatura)) {
        throw erro.proibido('Esta organização está com a mensalidade pendente.');
      }
      organizacaoId = org.id;
    }
```

- [ ] **Step 5: Bloquear a criação de configuração de pelada**

Em `apps/api/src/modules/peladas/rotas.ts`, na rota
`r.post('/organizacoes/:id/configuracoes', ...)`:

```typescript
    r.post('/organizacoes/:id/configuracoes', async (req, reply) => {
      const { id } = req.params as { id: string };
      exigirAdmin(req, id);

      const org = await db
        .selectFrom('organizacoes')
        .select('status_assinatura')
        .where('id', '=', id)
        .executeTakeFirstOrThrow();
      if (!organizacaoLiberada(org.status_assinatura)) {
        throw erro.proibido('Esta organização está com a mensalidade pendente.');
      }

      const d = validar(criarConfiguracaoSchema, req.body);
      const c = await db
        .insertInto('pelada_configuracoes')
        .values({
          organizacao_id: id,
          nome: d.nome,
          dia_semana: d.diaSemana,
          horario_jogo: d.horarioJogo,
          horario_lista: d.horarioLista,
          local: d.local ?? null,
          valor_padrao: d.valorPadrao != null ? String(d.valorPadrao) : null,
          ativo: d.ativo ?? true,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      reply.code(201);
      return c;
    });
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck --workspace @resenha05/api`
Expected: sem erros.

- [ ] **Step 7: Testar manualmente**

O teste desta task é manual (via curl), não automatizado: `apps/api` hoje não
tem nenhum teste de rota/integração (nenhum arquivo `*.test.ts` fora de
`packages/shared`, sem banco de teste configurado) — escrever esse tipo de
teste pela primeira vez é infraestrutura nova, fora do escopo deste plano.
A lógica de decisão em si (`organizacaoLiberada`) já está coberta por teste
unitário na Task 4; o que falta verificar aqui é só a fiação (a rota
realmente chama a função e realmente devolve 403).

Com uma organização em `trial` (crie uma nova organização de teste — nasce em `trial`):
```bash
curl -X POST -H "Authorization: Bearer $TOKEN_OUTRO_USUARIO" \
  -H "Content-Type: application/json" -d '{"codigo":"<codigo-da-org-trial>"}' \
  http://localhost:3000/api/organizacoes/entrar-por-codigo
```
Expected: `403`, `{"erro":"Esta organização está com a mensalidade pendente."}`.

Depois, rode manualmente `update organizacoes set status_assinatura = 'ativa' where id = '<id>'` no banco de teste e repita — espera 201.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/organizacoes/rotas.ts apps/api/src/modules/auth/rotas.ts apps/api/src/modules/peladas/rotas.ts
git commit -m "api: bloqueia entrar em organização e criar pelada quando mensalidade pendente"
```

---

## Task 15: Verificação final e checklist de deploy

**Files:** nenhum arquivo novo — task de integração e checklist.

- [ ] **Step 1: Rodar a suíte inteira**

Run: `npm run typecheck && npm run test && npm run lint`
Expected: tudo verde.

- [ ] **Step 2: Smoke test local do fluxo completo**

Com a API local rodando e `PLATAFORMA_DEV_TELEFONE` setado pro seu telefone de teste:
1. Logue com essa conta → `GET /api/auth/eu` deve trazer `papelPlataforma: "dev"`.
2. `POST /api/admin/mercadopago` com um access token de teste do MP (sandbox) → `200`.
3. `PUT /api/admin/configuracoes` com um novo valor → `GET /api/admin/configuracoes` reflete.
4. Crie uma organização nova (`POST /organizacoes`) → confirme `status_assinatura: "trial"` em `GET /organizacoes/:id`.
5. `POST /organizacoes/:id/assinatura/checkout` → recebe `checkoutUrl`.
6. Tente entrar nessa organização com outra conta → `403`.

- [ ] **Step 3: Checklist de variáveis de ambiente pra produção (Coolify)**

Antes de mesclar em `main` e disparar deploy, confirme em Coolify (Production **e** Preview) que existem:
- `PLATAFORMA_DEV_TELEFONE` — **obrigatória**; sem ela a API não sobe (mesmo tipo de falha que já aconteceu com `DATABASE_URL`). Valor: seu telefone no formato `+55DDDXXXXXXXXX`.
- `MERCADOPAGO_WEBHOOK_SECRET` — opcional pra subir, mas o webhook fica inoperante (todo evento cai em 500) até configurar. Pegue o valor no painel do Mercado Pago ao cadastrar a URL do webhook (`https://apiresenha05.coffetech.com.br/api/webhooks/mercadopago/assinatura`).
- Confirme que `MERCADOPAGO_PLATAFORMA_TOKEN` (variável antiga, agora removida do código) pode ser apagada do Coolify — não é mais lida em lugar nenhum.

- [ ] **Step 4: Commit final (se sobrar algo solto)**

```bash
git status --short
```
Se tudo já foi commitado nas tasks anteriores, não há o que commitar aqui —
esta task é só verificação.
