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
