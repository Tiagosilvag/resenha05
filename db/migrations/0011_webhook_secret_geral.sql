-- =============================================================================
-- Segredo do webhook de assinatura do Mercado Pago passa a ser cadastrado
-- pelo painel de admin (cifrado, igual ao Access Token) em vez de vir de uma
-- variável de ambiente (MERCADOPAGO_WEBHOOK_SECRET — removida do código).
-- =============================================================================

alter table plataforma_config
  add column mp_geral_webhook_secret_cipher bytea,
  add column mp_geral_webhook_secret_nonce bytea,
  add column mp_geral_webhook_secret_atualizado_em timestamptz;
