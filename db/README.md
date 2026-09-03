# Banco de dados

PostgreSQL 17, banco `resenha05`, usuário `resenha05_app` (dono do schema, sem
superusuário). Sem extensões.

## Arquivos

| Arquivo | Para quê |
|---|---|
| `migrations/NNNN_*.sql` | Fonte da verdade do schema. SQL puro, ordenado, cada arquivo roda uma vez. |
| `migrate.mjs` | Runner. Roda no deploy e localmente. Idempotente, com advisory lock. |
| `build-bootstrap.mjs` | Gera o `bootstrap.sql`. Rode depois de criar/alterar migrations. |
| `bootstrap.sql` | **Gerado.** Um script psql, do zero (role + banco) ao schema completo. |

## Primeira vez (criar o banco)

Conectado ao banco `postgres` como superusuário, uma vez:

```bash
# 1. edite a senha na linha \set app_password do topo
# 2. rode:
psql -h HOST -U postgres -f db/bootstrap.sql
```

Isso cria o role, o banco, o schema inteiro e marca todas as migrations como
aplicadas.

## A cada deploy

```bash
DATABASE_URL=postgres://resenha05_app:senha@host:5432/resenha05 node db/migrate.mjs
```

O container da API já chama isso no start (ver `apps/api/Dockerfile`).

## Nova migration

1. Crie `migrations/000X_nome.sql` (próximo número).
2. `npm run db:bootstrap:build` para regenerar o `bootstrap.sql`.
3. Commit dos dois.
4. No próximo deploy o runner aplica só a nova.

Regra: migration nunca é editada depois de aplicada em produção — sempre uma nova.
