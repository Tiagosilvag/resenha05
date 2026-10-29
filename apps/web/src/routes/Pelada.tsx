import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  amplitudeEntreTimesCheios,
  gerarPixCopiaECola,
  peladaExigePagamento,
  statusNoSorteio,
  type ModoPagamentoJogador,
} from '@resenha05/shared';
import { useAuth } from '../lib/auth';
import { api, ApiError, baixarPng } from '../lib/api';
import { formatarReais } from '../lib/dinheiro';
import { Aviso, Button, Card, Chip, Estrelas, Eyebrow, Input, MiniCartinha, Select, Spinner, StatTile } from '../components/ui';
import { CartinhaModal } from '../components/Cartinha';
import { EditarTimesModal } from './pelada/EditarTimesModal';

interface Presenca {
  profileId: string;
  nome: string | null;
  fotoUrl: string | null;
  fotoRecortada: boolean;
  status: 'confirmado' | 'pago' | 'desistiu';
  estrelas: number | null;
  /** O jogador avisou que pagou por Pix; o admin ainda confirma (só admins e o próprio jogador veem). */
  declaradoPagoEm: string | null;
  pagoMetodo: 'manual' | 'pix' | 'mercadopago' | null;
}
interface DadosDePagamento {
  modo: ModoPagamentoJogador;
  valorCentavos: number | null;
  organizacaoNome: string;
  pix: { chave: string; favorecido: string | null; instrucoes: string | null } | null;
}
interface PeladaResp {
  pelada: {
    id: string;
    organizacao_id: string;
    status: string;
    data: string;
    hora: string | null;
    local: string | null;
    valor: string | null;
  };
  presencas: Presenca[];
  minhaPresenca: Presenca | null;
  pagamento: DadosDePagamento;
}

