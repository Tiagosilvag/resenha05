# Admin de plataforma + assinatura mensal das organizações

## Contexto

Do backlog original do app (revisão de 09/09), este spec cobre o sub-projeto
**A** de três: fundação de admin de plataforma + cobrança da mensalidade que
libera uma organização. Os outros dois ficam para specs próprios, depois
deste implementado:

- **B — Taxa da pelada/torneio**: checkout pix/cartão por organização (conta
  MP da própria organização), confirmação de presença automática, comprovante
  + WhatsApp.
- **C — Balanço financeiro + inadimplentes**: ledger de entradas/saídas
  (mensalidades da conta geral + taxas das organizações) e lista de quem
  está devendo.

Este spec **não** cobre B nem C. Cobre só o necessário pra existir um admin
de plataforma, uma conta Mercado Pago geral, e o ciclo de vida da mensalidade
que decide se uma organização está `ativa`.

## Papéis (3 níveis)

1. **Dev** — você. Conta fixa, identificada por telefone configurado em env
   (`PLATAFORMA_DEV_TELEFONE`), não aparece em nenhuma tabela de
   cadastro/remoção. Único que cadastra ou remove admins de plataforma.
2. **Admin de plataforma** — "sócios". Tabela nova (`plataforma_admins`).
   Entre si, ninguém remove ninguém — só o dev adiciona ou remove. Sem
   limite de quantidade definido (não foi pedido; não implementa um).
3. **Admin de organização** (`admin`, `admin_principal`) — já existe em
   `organizacao_membros.papel`, sem mudança.

Isso é ortogonal ao papel de organização: uma pessoa pode ser jogador em uma
organização e admin de plataforma ao mesmo tempo — são dimensões separadas.

## Modelo de dados

### Nova tabela `plataforma_admins`
```
id               uuid, pk, default gen_random_uuid()
profile_id       uuid, fk profiles(id), unique
cadastrado_por   uuid, fk profiles(id)  -- sempre o dev, guardado por rastreabilidade
criado_em        timestamptz, default now()
```
Sem coluna de "papel" — só existir na tabela já é ser admin de plataforma.

### Nova tabela `plataforma_config`
Configuração global, linha única (id fixo `1`, chave primária constante em
código pra impedir segunda linha):
```
id                         smallint, pk, check (id = 1)
mensalidade_valor_centavos integer, not null
mp_geral_token_cipher      bytea
mp_geral_token_nonce       bytea
mp_geral_token_atualizado_em timestamptz
atualizado_em              timestamptz, default now()
```
Reaproveita `cifrarToken`/`decifrarToken` (`apps/api/src/lib/cripto.ts`),
igual ao token de organização hoje em `organizacoes.mp_token_cipher`.

### Nova tabela `assinaturas`
Histórico de cobrança por organização — uma linha por ciclo mensal:
```
id                    uuid, pk
organizacao_id        uuid, fk organizacoes(id)
mp_preapproval_id     text          -- id da assinatura recorrente no Mercado Pago
mp_payment_id         text, null    -- id do pagamento do ciclo, quando aprovado
periodo_referencia    date          -- primeiro dia do mês cobrado
valor_centavos        integer
status                text          -- 'pendente' | 'aprovado' | 'atrasado' | 'cancelado'
criado_em             timestamptz, default now()
atualizado_em         timestamptz, default now()
```

### Coluna reaproveitada `organizacoes.status_assinatura`
Já existe, com CHECK constraint já definido em `db/migrations/0001_core.sql`:
`text not null default 'trial' check (status_assinatura in ('trial','ativa','inadimplente','cancelada'))`.
Nenhuma migration nova precisa mexer nessa constraint — os 4 valores que já
existem cobrem exatamente o que este spec precisa:
- `trial` — organização nova, nunca pagou.
- `ativa` — mensalidade em dia.
- `inadimplente` — ciclo vigente não foi pago (preapproval existe mas o
  pagamento do mês falhou ou está pendente).
- `cancelada` — o dono cancelou a assinatura recorrente no Mercado Pago (ou
  o MP cancelou por falhas repetidas).

**Migração de dados:** todas as organizações com `criado_em` anterior à data
de deploy deste spec recebem `status_assinatura = 'ativa'` direto na
migration SQL (grandfathered, conforme decidido — não pagam agora).
Organizações criadas depois do deploy nascem em `'trial'` (já é o default da
coluna, nenhuma mudança necessária aí).

## Fluxo de assinatura (Mercado Pago Preapproval)

Usa a API de assinaturas recorrentes do Mercado Pago (preapproval), vinculada
à conta geral (`plataforma_config`):

1. Admin de plataforma vincula a conta MP geral (mesmo endpoint/padrão que já
   existe pra organização, só que grava em `plataforma_config` em vez de
   `organizacoes`).
2. Admin de plataforma configura `mensalidade_valor_centavos` (editável a
   qualquer momento; só vale pra cobranças futuras, não retroage).
3. Quando o dono de uma organização em `trial`, `inadimplente` ou
   `cancelada` inicia o pagamento, a API cria um preapproval no Mercado Pago
   (usando o token da conta geral) com o valor atual de `plataforma_config`
   e devolve o link de checkout do MP. Dono é redirecionado, autoriza a
   cobrança recorrente no cartão.
4. Webhook do MP (`POST /webhooks/mercadopago/assinatura`, novo endpoint)
   recebe eventos do preapproval:
   - `authorized` (cobrança do ciclo aprovada) → grava/atualiza linha em
     `assinaturas` com `status='aprovado'`, e `organizacoes.status_assinatura
     = 'ativa'`.
   - Pagamento do ciclo pendente ou recusado, com o preapproval ainda ativo
     → `assinaturas.status = 'atrasado'`, `organizacoes.status_assinatura =
     'inadimplente'`.
   - `cancelled` (preapproval cancelado, pelo dono ou pelo MP) →
     `assinaturas.status = 'cancelado'`, `organizacoes.status_assinatura =
     'cancelada'`.
