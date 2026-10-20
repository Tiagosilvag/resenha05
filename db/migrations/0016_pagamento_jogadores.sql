-- =============================================================================
-- 0016_pagamento_jogadores — como o jogador paga a pelada (decide o dono da
-- organização): manual, Pix do dono (A) ou Mercado Pago automático (B).
-- =============================================================================

alter table organizacoes
  -- manual: só o admin marca "pago"; pix: jogador vê a chave e avisa "já paguei";
  -- mercadopago: jogador paga por Pix/cartão e o "pago" é marcado sozinho.
  add column pagamento_jogador_modo text not null default 'manual'
    check (pagamento_jogador_modo in ('manual', 'pix', 'mercadopago')),
  add column pix_chave        text,
  add column pix_favorecido   text,
  add column pix_instrucoes   text,
  -- Conta Mercado Pago ligada por OAuth ("Conectar"): tokens cifrados (nunca em claro).
  add column mp_oauth_user_id        text,
  add column mp_oauth_access_cipher  bytea,
  add column mp_oauth_access_nonce   bytea,
  add column mp_oauth_refresh_cipher bytea,
  add column mp_oauth_refresh_nonce  bytea,
  add column mp_oauth_expira_em      timestamptz,
  add column mp_oauth_conectado_em   timestamptz;

-- Trilha do pagamento: quem marcou, quando, quanto e por qual meio. Sem isso "pago"
-- era só um status que qualquer mudança apagava sem deixar rastro.
alter table presencas
  add column pago_em                  timestamptz,
  add column pago_por                 uuid references profiles (id) on delete set null,
  add column pago_valor               numeric(10, 2),
  add column pago_metodo              text check (pago_metodo in ('manual', 'pix', 'mercadopago')),
  add column mp_payment_id            text,
  -- O jogador avisou que pagou (modo Pix); o admin ainda precisa confirmar.
  add column pagamento_declarado_em   timestamptz;

-- Quem já estava como "pago" antes desta migration ganha o registro mínimo.
update presencas set pago_em = atualizado_em, pago_metodo = 'manual' where status = 'pago';

-- Cobranças feitas ao jogador pelo Mercado Pago (modo mercadopago): uma linha por tentativa.
create table pagamentos_jogador (
  id              uuid primary key default gen_random_uuid(),
  organizacao_id  uuid not null references organizacoes (id) on delete cascade,
  pelada_id       uuid not null references peladas (id) on delete cascade,
  profile_id      uuid not null references profiles (id) on delete cascade,
  valor_centavos  integer not null check (valor_centavos > 0),
  status          text not null default 'pendente'
    check (status in ('pendente', 'aprovado', 'cancelado')),
  mp_payment_id   text,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

create index idx_pagamentos_jogador_pelada on pagamentos_jogador (pelada_id, profile_id);

-- Estado da conexão OAuth em andamento: amarra o retorno do Mercado Pago à organização
-- certa e guarda o verificador do PKCE. Expira rápido e só vale uma vez.
create table oauth_estados (
  estado         text primary key,
  organizacao_id uuid not null references organizacoes (id) on delete cascade,
  code_verifier  text,
  criado_por     uuid references profiles (id) on delete set null,
  criado_em      timestamptz not null default now()
);
