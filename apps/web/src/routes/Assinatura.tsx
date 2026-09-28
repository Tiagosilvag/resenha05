import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { StatusAssinatura } from '@resenha05/shared';
import { useAuth } from '../lib/auth';
import { useOrg } from '../lib/org';
import { api, ApiError } from '../lib/api';
import { Aviso, Button, Card, Chip, Spinner } from '../components/ui';

interface Organizacao {
  id: string;
  nome: string;
  statusAssinatura: StatusAssinatura;
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
  const { usuario } = useAuth();
  const nav = useNavigate();
  const [erro, setErro] = useState<string | null>(null);

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
    mutationFn: () => api<{ checkoutUrl: string }>(`/organizacoes/${orgId}/assinatura/checkout`, { method: 'POST' }),
    onSuccess: (resp) => {
      window.location.href = resp.checkoutUrl;
    },
    onError: (e) => setErro(e instanceof ApiError ? e.message : 'Não foi possível iniciar o pagamento.'),
  });

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

      <Card className="flex flex-col gap-3">
        <Chip tom={status.tom}>{status.rotulo}</Chip>
        <p className="text-sm text-tinta-soft">{status.texto}</p>

        {org.statusAssinatura !== 'ativa' &&
          (souDono ? (
            <Button onClick={() => checkout.mutate()} disabled={checkout.isPending}>
              {checkout.isPending ? <Spinner /> : 'Pagar mensalidade'}
            </Button>
          ) : (
            <Aviso tipo="info">Peça para o administrador principal da organização regularizar a mensalidade.</Aviso>
          ))}
      </Card>

      <button
        className="font-display text-sm font-semibold uppercase tracking-[0.03em] text-campo-700"
        onClick={() => nav(-1)}
      >
        Voltar
      </button>
    </div>
  );
}
