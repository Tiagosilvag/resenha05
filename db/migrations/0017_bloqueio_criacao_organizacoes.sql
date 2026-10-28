-- =============================================================================
-- Trava global de criação de organizações, ligada pelo painel de dev enquanto
-- a plataforma está em fase de testes.
-- =============================================================================

alter table plataforma_config
  add column criacao_organizacoes_bloqueada boolean not null default false;
