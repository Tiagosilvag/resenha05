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

-- ============================ 0004_torneios.sql ============================
\echo '== 0004_torneios.sql =='
BEGIN;
-- =============================================================================
-- 0004_torneios — torneios, campeonatos, jogos e súmula (Fase 8)
-- =============================================================================

create table torneios (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references organizacoes (id) on delete cascade,
  nome           text not null,
  formato        text not null check (formato in ('grupos','mata_mata','pontos_corridos')),
  status         text not null default 'em_andamento'
    check (status in ('em_andamento','encerrado','cancelado')),
  criado_em      timestamptz not null default now()
);

create index idx_torneios_org on torneios (organizacao_id, criado_em desc);

create table torneio_times (
  id         uuid primary key default gen_random_uuid(),
  torneio_id uuid not null references torneios (id) on delete cascade,
  nome       text not null,
  grupo      text
);

create index idx_torneio_times_torneio on torneio_times (torneio_id);

-- Um jogo pertence a um torneio OU a uma pelada (súmula de pelada avulsa).
create table jogos (
  id          uuid primary key default gen_random_uuid(),
  torneio_id  uuid references torneios (id) on delete cascade,
  pelada_id   uuid references peladas (id) on delete cascade,
  fase        text,                       -- ex.: "Grupo A", "Semifinal", "Rodada 3"
  time_a_id   uuid references torneio_times (id) on delete set null,
  time_b_id   uuid references torneio_times (id) on delete set null,
  time_a_nome text,                       -- fallback quando não há torneio_times
  time_b_nome text,
  placar_a    smallint,
  placar_b    smallint,
  data        timestamptz,
  status      text not null default 'agendado'
    check (status in ('agendado','em_andamento','encerrado')),
  criado_em   timestamptz not null default now(),
  check (torneio_id is not null or pelada_id is not null)
);

create index idx_jogos_torneio on jogos (torneio_id);
create index idx_jogos_pelada  on jogos (pelada_id);

