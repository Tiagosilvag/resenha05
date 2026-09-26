import { describe, it, expect, vi } from 'vitest';
import { processarPreapproval, type DepsProcessarPreapproval } from './processar.js';
import { MercadoPagoErro } from '../../lib/mercadopago-preapproval.js';

function deps(sobrescreve: Partial<DepsProcessarPreapproval> = {}): DepsProcessarPreapproval {
  return {
    carregarAssinatura: vi.fn().mockResolvedValue({ organizacaoId: 'org-1', periodoReferencia: '2026-10-01' }),
    buscarPreapproval: vi.fn().mockResolvedValue({
      id: 'pre_1',
      status: 'authorized',
      externalReference: 'lixo-que-nao-importa',
      valorCentavos: 4990,
    }),
    aplicar: vi.fn().mockResolvedValue(undefined),
    ...sobrescreve,
  };
}

describe('processarPreapproval', () => {
  it('usa a organização e o período da NOSSA assinatura, não o external_reference do MP', async () => {
    const d = deps();
    expect(await processarPreapproval('pre_1', d)).toBe('processado');
    expect(d.aplicar).toHaveBeenCalledWith({
      organizacaoId: 'org-1',
      preapprovalId: 'pre_1',
      periodoReferencia: '2026-10-01',
      valorCentavos: 4990,
      statusCiclo: 'aprovado',
      statusAssinaturaEvento: 'ativa',
    });
  });

  it('ignora (sem consultar o MP nem gravar) preapproval que não criamos', async () => {
    const d = deps({ carregarAssinatura: vi.fn().mockResolvedValue(null) });
    expect(await processarPreapproval('pre_desconhecido', d)).toBe('ignorado');
    expect(d.buscarPreapproval).not.toHaveBeenCalled();
    expect(d.aplicar).not.toHaveBeenCalled();
  });

  it('ignora quando o MP responde 404 (ex: token da plataforma trocado)', async () => {
    const d = deps({ buscarPreapproval: vi.fn().mockRejectedValue(new MercadoPagoErro('not found', 404)) });
    expect(await processarPreapproval('pre_1', d)).toBe('ignorado');
    expect(d.aplicar).not.toHaveBeenCalled();
  });

  it('propaga outros erros do MP para o webhook devolver 5xx e o MP reenviar', async () => {
    const d = deps({ buscarPreapproval: vi.fn().mockRejectedValue(new MercadoPagoErro('indisponível', 503)) });
    await expect(processarPreapproval('pre_1', d)).rejects.toThrow('indisponível');
  });
});
