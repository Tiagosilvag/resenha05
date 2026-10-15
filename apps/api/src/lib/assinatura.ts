import { organizacaoLiberada, type StatusAssinatura } from '@resenha05/shared';
import { AppError, erro } from './erros.js';
import { MercadoPagoErro } from './mercadopago-preapproval.js';

/** Bloqueia (403) as ações que exigem mensalidade em dia: entrar e criar pelada nova. */
export function exigirOrganizacaoLiberada(status: StatusAssinatura): void {
  if (!organizacaoLiberada(status)) {
    throw erro.proibido('Esta organização está com a mensalidade pendente.');
  }
}

/**
 * Falha ao falar com o Mercado Pago no checkout: o dono da organização recebe
 * uma mensagem genérica (o motivo real — token da plataforma inválido etc. —
 * vai para o log de quem chama), não um 500 "tente de novo". Quem é
 * administrador da plataforma (`detalhar`) vê o motivo exato, para não
 * depender de abrir o log do servidor.
 */
export function traduzirErroCobranca(e: unknown, detalhar = false): AppError {
  if (e instanceof AppError) return e;
  if (detalhar) {
    if (e instanceof MercadoPagoErro) {
      return erro.invalido(`O Mercado Pago recusou a assinatura: ${e.message} (HTTP ${e.status}).`);
    }
    const motivo = e instanceof Error ? e.message : String(e);
    return erro.invalido(`Falha ao preparar a cobrança: ${motivo}`);
  }
  return erro.invalido(
    'Não foi possível iniciar a cobrança da mensalidade agora. Avise o administrador da plataforma.',
  );
}
