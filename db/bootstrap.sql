-- =============================================================================
-- bootstrap.sql — GERADO por db/build-bootstrap.mjs. NÃO edite à mão.
-- =============================================================================
-- Do zero ao schema completo, num único psql. Rode UMA vez como superusuário,
-- conectado ao banco "postgres":
--
--   psql -h HOST -U postgres -f db/bootstrap.sql
--
-- >>> EDITE a senha na linha abaixo antes de rodar <<<
\set app_password 'TROQUE_ESTA_SENHA_FORTE'
-- =============================================================================
\set ON_ERROR_STOP on

\echo '== role resenha05_app =='
-- \gexec: monta o CREATE ROLE só se o papel ainda não existe. A senha vem da
-- variável psql \set acima (interpolada aqui, fora de qualquer aspas).
SELECT format('CREATE ROLE resenha05_app LOGIN PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'resenha05_app')\gexec

\echo '== database resenha05 =='
SELECT 'CREATE DATABASE resenha05 OWNER resenha05_app'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'resenha05')\gexec

\connect resenha05
ALTER SCHEMA public OWNER TO resenha05_app;
GRANT ALL ON SCHEMA public TO resenha05_app;
SET ROLE resenha05_app;

CREATE TABLE IF NOT EXISTS _migrations (
  nome        text PRIMARY KEY,
  aplicada_em timestamptz NOT NULL DEFAULT now()
);


-- ============================ 0001_core.sql ============================
\echo '== 0001_core.sql =='
BEGIN;
-- =============================================================================
-- 0001_core — núcleo multi-organizador (Fases 0 a 3)
-- =============================================================================
-- profiles, sessoes, perfil_extra, organizacoes, organizacao_membros.
-- Sem extensões: gen_random_uuid() é nativo do PostgreSQL 13+.
-- Autenticação, autorização e cifra de segredos ficam na API.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- profiles — identidade global do jogador + credencial de acesso
-- -----------------------------------------------------------------------------
create table profiles (
  id                     uuid primary key default gen_random_uuid(),
  nome                   text,
  telefone               text not null unique,
  senha_hash             text not null,
  telefone_verificado_em timestamptz,
  foto_url               text,
  time_coracao           text,
  created_at             timestamptz not null default now(),
  atualizado_em          timestamptz not null default now()
);

comment on table profiles is
  'Identidade global do jogador + credencial. Papel e estrelas ficam em organizacao_membros.';
comment on column profiles.telefone_verificado_em is
  'Preenchido quando o codigo enviado por WhatsApp e confirmado. No MVP a API preenche direto no cadastro.';

-- Normaliza e valida o telefone em qualquer insert/update (defesa em profundidade).
create or replace function normalize_telefone()
returns trigger
language plpgsql
as $$
begin
  new.telefone := regexp_replace(new.telefone, '[^0-9+]', '', 'g');
  if left(new.telefone, 1) <> '+' then
    new.telefone := '+' || new.telefone;
  end if;
  if new.telefone !~ '^\+55[0-9]{10,11}$' then
    raise exception 'Telefone invalido (%). Use +55 seguido de DDD e numero.', new.telefone;
  end if;
  return new;
end;
$$;

create trigger trg_normalize_telefone
  before insert or update of telefone on profiles
  for each row execute function normalize_telefone();

create or replace function touch_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger trg_profiles_touch
  before update on profiles
  for each row execute function touch_atualizado_em();

-- -----------------------------------------------------------------------------
-- sessoes — refresh tokens rotativos (o access token JWT nao e persistido)
-- -----------------------------------------------------------------------------
create table sessoes (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid not null references profiles (id) on delete cascade,
  token_hash     text not null unique,
  user_agent     text,
  criado_em      timestamptz not null default now(),
  expira_em      timestamptz not null,
  revogado_em    timestamptz
);

create index idx_sessoes_profile on sessoes (profile_id) where revogado_em is null;

