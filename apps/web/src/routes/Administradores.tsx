import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DIAS_SENHA_PROVISORIA,
  MAX_ADMINS,
  SENHA_PROVISORIA,
  criarJogadorEventoSchema,
  formatarTelefone,
  mascararTelefone,
} from '@resenha05/shared';
import { useAuth } from '../lib/auth';
import { useOrg } from '../lib/org';
import { api, ApiError } from '../lib/api';
import { Aviso, Button, Card, Chip, Estrelas, Field, Input, MiniCartinha, Spinner } from '../components/ui';
import { PainelArtilheiro } from '../components/Artilheiro';

interface Membro {
  profileId: string;
  nome: string | null;
  telefone: string;
  fotoUrl: string | null;
  fotoRecortada: boolean;
  papel: 'jogador' | 'admin' | 'admin_principal';
  estrelas: number;
  ativo: boolean;
  /** Só vem verdadeiro para quem administra: a conta ainda usa a senha provisória. */
  senhaProvisoria: boolean;
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
  const [nomeEvento, setNomeEvento] = useState('');
  const [telEvento, setTelEvento] = useState('');
  const [erroEvento, setErroEvento] = useState<string | null>(null);
  const [criado, setCriado] = useState<{ nome: string; senha: string; dias: number } | null>(null);

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
  const [codigoCopiado, setCodigoCopiado] = useState(false);

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

