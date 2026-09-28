import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { conectarMercadoPagoSchema } from '@resenha05/shared';
import { useAuth } from '../lib/auth';
import { useOrg } from '../lib/org';
import { api, ApiError } from '../lib/api';
import { Aviso, Button, Card, Input, Spinner } from '../components/ui';

interface Organizacao {
  id: string;
  nome: string;
  mercadoPagoConectado: boolean;
  mercadoPagoAtualizadoEm: string | null;
}

export function OrganizacaoMercadoPago() {
  const { orgId = '' } = useParams();
  const { usuario } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();

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

  const [accessToken, setAccessToken] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const salvar = useMutation({
    mutationFn: () => api(`/organizacoes/${orgId}/mercadopago`, { method: 'POST', json: { accessToken } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['organizacao', orgId] });
      setAccessToken('');
      setOk(true);
      setTimeout(() => setOk(false), 2500);
    },
    onError: (e) => setErro(e instanceof ApiError ? e.message : 'Não foi possível conectar.'),
  });

  if (isLoading) return <Spinner className="h-6 w-6 text-campo-600" />;
  if (!org) return <Aviso tipo="erro">Organização não encontrada.</Aviso>;

  if (!souDono) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-2xl font-bold tracking-tight">Conta Mercado Pago</h1>
        <Aviso tipo="info">Só o administrador principal da organização vincula essa conta.</Aviso>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Conta Mercado Pago</h1>
        <p className="text-sm text-tinta-soft">{org.nome}</p>
      </div>

      <Card>
        <p className="mb-3 text-sm text-tinta-soft">
          {org.mercadoPagoConectado
            ? `Conectada${
                org.mercadoPagoAtualizadoEm
                  ? ` desde ${new Date(org.mercadoPagoAtualizadoEm).toLocaleDateString('pt-BR')}`
                  : ''
              }.`
            : 'Ainda não conectada.'}
        </p>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        {ok && <Aviso tipo="ok">Conta conectada.</Aviso>}
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setErro(null);
            const parsed = conectarMercadoPagoSchema.safeParse({ accessToken });
            if (!parsed.success) {
              setErro(parsed.error.issues[0]?.message ?? 'Confira o Access Token.');
              return;
            }
            salvar.mutate();
          }}
        >
          <Input
            type="password"
            autoComplete="off"
            placeholder="Access Token de produção"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
          />
          <Button type="submit" disabled={salvar.isPending}>
            {salvar.isPending ? <Spinner /> : 'Salvar'}
          </Button>
        </form>
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
