import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatarTelefone } from '@resenha05/shared';
import { useAuth } from '../lib/auth';
import { useOrg } from '../lib/org';
import { api, ApiError } from '../lib/api';
import { Aviso, Button, Card, Estrelas, Input, MiniCartinha, Spinner } from '../components/ui';

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

interface PerfilEncontrado {
  profileId: string;
  nome: string | null;
  telefone: string;
  fotoUrl: string | null;
  fotoRecortada: boolean;
}

export function Administradores() {
  const { orgId = '' } = useParams();
  const { usuario, recarregar } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [termoAdicionar, setTermoAdicionar] = useState('');
  const [termoDebounced, setTermoDebounced] = useState('');
  const [okAdicionar, setOkAdicionar] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setTermoDebounced(termoAdicionar.trim()), 300);
    return () => clearTimeout(t);
  }, [termoAdicionar]);

  // Esta tela é da organização que está na URL — alinha o seletor do topo a ela.
  const { orgId: orgSelecionada, setOrgId } = useOrg();
  useEffect(() => {
    if (orgId && orgId !== orgSelecionada) setOrgId(orgId);
  }, [orgId, orgSelecionada, setOrgId]);

  const vinculo = usuario?.organizacoes.find((o) => o.id === orgId);
  const souDono = vinculo?.papel === 'admin_principal';
  const souAdmin = souDono || vinculo?.papel === 'admin';
  const linkConvite = `${window.location.origin}/entrar-org/${orgId}`;
  const [copiado, setCopiado] = useState(false);

  const { data: membros, isLoading } = useQuery({
    queryKey: ['membros', orgId],
    queryFn: () => api<Membro[]>(`/organizacoes/${orgId}/membros`),
    enabled: Boolean(orgId),
  });

  const buscaPerfis = useQuery({
    queryKey: ['buscar-perfis', orgId, termoDebounced],
    queryFn: () =>
      api<PerfilEncontrado[]>(`/organizacoes/${orgId}/membros/buscar?q=${encodeURIComponent(termoDebounced)}`),
    enabled: souAdmin && termoDebounced.length >= 2,
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

  const adicionar = useMutation({
    mutationFn: (v: { profileId: string }) =>
      api(`/organizacoes/${orgId}/membros/adicionar`, { method: 'POST', json: v }),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['membros', orgId] });
      const nome = buscaPerfis.data?.find((p) => p.profileId === v.profileId)?.nome;
      setTermoAdicionar('');
      setTermoDebounced('');
      setErro(null);
      setOkAdicionar(nome ? `${nome} foi adicionado(a)!` : 'Jogador adicionado!');
      setTimeout(() => setOkAdicionar(null), 3000);
    },
    onError: (e) => setErro(e instanceof ApiError ? e.message : 'Não foi possível adicionar.'),
  });

  const remover = useMutation({
    mutationFn: (v: { profileId: string }) =>
      api(`/organizacoes/${orgId}/membros/remover`, { method: 'POST', json: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['membros', orgId] }),
    onError: (e) => setErro(e instanceof ApiError ? e.message : 'Não foi possível remover.'),
  });

  async function sair() {
    if (!confirm('Sair desta organização?')) return;
    try {
      await api(`/organizacoes/${orgId}/sair`, { method: 'POST' });
      await recarregar();
      nav('/', { replace: true });
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível sair da organização.');
    }
  }

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
        <h1 className="font-display text-2xl font-bold tracking-tight">
          {souAdmin ? 'Administradores' : 'Organização'}
        </h1>
        <p className="text-sm text-tinta-soft">
          {souAdmin
            ? `${totalAdmins}/5 admins. ${souDono ? 'Você é o admin principal.' : 'Só o admin principal promove.'}`
            : `${(membros ?? []).length} membro(s).`}
        </p>
      </div>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {souAdmin && (
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

          <p className="eyebrow mb-1 mt-4">Já tem cadastro?</p>
          <p className="mb-3 text-sm text-tinta-soft">
            Digite o nome ou telefone da pessoa — ela precisa já ter uma conta.
          </p>
          {okAdicionar && <Aviso tipo="ok">{okAdicionar}</Aviso>}
          <div className="relative">
            <Input
              placeholder="Nome ou telefone"
              value={termoAdicionar}
              onChange={(e) => setTermoAdicionar(e.target.value)}
            />
            {termoDebounced.length >= 2 && (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-tinta-line bg-gramado-raised shadow-pop">
                {buscaPerfis.isFetching && (
                  <div className="flex items-center gap-2 px-3 py-2.5 text-sm text-tinta-faint">
                    <Spinner className="h-4 w-4" /> Buscando…
                  </div>
                )}
                {!buscaPerfis.isFetching && buscaPerfis.data?.length === 0 && (
                  <p className="px-3 py-2.5 text-sm text-tinta-faint">Nenhum cadastro encontrado.</p>
                )}
                {!buscaPerfis.isFetching &&
                  buscaPerfis.data?.map((p) => (
                    <button
                      key={p.profileId}
                      type="button"
                      disabled={adicionar.isPending}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-campo-50 disabled:opacity-50"
                      onClick={() => adicionar.mutate({ profileId: p.profileId })}
                    >
                      <MiniCartinha src={p.fotoUrl} nome={p.nome} recortada={p.fotoRecortada} largura={36} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{p.nome ?? 'Sem nome'}</p>
                        <p className="text-xs text-tinta-faint">{formatarTelefone(p.telefone)}</p>
                      </div>
                    </button>
                  ))}
              </div>
            )}
          </div>
        </Card>
      )}

      <Input placeholder="Buscar por nome ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} />

      <div className="flex flex-col gap-2">
        {filtrados.map((m) => {
          const podePromover = souDono && m.papel !== 'admin_principal';
          const podeExcluir =
            souAdmin && m.papel !== 'admin_principal' && m.profileId !== usuario?.id && (m.papel === 'jogador' || souDono);

          return (
            <Card key={m.profileId}>
              <div className="flex items-center gap-3">
                <MiniCartinha src={m.fotoUrl} nome={m.nome} recortada={m.fotoRecortada} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{m.nome ?? 'Sem nome'}</p>
                  <p className="text-xs text-tinta-faint">{formatarTelefone(m.telefone)}</p>
                </div>
                <span className="rounded-md bg-campo-50 px-2 py-0.5 text-xs font-semibold capitalize text-campo-700">
                  {m.papel.replace('_', ' ')}
                </span>
              </div>

              <div className="mt-3 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Estrelas n={m.estrelas} />
                  {souAdmin && (
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
                  )}
                </div>

                {(podePromover || podeExcluir) && (
                  <div className="flex flex-wrap items-center gap-2">
                    {podePromover && (
                      <Button
                        variante="secundario"
                        className="flex-1 min-w-0 !px-3 !text-[0.85rem]"
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

                    {podeExcluir && (
                      <Button
                        variante="perigo"
                        className="flex-1 min-w-0 !px-3 !text-[0.85rem]"
                        onClick={() => {
                          if (!confirm(`Remover ${m.nome ?? 'este jogador'} da organização?`)) return;
                          remover.mutate({ profileId: m.profileId });
                        }}
                      >
                        Excluir
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {vinculo && !souDono && (
        <Card>
          <button
            className="w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-barro-600 hover:bg-barro-100/50"
            onClick={sair}
          >
            Sair da organização
          </button>
        </Card>
      )}

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