  // Otimista: com − / + em toques seguidos, cada toque precisa partir do valor
  // que o admin acabou de ver, não do que o servidor ainda não confirmou.
  const estrelas = useMutation({
    mutationFn: (v: { profileId: string; estrelas: number }) =>
      api(`/organizacoes/${orgId}/membros/estrelas`, { method: 'POST', json: v }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ['membros', orgId] });
      const anterior = qc.getQueryData<Membro[]>(['membros', orgId]);
      qc.setQueryData<Membro[]>(['membros', orgId], (lista) =>
        lista?.map((m) => (m.profileId === v.profileId ? { ...m, estrelas: v.estrelas } : m)),
      );
      return { anterior };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.anterior) qc.setQueryData(['membros', orgId], ctx.anterior);
      setErro(e instanceof ApiError ? e.message : 'Não foi possível mudar as estrelas.');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['membros', orgId] }),
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

  const criarJogador = useMutation({
    mutationFn: (v: { nome: string; telefone: string }) =>
      api<{ nome: string; senhaProvisoria: string }>(`/organizacoes/${orgId}/jogadores-evento`, {
        method: 'POST',
        json: v,
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['membros', orgId] });
      setNomeEvento('');
      setTelEvento('');
      setErroEvento(null);
      setCriado({ nome: r.nome, senha: r.senhaProvisoria, dias: DIAS_SENHA_PROVISORIA });
    },
    onError: (e) => {
      setCriado(null);
      setErroEvento(e instanceof ApiError ? e.message : 'Não foi possível cadastrar.');
    },
  });

  const redefinirSenha = useMutation({
    mutationFn: (v: { profileId: string; nome: string | null }) =>
      api<{ senhaProvisoria: string }>(`/organizacoes/${orgId}/membros/redefinir-senha`, {
        method: 'POST',
        json: { profileId: v.profileId },
      }),
    onSuccess: (r, v) => {
      qc.invalidateQueries({ queryKey: ['membros', orgId] });
      setErroEvento(null);
      setCriado({ nome: v.nome ?? 'O jogador', senha: r.senhaProvisoria, dias: DIAS_SENHA_PROVISORIA });
    },
    onError: (e) => setErro(e instanceof ApiError ? e.message : 'Não foi possível redefinir a senha.'),
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
            ? `${totalAdmins}/${MAX_ADMINS} admins${totalAdmins >= MAX_ADMINS ? ' (limite atingido)' : ''}. ${souDono ? 'Você é o admin principal.' : 'Só o admin principal promove.'}`
            : `${(membros ?? []).length} membro(s).`}
        </p>
      </div>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {orgId && <PainelArtilheiro orgId={orgId} souDono={souDono} />}

      {souAdmin && (
        <Card>
          <p className="eyebrow mb-1">Código da organização</p>
          <p className="mb-2 text-sm text-tinta-soft">
            Quem digitar este código — no cadastro ou na tela de início — entra na organização.
          </p>
          <div className="flex items-center gap-2">
            <span className="placar-num flex-1 rounded-xl border border-campo-300 bg-campo-50 px-3 py-2.5 text-center text-xl tracking-[0.3em] text-campo-800">
              {vinculo?.codigo ?? '—'}
            </span>
            <Button
              variante="secundario"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(vinculo?.codigo ?? '');
                } catch {
                  /* alguns navegadores exigem a cópia manual */
                }
                setCodigoCopiado(true);
                setTimeout(() => setCodigoCopiado(false), 2000);
              }}
            >
              {codigoCopiado ? 'Copiado!' : 'Copiar'}
            </Button>
          </div>

          <p className="eyebrow mb-1 mt-4">Convidar por link</p>
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

      {souAdmin && (
        <Card>
          <p className="eyebrow mb-1">Cadastrar jogador do evento</p>
          <p className="mb-3 text-sm text-tinta-soft">
            Só nome e telefone. A conta nasce com a senha provisória {SENHA_PROVISORIA}, que vale {DIAS_SENHA_PROVISORIA}{' '}
            dias — no primeiro acesso a pessoa define a própria.
          </p>
          {erroEvento && <Aviso tipo="erro">{erroEvento}</Aviso>}
          {criado && (
            <Aviso tipo="ok">
              <span>
                {criado.nome}: senha provisória <strong>{criado.senha}</strong> (vale {criado.dias} dias).
              </span>
            </Aviso>
          )}
          <form
            className="mt-2 flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              setCriado(null);
              const parsed = criarJogadorEventoSchema.safeParse({ nome: nomeEvento, telefone: telEvento });
              if (!parsed.success) {
                setErroEvento(parsed.error.issues[0]?.message ?? 'Confira os dados.');
                return;
              }
              setErroEvento(null);
              criarJogador.mutate({ nome: nomeEvento, telefone: telEvento });
            }}
          >
            <Field label="Nome">
              <Input value={nomeEvento} onChange={(e) => setNomeEvento(e.target.value)} />
            </Field>
            <Field label="Telefone (WhatsApp)">
              <Input
                inputMode="tel"
                placeholder="(11) 91234-5678"
                maxLength={15}
                value={telEvento}
                onChange={(e) => setTelEvento(mascararTelefone(e.target.value))}
              />
            </Field>
            <Button type="submit" disabled={criarJogador.isPending}>
              {criarJogador.isPending ? <Spinner /> : 'Cadastrar jogador'}
            </Button>
          </form>
        </Card>
      )}

      <Input placeholder="Buscar por nome ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} />

      <div className="flex flex-col gap-2">
        {filtrados.map((m) => {
          const limiteAdmins = totalAdmins >= MAX_ADMINS;
          // Virar admin só quando ainda houver vaga; rebaixar é sempre possível.
          const podePromover =
            souDono && m.papel !== 'admin_principal' && (m.papel === 'admin' || !limiteAdmins);
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

              {souAdmin && m.senhaProvisoria && (
                <div className="mt-2 flex items-center gap-2">
                  <Chip tom="pendente">Senha provisória</Chip>
                  <Button
                    variante="secundario"
                    className="!px-3 !py-1.5 !text-[0.8rem]"
                    disabled={redefinirSenha.isPending}
                    onClick={() => {
                      if (!confirm(`Voltar a senha de ${m.nome ?? 'este jogador'} para ${SENHA_PROVISORIA}?`)) return;
                      redefinirSenha.mutate({ profileId: m.profileId, nome: m.nome });
                    }}
                  >
                    Redefinir senha
                  </Button>
                </div>
              )}

              <div className="mt-3 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  {souAdmin && (
                    <button
                      type="button"
                      aria-label={`Diminuir estrelas de ${m.nome ?? 'jogador'}`}
                      disabled={m.estrelas <= 1}
                      onClick={() => estrelas.mutate({ profileId: m.profileId, estrelas: m.estrelas - 1 })}
                      className="grid h-8 w-8 place-items-center rounded-lg border border-campo-300 bg-gramado-raised text-lg font-bold leading-none text-campo-800 hover:bg-campo-50 disabled:opacity-40"
                    >
                      −
                    </button>
                  )}
                  <Estrelas n={m.estrelas} />
                  {souAdmin && (
                    <button
                      type="button"
                      aria-label={`Aumentar estrelas de ${m.nome ?? 'jogador'}`}
                      disabled={m.estrelas >= 5}
                      onClick={() => estrelas.mutate({ profileId: m.profileId, estrelas: m.estrelas + 1 })}
                      className="grid h-8 w-8 place-items-center rounded-lg border border-campo-300 bg-gramado-raised text-lg font-bold leading-none text-campo-800 hover:bg-campo-50 disabled:opacity-40"
                    >
                      +
                    </button>
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
        <Link to={`/org/${orgId}/assinatura`}>
          <Card className="flex items-center justify-between gap-3 transition-shadow hover:shadow-pop">
            <p className="font-display font-semibold uppercase tracking-[0.02em]">Assinatura da organização</p>
            <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 stroke-tinta-faint" fill="none" strokeWidth="2" strokeLinecap="round">
              <path d="m9 6 6 6-6 6" />
            </svg>
          </Card>
        </Link>
      )}

      {souDono && (
        <Link to={`/org/${orgId}/mercadopago`}>
          <Card className="flex items-center justify-between gap-3 transition-shadow hover:shadow-pop">
            <p className="font-display font-semibold uppercase tracking-[0.02em]">Pagamento dos jogadores</p>
            <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 stroke-tinta-faint" fill="none" strokeWidth="2" strokeLinecap="round">
              <path d="m9 6 6 6-6 6" />
            </svg>
          </Card>
        </Link>
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
