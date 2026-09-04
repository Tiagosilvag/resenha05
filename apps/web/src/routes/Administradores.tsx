import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatarTelefone } from '@resenha05/shared';
import { useAuth } from '../lib/auth';
import { api, ApiError } from '../lib/api';
import { Avatar, Aviso, Button, Card, Estrelas, Input, Spinner } from '../components/ui';

interface Membro {
  profileId: string;
  nome: string | null;
  telefone: string;
  fotoUrl: string | null;
  fotoRecortada: boolean;
  papel: 'jogador' | 'admin' | 'admin_principal';
  estrelas: number;
  ativo: boolean;
}

export function Administradores() {
  const { orgId = '' } = useParams();
  const { usuario, recarregar } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const vinculo = usuario?.organizacoes.find((o) => o.id === orgId);
  const souDono = vinculo?.papel === 'admin_principal';
  const linkConvite = `${window.location.origin}/entrar-org/${orgId}`;
  const [copiado, setCopiado] = useState(false);

  const { data: membros, isLoading } = useQuery({
    queryKey: ['membros', orgId],
    queryFn: () => api<Membro[]>(`/organizacoes/${orgId}/membros`),
    enabled: Boolean(orgId),
  });

  const promover = useMutation({
    mutationFn: (v: { profileId: string; papel: 'jogador' | 'admin' }) =>
      api(`/organizacoes/${orgId}/membros/promover`, { method: 'POST', json: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['membros', orgId] }),
    onError: (e) => setErro(e instanceof ApiError ? e.message : 'Erro.'),
  });

  const estrelas = useMutation({
    mutationFn: (v: { profileId: string; estrelas: number }) =>
      api(`/organizacoes/${orgId}/membros/estrelas`, { method: 'POST', json: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['membros', orgId] }),
  });

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (membros ?? []).filter(
      (m) => !q || (m.nome ?? '').toLowerCase().includes(q) || m.telefone.includes(q),
    );
  }, [membros, busca]);

  const totalAdmins = (membros ?? []).filter((m) => m.papel === 'admin' && m.ativo).length;

  if (isLoading) return <Spinner className="h-6 w-6 text-campo-600" />;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Administradores</h1>
        <p className="text-sm text-tinta-soft">
          {totalAdmins}/5 admins. {souDono ? 'Você é o admin principal.' : 'Só o admin principal promove.'}
        </p>
      </div>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <Card>
        <p className="eyebrow mb-1">Convidar jogador</p>
        <p className="mb-3 text-sm text-tinta-soft">
          Compartilhe este link. Quem abrir e estiver logado entra direto na organização.
        </p>
        <div className="flex items-center gap-2">
          <Input readOnly value={linkConvite} onFocus={(e) => e.target.select()} />
          <Button
            variante="secundario"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(linkConvite);
              } catch {
                /* alguns navegadores exigem seleção manual; o campo já fica selecionado ao focar */
              }
              setCopiado(true);
              setTimeout(() => setCopiado(false), 2000);
            }}
          >
            {copiado ? 'Copiado!' : 'Copiar'}
          </Button>
        </div>
      </Card>

      <Input placeholder="Buscar por nome ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} />

      <div className="flex flex-col gap-2">
        {filtrados.map((m) => (
          <Card key={m.profileId}>
            <div className="flex items-center gap-3">
              <Avatar src={m.fotoUrl} nome={m.nome} recortada={m.fotoRecortada} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{m.nome ?? 'Sem nome'}</p>
                <p className="text-xs text-tinta-faint">{formatarTelefone(m.telefone)}</p>
              </div>
              <span className="rounded-md bg-campo-50 px-2 py-0.5 text-xs font-semibold capitalize text-campo-700">
                {m.papel.replace('_', ' ')}
              </span>
            </div>

            <div className="mt-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Estrelas n={m.estrelas} />
                <input
                  type="range"
                  min={1}
                  max={5}
                  value={m.estrelas}
                  onChange={(e) =>
                    estrelas.mutate({ profileId: m.profileId, estrelas: Number(e.target.value) })
                  }
                  className="w-24 accent-campo-600"
                />
              </div>

              {souDono && m.papel !== 'admin_principal' && (
                <Button
                  variante="secundario"
                  onClick={() =>
                    promover.mutate({
                      profileId: m.profileId,
                      papel: m.papel === 'admin' ? 'jogador' : 'admin',
                    })
                  }
                >
                  {m.papel === 'admin' ? 'Rebaixar' : 'Tornar admin'}
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      {souDono && (
        <Card>
          <button
            className="w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-barro-600 hover:bg-barro-100/50"
            onClick={async () => {
              if (!confirm('Encerrar esta organização? Peladas, torneios e vínculos serão apagados.')) return;
              try {
                await api(`/organizacoes/${orgId}`, { method: 'DELETE' });
                await recarregar();
                nav('/', { replace: true });
              } catch (e) {
                setErro(e instanceof ApiError ? e.message : 'Não foi possível encerrar.');
              }
            }}
          >
            Encerrar organização
          </button>
        </Card>
      )}
    </div>
  );
}
