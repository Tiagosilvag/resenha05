export interface ContaDiagnostico {
  id: string | null;
  ehTeste: boolean;
  siteId: string | null;
  email: string | null;
}

export interface AssinaturaDiagnostico {
  status: string;
  payerId: string | null;
  payerEmail: string | null;
}

export interface PagamentoDiagnostico {
  status: string;
  statusDetail: string | null;
  payerId: string | null;
  payerEmail: string | null;
}

export interface DiagnosticoMpEntrada {
  conta: ContaDiagnostico;
  assinatura: AssinaturaDiagnostico | null;
  pagamento: PagamentoDiagnostico | null;
}

export interface AchadoDiagnostico {
  tipo: 'problema' | 'atencao' | 'info';
  texto: string;
}

const MOTIVOS: Record<string, string> = {
  cc_rejected_high_risk:
    'Recusado pelo antifraude do Mercado Pago (risco alto). Costuma acontecer em cartão ou aparelho fora do habitual, em conta nova, ou depois de várias tentativas seguidas — espere algumas horas antes de tentar de novo.',
  cc_rejected_blacklist: 'Cartão em lista de bloqueio do Mercado Pago. Use outro cartão.',
  cc_rejected_other_reason:
    'Recusa genérica enviada pelo banco emissor, sem motivo específico (a documentação diz que é uma estimativa de risco de fraude). Tente outro cartão ou ligue para o banco.',
  cc_rejected_insufficient_amount: 'Cartão sem limite disponível.',
  cc_rejected_bad_filled_card_number: 'Número do cartão digitado errado.',
  cc_rejected_bad_filled_date: 'Validade do cartão digitada errada.',
  cc_rejected_bad_filled_security_code: 'Código de segurança do cartão digitado errado.',
  cc_rejected_bad_filled_other: 'Algum dado do cartão digitado errado.',
  cc_rejected_call_for_authorize: 'O banco exige que o titular autorize a compra por telefone.',
  cc_rejected_card_disabled: 'Cartão desativado; peça ao banco para ativar.',
  cc_rejected_max_attempts: 'Limite de tentativas atingido; use outro cartão.',
  cc_rejected_duplicated_payment: 'Pagamento duplicado (a mesma cobrança foi tentada há pouco).',
  rejected_by_issuer: 'Recusado pelo banco emissor do cartão.',
  high_risk: 'Recusado pelo antifraude do Mercado Pago (risco alto).',
};

const ig = (a: string | null | undefined, b: string | null | undefined) =>
  Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());

/** Traduz o que o Mercado Pago devolveu em achados para o administrador da plataforma. */
export function interpretarDiagnosticoMp(e: DiagnosticoMpEntrada): AchadoDiagnostico[] {
  const achados: AchadoDiagnostico[] = [];
  const mesmaConta = (payerId: string | null, payerEmail: string | null) =>
    ig(payerId, e.conta.id) || ig(payerEmail, e.conta.email);

  if (e.conta.ehTeste) {
    achados.push({ tipo: 'atencao', texto: 'A credencial salva é de uma conta de TESTE: cobranças reais não funcionam com ela.' });
  }
  if (e.conta.siteId && e.conta.siteId !== 'MLB') {
    achados.push({ tipo: 'atencao', texto: `A conta vendedora é do site ${e.conta.siteId}, não do Brasil (MLB).` });
  }

  if (e.assinatura) {
    if (mesmaConta(e.assinatura.payerId, e.assinatura.payerEmail)) {
      achados.push({
        tipo: 'problema',
        texto:
          'O pagador da assinatura é a mesma conta do vendedor (dona das credenciais). O Mercado Pago não deixa a conta pagar a si mesma: use o e-mail de outra pessoa.',
      });
    }
    if (e.assinatura.status === 'pending') {
      achados.push({ tipo: 'info', texto: 'A assinatura está pendente: foi criada, mas nenhum pagamento foi concluído ainda.' });
    } else if (e.assinatura.status === 'authorized') {
      achados.push({ tipo: 'info', texto: 'A assinatura está autorizada (paga e ativa).' });
    } else if (e.assinatura.status === 'cancelled') {
      achados.push({ tipo: 'atencao', texto: 'A assinatura foi cancelada no Mercado Pago.' });
    } else if (e.assinatura.status === 'paused') {
      achados.push({ tipo: 'atencao', texto: 'A assinatura está pausada no Mercado Pago.' });
    }
  }

  if (e.pagamento) {
    const p = e.pagamento;
    if (p.status === 'approved') {
      achados.push({ tipo: 'info', texto: 'O pagamento foi aprovado.' });
    } else {
      const motivo = p.statusDetail ? MOTIVOS[p.statusDetail] : undefined;
      achados.push({
        tipo: 'problema',
        texto: motivo
          ? `Pagamento ${p.status}: ${motivo}`
          : `Pagamento ${p.status}${p.statusDetail ? ` (motivo: ${p.statusDetail})` : ''}.`,
      });
    }
    if (mesmaConta(p.payerId, p.payerEmail)) {
      achados.push({
        tipo: 'problema',
        texto: 'Quem pagou é a mesma conta do vendedor. Pague com a conta de outra pessoa.',
      });
    }
  }

  return achados;
}
