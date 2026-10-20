# Histórico da sessão — outubro/2026

Documento para **retomar o trabalho em outra sessão**. Reúne o que foi pedido, decidido,
construído e descoberto, com os commits e o que ainda falta. O plano de próximos passos está em
[`docs/superpowers/plans/2026-10-20-pagamentos-e-proximos-passos.md`](superpowers/plans/2026-10-20-pagamentos-e-proximos-passos.md).

> Convenções: "dono" = administrador principal da organização (`admin_principal`);
> "admin" = `admin` ou `admin_principal`; "admin de plataforma" = quem administra o app todo
> (tabela `plataforma_admins`; o "dev" é fixo por `PLATAFORMA_DEV_TELEFONE`).

---

## 1. Como o projeto funciona (o essencial para retomar)

| Item | Detalhe |
|---|---|
| Monorepo (npm workspaces) | `apps/api` (Fastify 5 + Kysely + zod + vitest), `apps/web` (React 18 + Vite + TanStack Query + Tailwind), `packages/shared` (schemas zod e lógica pura) |
| **Shared é compilado** | a API usa `packages/shared/dist`. Depois de mexer no shared: `npm run build --workspace @resenha05/shared` (senão o typecheck da API não enxerga) |
| Banco | Postgres. Migrations em `db/migrations/NNNN_*.sql`, aplicadas no start do container por `node db/migrate.mjs`. Ao criar migration, rodar `npm run db:bootstrap:build` (regenera `db/bootstrap.sql`) |
| Deploy | Coolify, app Docker Compose `hkiv7ifyqlc7fm5b5xsyugq6`. Domínios: `resenha05.coffetech.com.br` (web/nginx, faz proxy de `/api`) e `apiresenha05.coffetech.com.br` (api). Deploy pelo MCP do Coolify (`deploy` → `get_deployment`). O MCP **não** lê/grava valores de variáveis de ambiente e só mostra log do nginx (log de migration não aparece) |
| Segredos | Access Tokens ficam cifrados (AES-256-GCM, `RESENHA05_ENC_KEY`). Nunca em env nem em claro |
| Testes | `npm test` (shared 163, api 59 no momento). Typecheck: `npm run typecheck`. Build web: `npm run build --workspace @resenha05/web` |
| Verificação ponta a ponta | roteiros e mock do Mercado Pago em [`scripts/verificacao/`](../scripts/verificacao/README.md) |

### Preferências do dono do projeto (importante)
- Fala **português**. Quer explicações diretas, sem jargão desnecessário.
- **Só faz push/deploy quando pede** ("pode fazer"). Eu sempre pergunto antes.
- **Um commit por tarefa**; trabalho na `main` local.
- **Não colar segredos no chat.** (Um Access Token do Mercado Pago foi colado em conversas
  anteriores: **renovar** se ainda não foi.)
- Valida visualmente: prefiro verificar no navegador antes de dizer que está pronto.
- Windows + Git Bash: **heredocs grandes quebram**. Use a ferramenta de escrita de arquivos ou
  scripts `.py`/`.mjs` em arquivo.

---

## 2. Linha do tempo do que foi entregue

Legenda: ✅ no ar (em `origin/main`, deploy feito) · 🟡 só local (commitado, **não publicado**).

### 2.1 Administração da plataforma e mensalidade (spec/plano de 26/09)
Documentos: `docs/superpowers/specs/2026-09-26-admin-plataforma-e-assinatura-design.md` e
`.../plans/2026-09-26-admin-plataforma-e-assinatura.md` (plano **concluído**).
- ✅ Admin de plataforma (papéis dev/admin), tabelas `plataforma_admins`, `plataforma_config`, `assinaturas` (migration 0010), grandfathering das organizações existentes.
- ✅ Assinatura mensal pelo Mercado Pago (preapproval), webhook idempotente com `x-signature`, bloqueio de entrar em organização e criar pelada com mensalidade pendente.
- ✅ Telas: checkout da assinatura (`Assinatura.tsx`), painel `/admin` (organizações, participantes, admins, configurações).
- ✅ Token da conta geral e segredo do webhook cadastrados **pelo painel** (cifrados), não por env (0011).
- ✅ Dono vincula a conta MP da organização (`OrganizacaoMercadoPago.tsx`, hoje reaproveitada — ver 3.4).
- ✅ Dev exclui contas de participantes; admins de plataforma veem detalhe (somente leitura) de cada organização.
- ✅ Checkout pede o e-mail do pagador (erro do MP "payer e collector devem ser ambos reais ou teste").
- ✅ Mensagem de erro de criptografia diz "ausente" vs "tamanho errado" (`validarChave`).

