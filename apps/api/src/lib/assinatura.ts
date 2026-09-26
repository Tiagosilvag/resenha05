import { organizacaoLiberada, type StatusAssinatura } from '@resenha05/shared';
import { erro } from './erros.js';

/** Bloqueia (403) as ações que exigem mensalidade em dia: entrar e criar pelada nova. */
export function exigirOrganizacaoLiberada(status: StatusAssinatura): void {
  if (!organizacaoLiberada(status)) {
    throw erro.proibido('Esta organização está com a mensalidade pendente.');
  }
}
