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
