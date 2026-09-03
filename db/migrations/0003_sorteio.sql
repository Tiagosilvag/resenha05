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