### 2.2 Peladas e sorteio
- ✅ Lista de presença filtrável por status; sorteio só com quem **pagou** quando a pelada tem valor (`peladaExigePagamento`/`statusNoSorteio` em `shared/sorteio.ts`).
- ✅ **Contas do evento** (0012): admin cadastra jogador só com nome e telefone; senha provisória `123456`, troca obrigatória e validade de 3 dias (`shared/senha-provisoria.ts`, `/auth/definir-senha`).
- ✅ **Sorteio com rascunho/confirmação** (0013): só admin vê o rascunho; "Confirmar sorteio" libera para os participantes; cancelar confirmação; ajuste manual pelo modal "Editar time".
- ✅ **Sorteio por "jogadores por time"** (`sortearTimesPorTamanho`): times cheios de N + um time com a sobra (ex.: 11 com 5 por time → 5, 5, 1). A diferença de estrelas ignora o time da sobra (`amplitudeEntreTimesCheios`).
- ✅ Botão **"Adicionar todos da organização"** na pelada (`POST /peladas/:id/presencas/todos`; não altera quem já está na lista).
- ✅ Estrelas do jogador por botões **− / +** (otimista) no lugar do slider.

### 2.3 Partidas dentro da pelada (migrações 0014 e 0015)
- ✅ **Tela `/peladas/:id/partidas`**: regras por pelada (duração e limite de gols), partida com iniciar/pausar/retomar/encerrar, **cronômetro por timestamps** (não depende do navegador), gols individuais com autor, fim automático por tempo ou gols, histórico, artilharia da pelada.
- ✅ **Redistribuição do time perdedor**: o time que perde se desfaz para completar o time incompleto, escolhendo os jogadores que deixam o novo time mais perto, em estrelas, do time que continua (`redistribuirPerdedor`; empate de equilíbrio é sorteado).
- ✅ **Substituição durante a partida** (cansaço/lesão): sai um, entra o "melhor encaixe" de quem espera (`rankearSubstitutos`); quem saiu vai para o **último time da fila** (`filaDeEspera`) ou deixa os times (lesão).
- ✅ Gols removidos ficam gravados com quem removeu (soft delete) e saem da artilharia; a composição de cada partida fica congelada (`partida_jogadores`); só 1 partida aberta por pelada (índice único parcial).
- ✅ Artilharia ganhou filtro **por pelada** (`GET /organizacoes/:id/artilharia?peladaId=`).
- Decisões: gol removido que fechou a partida reabre como **pausada**; depois de "Concluir" não corrige gol; não cancela confirmação do sorteio nem muda regras com partida aberta.

### 2.4 Mensalidade — liberação manual, pagamento avulso, diagnóstico
- ✅ **Liberar mês** (botão no detalhe da organização, admin de plataforma): cria linha `assinaturas` com id `manual-<orgId>`; vence no último dia do mês; liberar de novo estende (até 12 meses). Varredura devolve a "pendente" quando vence (boot + a cada hora + ao abrir o painel). (`lib/liberacao-manual.ts`)
- ✅ **Diagnóstico de cobrança** (`/admin` → Configurações): consulta o Mercado Pago (conta vendedora, última assinatura e uma operação) e explica a recusa.
- 🟡 **Pagamento avulso do mês** (`fc2bd36`): o dono paga **Pix ou cartão como convidado** (Checkout Pro), sem conta no MP. Não renova sozinho. Linhas `avulso-<chave>` em `assinaturas`; o pagamento é **reconsultado no MP com o token da plataforma** antes de liberar (webhook `type=payment` e volta do comprador com `payment_id`).