create table sumula_eventos (
  id         uuid primary key default gen_random_uuid(),
  jogo_id    uuid not null references jogos (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  time_id    uuid references torneio_times (id) on delete set null,
  tipo       text not null
    check (tipo in ('gol','gol_contra','assistencia','cartao_amarelo','cartao_vermelho')),
  minuto     smallint check (minuto between 0 and 200),
  criado_em  timestamptz not null default now()
);

create index idx_sumula_jogo    on sumula_eventos (jogo_id);
create index idx_sumula_profile on sumula_eventos (profile_id, tipo);
INSERT INTO _migrations (nome) VALUES ('0004_torneios.sql') ON CONFLICT DO NOTHING;
COMMIT;

-- ============================ 0005_estatisticas.sql ============================
\echo '== 0005_estatisticas.sql =='
BEGIN;
-- =============================================================================
-- 0005_estatisticas — view de eventos por jogador (Fase 9)
-- =============================================================================
-- Base para artilharia e assistências, com a organização e a data de cada
-- evento resolvidas (o jogo pode vir de torneio ou de pelada).

create view v_eventos_jogador as
select
  se.id,
  se.profile_id,
  se.tipo,
  se.jogo_id,
  coalesce(j.data, se.criado_em)                 as quando,
  coalesce(t.organizacao_id, p.organizacao_id)   as organizacao_id
from sumula_eventos se
join jogos j       on j.id = se.jogo_id
left join torneios t on t.id = j.torneio_id
left join peladas p  on p.id = j.pelada_id;
INSERT INTO _migrations (nome) VALUES ('0005_estatisticas.sql') ON CONFLICT DO NOTHING;
COMMIT;

-- ============================ 0006_foto_recortada.sql ============================
\echo '== 0006_foto_recortada.sql =='
BEGIN;
-- =============================================================================
-- 0006_foto_recortada — marca se a foto de perfil já vem sem fundo (estilo FUT)
-- =============================================================================

alter table profiles
  add column foto_recortada boolean not null default false;

comment on column profiles.foto_recortada is
  'true quando o upload foi um PNG sem fundo (recorte feito no navegador). A cartinha então mostra o jogador "saindo" da moldura.';
INSERT INTO _migrations (nome) VALUES ('0006_foto_recortada.sql') ON CONFLICT DO NOTHING;
COMMIT;

-- ============================ 0007_organizacao_codigo.sql ============================
\echo '== 0007_organizacao_codigo.sql =='
BEGIN;
-- =============================================================================
-- Codigo curto da organizacao: o que a pessoa digita para entrar (no cadastro
-- ou depois), sem depender do link de convite nem do UUID.
--
-- Alfabeto sem O/0 e I/1 para ninguem errar ao ler ou ditar o codigo.
-- =============================================================================

create or replace function novo_codigo_org()
returns text
language plpgsql
as $$
declare
  alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  tentativa text;
  i int;
begin
  loop
    tentativa := '';
    for i in 1..6 loop
      tentativa := tentativa || substr(alfabeto, 1 + floor(random() * length(alfabeto))::int, 1);
    end loop;
    exit when not exists (select 1 from organizacoes where codigo = tentativa);
  end loop;
  return tentativa;
end;
$$;

alter table organizacoes add column codigo text;

-- Uma organizacao por vez: dentro de um mesmo UPDATE a funcao nao enxergaria
-- os codigos gerados para as outras linhas e poderia repetir.
do $$
declare
  r record;
begin
  for r in select id from organizacoes where codigo is null loop
    update organizacoes set codigo = novo_codigo_org() where id = r.id;
  end loop;
end;
$$;

alter table organizacoes alter column codigo set not null;
alter table organizacoes alter column codigo set default novo_codigo_org();
create unique index uq_organizacoes_codigo on organizacoes (codigo);
INSERT INTO _migrations (nome) VALUES ('0007_organizacao_codigo.sql') ON CONFLICT DO NOTHING;
COMMIT;

-- ============================ 0008_periodo_artilharia.sql ============================
\echo '== 0008_periodo_artilharia.sql =='
BEGIN;
-- =============================================================================
-- Periodo do painel de artilharia da organizacao: o dono escolhe se a disputa
-- fecha por semana, mes ou trimestre.
-- =============================================================================

alter table organizacoes
  add column periodo_artilharia text not null default 'mes'
    check (periodo_artilharia in ('semana', 'mes', 'trimestre'));
INSERT INTO _migrations (nome) VALUES ('0008_periodo_artilharia.sql') ON CONFLICT DO NOTHING;
COMMIT;

-- ============================ 0009_fases_torneio.sql ============================
\echo '== 0009_fases_torneio.sql =='
BEGIN;
-- =============================================================================
-- Fases do torneio: em vez de um formato único preso ao torneio inteiro, cada
-- torneio agora tem fases (ex.: "Fase de grupos", "Semifinal"), cada uma com
-- seu próprio formato — assim dá pra fazer grupos + mata-mata no mesmo torneio.
-- =============================================================================

create table torneio_fases (
  id         uuid primary key default gen_random_uuid(),
  torneio_id uuid not null references torneios (id) on delete cascade,
  nome       text not null,
  formato    text not null check (formato in ('grupos', 'mata_mata', 'pontos_corridos')),
  ordem      smallint not null default 0,
  criado_em  timestamptz not null default now()
);

create index idx_torneio_fases_torneio on torneio_fases (torneio_id, ordem);

alter table jogos add column fase_id uuid references torneio_fases (id) on delete set null;

-- Backfill: uma fase por combinação distinta (torneio, texto livre da antiga
-- coluna `fase`), herdando o formato que o torneio tinha — não temos como
-- saber melhor que isso para os jogos que já existem.
insert into torneio_fases (torneio_id, nome, formato, ordem)
select distinct j.torneio_id, coalesce(j.fase, 'Fase única'), t.formato, 0
from jogos j
join torneios t on t.id = j.torneio_id
where j.torneio_id is not null;

update jogos j
set fase_id = tf.id
from torneio_fases tf
where j.torneio_id = tf.torneio_id
  and coalesce(j.fase, 'Fase única') = tf.nome;

-- O formato virou propriedade da fase, não do torneio.
alter table torneios drop column formato;
INSERT INTO _migrations (nome) VALUES ('0009_fases_torneio.sql') ON CONFLICT DO NOTHING;
COMMIT;

-- ============================ 0010_admin_plataforma.sql ============================
\echo '== 0010_admin_plataforma.sql =='
BEGIN;
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
INSERT INTO _migrations (nome) VALUES ('0010_admin_plataforma.sql') ON CONFLICT DO NOTHING;
COMMIT;

-- ============================ 0011_webhook_secret_geral.sql ============================
\echo '== 0011_webhook_secret_geral.sql =='
BEGIN;
-- =============================================================================
-- Segredo do webhook de assinatura do Mercado Pago passa a ser cadastrado
-- pelo painel de admin (cifrado, igual ao Access Token) em vez de vir de uma
-- variável de ambiente (MERCADOPAGO_WEBHOOK_SECRET — removida do código).
-- =============================================================================

alter table plataforma_config
  add column mp_geral_webhook_secret_cipher bytea,
  add column mp_geral_webhook_secret_nonce bytea,
  add column mp_geral_webhook_secret_atualizado_em timestamptz;
INSERT INTO _migrations (nome) VALUES ('0011_webhook_secret_geral.sql') ON CONFLICT DO NOTHING;
COMMIT;

-- ============================ 0012_senha_provisoria.sql ============================
\echo '== 0012_senha_provisoria.sql =='
BEGIN;
-- =============================================================================
-- Contas criadas por um admin (ex.: jogadores de um evento) nascem com uma senha
-- provisória. Enquanto a coluna não é nula a conta ainda usa a senha provisória;
-- ela vale até esse instante, e a pessoa é obrigada a definir uma própria no
-- primeiro login (a coluna volta a null).
-- =============================================================================

alter table profiles
  add column senha_provisoria_ate timestamptz;

comment on column profiles.senha_provisoria_ate is
  'Não nulo = a conta ainda usa a senha provisória (123456), válida até este instante. Null = a pessoa definiu a própria senha.';
INSERT INTO _migrations (nome) VALUES ('0012_senha_provisoria.sql') ON CONFLICT DO NOTHING;
COMMIT;

-- ============================ 0013_sorteio_confirmado.sql ============================
\echo '== 0013_sorteio_confirmado.sql =='
BEGIN;
-- =============================================================================
-- Sorteio em duas etapas: o admin sorteia (rascunho, só admins veem) e depois
-- confirma, e aí os participantes passam a ver os times. Cancelar a confirmação
-- volta o sorteio a rascunho, para refazer ou ajustar à mão.
-- =============================================================================

alter table sorteios
  add column confirmado_em timestamptz;

comment on column sorteios.confirmado_em is
  'Null = rascunho (só admins veem). Preenchido = confirmado: os participantes da organização veem os times.';
INSERT INTO _migrations (nome) VALUES ('0013_sorteio_confirmado.sql') ON CONFLICT DO NOTHING;
COMMIT;

-- ============================ 0014_partidas_pelada.sql ============================
\echo '== 0014_partidas_pelada.sql =='
BEGIN;
-- =============================================================================
-- 0014_partidas_pelada — partidas dentro de uma pelada: regras, cronômetro,
-- gols individuais e composição histórica dos times.
-- =============================================================================
-- Reaproveita `jogos` (já aceita pelada_id) e `sumula_eventos` (um gol por
-- linha), que alimentam a artilharia pela view v_eventos_jogador.

-- Regras valem para todas as partidas da pelada; vazio = sem limite.
alter table peladas
  add column partida_duracao_min  smallint check (partida_duracao_min between 1 and 180),
  add column partida_gols_limite  smallint check (partida_gols_limite between 1 and 99);

-- 'pausado' é um estado da partida; 'aguardando' continua sendo 'agendado'.
alter table jogos drop constraint jogos_status_check;
alter table jogos add constraint jogos_status_check
  check (status in ('agendado', 'em_andamento', 'pausado', 'encerrado'));

alter table jogos
  -- Times do sorteio que se enfrentam (os de torneio usam time_a_id/time_b_id).
  add column time_a_sorteio_id uuid references times (id) on delete set null,
  add column time_b_sorteio_id uuid references times (id) on delete set null,
  -- Regras congeladas na criação: editar a pelada não muda partida em curso.
  add column duracao_min       smallint,
  add column gols_limite       smallint,
  -- Cronômetro por timestamps: tempo corrido = acumulado_seg + (agora - retomado_em).
  add column iniciado_em       timestamptz,
  add column retomado_em       timestamptz,
  add column acumulado_seg     integer not null default 0 check (acumulado_seg >= 0),
  add column encerrado_em      timestamptz,
  add column encerramento      text check (encerramento in ('tempo', 'gols', 'manual')),
  add column observacao        text,
  add column vencedor_time_id  uuid references times (id) on delete set null,
  -- Confirmado pelo responsável depois do fim; dispara a redistribuição.
  add column perdedor_time_id  uuid references times (id) on delete set null,
  add column concluido_em      timestamptz,
  add column concluido_por     uuid references profiles (id) on delete set null,
  add column redistribuicao    jsonb,
  add column criado_por        uuid references profiles (id) on delete set null;

-- Partidas de pelada que já existiam (nenhuma tela as criava) ficam concluídas.
update jogos set concluido_em = coalesce(criado_em, now())
  where pelada_id is not null and status = 'encerrado';

-- No máximo uma partida "aberta" (não concluída) por pelada: cliques repetidos
-- em "criar partida" não geram duplicatas.
create unique index idx_jogos_pelada_aberta
  on jogos (pelada_id)
  where pelada_id is not null and concluido_em is null;

-- Composição de cada time NAQUELE jogo, congelada na criação: a redistribuição
-- mexe em time_jogadores, mas o histórico das partidas não muda.
create table partida_jogadores (
  jogo_id    uuid not null references jogos (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  time_id    uuid not null references times (id) on delete cascade,
  estrelas   smallint not null check (estrelas between 1 and 5),
  primary key (jogo_id, profile_id)
);

create index idx_partida_jogadores_time on partida_jogadores (jogo_id, time_id);

-- Gol de pelada: time que marcou, quem registrou e remoção lógica (auditoria).
alter table sumula_eventos
  add column time_pelada_id uuid references times (id) on delete set null,
  add column criado_por     uuid references profiles (id) on delete set null,
  add column removido_em    timestamptz,
  add column removido_por   uuid references profiles (id) on delete set null;

create index idx_sumula_eventos_ativos on sumula_eventos (jogo_id) where removido_em is null;

-- A artilharia só conta eventos que não foram removidos; pelada_id (no fim)
-- permite o ranking de uma pelada específica.
create or replace view v_eventos_jogador as
select
  se.id,
  se.profile_id,
  se.tipo,
  se.jogo_id,
  coalesce(j.data, se.criado_em)                 as quando,
  coalesce(t.organizacao_id, p.organizacao_id)   as organizacao_id,
  j.pelada_id                                    as pelada_id
from sumula_eventos se
join jogos j       on j.id = se.jogo_id
left join torneios t on t.id = j.torneio_id
left join peladas p  on p.id = j.pelada_id
where se.removido_em is null;
INSERT INTO _migrations (nome) VALUES ('0014_partidas_pelada.sql') ON CONFLICT DO NOTHING;
COMMIT;

-- ============================ 0015_substituicoes_partida.sql ============================
\echo '== 0015_substituicoes_partida.sql =='
BEGIN;
-- =============================================================================
-- 0015_substituicoes_partida — trocar jogador no meio da partida (cansaço,
-- lesão): sai um, entra alguém que esperava, e quem saiu vai para o fim da fila.
-- =============================================================================

-- Quem está em quadra: saiu_em preenchido = já saiu da partida (os gols que
-- fez continuam valendo e o histórico dos times não muda).
alter table partida_jogadores
  add column entrou_em timestamptz,
  add column saiu_em   timestamptz;

create table partida_substituicoes (
  id                 uuid primary key default gen_random_uuid(),
  jogo_id            uuid not null references jogos (id) on delete cascade,
  time_id            uuid not null references times (id) on delete cascade,
  saiu_profile_id    uuid not null references profiles (id) on delete cascade,
  entrou_profile_id  uuid not null references profiles (id) on delete cascade,
  -- Time (do fim da fila) para onde quem saiu foi; null = não volta a jogar hoje.
  destino_time_id    uuid references times (id) on delete set null,
  criado_em          timestamptz not null default now(),
  criado_por         uuid references profiles (id) on delete set null
);

create index idx_partida_substituicoes_jogo on partida_substituicoes (jogo_id, criado_em);
INSERT INTO _migrations (nome) VALUES ('0015_substituicoes_partida.sql') ON CONFLICT DO NOTHING;
COMMIT;

-- ============================ 0016_pagamento_jogadores.sql ============================
\echo '== 0016_pagamento_jogadores.sql =='
BEGIN;
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
INSERT INTO _migrations (nome) VALUES ('0016_pagamento_jogadores.sql') ON CONFLICT DO NOTHING;
COMMIT;

\echo ''
\echo 'Pronto. Schema resenha05 criado. Deploys seguintes: node db/migrate.mjs'
