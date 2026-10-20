import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { iniciarCheckoutSchema, type StatusAssinatura } from '@resenha05/shared';
import { useAuth } from '../lib/auth';
import { formatarCentavos } from '../lib/dinheiro';
import { useOrg } from '../lib/org';
import { api, ApiError } from '../lib/api';
import { Aviso, Button, Card, Chip, Field, Input, Spinner } from '../components/ui';

interface Organizacao {
  id: string;
  nome: string;
  statusAssinatura: StatusAssinatura;
  /** Tem assinatura recorrente ativa no Mercado Pago (não precisa pagar mês a mês). */
  assinaturaAutomatica: boolean;
  /** Último dia coberto por pagamento avulso ou liberação manual. */
  venceEm: string | null;
  proximoMesAvulso: string | null;
  mensalidadeCentavos: number;
}

/** 'YYYY-MM-DD' -> 'DD/MM/AAAA' sem passar por Date (o fuso não muda o dia). */
function dataBr(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

function mesAno(iso: string): string {
  const [a, m] = iso.slice(0, 10).split('-');
  return `${m}/${a}`;
}

const STATUS: Record<StatusAssinatura, { rotulo: string; tom: 'confirmado' | 'pendente' | 'desistiu'; texto: string }> = {
  ativa: { rotulo: 'Em dia', tom: 'confirmado', texto: 'A mensalidade está em dia.' },
  trial: {
    rotulo: 'Período de avaliação',
    tom: 'pendente',
    texto: 'Esta organização ainda não assinou a mensalidade. Assine para continuar liberada.',
  },
  inadimplente: {
    rotulo: 'Pendente',
    tom: 'pendente',
    texto:
      'A mensalidade está pendente. Enquanto isso, jogadores novos não entram e não dá para criar pelada nova — regularize para liberar de novo.',
  },
  cancelada: {
    rotulo: 'Cancelada',
    tom: 'desistiu',
    texto: 'A assinatura foi cancelada. Assine de novo para reabrir a organização.',
  },
};

export function Assinatura() {
  const { orgId = '' } = useParams();
  const { usuario, recarregar } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'info' | 'erro'; texto: string } | null>(null);
  const [email, setEmail] = useState('');

  // Esta tela é da organização que está na URL — alinha o seletor do topo a ela.
  const { orgId: orgSelecionada, setOrgId } = useOrg();
  useEffect(() => {
    if (orgId && orgId !== orgSelecionada) setOrgId(orgId);
  }, [orgId, orgSelecionada, setOrgId]);

  const { data: org, isLoading } = useQuery({
    queryKey: ['organizacao', orgId],
    queryFn: () => api<Organizacao>(`/organizacoes/${orgId}`),
    enabled: Boolean(orgId),
  });

  const vinculo = usuario?.organizacoes.find((o) => o.id === orgId);
  const souDono = vinculo?.papel === 'admin_principal';

  const checkout = useMutation({
    mutationFn: (payerEmail: string) =>
      api<{ checkoutUrl: string }>(`/organizacoes/${orgId}/assinatura/checkout`, {
        method: 'POST',
        json: { payerEmail },
      }),
    onSuccess: (resp) => {
      window.location.href = resp.checkoutUrl;
    },
    onError: (e) => setErro(e instanceof ApiError ? e.message : 'Não foi possível iniciar o pagamento.'),
  });

  const avulso = useMutation({
    mutationFn: () => api<{ checkoutUrl: string }>(`/organizacoes/${orgId}/assinatura/avulso`, { method: 'POST' }),
    onSuccess: (resp) => {
      window.location.href = resp.checkoutUrl;
    },
    onError: (e) => setErro(e instanceof ApiError ? e.message : 'Não foi possível iniciar o pagamento.'),
  });

  // O Mercado Pago volta para esta página com ?payment_id=...&status=...: confere na hora.
  const conferir = useMutation({
    mutationFn: (paymentId: string) =>
      api<{ resultado: string; statusMp: string }>(`/organizacoes/${orgId}/assinatura/avulso/conferir`, {
        method: 'POST',
        json: { paymentId },
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['organizacao', orgId] });
      void recarregar();
      if (r.resultado === 'aplicar' || r.resultado === 'ja_aplicado') {
        setAviso({ tipo: 'ok', texto: 'Pagamento aprovado! A mensalidade foi liberada.' });
      } else if (r.statusMp === 'pending' || r.statusMp === 'in_process') {
        setAviso({
          tipo: 'info',
          texto: 'Pagamento em análise. Assim que o Mercado Pago aprovar, a mensalidade é liberada sozinha.',
        });
      } else {
        setAviso({ tipo: 'erro', texto: 'O pagamento não foi aprovado. Você pode tentar de novo.' });
      }
    },
    onError: (e) => setErro(e instanceof ApiError ? e.message : 'Não foi possível conferir o pagamento.'),
  });
  const paymentId = params.get('payment_id') ?? params.get('collection_id');
  useEffect(() => {
    if (!paymentId || !souDono || !orgId) return;
    conferir.mutate(paymentId);
    // Limpa o endereço para a conferência não se repetir ao atualizar a página.
    setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentId, souDono, orgId]);

  if (isLoading) return <Spinner className="h-6 w-6 text-campo-600" />;
  if (!org) return <Aviso tipo="erro">Organização não encontrada.</Aviso>;

  const status = STATUS[org.statusAssinatura];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Assinatura</h1>
        <p className="text-sm text-tinta-soft">{org.nome}</p>
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
      {conferir.isPending && (
        <div className="flex items-center gap-2 text-sm text-tinta-soft">
          <Spinner className="h-4 w-4 text-campo-600" /> Conferindo o pagamento…
        </div>
      )}

      <Card className="flex flex-col gap-3">
        <Chip tom={status.tom}>{status.rotulo}</Chip>
        <p className="text-sm text-tinta-soft">{status.texto}</p>
        {org.venceEm && !org.assinaturaAutomatica && (
          <p className="text-sm text-tinta-soft">
            {org.statusAssinatura === 'ativa' ? 'Pago até' : 'Venceu em'}{' '}
            <span className="font-semibold text-tinta">{dataBr(org.venceEm)}</span>.
          </p>
        )}

        {org.statusAssinatura !== 'ativa' &&
          (souDono ? (
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                setErro(null);
                const parsed = iniciarCheckoutSchema.safeParse({ payerEmail: email });
                if (!parsed.success) {
                  setErro(parsed.error.issues[0]?.message ?? 'Informe um e-mail válido.');
                  return;
                }
                checkout.mutate(parsed.data.payerEmail);
              }}
            >
              <Field
                label="E-mail da conta Mercado Pago"
                dica="É a conta que vai pagar no checkout. No modo de teste, use o e-mail da conta compradora de teste."
              >
                <Input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="voce@exemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Button type="submit" disabled={checkout.isPending}>
                {checkout.isPending ? <Spinner /> : 'Pagar mensalidade'}
              </Button>
            </form>
          ) : (
            <Aviso tipo="info">Peça para o administrador principal da organização regularizar a mensalidade.</Aviso>
          ))}
      </Card>

      {souDono && !org.assinaturaAutomatica && org.proximoMesAvulso && (
        <Card className="flex flex-col gap-3">
          <p className="eyebrow">Sem conta no Mercado Pago?</p>
          <p className="text-sm text-tinta-soft">
            Pague o mês por Pix ou cartão como convidado, sem criar conta. Não renova sozinho: quando o mês acabar,
            é só pagar de novo.
          </p>
          <Button variante="secundario" disabled={avulso.isPending} onClick={() => avulso.mutate()}>
            {avulso.isPending ? (
              <Spinner />
            ) : (
              `Pagar ${mesAno(org.proximoMesAvulso)} — ${formatarCentavos(org.mensalidadeCentavos)}`
            )}
          </Button>
        </Card>
      )}

      <button
        className="font-display text-sm font-semibold uppercase tracking-[0.03em] text-campo-700"
        onClick={() => nav(-1)}
      >
        Voltar
      </button>
    </div>
  );
}
