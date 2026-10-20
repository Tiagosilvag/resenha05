import { sql } from 'kysely';
import { PREFIXO_LIBERACAO_MANUAL, PREFIXO_PAGAMENTO_AVULSO, fimDoMes } from '@resenha05/shared';
import { db } from '../db/index.js';

// Linhas de `assinaturas` que valem só até o fim do mês (liberação manual ou pagamento avulso).
const MANUAL = `${PREFIXO_LIBERACAO_MANUAL}%`;
const AVULSO = `${PREFIXO_PAGAMENTO_AVULSO}%`;

export interface SituacaoLiberacao {
  /** Mensalidade que está valendo por um pagamento aprovado no Mercado Pago. */
  pagaPeloMercadoPago: boolean;
  /** Último mês liberado à mão ('YYYY-MM-01'), se houver. */
  ultimoPeriodoManual: string | null;
}

/** Como está a mensalidade de cada organização: Mercado Pago e/ou liberação manual. */
export async function situacaoDasLiberacoes(
  organizacaoIds: string[],
): Promise<Map<string, SituacaoLiberacao>> {
  const mapa = new Map<string, SituacaoLiberacao>();
  if (organizacaoIds.length === 0) return mapa;

  const linhas = await db
    .selectFrom('assinaturas')
    .select([
      'organizacao_id as organizacaoId',
      sql<boolean>`bool_or(not (mp_preapproval_id like ${MANUAL} or mp_preapproval_id like ${AVULSO}))`.as('mp'),
      sql<string | null>`(max(periodo_referencia) filter (where mp_preapproval_id like ${MANUAL} or mp_preapproval_id like ${AVULSO}))::text`.as('ultimoManual'),
    ])
    .where('organizacao_id', 'in', organizacaoIds)
    .where('status', '=', 'aprovado')
    .groupBy('organizacao_id')
    .execute();

  for (const l of linhas) {
    mapa.set(l.organizacaoId, {
      pagaPeloMercadoPago: Boolean(l.mp),
      ultimoPeriodoManual: l.ultimoManual,
    });
  }
  return mapa;
}

/** Data em que a liberação manual vence (último dia do mês liberado), ou null. */
export function vencimentoManual(s: SituacaoLiberacao | undefined): string | null {
  return s?.ultimoPeriodoManual ? fimDoMes(s.ultimoPeriodoManual) : null;
}

/**
 * Organizações que só estão ativas por liberação manual e cujo último mês
 * liberado já acabou voltam a "inadimplente". Quem tem pagamento aprovado no
 * Mercado Pago não é tocado. Devolve quantas organizações foram desativadas.
 */
export async function expirarLiberacoesManuais(): Promise<number> {
  const r = await sql`
    update organizacoes o set status_assinatura = 'inadimplente'
    where o.status_assinatura = 'ativa'
      and exists (
        select 1 from assinaturas a
        where a.organizacao_id = o.id and a.status = 'aprovado'
          and (a.mp_preapproval_id like ${MANUAL} or a.mp_preapproval_id like ${AVULSO})
      )
      and not exists (
        select 1 from assinaturas a
        where a.organizacao_id = o.id and a.status = 'aprovado'
          and not (a.mp_preapproval_id like ${MANUAL} or a.mp_preapproval_id like ${AVULSO})
      )
      and not exists (
        select 1 from assinaturas a
        where a.organizacao_id = o.id and a.status = 'aprovado'
          and (a.mp_preapproval_id like ${MANUAL} or a.mp_preapproval_id like ${AVULSO})
          and (a.periodo_referencia + interval '1 month')::date > (now() at time zone 'America/Sao_Paulo')::date
      )
  `.execute(db);
  return Number(r.numAffectedRows ?? 0);
}