export function Pelada() {
  const { peladaId = '' } = useParams();
  const { usuario } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<'todos' | Presenca['status']>('todos');
  const [verCard, setVerCard] = useState<{ id: string; nome: string | null } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['pelada', peladaId],
    queryFn: () => api<PeladaResp>(`/peladas/${peladaId}`),
    refetchInterval: 8000,
  });

  const org = usuario?.organizacoes.find((o) => o.id === data?.pelada.organizacao_id);
  const souDono = org?.papel === 'admin_principal';
  const admin = souDono || org?.papel === 'admin';

  const confirmar = useMutation({
    mutationFn: (status: 'confirmado' | 'desistiu') =>
      api(`/peladas/${peladaId}/presenca`, { method: 'POST', json: { status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pelada', peladaId] }),
    onError: (e) => setErro(e instanceof ApiError ? e.message : 'Erro.'),
  });
  const [buscaMembro, setBuscaMembro] = useState('');

  // Lista da organização, para o admin colocar quem não confirmou sozinho.
  const membros = useQuery({
    queryKey: ['membros', data?.pelada.organizacao_id],
    queryFn: () => api<MembroOrg[]>(`/organizacoes/${data!.pelada.organizacao_id}/membros`),
    enabled: Boolean(admin && data?.pelada.organizacao_id),
  });

  const adicionarNaLista = useMutation({
    mutationFn: (profileId: string) =>
      api(`/peladas/${peladaId}/presencas`, { method: 'POST', json: { profileId } }),
    onSuccess: () => {
      setBuscaMembro('');
      setErro(null);
      qc.invalidateQueries({ queryKey: ['pelada', peladaId] });
    },
    onError: (e) => setErro(e instanceof ApiError ? e.message : 'Não foi possível adicionar.'),
  });

  const [avisoLista, setAvisoLista] = useState<string | null>(null);
  const adicionarTodos = useMutation({
    mutationFn: () =>
      api<{ adicionados: number }>(`/peladas/${peladaId}/presencas/todos`, { method: 'POST' }),
    onSuccess: ({ adicionados }) => {
      setErro(null);
      setAvisoLista(
        adicionados === 0
          ? 'Todo mundo da organização já estava na lista.'
          : `${adicionados} jogador(es) adicionado(s) à lista.`,
      );
      qc.invalidateQueries({ queryKey: ['pelada', peladaId] });
    },
    onError: (e) => {
      setAvisoLista(null);
      setErro(e instanceof ApiError ? e.message : 'Não foi possível adicionar todos.');
    },
  });

  const tirarDaLista = useMutation({
    mutationFn: (profileId: string) =>
      api(`/peladas/${peladaId}/presencas/${profileId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pelada', peladaId] }),
    onError: (e) => setErro(e instanceof ApiError ? e.message : 'Não foi possível remover.'),
  });

  const pagamento = useMutation({
    mutationFn: (v: { profileId: string; pago: boolean }) =>
      api(`/peladas/${peladaId}/pagamento`, { method: 'POST', json: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pelada', peladaId] }),
    onError: (e) =>
      setErro(e instanceof ApiError ? e.message : 'Não foi possível mudar o pagamento.'),
  });

  const sairDaLista = useMutation({
    mutationFn: () => api(`/peladas/${peladaId}/presenca`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pelada', peladaId] }),
    onError: (e) => setErro(e instanceof ApiError ? e.message : 'Não foi possível sair da lista.'),
  });

  if (isLoading || !data) return <Spinner className="h-6 w-6 text-campo-600" />;

  const confirmados = data.presencas.filter((p) => p.status !== 'desistiu');
  const pagos = data.presencas.filter((p) => p.status === 'pago').length;
  const exigePagamento = peladaExigePagamento(data.pelada.valor);
  const entramNoSorteio = statusNoSorteio(data.pelada.valor);
  const elegiveis = data.presencas.filter((p) => entramNoSorteio.includes(p.status as 'confirmado' | 'pago')).length;
  const semPagar = data.presencas.filter((p) => p.status === 'confirmado').length;
  const contagem: Record<'todos' | Presenca['status'], number> = {
    todos: data.presencas.length,
    confirmado: semPagar,
    pago: pagos,
    desistiu: data.presencas.filter((p) => p.status === 'desistiu').length,
  };
  const visiveis = filtro === 'todos' ? data.presencas : data.presencas.filter((p) => p.status === filtro);
  const dataFmt = new Date(data.pelada.data.slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });
  const dentro = data.minhaPresenca && data.minhaPresenca.status !== 'desistiu';

  const q = buscaMembro.trim().toLowerCase();
  const naLista = new Set(data.presencas.map((p) => p.profileId));
  const membrosForaDaLista = (membros.data ?? []).filter((m) => !naLista.has(m.profileId));
  const foraDaLista = membrosForaDaLista
    .filter((m) => (m.nome ?? '').toLowerCase().includes(q))
    .slice(0, 6);

  return (
    <div className="flex flex-col gap-5">
      {/* cabeçalho */}
      <div className="overflow-hidden rounded-2xl bg-noite bg-brasao p-5 text-white shadow-pop">
        <p className="font-display text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-white/70">
          Próxima pelada
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-white first-letter:uppercase">{dataFmt}</h1>
        <p className="mt-0.5 text-sm text-white/80">
          {data.pelada.hora ? data.pelada.hora.slice(0, 5) : 'horário a definir'}
          {data.pelada.local ? ` · ${data.pelada.local}` : ''}
        </p>
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <ValorDaPelada peladaId={peladaId} valor={data.pelada.valor} souDono={souDono} />

      <div className="grid grid-cols-3 gap-2.5">
        <StatTile valor={confirmados.length} rotulo="na lista" />
        <StatTile valor={pagos} rotulo="pagos" />
        <StatTile valor={data.presencas.filter((p) => p.status === 'desistiu').length} rotulo="fora" />
      </div>

      {data.pelada.status === 'aberta' ? (
        dentro ? (
          <Button variante="secundario" onClick={() => sairDaLista.mutate()}>
            Sair da lista
          </Button>
        ) : (
          <Button onClick={() => confirmar.mutate('confirmado')} disabled={confirmar.isPending}>
            {confirmar.isPending ? <Spinner /> : 'Confirmar presença'}
          </Button>
        )
      ) : (
        <Aviso>A lista desta pelada está {data.pelada.status}.</Aviso>
      )}

      {dentro && data.minhaPresenca && data.pagamento.valorCentavos && (
        <PagamentoDoJogador
          peladaId={peladaId}
          pagamento={data.pagamento}
          minha={data.minhaPresenca}
          onMudou={() => qc.invalidateQueries({ queryKey: ['pelada', peladaId] })}
        />
      )}

      {admin && (
        <Card>
          <p className="eyebrow mb-1">Adicionar à lista</p>
          <p className="mb-2 text-sm text-tinta-soft">
            Coloque quem avisou por fora — só quem já é da organização.
          </p>
          <Input
            placeholder="Buscar por nome"
            value={buscaMembro}
            onChange={(e) => setBuscaMembro(e.target.value)}
          />
          {avisoLista && <div className="mt-2"><Aviso tipo="ok">{avisoLista}</Aviso></div>}
          {buscaMembro.trim().length >= 2 && (
            <div className="mt-2 overflow-hidden rounded-xl border border-tinta-line">
              {foraDaLista.length === 0 && (
                <p className="px-3 py-2.5 text-sm text-tinta-faint">
                  Ninguém encontrado fora da lista.
                </p>
              )}
              {foraDaLista.map((m) => (
                <button
                  key={m.profileId}
                  type="button"
                  disabled={adicionarNaLista.isPending}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-campo-50 disabled:opacity-50"
                  onClick={() => adicionarNaLista.mutate(m.profileId)}
                >
                  <MiniCartinha src={m.fotoUrl} nome={m.nome} recortada={m.fotoRecortada} largura={30} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {m.nome ?? 'Sem nome'}
                  </span>
                </button>
              ))}
            </div>
          )}
          {membrosForaDaLista.length > 0 && (
            <Button
              variante="secundario"
              className="mt-3 w-full"
              disabled={adicionarTodos.isPending}
              onClick={() => {
                const n = membrosForaDaLista.length;
                const aviso = exigePagamento
                  ? ' Eles entram como confirmados e só vão para o sorteio depois de marcados como pagos.'
                  : '';
                if (!confirm(`Adicionar à lista os ${n} jogador(es) da organização que ainda não estão nela?${aviso}`)) return;
                adicionarTodos.mutate();
              }}
            >
              {adicionarTodos.isPending ? <Spinner /> : `Adicionar todos da organização (${membrosForaDaLista.length})`}
            </Button>
          )}
        </Card>
      )}

      <section>
        <Eyebrow>Lista de presença</Eyebrow>
        {admin && (
          <p className="-mt-1 mb-2 text-xs text-tinta-faint">
            Toque no status de um jogador para marcar que ele pagou.
          </p>
        )}
        {admin && (
          <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por status">
            {(
              [
                ['todos', 'Todos'],
                ['confirmado', 'Confirmado'],
                ['pago', 'Pago'],
                ['desistiu', 'Desistiu'],
              ] as const
            ).map(([valor, rotulo]) => (
              <button
                key={valor}
                type="button"
                aria-pressed={filtro === valor}
                onClick={() => setFiltro(valor)}
                className={`rounded-full border px-3 py-1 font-display text-xs font-semibold uppercase tracking-[0.04em] transition-colors ${
                  filtro === valor
                    ? 'border-campo-400 bg-campo-50 text-campo-800'
                    : 'border-tinta-line text-tinta-soft hover:bg-campo-50/60'
                }`}
              >
                {rotulo} ({contagem[valor]})
              </button>
            ))}
          </div>
        )}
        <div className="divide-y divide-tinta-line/60 overflow-hidden rounded-2xl border border-tinta-line/70 bg-gramado-raised">
          {visiveis.map((p, i) => (
            <div
              key={p.profileId}
              className={`flex items-center gap-2 px-3 py-2.5 ${p.status === 'desistiu' ? 'opacity-55' : ''}`}
            >
              <span className="placar-num w-5 shrink-0 text-center text-xs text-tinta-faint">{i + 1}</span>
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                onClick={() => setVerCard({ id: p.profileId, nome: p.nome })}
              >
                <MiniCartinha src={p.fotoUrl} nome={p.nome} largura={34} recortada={p.fotoRecortada} />
                <span className="min-w-0">
                  <span className={`block truncate text-sm font-medium ${p.status === 'desistiu' ? 'line-through' : ''}`}>
                    {p.nome ?? 'Jogador'}
                  </span>
                  {p.estrelas != null && <Estrelas n={p.estrelas} className="mt-0.5" />}
                </span>
              </button>
              {admin && p.status === 'confirmado' && p.declaradoPagoEm && (
                <span className="shrink-0 rounded-full bg-ouro-100 px-2 py-0.5 font-display text-[0.62rem] font-bold uppercase tracking-[0.04em] text-ouro-700">
                  avisou que pagou
                </span>
              )}
              {admin && p.status === 'pago' && p.pagoMetodo === 'mercadopago' ? (
                <span
                  title="Pago pelo Mercado Pago — só se desfaz com estorno lá"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-grama-100 px-2.5 py-0.5 font-display text-[0.7rem] font-semibold uppercase tracking-[0.05em] text-grama-800 ring-1 ring-grama-500/40"
                >
                  <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                  Pago · Mercado Pago
                </span>
              ) : admin && p.status !== 'desistiu' ? (
                <button
                  type="button"
                  disabled={pagamento.isPending}
                  aria-label={
                    p.status === 'pago'
                      ? `Marcar ${p.nome ?? 'jogador'} como não pago`
                      : `Marcar ${p.nome ?? 'jogador'} como pago`
                  }
                  onClick={() =>
                    pagamento.mutate({ profileId: p.profileId, pago: p.status !== 'pago' })
                  }
                  className="shrink-0 rounded-full ring-offset-2 ring-offset-gramado-raised transition-transform hover:ring-1 hover:ring-campo-300 active:scale-95 disabled:opacity-50"
                >
                  <Chip tom={p.status}>{p.status}</Chip>
                </button>
              ) : (
                <Chip tom={p.status}>{p.status}</Chip>
              )}
              {admin && !(p.status === 'pago' && p.pagoMetodo === 'mercadopago') && (
                <button
                  type="button"
                  aria-label={`Tirar ${p.nome ?? 'jogador'} da lista`}
                  disabled={tirarDaLista.isPending}
                  onClick={() => {
                    if (!confirm(`Tirar ${p.nome ?? 'este jogador'} da lista?`)) return;
                    tirarDaLista.mutate(p.profileId);
                  }}
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-tinta-faint transition-colors hover:bg-barro-100/60 hover:text-barro-600 disabled:opacity-50"
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                    <path d="M6 6l12 12M6 18 18 6" />
                  </svg>
                </button>
              )}
            </div>
          ))}
          {data.presencas.length === 0 && (
            <p className="px-3.5 py-6 text-center text-sm text-tinta-faint">Ninguém confirmou ainda.</p>
          )}
          {data.presencas.length > 0 && visiveis.length === 0 && (
            <p className="px-3.5 py-6 text-center text-sm text-tinta-faint">Ninguém com esse status.</p>
          )}
        </div>
      </section>

      {!admin && <TimesConfirmados peladaId={peladaId} orgId={data.pelada.organizacao_id} />}

      {admin && (
        <PainelSorteio
          peladaId={peladaId}
          orgId={data.pelada.organizacao_id}
          elegiveis={elegiveis}
          exigePagamento={exigePagamento}
          semPagar={semPagar}
        />
      )}

      {souDono && (
        <Card>
          <button
            className="w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-barro-600 hover:bg-barro-100/50"
            onClick={async () => {
              if (!confirm('Excluir esta pelada? A lista de presença vai junto.')) return;
              try {
                await api(`/peladas/${peladaId}`, { method: 'DELETE' });
                qc.invalidateQueries({ queryKey: ['peladas', data.pelada.organizacao_id] });
                nav('/peladas', { replace: true });
              } catch (e) {
                setErro(e instanceof ApiError ? e.message : 'Não foi possível excluir a pelada.');
              }
            }}
          >
            Excluir pelada
          </button>
        </Card>
      )}

      {verCard && (
        <CartinhaModal
          profileId={verCard.id}
          orgId={data.pelada.organizacao_id}
          nome={verCard.nome}
          onFechar={() => setVerCard(null)}
        />
      )}
    </div>
  );
}

interface MembroOrg {
  profileId: string;
  nome: string | null;
  telefone: string;
  fotoUrl: string | null;
  fotoRecortada: boolean;
}

interface JogadorForaDoTime {
  profileId: string;
  nome: string | null;
  estrelas: number;
}

interface SorteioResp {
  sorteio: { id: string; confirmado: boolean } | null;
  times: TimeResultado[];
  foraDosTimes: JogadorForaDoTime[];
}

function ValorDaPelada({
  peladaId,
  valor,
  souDono,
}: {
  peladaId: string;
  valor: string | null;
  souDono: boolean;
}) {
  const qc = useQueryClient();
  const [editando, setEditando] = useState(false);
  const [campo, setCampo] = useState(valor ?? '');
  const [erro, setErro] = useState<string | null>(null);

  const salvar = useMutation({
    mutationFn: () => {
      const limpo = campo.trim();
      const n = limpo ? Number(limpo.replace(',', '.')) : null;
      if (n != null && (!Number.isFinite(n) || n < 0)) throw new Error('Valor inválido.');
      return api(`/peladas/${peladaId}/valor`, { method: 'PATCH', json: { valor: n } });
    },
    onSuccess: () => {
      setEditando(false);
      setErro(null);
      qc.invalidateQueries({ queryKey: ['pelada', peladaId] });
    },
    onError: (e) => setErro(e instanceof ApiError ? e.message : 'Valor inválido.'),
  });

  if (!souDono) {
    return valor != null ? (
      <p className="text-sm text-tinta-soft">Valor desta pelada: {formatarReais(valor)}</p>
    ) : null;
  }

  if (!editando) {
    return (
      <button
        type="button"
        className="self-start text-sm font-medium text-campo-700 underline-offset-2 hover:underline"
        onClick={() => {
          setCampo(valor ?? '');
          setEditando(true);
        }}
      >
        {valor != null ? `Valor desta pelada: ${formatarReais(valor)} · editar` : 'Definir valor desta pelada'}
      </button>
    );
  }

  return (
    <Card className="flex flex-col gap-2">
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <div className="flex items-center gap-2">
        <Input
          inputMode="decimal"
          placeholder="0,00"
          value={campo}
          onChange={(e) => setCampo(e.target.value)}
          className="max-w-[10rem]"
        />
        <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
          {salvar.isPending ? <Spinner /> : 'Salvar'}
        </Button>
        <Button variante="secundario" onClick={() => setEditando(false)} disabled={salvar.isPending}>
          Cancelar
        </Button>
      </div>
      <p className="text-xs text-tinta-faint">Deixe em branco pra essa pelada não cobrar dos jogadores.</p>
    </Card>
  );
}

function BotaoBaixarArte({ peladaId }: { peladaId: string }) {
  return (
    <button
      className="mt-3 inline-flex items-center gap-2 rounded-xl border border-ouro-500/40 bg-gramado-dark px-4 py-2 font-display text-sm font-semibold uppercase tracking-[0.04em] text-ouro-300"
      onClick={() => baixarPng(`/peladas/${peladaId}/sorteio/arte.png`, 'sorteio-resenha05.png')}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M12 4v11m0 0 4-4m-4 4-4-4M5 19h14" />
      </svg>
      Baixar arte do sorteio
    </button>
  );
}

function GradeDeTimes({
  times,
  onVerJogador,
}: {
  times: TimeResultado[];
  onVerJogador: (j: { id: string; nome: string | null }) => void;
}) {
  return (
    <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
      {times.map((t) => (
        <div key={t.numero} className="overflow-hidden rounded-xl border border-tinta-line/70">
          <div className="flex items-center justify-between bg-gramado-dark px-3 py-2 text-white">
            <span className="font-display text-sm font-bold uppercase tracking-[0.05em]">Time {t.numero}</span>
            <Estrelas n={t.totalEstrelas / Math.max(1, t.jogadores.length)} />
          </div>
          <ul className="divide-y divide-tinta-line/50 bg-gramado-raised text-sm">
            {t.jogadores.map((j) => (
              <li key={j.profileId} className="flex items-center justify-between gap-2 px-3 py-1.5">
                <button
                  type="button"
                  className="min-w-0 truncate text-left text-tinta underline-offset-2 hover:underline"
                  onClick={() => onVerJogador({ id: j.profileId, nome: j.nome })}
                >
                  {j.nome ?? 'Jogador'}
                </button>
                <Estrelas n={j.estrelas} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * Quem confirmou ou pagou depois do sorteio (ou chegou atrasado) e ainda não
 * está em nenhum time — encaixa direto, mesmo com o sorteio já confirmado.
 */
function ForaDosTimes({
  jogadores,
  times,
  erro,
  encaixando,
  onEncaixar,
}: {
  jogadores: JogadorForaDoTime[];
  times: number[];
  erro: string | null;
  encaixando: boolean;
  onEncaixar: (profileId: string, timeNumero: number) => void;
}) {
  return (
    <section className="mt-3 rounded-xl border border-ouro-500/40 p-3">
      <p className="eyebrow mb-1">Ficaram de fora do sorteio ({jogadores.length})</p>
      <p className="mb-2 text-xs text-tinta-faint">
        Confirmaram ou pagaram depois do sorteio, ou chegaram atrasados — encaixe direto num time.
      </p>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <ul className="divide-y divide-tinta-line/50 overflow-hidden rounded-xl border border-tinta-line/70 bg-gramado-raised text-sm">
        {jogadores.map((j) => (
          <li key={j.profileId} className="flex items-center justify-between gap-2 px-3 py-2">
            <span className="min-w-0">
              <span className="block truncate">{j.nome ?? 'Jogador'}</span>
              <Estrelas n={j.estrelas} className="mt-0.5" />
            </span>
            <Select
              aria-label={`Colocar ${j.nome ?? 'jogador'} num time`}
              value=""
              disabled={encaixando}
              className="!w-auto !py-1.5 !text-sm"
              onChange={(e) => {
                if (e.target.value) onEncaixar(j.profileId, Number(e.target.value));
              }}
            >
              <option value="">Colocar no time…</option>
              {times.map((n) => (
                <option key={n} value={n}>
                  Time {n}
                </option>
              ))}
            </Select>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** O que os participantes veem: só aparece depois que o admin confirma o sorteio. */
/** Atalho para a tela de placar e cronômetro das partidas da pelada. */
function LinkPartidas({ peladaId }: { peladaId: string }) {
  return (
    <Link
      to={`/peladas/${peladaId}/partidas`}
      className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-campo-300 bg-gramado-raised px-4 py-2.5 font-display text-[0.95rem] font-semibold uppercase tracking-[0.03em] text-campo-800 hover:bg-campo-50"
    >
      Partidas e placar
    </Link>
  );
}

/** O que o jogador faz para pagar, conforme a organização escolheu (manual, Pix ou Mercado Pago). */
function PagamentoDoJogador({
  peladaId,
  pagamento,
  minha,
  onMudou,
}: {
  peladaId: string;
  pagamento: DadosDePagamento;
  minha: Presenca;
  onMudou: () => void;
}) {
  const [params, setParams] = useSearchParams();
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'info' | 'erro'; texto: string } | null>(null);
  const [copiado, setCopiado] = useState<'chave' | 'codigo' | null>(null);
  const pago = minha.status === 'pago';
  const reais = (pagamento.valorCentavos ?? 0) / 100;
  const valorTxt = reais.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const falhou = (e: unknown) => setErro(e instanceof ApiError ? e.message : 'Não foi possível concluir.');

  const declarar = useMutation({
    mutationFn: () => api(`/peladas/${peladaId}/pagamento/declarar`, { method: 'POST' }),
    onSuccess: () => {
      setErro(null);
      onMudou();
    },
    onError: falhou,
  });
  const pagar = useMutation({
    mutationFn: () => api<{ checkoutUrl: string }>(`/peladas/${peladaId}/pagamento/mercadopago`, { method: 'POST' }),
    onSuccess: (r) => {
      window.location.href = r.checkoutUrl;
    },
    onError: falhou,
  });
  const conferir = useMutation({
    mutationFn: (paymentId: string) =>
      api<{ resultado: string; statusMp: string }>(`/peladas/${peladaId}/pagamento/mercadopago/conferir`, {
        method: 'POST',
        json: { paymentId },
      }),
    onSuccess: (r) => {
      onMudou();
      if (r.resultado === 'aplicar' || r.resultado === 'ja_aplicado') {
        setAviso({ tipo: 'ok', texto: 'Pagamento aprovado! Você está com o pagamento em dia.' });
      } else if (r.statusMp === 'pending' || r.statusMp === 'in_process') {
        setAviso({ tipo: 'info', texto: 'Pagamento em análise. Assim que for aprovado, aparece aqui como pago.' });
      } else {
        setAviso({ tipo: 'erro', texto: 'O pagamento não foi aprovado. Você pode tentar de novo.' });
      }
    },
    onError: falhou,
  });

  // O Mercado Pago volta para esta página com ?payment_id=...: confere na hora.
  const paymentId = params.get('payment_id') ?? params.get('collection_id');
  useEffect(() => {
    if (!paymentId || pagamento.modo !== 'mercadopago') return;
    conferir.mutate(paymentId);
    setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentId]);

  const copiar = async (texto: string, qual: 'chave' | 'codigo') => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(qual);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      setErro('Não foi possível copiar. Selecione o texto e copie manualmente.');
    }
  };

  const pix = pagamento.pix;
  const copiaECola = pix
    ? gerarPixCopiaECola({ chave: pix.chave, favorecido: pix.favorecido ?? pagamento.organizacaoNome, valor: reais, txid: peladaId.replace(/-/g, '').slice(0, 20) })
    : null;

  return (
    <Card as="section" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Eyebrow className="!mb-0">Pagamento</Eyebrow>
        <span className="placar-num text-lg text-campo-800">{valorTxt}</span>
      </div>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {aviso && !(pago && aviso.tipo === 'ok') && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
      {conferir.isPending && (
        <div className="flex items-center gap-2 text-sm text-tinta-soft">
          <Spinner className="h-4 w-4 text-campo-600" /> Conferindo o pagamento…
        </div>
      )}

      {pago ? (
        <Aviso tipo="ok">
          Pagamento confirmado
          {minha.pagoMetodo === 'pix' ? ' (Pix)' : minha.pagoMetodo === 'mercadopago' ? ' (Mercado Pago)' : ''}. Obrigado!
        </Aviso>
      ) : pagamento.modo === 'manual' ? (
        <p className="text-sm text-tinta-soft">Combine o pagamento com o organizador. Ele marca aqui quando receber.</p>
      ) : pagamento.modo === 'pix' && pix && copiaECola ? (
        <>
          <p className="text-sm text-tinta-soft">
            Pague {valorTxt} por Pix{pix.favorecido ? ` para ${pix.favorecido}` : ''} e depois toque em “Já paguei”.
          </p>
          <div className="rounded-xl border border-tinta-line bg-gramado-sunk px-3 py-2 text-sm">
            <p className="eyebrow mb-0.5">Chave Pix</p>
            <p className="break-all font-medium">{pix.chave}</p>
          </div>
          {pix.instrucoes && <p className="text-sm text-tinta-soft">{pix.instrucoes}</p>}
          <div className="grid grid-cols-2 gap-2">
            <Button variante="secundario" className="!px-2 !text-[0.8rem]" onClick={() => copiar(pix.chave, 'chave')}>
              {copiado === 'chave' ? 'Copiado!' : 'Copiar chave'}
            </Button>
            <Button variante="secundario" className="!px-2 !text-[0.8rem]" onClick={() => copiar(copiaECola, 'codigo')}>
              {copiado === 'codigo' ? 'Copiado!' : 'Pix copia e cola'}
            </Button>
          </div>
          {minha.declaradoPagoEm ? (
            <Aviso tipo="info">Você avisou que pagou. Aguardando o organizador confirmar.</Aviso>
          ) : (
            <Button disabled={declarar.isPending} onClick={() => declarar.mutate()}>
              {declarar.isPending ? <Spinner /> : 'Já paguei'}
            </Button>
          )}
        </>
      ) : pagamento.modo === 'mercadopago' ? (
        <>
          <p className="text-sm text-tinta-soft">
            Pague por Pix ou cartão, sem precisar de conta no Mercado Pago. O “pago” é marcado sozinho.
          </p>
          <Button disabled={pagar.isPending} onClick={() => pagar.mutate()}>
            {pagar.isPending ? <Spinner /> : `Pagar ${valorTxt}`}
          </Button>
        </>
      ) : (
        <p className="text-sm text-tinta-soft">O organizador ainda não configurou como receber. Combine com ele.</p>
      )}
    </Card>
  );
}

function TimesConfirmados({ peladaId, orgId }: { peladaId: string; orgId: string }) {
  const [verCard, setVerCard] = useState<{ id: string; nome: string | null } | null>(null);
  const { data } = useQuery({
    queryKey: ['sorteio', peladaId],
    queryFn: () => api<SorteioResp>(`/peladas/${peladaId}/sorteio`),
    refetchInterval: 8000,
  });
  if (!data?.sorteio || data.times.length === 0) return null;

  return (
    <Card as="section">
      <Eyebrow>Times do dia</Eyebrow>
      <p className="-mt-1 text-sm text-tinta-soft">Sorteio confirmado pelo organizador.</p>
      <LinkPartidas peladaId={peladaId} />
      <BotaoBaixarArte peladaId={peladaId} />
      <GradeDeTimes times={data.times} onVerJogador={setVerCard} />
      {verCard && (
        <CartinhaModal
          profileId={verCard.id}
          orgId={orgId}
          nome={verCard.nome}
          onFechar={() => setVerCard(null)}
        />
      )}
    </Card>
  );
}

interface TimeResultado {
  numero: number;
  totalEstrelas: number;
  jogadores: { profileId: string; nome: string | null; estrelas: number }[];
}

/** Texto de "como vai ficar" antes de sortear. */
function previaDoSorteio(modo: 'times' | 'porTime', n: number, elegiveis: number): string {
  if (modo === 'times') {
    const times = Math.max(2, Math.min(32, n));
    const base = Math.floor(elegiveis / times);
    const maiores = elegiveis % times;
    if (base === 0) return `Só ${elegiveis} jogador(es) para ${times} times.`;
    return maiores === 0
      ? `Vai dar ${times} times de ${base} jogador(es).`
      : `Vai dar ${times} times: ${maiores} com ${base + 1} jogadores e ${times - maiores} com ${base}.`;
  }
  const cheios = Math.floor(elegiveis / n);
  const sobra = elegiveis % n;
  if (cheios + (sobra > 0 ? 1 : 0) < 2) {
    return `Com ${elegiveis} jogador(es) não dá para formar 2 times de ${n}.`;
  }
  const cheiosTxt = `${cheios} time(s) de ${n}`;
  if (sobra === 0) return `Vai dar ${cheiosTxt}.`;
  return sobra === 1
    ? `Vai dar ${cheiosTxt} + 1 time com o jogador que sobra.`
    : `Vai dar ${cheiosTxt} + 1 time com os ${sobra} que sobram.`;
}

function PainelSorteio({
  peladaId,
  orgId,
  elegiveis,
  exigePagamento,
  semPagar,
}: {
  peladaId: string;
  orgId: string;
  /** Quantos entram no sorteio (só pagos, se a pelada cobra; senão confirmados e pagos). */
  elegiveis: number;
  exigePagamento: boolean;
  semPagar: number;
}) {
  const qc = useQueryClient();
  const [modo, setModo] = useState<'times' | 'porTime'>('times');
  // Texto cru: preso a um número, apagar o campo faria ele voltar ao mínimo na
  // hora e o valor ficaria impossível de trocar.
  const [quantidade, setQuantidade] = useState('2');
  const [erro, setErro] = useState<string | null>(null);
  const [verCard, setVerCard] = useState<{ id: string; nome: string | null } | null>(null);
  const [editandoAberto, setEditandoAberto] = useState(false);

  const digitado = Number(quantidade);
  const valido = quantidade !== '' && Number.isFinite(digitado) && digitado >= 1;
  const inteiro = valido ? Math.round(digitado) : 0;
  const nTimes = !valido ? 0 : Math.max(2, Math.min(32, inteiro));
  const previa = !valido || elegiveis === 0 ? null : previaDoSorteio(modo, inteiro, elegiveis);

  function trocarModo(novo: 'times' | 'porTime') {
    setModo(novo);
    setQuantidade(novo === 'times' ? '2' : '5');
  }

  const atual = useQuery({
    queryKey: ['sorteio', peladaId],
    queryFn: () => api<SorteioResp>(`/peladas/${peladaId}/sorteio`),
  });
  const sortear = useMutation({
    mutationFn: () =>
      api<{ times: TimeResultado[]; amplitudeEstrelas: number }>(`/peladas/${peladaId}/sorteio`, {
        method: 'POST',
        json: modo === 'times' ? { nTimes } : { jogadoresPorTime: inteiro },
      }),
    onSuccess: () => {
      setErro(null);
      qc.invalidateQueries({ queryKey: ['sorteio', peladaId] });
    },
    onError: (e) => setErro(e instanceof ApiError ? e.message : 'Erro no sorteio.'),
  });

  const times = atual.data?.times ?? [];
  const foraDosTimes = atual.data?.foraDosTimes ?? [];
  const confirmado = atual.data?.sorteio?.confirmado ?? false;
  const amplitude = amplitudeEntreTimesCheios(times);

  const aposAcao = {
    onSuccess: () => {
      setErro(null);
      qc.invalidateQueries({ queryKey: ['sorteio', peladaId] });
    },
    onError: (e: unknown) => setErro(e instanceof ApiError ? e.message : 'Não foi possível concluir.'),
  };
  const confirmar = useMutation({
    mutationFn: () => api(`/peladas/${peladaId}/sorteio/confirmar`, { method: 'POST' }),
    ...aposAcao,
  });
  const cancelarConfirmacao = useMutation({
    mutationFn: () => api(`/peladas/${peladaId}/sorteio/cancelar-confirmacao`, { method: 'POST' }),
    ...aposAcao,
  });
  const mover = useMutation({
    mutationFn: (v: { profileId: string; timeNumero: number }) =>
      api(`/peladas/${peladaId}/sorteio/mover`, { method: 'POST', json: v }),
    ...aposAcao,
  });
  const encaixar = useMutation({
    mutationFn: (v: { profileId: string; timeNumero: number }) =>
      api(`/peladas/${peladaId}/sorteio/encaixar`, { method: 'POST', json: v }),
    ...aposAcao,
  });

  return (
    <Card as="section">
      <Eyebrow>Sorteio de times</Eyebrow>
      <p className="-mt-1 text-sm text-tinta-soft">
        {exigePagamento
          ? `${elegiveis} pago(s) para dividir. Só quem está como pago entra no sorteio${
              semPagar > 0 ? ` — ${semPagar} confirmado(s) sem pagar ficam de fora` : ''
            }.`
          : `${elegiveis} confirmado(s) para dividir.`}
      </p>
      {erro && <div className="mt-2"><Aviso tipo="erro">{erro}</Aviso></div>}

      <div className="mt-3 flex gap-2">
        {(
          [
            ['times', 'Nº de times'],
            ['porTime', 'Jogadores por time'],
          ] as const
        ).map(([valor, rotulo]) => (
          <button
            key={valor}
            type="button"
            onClick={() => trocarModo(valor)}
            className={`flex-1 rounded-xl border px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.04em] transition-colors ${
              modo === valor
                ? 'border-campo-400 bg-campo-50 text-campo-800'
                : 'border-tinta-line text-tinta-soft'
            }`}
          >
            {rotulo}
          </button>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          min={modo === 'times' ? 2 : 1}
          max={32}
          value={quantidade}
          aria-label={modo === 'times' ? 'Número de times' : 'Jogadores por time'}
          onChange={(e) => setQuantidade(e.target.value)}
          onBlur={() => {
            if (!valido) setQuantidade(modo === 'times' ? '2' : '5');
          }}
          className="placar-num w-20 rounded-lg border border-tinta-line bg-white px-2 py-1.5 text-center text-base"
        />
        <Button onClick={() => sortear.mutate()} disabled={sortear.isPending || !valido || confirmado}>
          {sortear.isPending ? <Spinner /> : times.length ? 'Re-sortear' : 'Sortear'}
        </Button>
      </div>

      {previa && <p className="mt-1.5 text-xs text-tinta-faint">{previa}</p>}

      {times.length > 1 && (
        <p className="mt-2 text-xs text-tinta-faint">
          Diferença entre o time mais forte e o mais fraco: {amplitude} estrela(s).
        </p>
      )}

      {times.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {confirmado ? (
            <>
              <Aviso tipo="ok">Sorteio confirmado: os participantes já veem os times.</Aviso>
              <Button
                variante="secundario"
                onClick={() => {
                  if (!confirm('Cancelar a confirmação? Os participantes deixam de ver os times até você confirmar de novo.')) return;
                  cancelarConfirmacao.mutate();
                }}
                disabled={cancelarConfirmacao.isPending}
              >
                {cancelarConfirmacao.isPending ? <Spinner /> : 'Cancelar confirmação'}
              </Button>
              <p className="text-xs text-tinta-faint">
                Para refazer o sorteio ou mover jogadores de time, cancele a confirmação primeiro.
              </p>
            </>
          ) : (
            <>
              <Aviso>Rascunho: só os administradores veem estes times. Ajuste se precisar e confirme.</Aviso>
              <Button onClick={() => confirmar.mutate()} disabled={confirmar.isPending}>
                {confirmar.isPending ? <Spinner /> : 'Confirmar sorteio'}
              </Button>
            </>
          )}
        </div>
      )}

      {times.length > 0 && <LinkPartidas peladaId={peladaId} />}
      {times.length > 0 && <BotaoBaixarArte peladaId={peladaId} />}

      {times.length > 0 && !confirmado && (
        <Button variante="secundario" className="mt-2" onClick={() => setEditandoAberto(true)}>
          Editar times
        </Button>
      )}

      <GradeDeTimes times={times} onVerJogador={setVerCard} />

      {times.length > 0 && foraDosTimes.length > 0 && (
        <ForaDosTimes
          jogadores={foraDosTimes}
          times={times.map((t) => t.numero)}
          erro={erro}
          encaixando={encaixar.isPending}
          onEncaixar={(profileId, timeNumero) => encaixar.mutate({ profileId, timeNumero })}
        />
      )}

      {editandoAberto && !confirmado && (
        <EditarTimesModal
          times={times}
          aoMover={(profileId, timeNumero) => mover.mutate({ profileId, timeNumero })}
          movendo={mover.isPending}
          erro={erro}
          onFechar={() => {
            setEditandoAberto(false);
            setErro(null);
          }}
        />
      )}

      {verCard && (
        <CartinhaModal
          profileId={verCard.id}
          orgId={orgId}
          nome={verCard.nome}
          onFechar={() => setVerCard(null)}
        />
      )}
    </Card>
  );
}
