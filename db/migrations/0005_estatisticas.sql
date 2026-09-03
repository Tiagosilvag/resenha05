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
