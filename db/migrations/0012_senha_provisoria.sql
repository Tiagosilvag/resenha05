-- =============================================================================
-- Contas criadas por um admin (ex.: jogadores de um evento) nascem com uma senha
-- provisória. Enquanto a coluna não é nula a conta ainda usa a senha provisória;
-- ela vale até esse instante, e a pessoa é obrigada a definir uma própria no
-- primeiro login (a coluna volta a null).
-- =============================================================================

alter table profiles
  add column senha_provisoria_ate timestamptz;

comment on column profiles.senha_provisoria_ate is
  'Não nulo = a conta ainda usa a senha provisória (123456), válida até este instante. Null = a pessoa definiu a própria senha.';
