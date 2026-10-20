# Guia: configurar o OAuth do Mercado Pago para o Resenha05

Objetivo: cada dono de organização conecta a própria conta do Mercado Pago com **um clique**
(login + autorizar), sem criar aplicação nem copiar credencial. Você (dev) configura **uma**
aplicação, uma única vez.

> Fonte: documentação oficial do Mercado Pago Brasil (OAuth, Credenciais, Webhooks, Contas de
> teste, Detalhes da aplicação). Onde a documentação não diz, está marcado **[confirmar no painel]**.
> Os rótulos entre aspas são os que a documentação cita; o painel pode mudar de nome.

## O que você terá no fim
| Item | Onde vai |
|---|---|
| Client ID (número da aplicação) | variável `MP_OAUTH_CLIENT_ID` no Coolify |
| Client Secret | variável `MP_OAUTH_CLIENT_SECRET` no Coolify (**nunca** no chat/Git) |
| URL de redirecionamento | cadastrada no painel do Mercado Pago |
| Webhook (mp-connect + pagamentos) | cadastrado no painel do Mercado Pago |

## Decisão prévia: reaproveitar a aplicação atual ou criar outra?
Recomendado: **reaproveitar a aplicação cuja credencial de produção já está em
Administração → Configurações**. Assim há um só conjunto de credenciais e um só segredo de webhook.
Se o painel não permitir adicionar a URL de redirecionamento nela, crie uma segunda aplicação
(Passo 1) e me avise: eu configuro as duas.

## Passo 1 — Criar a aplicação (só se for criar uma nova)
1. Abra https://www.mercadopago.com.br/developers/panel/app (**Suas integrações**).
2. Em **Criar nova aplicação**, escolha **Criar manualmente**.
3. Preencha (rótulos da documentação): **Nome de aplicação** (ex.: Resenha05), **Nome curto da
   aplicação**, **Descrição da aplicação**, **Setor**, **URL do site em produção**
   (`https://resenha05.coffetech.com.br`).
4. Em **Solução de pagamento a ser integrada**: **Pagamentos online**. Produto: **Checkout Pro**.
   Se aparecer **Modelo(s) de integração** com uma opção de marketplace, marque-a
   **[confirmar no painel: a documentação não cita uma opção literalmente chamada "Marketplace"]**.

## Passo 2 — URL de redirecionamento, PKCE e permissões
Em **Suas integrações → (sua aplicação) → Detalhes da aplicação → Editar dados → Configurações avançadas**:
1. **URLs de redirecionamento**: cadastre exatamente
   `https://resenha05.coffetech.com.br/api/oauth/mercadopago/callback`
   - precisa ser **HTTPS** e **estática** (sem parâmetros);
   - tem que ser idêntica à usada pelo sistema, senão o Mercado Pago devolve erro.
2. **Permissões da aplicação**: mantenha **leitura**, **escrita** e **acesso offline** ligadas
   (o "acesso offline" é o que permite renovar o token sem o dono entrar de novo).
3. **Usar o fluxo de código de autorização com o PKCE**: é recomendado e eu vou implementar.
   **Ligue só quando eu avisar** que o código está no ar (com ele ligado, o Mercado Pago passa a
   exigir os campos do PKCE em toda conexão).
4. Salve.

## Passo 3 — Ativar as credenciais de produção
Em **Suas integrações → (sua aplicação) → Credenciais de produção** (pule se já estiver ativa):
1. **Indústria**: escolha o ramo.
2. **Website (obrigatório)**: `https://resenha05.coffetech.com.br`.
3. Aceite a **Declaração de Privacidade** e os **Termos e condições**, marque o reCAPTCHA e clique em
   **Ativar credenciais de produção**.

## Passo 4 — Pegar Client ID e Client Secret
1. Em **Credenciais de produção** aparecem **Client ID** e **Client Secret**.
2. O **Client ID** é o mesmo "Número da aplicação" dos **Detalhes da aplicação**.
3. No Coolify, no recurso do Resenha05, crie as variáveis (mesmo lugar das outras):
   - `MP_OAUTH_CLIENT_ID` = Client ID
   - `MP_OAUTH_CLIENT_SECRET` = Client Secret
