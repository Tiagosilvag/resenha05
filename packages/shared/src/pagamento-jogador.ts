import { z } from 'zod';

export const MODOS_PAGAMENTO_JOGADOR = ['manual', 'pix', 'mercadopago'] as const;
export type ModoPagamentoJogador = (typeof MODOS_PAGAMENTO_JOGADOR)[number];

/**
 * Como a organização recebe dos jogadores. Quem decide é o dono:
 * `manual` (o admin marca), `pix` (jogador vê a chave e avisa) ou `mercadopago` (automático).
 */
export const configurarPagamentoJogadoresSchema = z
  .object({
    modo: z.enum(MODOS_PAGAMENTO_JOGADOR),
    pixChave: z.string().trim().max(77, 'Chave Pix muito longa.').nullish(),
    pixFavorecido: z.string().trim().max(60).nullish(),
    pixInstrucoes: z.string().trim().max(200).nullish(),
  })
  .refine((v) => v.modo !== 'pix' || Boolean(v.pixChave), {
    message: 'Informe a chave Pix para receber por Pix.',
    path: ['pixChave'],
  });
export type ConfigurarPagamentoJogadoresInput = z.infer<typeof configurarPagamentoJogadoresSchema>;

/** "30.00" | 30 | null → 3000 centavos; sem valor ou zero → null (pelada grátis). */
export function valorEmCentavos(valor: string | number | null | undefined): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = typeof valor === 'number' ? valor : Number(String(valor).replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

/** `external_reference` enviado ao Mercado Pago: aponta para a cobrança pendente do jogador. */
export function referenciaDoPagamentoJogador(id: string): string {
  return `jogador:${id}`;
}

export function idDaReferenciaJogador(referencia: string | null | undefined): string | null {
  const m = /^jogador:([0-9a-f-]{36})$/i.exec(referencia ?? '');
  return m ? m[1]! : null;
}

export type DecisaoPagamentoJogador =
  | 'aplicar'
  | 'ja_aplicado'
  | 'nao_aprovado'
  | 'desconhecido'
  | 'valor_insuficiente'
  | 'outro_jogador';

/**
 * O que fazer com um pagamento de jogador consultado no Mercado Pago. Só um pagamento
 * aprovado, que aponta para uma cobrança nossa pendente (do jogador/pelada certos e
 * com valor pelo menos igual ao cobrado) marca o jogador como pago.
 */
export function decidirPagamentoJogador(e: {
  pagamento: { status: string; valor: number | null };
  linha: { valorCentavos: number; status: string; peladaId: string; profileId: string } | null;
  esperado?: { peladaId: string; profileId: string };
}): DecisaoPagamentoJogador {
  if (!e.linha) return 'desconhecido';
  if (e.esperado && (e.linha.peladaId !== e.esperado.peladaId || e.linha.profileId !== e.esperado.profileId)) {
    return 'outro_jogador';
  }
  if (e.pagamento.status !== 'approved') return 'nao_aprovado';
  if (e.linha.status === 'aprovado') return 'ja_aplicado';
  const pago = Math.round((e.pagamento.valor ?? 0) * 100);
  if (pago < e.linha.valorCentavos) return 'valor_insuficiente';
  return 'aplicar';
}
