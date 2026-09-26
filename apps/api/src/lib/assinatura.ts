import { organizacaoLiberada, type StatusAssinatura } from '@resenha05/shared';
import { AppError, erro } from './erros.js';

/** Bloqueia (403) as ações que exigem mensalidade em dia: entrar e criar pelada nova. */
export function exigirOrganizacaoLiberada(status: StatusAssinatura): void {
  if (!organizacaoLiberada(status)) {
    throw erro.proibido('Esta organização está com a mensalidade pendente.');
  }
}

/**
 * Falha ao falar com o Mercado Pago no checkout: o dono da organização recebe
 * uma mensagem genérica (o motivo real — token da plataforma inválido etc. —
 * vai para o log de quem chama), não um 500 "tente de novo".
 */
export function traduzirErroCobranca(e: unknown): AppError {
  if (e instanceof AppError) return e;
  return erro.invalido(
    'Não foi possível iniciar a cobrança da mensalidade agora. Avise o administrador da plataforma.',
  );
}
