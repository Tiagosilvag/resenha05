# Plano — publicar, configurar o OAuth e evoluir o modelo de pagamentos

> **Para quem retomar (humano ou agente):** leia primeiro
> [`docs/historico-sessao-2026-10.md`](../../historico-sessao-2026-10.md) (o que foi feito e decidido).
> Use `superpowers:executing-plans` (ou o fluxo inline) e **um commit por tarefa**, na `main`.
> Marque as caixas (`- [x]`) **neste arquivo** ao concluir cada tarefa e inclua a atualização no mesmo commit.

**Estado de partida (20/10/2026):**
- `origin/main` termina em `565dbb8`. Tudo até ali está no ar.
- **Commits locais não publicados** (em ordem): `27e5123` ⛔ (não publicar), `fc2bd36`, `0460061`, `76c1419`,
  `e8dce63`, `11b2f2d`, `3b8ea5b` e o commit deste plano.
- Testes: shared 163 ✅, api 59 ✅; roteiros em `scripts/verificacao` (169 verificações) ✅.

**Regras de trabalho do dono do projeto:** português; **push/deploy só com pedido explícito**; nunca
colar segredos no chat; verificar no navegador antes de dizer que está pronto; heredocs grandes
quebram no Git Bash (use arquivos/Write).

---

## Fase 0 — Publicar o que está pronto  *(depende do "pode fazer" do dono)*

- [x] **0.1 Publicar por cherry-pick seletivo** (deixa `27e5123`/`7c3345b` de fora):
  ```bash
  git fetch origin
  git switch -c entrega-pagamentos origin/main
  git cherry-pick fc2bd36 0460061 76c1419 e8dce63 11b2f2d 3b8ea5b   # + commit do plano (hash em `git log`)
  npm run build --workspace @resenha05/shared && npm run typecheck && npm test && npm run build --workspace @resenha05/web
  git push origin HEAD:main
  git switch main && git rebase origin/main && git branch -D entrega-pagamentos
  ```
  Aceite: `git log origin/main` contém os commits; `git status` limpo (sem `27e5123` publicado).
  **Confirmado em 20/10 (sessão nova):** `origin/main` termina em `ce6e210` (commit deste plano) e já
  inclui todo o conteúdo listado acima sob hashes novos (cherry-pick recria hash); nenhum commit com a
  descrição do `27e5123`/`7c3345b` (webhook monta manifesto) está em `origin/main`.
- [x] **0.2 Deploy** pelo MCP do Coolify: `deploy` com `uuid=hkiv7ifyqlc7fm5b5xsyugq6`, depois
  `get_deployment` até `finished`. A **migration `0016`** roda sozinha no start do container.
  Aceite: bundle do site contém "Pagamento dos jogadores"; `POST /api/organizacoes/:id/assinatura/avulso`
  sem token devolve 401 (não 404). (O MCP não mostra o log da migration — se quiser a mensagem
  "applied", ver no painel do Coolify.)
  **Confirmado em 20/10:** deploy `ua0xhkv7oioqf7kufhrbnqlf`, commit `ce6e210`, status `finished`
  (04:50 UTC). Smoke test via curl: `GET /api/health` → 200; `POST /api/organizacoes/<uuid>/assinatura/avulso`
  sem token → **401** `nao_autorizado` (não 404) — migration 0016 aplicada (senão a API não subiria,
  como já visto nesta aplicação). Não abri as telas no navegador (isso é a 0.3, ainda em aberto).
- [ ] **0.3 Smoke test em produção** (o dono ou o agente com login): abrir `/org/:id/assinatura` (card
  "Sem conta no Mercado Pago?"), `/org/:id/mercadopago` (3 modos) e uma pelada com valor (card "Pagamento").
- [ ] **0.4 Voltar a mensalidade ao valor real** (Administração → Configurações) — está em R$ 1/R$ 5 de teste.
- [ ] **0.5 Renovar o Access Token do Mercado Pago** que foi colado no chat (dono do projeto).

## Fase 1 — Configurar e validar o OAuth  *(parte do dono + parte de código)*

Guia do painel: [`docs/guia-mercadopago-oauth.md`](../../guia-mercadopago-oauth.md).