4. **Não cole o Client Secret no chat.** Se algum segredo vazar, use **Renovar** nas credenciais
   (atenção: renovar afeta integrações já configuradas).

## Passo 5 — Webhook da aplicação
Em **Suas integrações → (sua aplicação) → Webhooks → Configurar notificações**:
1. **URL modo produção**: `https://resenha05.coffetech.com.br/api/webhooks/mercadopago/assinatura`
   (é o endereço que já recebe os avisos da mensalidade).
2. Eventos a marcar:
   - **Vinculação de aplicações** (`mp-connect`): avisa quando um dono conecta ou desconecta a conta;
   - **Pagamentos** (`payment`);
   - e mantenha o evento de assinaturas que você já usa para a mensalidade.
3. **Salvar**. O Mercado Pago gera a **assinatura secreta** da aplicação. Se for a aplicação atual,
   o segredo é o mesmo que já está em Administração → Configurações. Se criou uma aplicação nova,
   cole o novo segredo e me avise.
4. Dica da documentação para vários vendedores: acrescentar `?cliente=...` no fim da URL ajuda a
   identificá-los (o sistema também identifica pelo pagamento).

## Passo 6 — Testar antes de usar de verdade
1. Em **Contas de teste → + Criar conta de teste** crie um **Vendedor** e um **Comprador**
   (mesmo país). Existe também o tipo **Integrador**, usado em integrações marketplace.
   Limite de 15 contas de teste, e elas não podem ser apagadas.
2. Na troca do código por token, o parâmetro `test_token: "true"` gera credenciais de sandbox
   (eu uso isso no ambiente de testes).
3. Atenção: **pagamentos de teste não enviam notificações**. Por isso o sistema também confere o
   pagamento quando o comprador volta ao site.
4. Teste final **em produção com valor baixo (R$ 1 a R$ 5)**: o dono conecta a conta real, um jogador
   paga por Pix **de outra conta** (quem vende não paga a si mesmo), e confere-se o "pago" automático.
5. A documentação **não traz** um passo a passo completo de OAuth com contas de teste
   **[confirmar no painel]**.

## Passo 7 — O que eu faço quando você terminar os passos 2 a 5
1. Rota `GET /api/oauth/mercadopago/callback` e botão **Conectar com Mercado Pago** (dono).
2. Guardar o token e o `refresh_token` cifrados e **renovar sozinho** antes dos 180 dias.
3. Tratar a desconexão (webhook `mp-connect`) e mostrar "Reconectar" ao dono.
4. Trocar a tela de colar Access Token por esse botão.
5. Cobrança do jogador pela conta do dono (opção B) e a opção A (Pix do dono) por escolha da
   organização.

## Pendências para confirmar no painel
- Se a aplicação precisa de **aprovação/certificação** para usar OAuth em produção (não encontrei
  exigência na documentação, mas não li as páginas de certificação).
- Se existe um **modelo de integração "Marketplace"** a marcar na criação.
- Se a notificação enviada pela URL de cada pagamento vem **assinada** (por isso o sistema confere
  todo pagamento no Mercado Pago antes de liberar).
- A **unidade da taxa da plataforma** (`marketplace_fee`): valor em reais ou percentual. Começamos
  com taxa zero.

## Checklist rápido
- [ ] Aplicação escolhida (atual ou nova)
- [ ] URL de redirecionamento cadastrada (idêntica à acima)
- [ ] Permissões leitura/escrita/acesso offline ligadas
- [ ] Credenciais de produção ativadas
- [ ] `MP_OAUTH_CLIENT_ID` e `MP_OAUTH_CLIENT_SECRET` no Coolify
- [ ] Webhook com `mp-connect` e `payment`
- [ ] Me avisar para eu implementar e então ligar o PKCE
