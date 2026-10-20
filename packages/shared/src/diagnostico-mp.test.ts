import { describe, it, expect } from 'vitest';
import { interpretarDiagnosticoMp, type DiagnosticoMpEntrada } from './diagnostico-mp.js';

const base: DiagnosticoMpEntrada = {
  conta: { id: '111', ehTeste: false, siteId: 'MLB', email: 'dono@x.com' },
  assinatura: null,
  pagamento: null,
};

describe('interpretarDiagnosticoMp', () => {
  it('conta de teste avisa que não cobra de verdade', () => {
    const r = interpretarDiagnosticoMp({ ...base, conta: { ...base.conta, ehTeste: true } });
    expect(r.some((a) => a.tipo === 'atencao' && /teste/i.test(a.texto))).toBe(true);
  });

  it('conta de outro país avisa', () => {
    const r = interpretarDiagnosticoMp({ ...base, conta: { ...base.conta, siteId: 'MLA' } });
    expect(r.some((a) => /MLA/.test(a.texto))).toBe(true);
  });

  it('pagador igual ao vendedor na assinatura é problema', () => {
    const r = interpretarDiagnosticoMp({
      ...base,
      assinatura: { status: 'pending', payerId: '111', payerEmail: 'dono@x.com' },
    });
    expect(r.some((a) => a.tipo === 'problema' && /mesma conta/i.test(a.texto))).toBe(true);
  });

  it('e-mail do pagador igual ao do vendedor também é problema', () => {
    const r = interpretarDiagnosticoMp({
      ...base,
      assinatura: { status: 'pending', payerId: null, payerEmail: 'DONO@x.com' },
    });
    expect(r.some((a) => a.tipo === 'problema' && /mesma conta|e-mail/i.test(a.texto))).toBe(true);
  });

  it('assinatura pendente sem problema vira informação', () => {
    const r = interpretarDiagnosticoMp({
      ...base,
      assinatura: { status: 'pending', payerId: '222', payerEmail: 'outra@x.com' },
    });
    expect(r.some((a) => a.tipo === 'info' && /pendente/i.test(a.texto))).toBe(true);
    expect(r.some((a) => a.tipo === 'problema')).toBe(false);
  });

  it('antifraude: explica o status_detail da recusa', () => {
    const r = interpretarDiagnosticoMp({
      ...base,
      pagamento: { status: 'rejected', statusDetail: 'cc_rejected_high_risk', payerId: '222', payerEmail: null },
    });
    expect(r.some((a) => /antifraude/i.test(a.texto))).toBe(true);
  });

  it('cc_rejected_other_reason aponta o banco emissor', () => {
    const r = interpretarDiagnosticoMp({
      ...base,
      pagamento: { status: 'rejected', statusDetail: 'cc_rejected_other_reason', payerId: '222', payerEmail: null },
    });
    expect(r.some((a) => /banco/i.test(a.texto))).toBe(true);
  });

  it('pagamento recusado de pagador igual ao vendedor é problema', () => {
    const r = interpretarDiagnosticoMp({
      ...base,
      pagamento: { status: 'rejected', statusDetail: 'cc_rejected_other_reason', payerId: '111', payerEmail: null },
    });
    expect(r.some((a) => a.tipo === 'problema' && /mesma conta/i.test(a.texto))).toBe(true);
  });

  it('status_detail desconhecido ainda é mostrado', () => {
    const r = interpretarDiagnosticoMp({
      ...base,
      pagamento: { status: 'rejected', statusDetail: 'algo_novo', payerId: null, payerEmail: null },
    });
    expect(r.some((a) => /algo_novo/.test(a.texto))).toBe(true);
  });

  it('pagamento aprovado é informado', () => {
    const r = interpretarDiagnosticoMp({
      ...base,
      pagamento: { status: 'approved', statusDetail: 'accredited', payerId: '222', payerEmail: null },
    });
    expect(r.some((a) => /aprovad/i.test(a.texto))).toBe(true);
  });
});