- [ ] **1.1 (dono)** Passos 1–5 do guia: aplicação (reaproveitar a atual), URL de redirecionamento
  `https://resenha05.coffetech.com.br/api/oauth/mercadopago/callback`, credenciais de produção, webhook
  (`Vinculação de aplicações` + `Pagamentos`).
- [ ] **1.2 (dono)** Criar no Coolify `MP_OAUTH_CLIENT_ID` e `MP_OAUTH_CLIENT_SECRET` (já declaradas no
  `docker-compose.yaml`) e reiniciar/redeployar. Aceite: em `/org/:id/mercadopago` (modo Mercado Pago)
  aparece **"Conectar com Mercado Pago"** em vez do campo de token.
- [ ] **1.3 Teste real** com valor baixo: dono conecta a conta; um jogador paga **de outra conta** (quem
  vende não paga a si mesmo); conferir "pago" automático, `presencas.pago_metodo='mercadopago'` e
  `pagamentos_jogador.status='aprovado'`. Se o aviso (webhook) não chegar, confirmar o evento
  "Pagamentos" no painel — a volta do jogador (`?payment_id=`) já cobre o caso comum.
- [ ] **1.4 PKCE:** ligar "Usar o fluxo de código de autorização com o PKCE" no painel **e** `MP_OAUTH_PKCE=1`
  no Coolify; repetir a conexão. (Ligar só uma das duas pontas quebra a conexão.)
- [ ] **1.5 (código) Webhook `mp-connect`:** tratar desvinculação/vinculação em
  `POST /webhooks/mercadopago/...` (o formato do payload **não está documentado**: capturar um exemplo
  real, ver `req.log`, e só então implementar). Efeito: marcar a organização como desconectada e voltar o
  modo `mercadopago` para `manual`. TDD na função que interpreta o payload.
- [ ] **1.6 (código) Estado "Reconectar":** quando `mp_oauth_expira_em` estiver a < 15 dias ou a renovação
  falhar, mostrar aviso na tela `/org/:id/mercadopago` e para o dono na pelada. Hoje a renovação é
  silenciosa (`lib/mp-organizacao.ts`) e, se falhar, o dono só descobre quando o pagamento falha.
- [ ] **1.7** Registrar se o painel exigiu **aprovação/certificação** da aplicação para OAuth em produção
  (não achei exigência na documentação; páginas de certificação não foram lidas).

## Fase 2 — Modelo de negócio  *(precisam de decisão do dono antes do código)*

- [ ] **2.1 Taxa da plataforma sobre pagamentos de jogadores?** (`marketplace_fee`). Decidir: sim/não e
  quanto. Confirmar no sandbox se a unidade é valor ou percentual (a documentação é ambígua). Se sim:
  campo em `plataforma_config`, enviar `marketplace_fee` na preferência (só com token OAuth) e mostrar o
  resumo ao dono da organização.
- [ ] **2.2 Período grátis real.** Hoje organização nova nasce `trial` e não consegue criar pelada/receber
  membro até pagar (`organizacaoLiberada` aceita só `ativa`) — o "período de avaliação" não existe.
  Decidir a duração (ex.: o primeiro mês liberado). Sugestão: ao criar a organização, inserir uma
  liberação `manual-<orgId>` do mês atual (reaproveita `proximoMesALiberar`) e corrigir os textos em
  `Assinatura.tsx`.
- [ ] **2.3 Reembolso/desistência/cancelamento.** Hoje jogador pago não sai da lista (bloqueado) e o admin
  pode removê-lo, mas não há registro de devolução. Definir regra e estados (ex.: `reembolso_pendente`),
  tela do admin e o caso "pelada cancelada com pagos".
- [ ] **2.3b Remover jogador pago da lista (admin):** hoje `DELETE /peladas/:id/presencas/:profileId` apaga
  a linha inclusive de quem pagou. Exigir confirmação reforçada ou virar "desistiu + a devolver".