### 2.5 Pagamento dos jogadores (migração 0016) — 🟡 `0460061`
Ver seção 3. Inclui proteção do "pago" e trilha de auditoria.

### 2.6 Documentação
- 🟡 `76c1419`: [`docs/guia-mercadopago-oauth.md`](guia-mercadopago-oauth.md) — passo a passo do painel do Mercado Pago para o OAuth.

### 2.7 Estado do git (no momento deste documento)
- `origin/main` termina em `565dbb8` (diagnóstico de cobrança).
- **Commits locais ainda não publicados**: `27e5123`, `fc2bd36`, `0460061`, `76c1419` (+ os commits desta documentação).
- `27e5123` (*webhook do MP monta o manifesto só com o que a notificação trouxe*) foi feito por uma
  suspeita que se mostrou desnecessária; **foi mantido de fora de propósito**. Publicar só os outros
  por cherry-pick (ver plano, seção "Como publicar").

---

## 3. Pagamentos: raciocínio, decisões e descobertas

### 3.1 Dois fluxos de dinheiro diferentes
1. **Organização → plataforma (mensalidade).** Conta MP da **plataforma**. Opções: assinatura recorrente (preapproval), pagamento avulso do mês (Pix/cartão sem conta) ou liberação manual.
2. **Jogador → organização (taxa da pelada).** Conta MP **da própria organização** (nunca a da plataforma, para não virar intermediação de pagamento).

### 3.2 Diagnóstico do modelo de negócio (feito nesta sessão)
Achados no código, **antes** da implementação nova:
1. O "pago" podia ser **apagado pelo próprio jogador** (sair da lista apagava a linha; confirmar de novo sobrescrevia o status). → **corrigido** (0460061).
2. Sem trilha: não guardava quem marcou, quando, quanto e meio. → **corrigido** (colunas `pago_*` em `presencas`).
3. O jogador **não via como pagar** (sem chave Pix/instruções). → **corrigido** (modo Pix).
4. A conta MP da organização era cadastrada (token colado) e **nunca usada**. → agora usada no modo automático.
5. **O "trial" não existe de fato**: organização nova nasce `trial`, mas só `ativa` pode criar pelada/receber membro (`organizacaoLiberada`). Onboarding exige pagar antes de testar. → **pendente** (ver plano).
6. Não há ledger/lista de inadimplentes nem regra de reembolso (desistência/cancelamento depois de pagar). → **pendente**.

### 3.3 Decisão do dono do produto
> "A e B, quem decide será o dono da organização." (modo **manual**, **A = Pix do dono**, **B = Mercado Pago automático**)

Implementado como `organizacoes.pagamento_jogador_modo` (`manual | pix | mercadopago`), alterado só pelo
**dono**. A taxa da plataforma sobre pagamentos de jogadores **não** foi implementada (decisão em aberto).

### 3.4 Como funciona cada modo
- **Manual:** o admin marca "pago" na lista (como antes, agora com trilha).
- **A — Pix:** o dono cadastra chave Pix, nome do recebedor e recado. O jogador vê a chave, copia a chave ou o **"Pix copia e cola" com o valor já preenchido** (`shared/pix.ts`, BR Code + CRC16 testado com o vetor padrão) e toca em **"Já paguei"** (`presencas.pagamento_declarado_em`). O admin vê "avisou que pagou" e confirma (vira `pago_metodo = 'pix'`).
- **B — Mercado Pago automático:** o jogador toca em "Pagar R$ X" → preferência (Checkout Pro) criada **com o token da organização** → paga como convidado → ao voltar (`?payment_id=`) o sistema confere; o aviso (`/api/webhooks/mercadopago/pagamento-jogador/:orgId`) cobre quem fechou a aba. **Todo pagamento é reconsultado no MP com o token da organização antes de marcar "pago"** (não confiamos no webhook). Cobrança pendente vive em `pagamentos_jogador` (referência `jogador:<id>`).
- **Conexão da conta do dono:** botão **"Conectar com Mercado Pago"** (OAuth, `lib/mercadopago-oauth.ts`, `lib/mp-organizacao.ts`): tokens cifrados, renovação automática 7 dias antes de vencer, estado de uso único (`oauth_estados`, 15 min), PKCE opcional (`MP_OAUTH_PKCE=1`). Enquanto `MP_OAUTH_CLIENT_ID/SECRET` não estiverem configurados, o botão não aparece e vale o **Access Token colado** (jeito antigo, mantido de propósito como fallback).

