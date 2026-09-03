/**
 * Normalização e validação de telefone BR — espelha o trigger normalize_telefone()
 * do banco (migration 0001). A API deve gravar sempre o formato canônico
 * `+55DDDXXXXXXXXX`.
 */

const CANONICO = /^\+55\d{10,11}$/;
const CELULAR = /^\+55\d{2}9\d{8}$/;

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

/** Celular BR: DDD + 9 + 8 dígitos, ou seja `(XX) XXXXX-XXXX`. */
export function telefoneCelularValido(entrada: string): boolean {
  return CELULAR.test(normalizarTelefone(entrada));
}

/**
 * Máscara progressiva para digitação. Aceita só dígitos (corta em 11) e
 * devolve `(XX) XXXXX-XXXX` conforme a pessoa digita.
 */
export function mascararTelefone(entrada: string): string {
  let d = entrada.replace(/\D/g, '');
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2); // colou com +55
  d = d.slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
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
