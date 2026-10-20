# Verificação ponta a ponta (local)

Sobe um **Postgres em memória** (PGlite) e um **Mercado Pago de mentira**, e roda roteiros que exercitam
a API de verdade (sem cobrar nada). Foi assim que as partidas, as substituições, o pagamento avulso da
mensalidade e o pagamento dos jogadores (Pix, Mercado Pago e OAuth) foram verificados.

> Não é parte do `npm test` (que roda só lógica pura). É uma verificação manual de integração.

## Preparar (uma vez)
```bash
cd scripts/verificacao && npm install      # instala só o PGlite, aqui dentro (node_modules é ignorado pelo git)
```
`apps/api/.env` precisa de `DATABASE_URL=postgres://resenha05:resenha05@127.0.0.1:55432/resenha05`
(além das variáveis normais). Para os roteiros de **pagamento** acrescente (só local, nunca em produção):
```
MP_API_BASE=http://localhost:4010
MP_OAUTH_CLIENT_ID=1234567890
MP_OAUTH_CLIENT_SECRET=segredo_de_teste_oauth
```
(`apps/api/.env` é ignorado pelo git; remova essas 3 linhas depois.)

## Subir tudo (cada comando em um terminal)
```bash
node scripts/verificacao/serve-banco.mjs   # banco em memória, aplica todas as migrations (volta vazio a cada reinício)
node scripts/verificacao/mock-mp.mjs       # Mercado Pago de mentira em http://localhost:4010 (só roteiros de pagamento)
npm run dev:api                            # API em :3000 (ou o preview "api-dev" do .claude/launch.json)
npm run dev:web                            # web em :5173 (só para olhar as telas)
```

## Roteiros (rodam contra a API em :3000)
Cada um cria os próprios usuários/organizações. **Use um banco recém-iniciado** (os telefones são fixos;
repetir no mesmo banco dá "telefone já cadastrado"). Rode a partir da raiz do repositório:

| Comando | O que prova | Precisa do mock/env de pagamento? |
|---|---|---|
| `node scripts/verificacao/cenario-partidas.mjs` | 9 jogadores (4+4+1), cronômetro (pausa/retoma/tempo), limite de gols, empate, correção de gol, redistribuição, histórico, artilharia, duas peladas com regras diferentes, cliques/gols simultâneos (52 verificações) | não |
| `node scripts/verificacao/cenario-substituicao.mjs` | substituição em partida: quem sai vai para o **último time da fila**, lesão (não volta), gols só de quem está em quadra (25) | não |
| `node scripts/verificacao/cenario-avulso.mjs` | pagamento avulso da **mensalidade** (Pix/cartão sem conta), webhook, notificação forjada, vencimento (34) | **sim** |
| `node scripts/verificacao/cenario-pagamento-jogadores.mjs` | proteção do "pago", modos manual/Pix/Mercado Pago, OAuth (conectar, renovar token, desconectar) (58) | **sim** |

Cada roteiro imprime `PASS`/`FAIL` por verificação e termina com `TUDO OK` (código de saída 0) ou `N FALHA(S)`.

## Olhar as telas
`node scripts/verificacao/seed-ui-partidas.mjs` cria uma organização "Racha da Tela" com 9 jogadores e uma
pelada de 4+4+1 já com o sorteio confirmado (login: `11955550001` / `senha12345`). Para a tela de
administração da plataforma, torne esse usuário admin de plataforma:
`insert into plataforma_admins (profile_id, cadastrado_por) values ('<id>','<id>')`.

## Mock do Mercado Pago (`mock-mp.mjs`)
Implementa `/users/me`, `POST /checkout/preferences`, `GET /v1/payments/:id` e `POST /oauth/token`
(código válido: `codigo_valido`). Controle do teste: `POST /_pagamento` (cadastra um pagamento),
`GET /_preferencias`, `GET /_oauth` (para conferir o que a API enviou).

## Limitações
- O PGlite é um emulador: sob concorrência ou depois de violação de unicidade pode derrubar conexões
  ("Connection terminated unexpectedly"). Reinicie `serve-banco.mjs`; não é bug do app.
- O mock não valida a assinatura do webhook nem o formato real de todas as respostas do Mercado Pago.
  O primeiro pagamento real em produção continua sendo o teste definitivo.