-- -----------------------------------------------------------------------------
-- perfil_extra — "Complete seu cadastro" (Fase 2, opcional)
-- -----------------------------------------------------------------------------
create table perfil_extra (
  profile_id       uuid primary key references profiles (id) on delete cascade,
  data_nascimento  date,
  email            text,
  cidade           text,
  posicao          text,
  pe_preferido     text,
  tamanho_camisa   text,
  aceite_marketing boolean not null default false,
  atualizado_em    timestamptz not null default now()
);

comment on column perfil_extra.aceite_marketing is
  'Consentimento LGPD explicito e separado (campanhas/vendas). Desmarcado por padrao.';

create trigger trg_perfil_extra_touch
  before update on perfil_extra
  for each row execute function touch_atualizado_em();

-- -----------------------------------------------------------------------------
-- organizacoes — uma linha por organizador aderido a plataforma
-- -----------------------------------------------------------------------------
-- O Access Token de Mercado Pago e gravado CIFRADO pela API (AES-256-GCM).
-- A chave mestra vive so na env RESENHA05_ENC_KEY. Nada de token em texto puro.
create table organizacoes (
  id                     uuid primary key default gen_random_uuid(),
  nome                   text not null,
  dono_id                uuid not null references profiles (id),
  mp_token_cipher        bytea,
  mp_token_nonce         bytea,
  mp_token_atualizado_em timestamptz,
  status_assinatura      text not null default 'trial'
    check (status_assinatura in ('trial','ativa','inadimplente','cancelada')),
  criado_em              timestamptz not null default now()
);

comment on column organizacoes.mp_token_cipher is
  'Access Token de Mercado Pago da organizacao, cifrado pela API. NULL = ainda nao conectou.';

create index idx_organizacoes_dono on organizacoes (dono_id);

-- -----------------------------------------------------------------------------
-- organizacao_membros — papel e estrelas sao por organizacao, nao globais
-- -----------------------------------------------------------------------------
create table organizacao_membros (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references organizacoes (id) on delete cascade,
  profile_id     uuid not null references profiles (id) on delete cascade,
  papel          text not null check (papel in ('jogador','admin','admin_principal')),
  estrelas       smallint not null default 3 check (estrelas between 1 and 5),
  ativo          boolean not null default true,
  entrou_em      timestamptz not null default now(),
  unique (organizacao_id, profile_id)
);

create index idx_membros_org     on organizacao_membros (organizacao_id) where ativo;
create index idx_membros_profile on organizacao_membros (profile_id)     where ativo;

-- Trava: no maximo 5 admins ativos e no maximo 1 admin_principal por organizacao.
create or replace function enforce_membro_papel()
returns trigger
language plpgsql
as $$
declare
  admin_count int;
  principal_count int;
begin
  if new.papel = 'admin' and new.ativo then
    select count(*) into admin_count
    from organizacao_membros
    where organizacao_id = new.organizacao_id
      and papel = 'admin' and ativo
      and profile_id <> new.profile_id;
    if admin_count >= 5 then
      raise exception 'Esta organizacao ja tem 5 administradores ativos' using errcode = 'check_violation';
    end if;
  elsif new.papel = 'admin_principal' and new.ativo then
    select count(*) into principal_count
    from organizacao_membros
    where organizacao_id = new.organizacao_id
      and papel = 'admin_principal' and ativo
      and profile_id <> new.profile_id;
    if principal_count >= 1 then
      raise exception 'Esta organizacao ja tem um admin_principal' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_enforce_membro_papel
  before insert or update of papel, ativo on organizacao_membros
  for each row execute function enforce_membro_papel();

-- -----------------------------------------------------------------------------
-- Funcoes de apoio para a API (deixam as queries de autorizacao mais limpas)
-- -----------------------------------------------------------------------------
create or replace function is_org_admin(p_profile_id uuid, p_org_id uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from organizacao_membros
    where organizacao_id = p_org_id and profile_id = p_profile_id
      and papel in ('admin','admin_principal') and ativo
  );
$$;

create or replace function is_org_owner(p_profile_id uuid, p_org_id uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from organizacoes where id = p_org_id and dono_id = p_profile_id
  );
$$;
INSERT INTO _migrations (nome) VALUES ('0001_core.sql') ON CONFLICT DO NOTHING;
COMMIT;

