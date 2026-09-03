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