5. Processamento do webhook é idempotente por `mp_preapproval_id` +
   `periodo_referencia` (mesmo padrão de upsert usado noutros pontos do
   código pra webhooks externos).

Pix não entra nesse fluxo — recorrência nativa do MP é só cartão. Já decidido
que pix fica restrito à taxa da pelada (sub-projeto B).

## Gating (onde bloqueia)

Bloqueia exatamente duas ações quando `organizacoes.status_assinatura !=
'ativa'`:

1. **Entrar por código** — `POST /organizacoes/entrar-por-codigo` e o fluxo
   de `codigoOrganizacao` dentro de `POST /auth/cadastro`
   (`apps/api/src/modules/auth/rotas.ts`). Retorna erro claro (ex:
   `erro.proibido('Esta organização está com a mensalidade pendente.')`).
2. **Criar configuração de pelada** — endpoint de criação em
   `apps/api/src/modules/peladas/rotas.ts` (a criação da `pelada_configuracoes`,
   não o `POST /peladas/da-config` que só gera a semana a partir de uma
   config já existente e continua funcionando pra peladas já configuradas).

Tudo o resto (peladas já configuradas continuam gerando semana normalmente,
súmulas, sorteio, estatísticas, presença, perfil) funciona igual,
independente do status da assinatura. Isso evita interromper jogos em
andamento por causa de um atraso de pagamento.

## Endpoints novos

Módulo novo `apps/api/src/modules/admin-plataforma/rotas.ts`, prefixo
`/api/admin`, guard novo `exigirAdminPlataforma` (dev ou membro de
`plataforma_admins`) em `apps/api/src/plugins/auth.ts`:

- `GET /admin/participantes` — lista paginada/buscável de todos os
  `profiles` do app.
- `GET /admin/organizacoes` — lista de organizações com
  `status_assinatura` e dados básicos.
- `GET /admin/configuracoes` / `PUT /admin/configuracoes` — ler/editar
  `mensalidade_valor_centavos`.
- `POST /admin/mercadopago` — vincular/trocar o token da conta MP geral
  (mesmo padrão de `POST /organizacoes/:id/mercadopago`, mas grava em
  `plataforma_config`).
- `GET /admin/plataforma-admins` — lista de admins de plataforma.
- `POST /admin/plataforma-admins` — cadastrar (**guard extra: só dev**,
  verificado por telefone contra `PLATAFORMA_DEV_TELEFONE`, não pelo guard
  genérico de admin de plataforma).
- `DELETE /admin/plataforma-admins/:id` — remover (**só dev**, mesmo guard
  extra).
- `POST /organizacoes/:id/assinatura/checkout` — dono da organização inicia
  o pagamento da mensalidade (cria preapproval, devolve link do MP).
- `POST /webhooks/mercadopago/assinatura` — recebe eventos do MP (sem
  autenticação de sessão; valida a notificação pelo mecanismo do próprio MP,
  igual seria feito pra qualquer webhook de pagamento).

`SessaoUsuario` (`packages/shared/src/index.ts`) ganha um campo
`papelPlataforma: 'dev' | 'admin' | null`, populado em `carregarUsuario`
(`apps/api/src/lib/sessao.ts`) a partir do telefone (dev) ou de uma consulta
em `plataforma_admins`.

## Tratamento de erros

- Checkout de assinatura sem conta MP geral vinculada → erro claro
  (`erro.invalido('Conta Mercado Pago da plataforma ainda não configurada.')`),
  mesmo padrão já usado quando falta `RESENHA05_ENC_KEY`.
- Webhook do MP para preapproval/pagamento desconhecido (id não bate com
  nenhuma linha de `assinaturas`) → loga e responde 200 (evita retry
  infinito do MP), não lança erro 500.
- Tentativa de cadastrar/remover admin de plataforma por quem não é dev →
  403, mesma função `erro.proibido`.

## Testes

Seguindo o padrão já usado em `packages/shared/src/sorteio.test.ts`:

- Unit: transições de `status_assinatura` a partir de eventos de webhook
  (`authorized`, `cancelled`, ciclo sem pagamento).
- Unit: guard `exigirAdminPlataforma` e o guard extra "só dev".
- Integração: `POST /organizacoes/entrar-por-codigo` e criação de config de
  pelada retornam erro quando `status_assinatura != 'ativa'`, e funcionam
  quando `'ativa'`.
- Migração: o projeto não tem teste automatizado de migration hoje (são só
  arquivos SQL aplicados via `db:migrate`). Verificação é manual pós-deploy:
  `SELECT status_assinatura, count(*) FROM organizacoes GROUP BY 1` deve
  mostrar todas as organizações pré-existentes como `'ativa'`.

## Fora de escopo (fica pra depois)

- Checkout pix/cartão da taxa da pelada (sub-projeto B).
- Balanço financeiro e lista de inadimplentes (sub-projeto C).
- Limite de quantidade de admins de plataforma (não foi pedido).
- Grace period configurável antes de marcar `inadimplente` (o corte é
  direto: ciclo não pago vira `inadimplente` no evento do MP; se depois
  quiser um prazo de tolerância, é mudança pequena e isolada nesse mesmo
  fluxo).
- Notificação (WhatsApp/e-mail) avisando o dono que a mensalidade está
  vencendo ou venceu — hoje ele só descobre ao tentar entrar por código ou
  criar pelada e levar o erro.
