-- =============================================================================
-- Sorteio em duas etapas: o admin sorteia (rascunho, só admins veem) e depois
-- confirma, e aí os participantes passam a ver os times. Cancelar a confirmação
-- volta o sorteio a rascunho, para refazer ou ajustar à mão.
-- =============================================================================

alter table sorteios
  add column confirmado_em timestamptz;

comment on column sorteios.confirmado_em is
  'Null = rascunho (só admins veem). Preenchido = confirmado: os participantes da organização veem os times.';
