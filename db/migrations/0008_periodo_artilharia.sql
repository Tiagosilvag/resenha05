-- =============================================================================
-- Periodo do painel de artilharia da organizacao: o dono escolhe se a disputa
-- fecha por semana, mes ou trimestre.
-- =============================================================================

alter table organizacoes
  add column periodo_artilharia text not null default 'mes'
    check (periodo_artilharia in ('semana', 'mes', 'trimestre'));
