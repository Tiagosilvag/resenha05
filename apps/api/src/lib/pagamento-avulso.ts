import {
  chaveDaReferenciaAvulsa,
  decidirPagamentoAvulso,
  idPagamentoAvulso,
  type DecisaoPagamentoAvulso,
} from '@resenha05/shared';
import { db } from '../db/index.js';
import { decifrarToken } from './cripto.js';
import { consultarPagamentoDetalhado } from './mercadopago-diagnostico.js';

/** Access Token da conta da plataforma (cifrado no banco), ou null se ainda não foi conectada. */
export async function tokenDaPlataforma(): Promise<string | null> {
  const cfg = await db
    .selectFrom('plataforma_config')
    .select(['mp_geral_token_cipher', 'mp_geral_token_nonce'])
    .where('id', '=', 1)
    .executeTakeFirstOrThrow();
  if (!cfg.mp_geral_token_cipher || !cfg.mp_geral_token_nonce) return null;
  return decifrarToken(cfg.mp_geral_token_cipher, cfg.mp_geral_token_nonce);
}

export interface ResultadoConferencia {
  decisao: DecisaoPagamentoAvulso;
  statusMp: string;
  organizacaoId: string | null;
  periodoReferencia: string | null;
}

/**
 * Consulta o pagamento no Mercado Pago (a fonte da verdade — o que chegou por
 * webhook ou pela volta do comprador não é confiado) e, se estiver aprovado e
 * bater com uma cobrança nossa pendente, libera o mês. Pode ser chamada várias
 * vezes para o mesmo pagamento: só a primeira libera.
 */
export async function conferirPagamentoAvulso(
  token: string,
  paymentId: string,
  organizacaoEsperada?: string,
): Promise<ResultadoConferencia> {
  const pagamento = await consultarPagamentoDetalhado(token, paymentId);
  const chave = chaveDaReferenciaAvulsa(pagamento.externalReference);
  const linha = chave
    ? await db
        .selectFrom('assinaturas')
        .select(['id', 'organizacao_id', 'valor_centavos', 'status', 'periodo_referencia'])
        .where('mp_preapproval_id', '=', idPagamentoAvulso(chave))
        .executeTakeFirst()
    : undefined;

  const decisao = decidirPagamentoAvulso({
    pagamento: { status: pagamento.status, valor: pagamento.valor, externalReference: pagamento.externalReference },
    linha: linha
      ? { organizacaoId: linha.organizacao_id, valorCentavos: linha.valor_centavos, status: linha.status }
      : null,
    ...(organizacaoEsperada ? { organizacaoEsperada } : {}),
  });

  const base = {
    statusMp: pagamento.status,
    organizacaoId: linha?.organizacao_id ?? null,
    periodoReferencia: linha?.periodo_referencia ?? null,
  };
  if (decisao !== 'aplicar' || !linha) return { decisao, ...base };

  const liberou = await db.transaction().execute(async (tx) => {
    // Só quem muda a linha de pendente para aprovada libera: notificações repetidas não fazem nada.
    const r = await tx
      .updateTable('assinaturas')
      .set({ status: 'aprovado', mp_payment_id: String(pagamento.id), atualizado_em: new Date() })
      .where('id', '=', linha.id)
      .where('status', '<>', 'aprovado')
      .executeTakeFirst();
    if (r.numUpdatedRows === 0n) return false;
    await tx.updateTable('organizacoes').set({ status_assinatura: 'ativa' }).where('id', '=', linha.organizacao_id).execute();
    return true;
  });
  return { decisao: liberou ? 'aplicar' : 'ja_aplicado', ...base };
}
