# Resenha05

Gestão de peladas, copas e campeonatos. Monorepo — **PostgreSQL puro + API própria**,
sem Supabase, sem Lovable.

| Pasta | O quê |
|---|---|
| `apps/api` | API HTTP — Fastify + Kysely + JWT. Único processo que fala com o banco. |
| `apps/web` | App React (Vite) + Tailwind. Vira app de loja via Capacitor (Fase 12). |
| `packages/shared` | Schemas zod + tipos + algoritmo de sorteio, compartilhados entre web e api. |
| `db` | Migrations SQL + runner (`migrate.mjs`) + gerador do `bootstrap.sql`. |

Plano de implementação completo: ver o artifact enviado no chat (rev. 2).

## Rodar local

Pré-requisitos: Node 20+, um PostgreSQL 15+.

```bash
npm install
cp .env.example .env          # ajuste DATABASE_URL e os segredos

# cria o banco + schema (uma vez)
psql "$SUPERUSER_URL" -f db/bootstrap.sql   # edite a senha no topo do arquivo antes

# sobe API (:3000) e web (:5173) em terminais separados
npm run dev:api
npm run dev:web
```

O front chama sempre `/api/*`; em dev o Vite faz proxy para `http://localhost:3000`.

## Deploy (Coolify)

Dois apps **Dockerfile** a partir deste repo (Base Directory `/`, o Dockerfile
copia do root do monorepo):

- **`resenha05-api`** — Dockerfile `apps/api/Dockerfile` · porta 3000 · domínio
  `api-resenha05.coffetech.com.br`. O container roda as migrations no start.
  Env: `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `RESENHA05_ENC_KEY`,
  `WEB_ORIGIN=https://resenha05.coffetech.com.br`, `R2_*`, `NODE_ENV=production`.
- **`resenha05-web`** — Dockerfile `apps/web/Dockerfile` · nginx porta 80 ·
  domínio `resenha05.coffetech.com.br`. **Build arg** `VITE_API_URL=https://api-resenha05.coffetech.com.br/api`.

Fases 1 a 5 implementadas: cadastro + LGPD, complete seu cadastro, administração,
peladas + lista de presença (polling), sorteio balanceado.

## Fases

Ver `MEMORY`/artifact do plano. Próximo: Fase 6 (pagamentos Mercado Pago) e Fase 7
(automações n8n + WhatsApp).
