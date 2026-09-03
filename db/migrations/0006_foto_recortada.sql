-- =============================================================================
-- 0006_foto_recortada — marca se a foto de perfil já vem sem fundo (estilo FUT)
-- =============================================================================

alter table profiles
  add column foto_recortada boolean not null default false;

comment on column profiles.foto_recortada is
  'true quando o upload foi um PNG sem fundo (recorte feito no navegador). A cartinha então mostra o jogador "saindo" da moldura.';
