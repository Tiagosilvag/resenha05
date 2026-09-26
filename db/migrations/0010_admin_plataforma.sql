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
