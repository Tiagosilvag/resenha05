import {
  decidirPagamentoJogador,
  idDaReferenciaJogador,
  type DecisaoPagamentoJogador,
} from '@resenha05/shared';
import { db } from '../db/index.js';
import { consultarPagamentoDetalhado } from './mercadopago-diagnostico.js';

export interface ResultadoPagamentoJogador {
  decisao: DecisaoPagamentoJogador;
  statusMp: string;
}

/**
 * Consulta o pagamento no Mercado Pago com o token da organização (a fonte da verdade —
 * o que veio por webhook ou pela volta do jogador não é confiado) e, se estiver aprovado e
 * bater com uma cobrança nossa pendente, marca o jogador como pago. Repetível: só a
 * primeira vez marca.
 */
export async function conferirPagamentoJogador(
  token: string,
  orgId: string,
  paymentId: string,
  esperado?: { peladaId: string; profileId: string },
): Promise<ResultadoPagamentoJogador> {
  const pagamento = await consultarPagamentoDetalhado(token, paymentId);
  const cobrancaId = idDaReferenciaJogador(pagamento.externalReference);
  const linha = cobrancaId
    ? await db
        .selectFrom('pagamentos_jogador')
        .select(['id', 'pelada_id', 'profile_id', 'valor_centavos', 'status'])
        .where('id', '=', cobrancaId)
        .where('organizacao_id', '=', orgId)
        .executeTakeFirst()
    : undefined;

  const decisao = decidirPagamentoJogador({
    pagamento: { status: pagamento.status, valor: pagamento.valor },
    linha: linha
      ? { valorCentavos: linha.valor_centavos, status: linha.status, peladaId: linha.pelada_id, profileId: linha.profile_id }
      : null,
    ...(esperado ? { esperado } : {}),
  });
  if (decisao !== 'aplicar' || !linha) return { decisao, statusMp: pagamento.status };

  const marcou = await db.transaction().execute(async (tx) => {
    // Só quem muda a cobrança de pendente para aprovada marca o jogador: avisos repetidos não fazem nada.
    const r = await tx
      .updateTable('pagamentos_jogador')
      .set({ status: 'aprovado', mp_payment_id: String(pagamento.id), atualizado_em: new Date() })
      .where('id', '=', linha.id)
      .where('status', '<>', 'aprovado')
      .executeTakeFirst();
    if (r.numUpdatedRows === 0n) return false;

    const dados = {
      status: 'pago' as const,
      pago_em: new Date(),
      pago_por: null,
      pago_valor: (linha.valor_centavos / 100).toFixed(2),
      pago_metodo: 'mercadopago' as const,
      mp_payment_id: String(pagamento.id),
      pagamento_declarado_em: null,
    };
    await tx
      .insertInto('presencas')
      .values({ pelada_id: linha.pelada_id, profile_id: linha.profile_id, ...dados })
      .onConflict((oc) => oc.columns(['pelada_id', 'profile_id']).doUpdateSet(dados))
      .execute();
    return true;
  });
  return { decisao: marcou ? 'aplicar' : 'ja_aplicado', statusMp: pagamento.status };
}