### 3.5 Escalabilidade da integração (a pergunta do dono: "isso não é escalável")
Resposta e decisão: usar **OAuth do Mercado Pago**. Uma única aplicação da plataforma no painel de
desenvolvedor; cada dono só clica em Conectar, entra na própria conta e autoriza — sem criar aplicação,
sem copiar credencial. O passo a passo do painel está em `docs/guia-mercadopago-oauth.md`.
**Falta o dono do produto fazer a configuração no painel e criar as variáveis no Coolify** (ver plano).

### 3.6 O que a documentação oficial do Mercado Pago diz (pesquisado nesta sessão)
- **Assinaturas e Checkout Pro aceitam pagador convidado** (sem conta MP); meios incluem Pix, cartão e boleto. Para assinatura recorrente sem conta a documentação não detalha Pix/boleto na recorrência.
- Assinatura com `status: authorized` exige `card_token_id`; sem ele fica `pending` e o pagador conclui no `init_point`.
- **Não há valor mínimo documentado** para assinatura (exemplos usam R$ 10).
- Checkout Pro: `POST /checkout/preferences` (`items`, `external_reference`, `back_urls`, `auto_return`, `notification_url`); `back_urls` e `notification_url` **não aceitam localhost**; na volta o MP acrescenta `payment_id`, `status`, `collection_status`, `external_reference`…
- Notificação de pagamento: `type=payment`, `data.id`; formato antigo `?topic=payment&id=`; consultar `GET /v1/payments/{id}`. **Pagamentos de teste não enviam notificação.**
- **Não confirmado**: se a notificação da `notification_url` da preferência vem com `x-signature` validável (a documentação só associa a assinatura secreta ao webhook configurado no painel). Por isso o sistema **sempre reconsulta**.
- **OAuth**: URL de autorização `https://auth.mercadopago.com/authorization?client_id&response_type=code&platform_id=mp&state&redirect_uri` (host `.com`, não `.com.br`); `POST /oauth/token` (corpo JSON) com `authorization_code`; resposta tem `access_token`, `refresh_token`, `user_id`, `expires_in` (15552000 = **180 dias**), `public_key`; renovar com `refresh_token` (vem um **novo** refresh token a cada renovação); `redirect_uri` HTTPS, estática e idêntica à cadastrada; code vale 10 min e uso único; escopos `read write offline_access`; webhook `mp-connect` avisa vinculação/desvinculação.
- `marketplace_fee` (taxa da plataforma) existe na preferência; **a unidade (valor vs percentual) não está clara** na documentação.
- Não foi encontrada na documentação exigência de **aprovação/certificação** da aplicação para OAuth em produção (as páginas de certificação não foram lidas).

### 3.7 Investigação do erro de pagamento (R$ 1 / produção)
O dono relatou "erro no pagamento" na tela do MP com R$ 1 e depois R$ 5, com dois cartões
(mensagens: *"Seu pagamento foi recusado… use o meio de pagamento e dispositivo que costuma usar"* e
*"Não foi possível processar seu pagamento"*). Causa provável: **recusa de risco/antifraude do MP**
(conta/cartão/aparelho fora do habitual; quem vende não paga a si mesmo). Foi criado o **Diagnóstico de
cobrança** (consulta a operação e mostra o `status_detail`). **Desfecho:** o dono reportou *"deu certo,
acredito que seja algum bug nos meus equipamentos"* — pagamento passou depois. Não houve defeito no código.
Lembrete: a mensalidade ficou configurada em **R$ 1/R$ 5 para teste** — voltar ao valor real
(Administração → Configurações).

---

## 4. Banco de dados (migrações desta sessão)

