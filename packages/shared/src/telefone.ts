/**
 * Normalização e validação de telefone BR — espelha o trigger normalize_telefone()
 * do banco (migration 0001). A API deve gravar sempre o formato canônico
 * `+55DDDXXXXXXXXX`.
 */

const CANONICO = /^\+55\d{10,11}$/;

/** Remove tudo que não for dígito ou `+` e garante o prefixo `+`. */
export function normalizarTelefone(entrada: string): string {
  let t = entrada.replace(/[^0-9+]/g, '');
  if (t.startsWith('55') && !t.startsWith('+')) t = '+' + t;
  else if (!t.startsWith('+')) t = '+55' + t;
  return t;
}

export function telefoneValido(entrada: string): boolean {
  return CANONICO.test(normalizarTelefone(entrada));
}

/** Normaliza e valida; lança se inválido. Retorna o formato canônico. */
export function exigirTelefoneCanonico(entrada: string): string {
  const t = normalizarTelefone(entrada);
  if (!CANONICO.test(t)) {
    throw new Error('Telefone inválido: use DDD + número (ex.: 11 91234-5678).');
  }
  return t;
}

/** `+5511912345678` -> `(11) 91234-5678` para exibição. */
export function formatarTelefone(canonico: string): string {
  const m = canonico.match(/^\+55(\d{2})(\d{4,5})(\d{4})$/);
  if (!m) return canonico;
  return `(${m[1]}) ${m[2]}-${m[3]}`;
}
