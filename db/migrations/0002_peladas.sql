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