-- ============================ 0002_peladas.sql ============================
\echo '== 0002_peladas.sql =='
BEGIN;
-- =============================================================================
-- 0002_peladas — configuracoes, instancias e lista de presenca (Fase 4)
-- =============================================================================

-- O "molde" recorrente. Cada pelada tem seu proprio dia da semana e horario.
create table pelada_configuracoes (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references organizacoes (id) on delete cascade,
  nome           text not null,
  dia_semana     smallint not null check (dia_semana between 0 and 6),  -- 0 = domingo
  horario_jogo   time not null,
  horario_lista  time not null,
  local          text,
  valor_padrao   numeric(10,2),
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now()
);

comment on column pelada_configuracoes.dia_semana is '0=domingo ... 6=sabado (ISO extract(dow)).';
comment on column pelada_configuracoes.horario_lista is 'Hora em que a lista da semana e gerada e enviada.';

create index idx_config_org on pelada_configuracoes (organizacao_id) where ativo;

-- Instancia semanal de uma pelada_configuracoes (ou avulsa / torneio).
create table peladas (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references organizacoes (id) on delete cascade,
  config_id      uuid references pelada_configuracoes (id) on delete set null,
  tipo           text not null default 'pelada' check (tipo in ('pelada','torneio','campeonato')),
  data           date not null,
  hora           time,
  local          text,
  valor          numeric(10,2),
  status         text not null default 'aberta'
    check (status in ('aberta','fechada','realizada','cancelada')),
  criado_em      timestamptz not null default now(),
  unique (config_id, data)
);

create index idx_peladas_org  on peladas (organizacao_id, data desc);
create index idx_peladas_data on peladas (data) where status = 'aberta';

-- Fonte da lista de presenca exibida em tempo real.
create table presencas (
  id            uuid primary key default gen_random_uuid(),
  pelada_id     uuid not null references peladas (id) on delete cascade,
  profile_id    uuid not null references profiles (id) on delete cascade,
  status        text not null default 'confirmado'
    check (status in ('confirmado','pago','desistiu')),
  confirmado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (pelada_id, profile_id)
);

create index idx_presencas_pelada on presencas (pelada_id);

create trigger trg_presencas_touch
  before update on presencas
  for each row execute function touch_atualizado_em();

-- Notifica a API (LISTEN presenca_mudou) para empurrar a lista via SSE (Fase 7B).
create or replace function notify_presenca_mudou()
returns trigger
language plpgsql
as $$
declare
  pid uuid := coalesce(new.pelada_id, old.pelada_id);
begin
  perform pg_notify('presenca_mudou', pid::text);
  return null;
end;
$$;

create trigger trg_presencas_notify
  after insert or update or delete on presencas
  for each row execute function notify_presenca_mudou();
INSERT INTO _migrations (nome) VALUES ('0002_peladas.sql') ON CONFLICT DO NOTHING;
COMMIT;

-- ============================ 0003_sorteio.sql ============================
\echo '== 0003_sorteio.sql =='
BEGIN;
-- =============================================================================
-- 0003_sorteio — resultado do sorteio de times (Fase 5)
-- =============================================================================

create table sorteios (
  id         uuid primary key default gen_random_uuid(),
  pelada_id  uuid not null references peladas (id) on delete cascade,
  n_times    smallint not null check (n_times between 2 and 32),
  criado_em  timestamptz not null default now(),
  criado_por uuid references profiles (id) on delete set null
);

create index idx_sorteios_pelada on sorteios (pelada_id, criado_em desc);

create table times (
  id         uuid primary key default gen_random_uuid(),
  sorteio_id uuid not null references sorteios (id) on delete cascade,
  numero     smallint not null,
  nome       text,
  unique (sorteio_id, numero)
);

create table time_jogadores (
  time_id    uuid not null references times (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  estrelas   smallint not null check (estrelas between 1 and 5),
  primary key (time_id, profile_id)
);

create index idx_time_jogadores_time on time_jogadores (time_id);
INSERT INTO _migrations (nome) VALUES ('0003_sorteio.sql') ON CONFLICT DO NOTHING;
COMMIT;

\echo ''
\echo 'Pronto. Schema resenha05 criado. Deploys seguintes: node db/migrate.mjs'