- [ ] **2.4 Financeiro / inadimplentes** (sub-projeto C do spec de 26/09): tela "Financeiro da pelada"
  (quem pagou/deve, totais por meio: manual/Pix/Mercado Pago) e lista de devedores da organização.
  Fonte: `presencas.pago_*` + `pagamentos_jogador` (já registram tudo).
- [ ] **2.5 Comprovante e avisos** (sub-projeto B do spec; automação n8n/WhatsApp do README): enviar
  comprovante ao jogador e aviso ao admin quando houver "avisou que pagou".

## Fase 3 — Limpeza e qualidade

- [ ] **3.1 Fallback do Access Token colado:** manter como "avançado" ou remover depois que o OAuth estiver
  validado em produção (`OrganizacaoMercadoPago.tsx`, `lib/mp-organizacao.ts`). Hoje o fallback existe de
  propósito para não bloquear organizações antes do OAuth.
- [ ] **3.2 Decidir `27e5123`:** descartar localmente (`git reset`/`git rebase -i` não é suportado no
  ambiente do agente — pedir ao dono ou usar `git revert`), pois nunca foi publicado e a hipótese que o
  motivou foi refutada.
- [ ] **3.3 Testes de API em CI:** transformar os roteiros de `scripts/verificacao` em `npm run verificar`
  (subir PGlite + mock + API em um comando) para rodar a cada mudança.
- [ ] **3.4 Partidas:** (a) o fim por tempo é aplicado ao consultar a API (sem cron) — avaliar job
  periódico se alguém precisar do resultado sem abrir a tela; (b) confirmar o comportamento ao **refazer o
  sorteio depois de partidas jogadas** (o histórico usa a composição congelada; só o sorteio mais recente
  gera novas partidas).
- [ ] **3.5 Pix copia e cola:** testar o código num app de banco real com valor pequeno e, se algum banco
  recusar, ajustar `shared/pix.ts` (campos 59/60 — nome e cidade — e `txid`).
- [ ] **3.6 Mobile/Android:** o app Android (Capacitor) é gerado por workflow (`apk-latest`). Conferir se
  "Copiar" (área de transferência) e o redirecionamento ao Mercado Pago funcionam dentro do WebView.

---

## Referência rápida

### Onde está cada coisa
| Assunto | Arquivos principais |
|---|---|
| Mensalidade (MP, avulso, manual, diagnóstico) | `apps/api/src/modules/{admin-plataforma,webhook-assinatura,organizacoes}`, `lib/{liberacao-manual,pagamento-avulso,mercadopago-*}.ts`, `packages/shared/src/assinatura.ts` |
| Pagamento dos jogadores | `apps/api/src/modules/pagamento-jogadores/rotas.ts`, `lib/{mp-organizacao,mercadopago-oauth,pagamento-jogador}.ts`, `packages/shared/src/{pagamento-jogador,pix}.ts`, `apps/web/src/routes/{OrganizacaoMercadoPago,Pelada}.tsx` |
| Partidas | `apps/api/src/modules/partidas/rotas.ts`, `packages/shared/src/partida.ts`, `apps/web/src/routes/PartidasPelada.tsx` |
| Sorteio | `packages/shared/src/sorteio.ts`, `apps/api/src/modules/sorteio/rotas.ts`, `apps/web/src/routes/Pelada.tsx` |
| Banco | `db/migrations/0010…0016`, `apps/api/src/db/schema.ts` |
| Verificação | `scripts/verificacao/README.md` |

### Perguntas abertas ao dono do projeto
1. Cobrar **taxa da plataforma** sobre o pagamento dos jogadores? Quanto? (2.1)
2. Qual a duração do **período grátis** para organização nova? (2.2)
3. Política de **reembolso** quando o jogador paga e desiste, ou a pelada é cancelada? (2.3)
4. O painel do Mercado Pago pediu **aprovação** da aplicação para OAuth? (1.7)

### Verificação antes de encerrar qualquer tarefa
`npm run build --workspace @resenha05/shared && npm run typecheck && npm test && npm run build --workspace @resenha05/web`;
se mexeu na API/banco, rodar os roteiros relevantes de `scripts/verificacao`; se mexeu em tela, olhar no
navegador (preview `api-dev` + `web-dev` do `.claude/launch.json`).