| # | O que adiciona |
|---|---|
| 0010 | `plataforma_admins`, `plataforma_config`, `assinaturas`; grandfathering de organizações existentes |
| 0011 | segredo do webhook (cifrado) na `plataforma_config` |
| 0012 | senha provisória (`profiles`) |
| 0013 | `sorteios.confirmado_em` (rascunho vs confirmado) |
| 0014 | regras da pelada (`partida_duracao_min`, `partida_gols_limite`); em `jogos`: times do sorteio, cronômetro por timestamps, encerramento, vencedor/perdedor, `concluido_em`, `redistribuicao` (jsonb); tabela `partida_jogadores`; `sumula_eventos` com `time_pelada_id`, `criado_por`, `removido_*`; view `v_eventos_jogador` ignora removidos e expõe `pelada_id`; índice único: 1 partida aberta por pelada |
| 0015 | `partida_jogadores.entrou_em/saiu_em`; tabela `partida_substituicoes` |
| 0016 | `organizacoes`: `pagamento_jogador_modo`, `pix_*`, `mp_oauth_*`; `presencas`: `pago_em/pago_por/pago_valor/pago_metodo/mp_payment_id/pagamento_declarado_em`; tabelas `pagamentos_jogador`, `oauth_estados`; marca quem já estava "pago" como `manual` |

Convenções em `assinaturas.mp_preapproval_id`: sem prefixo = assinatura recorrente MP; `manual-<orgId>` =
liberação manual; `avulso-<chave>` = pagamento avulso. Os dois últimos **vencem no fim do mês**
(`ehPeriodoLimitado`); a assinatura MP não expira por data.

## 5. Rotas novas (resumo)
- **Mensalidade:** `POST /admin/organizacoes/:id/liberar-mes`; `GET /admin/diagnostico-mp?operacao=`; `POST /organizacoes/:id/assinatura/avulso` e `.../avulso/conferir`; `GET /organizacoes/:id` agora traz `venceEm`, `assinaturaAutomatica`, `proximoMesAvulso`, `mensalidadeCentavos`.
- **Webhook (público):** `POST /webhooks/mercadopago/assinatura` (assinaturas + pagamento avulso da mensalidade) e `POST /webhooks/mercadopago/pagamento-jogador/:orgId`.
- **Pagamento dos jogadores:** `GET/PUT /organizacoes/:id/pagamento-jogadores`; `POST /organizacoes/:id/mercadopago/oauth/iniciar`; `DELETE /organizacoes/:id/mercadopago/oauth`; `GET /oauth/mercadopago/callback` (público); `POST /peladas/:id/pagamento/declarar`; `POST /peladas/:id/pagamento/mercadopago` e `.../conferir`.
- **Partidas:** `GET /peladas/:id/partidas`; `PUT .../partidas/regras`; `POST .../partidas`; `POST /partidas/:id/{iniciar,pausar,retomar,encerrar,gols,substituicoes,concluir}`; `DELETE /partidas/:id` e `.../gols/:eventoId`.
- **Pelada:** `POST /peladas/:id/presencas/todos`.

## 6. Variáveis de ambiente novas
| Variável | Para quê | Onde |
|---|---|---|
| `MP_OAUTH_CLIENT_ID` / `MP_OAUTH_CLIENT_SECRET` | aplicação OAuth da plataforma (botão "Conectar") | Coolify (já declaradas no `docker-compose.yaml`; vazias = recurso desligado) |
| `MP_OAUTH_PKCE` | `1` só depois de ligar o PKCE no painel do MP | Coolify |
| `MP_API_BASE` | **apenas testes locais** (aponta a API para o mock do MP) | `apps/api/.env` (gitignored). **Nunca em produção** |

## 7. Armadilhas conhecidas
- Rodar `npm run build --workspace @resenha05/shared` antes do typecheck da API se mexer no shared.
- O harness local usa **PGlite**: sob carga/duplicidade ele pode derrubar conexões ("Connection terminated unexpectedly") — é limitação do emulador, não bug do app. Reiniciar o `serve.mjs`.
- Telefones de teste precisam ser celular BR válido (`+55 DD 9 XXXXXXXX`).
- Corpo vazio com `Content-Type: application/json` dá 400 no Fastify (o front não envia o header sem corpo).
- A pasta `uploads/` local é artefato de teste (agora ignorada pelo git).
- Log da migration em produção não aparece pelo MCP do Coolify: confira pelo painel do Coolify se quiser a mensagem "applied".
