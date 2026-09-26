import { interpretarStatusPreapproval, type StatusAssinatura } from '@resenha05/shared';
import { MercadoPagoErro, type PreapprovalDetalhe } from '../../lib/mercadopago-preapproval.js';

export interface AplicarEventoInput {
  organizacaoId: string;
  preapprovalId: string;
  periodoReferencia: string;
  valorCentavos: number;
  statusCiclo: 'aprovado' | 'atrasado' | 'cancelado';
  statusAssinaturaEvento: StatusAssinatura;
}

export interface DepsProcessarPreapproval {
  /** Assinatura criada por nós no checkout — fonte da organização e do período. */
  carregarAssinatura(
    preapprovalId: string,
  ): Promise<{ organizacaoId: string; periodoReferencia: string } | null>;
  buscarPreapproval(preapprovalId: string): Promise<PreapprovalDetalhe>;
  aplicar(input: AplicarEventoInput): Promise<void>;
}

/**
 * Sincroniza um preapproval com o nosso banco. 'ignorado' = evento que não dá
 * para processar e que reenviar não resolveria (o webhook responde 200).
 */
export async function processarPreapproval(
  preapprovalId: string,
  deps: DepsProcessarPreapproval,
): Promise<'processado' | 'ignorado'> {
  const assinatura = await deps.carregarAssinatura(preapprovalId);
  if (!assinatura) return 'ignorado';

  let detalhe: PreapprovalDetalhe;
  try {
    detalhe = await deps.buscarPreapproval(preapprovalId);
  } catch (e) {
    if (e instanceof MercadoPagoErro && e.status === 404) return 'ignorado';
    throw e;
  }

  const { statusAssinatura, statusCiclo } = interpretarStatusPreapproval(detalhe.status);
  await deps.aplicar({
    organizacaoId: assinatura.organizacaoId,
    preapprovalId,
    periodoReferencia: assinatura.periodoReferencia,
    valorCentavos: detalhe.valorCentavos,
    statusCiclo,
    statusAssinaturaEvento: statusAssinatura,
  });
  return 'processado';
}
