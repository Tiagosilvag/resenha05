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

## Deploy (Coolify — um recurso só, Docker Compose)

Build pack **Docker Compose**, arquivo `docker-compose.yaml` na raiz. Sobe 3
containers (`db`, `api`, `web`) numa rede interna. O `web` (nginx) faz proxy de
`/api` para o `api` — um domínio só, sem CORS.

Variáveis no Coolify:

| Variável | Valor |
|---|---|
| `POSTGRES_PASSWORD` | senha do banco |
| `JWT_SECRET` | `openssl rand -base64 48` |
| `JWT_REFRESH_SECRET` | `openssl rand -base64 48` |
| `RESENHA05_ENC_KEY` | `openssl rand -base64 32` (32 bytes exatos) |
| `WEB_ORIGIN` | `https://resenha05.coffetech.com.br` |
| `R2_*` | opcional (upload de foto) |

Domínio `resenha05.coffetech.com.br` → serviço `web`, porta 80. A API roda as
migrations pendentes toda vez que o container sobe.

Fases 1 a 5 implementadas: cadastro + LGPD, complete seu cadastro, administração,
peladas + lista de presença (polling), sorteio balanceado.

## Fases

Ver `MEMORY`/artifact do plano. Próximo: Fase 6 (pagamentos Mercado Pago) e Fase 7
(automações n8n + WhatsApp).
