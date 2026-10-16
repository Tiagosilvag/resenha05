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
