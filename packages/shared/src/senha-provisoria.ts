/** Senha das contas criadas por um admin (ex.: jogadores de um evento). */
export const SENHA_PROVISORIA = '123456';
/** Quantos dias a senha provisória vale; depois disso o login com ela é recusado. */
export const DIAS_SENHA_PROVISORIA = 3;

const DIA_EM_MS = 86_400_000;

/** Até quando a senha provisória criada em `criadaEm` vale. */
export function prazoSenhaProvisoria(criadaEm: Date = new Date()): Date {
  return new Date(criadaEm.getTime() + DIAS_SENHA_PROVISORIA * DIA_EM_MS);
}

/**
 * Situação da senha de uma conta, a partir de `profiles.senha_provisoria_ate`:
 * 'nenhuma' = a pessoa já definiu a própria senha; 'vigente' = ainda dá para
 * entrar com a provisória; 'expirada' = o prazo passou (no instante exato
 * também já conta como expirada).
 */
export function situacaoSenhaProvisoria(
  ate: Date | string | null | undefined,
  agora: Date = new Date(),
): 'nenhuma' | 'vigente' | 'expirada' {
  if (ate === null || ate === undefined) return 'nenhuma';
  return new Date(ate).getTime() > agora.getTime() ? 'vigente' : 'expirada';
}
