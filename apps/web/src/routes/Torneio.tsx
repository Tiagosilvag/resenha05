import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FORMATOS_TORNEIO, type LinhaClassificacao } from '@resenha05/shared';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Aviso, Button, Card, Chip, Eyebrow, Field, Input, Placar, Select, Spinner } from '../components/ui';

interface Time {
  id: string;
  nome: string;
  grupo: string | null;
}
interface Fase {
  id: string;
  nome: string;
  formato: 'grupos' | 'mata_mata' | 'pontos_corridos';
  ordem: number;
}
interface Jogo {
  id: string;
  fase_id: string | null;
  time_a_id: string | null;
  time_b_id: string | null;
  time_a_nome: string | null;
  time_b_nome: string | null;
  placar_a: number | null;
  placar_b: number | null;
  status: string;
}
interface TorneioResp {
  torneio: { id: string; organizacao_id: string; nome: string; status: string };
  times: Time[];
  fases: Fase[];
  jogos: Jogo[];
  classificacoes: Record<string, LinhaClassificacao[]>;
}

const ROTULO_FORMATO: Record<string, string> = {
  grupos: 'Fase de grupos',
  mata_mata: 'Mata-mata',
  pontos_corridos: 'Pontos corridos',
};

function Tabela({ linhas }: { linhas: LinhaClassificacao[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-tinta-line/70 bg-gramado-raised">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gramado-sunk font-display text-[0.66rem] font-semibold uppercase tracking-[0.06em] text-tinta-faint">
            <th className="py-2 pl-3 pr-1 text-left">#</th>
            <th className="py-2 pr-2 text-left">Time</th>
            <th className="px-1.5 py-2 text-center">P</th>
            <th className="px-1.5 py-2 text-center">J</th>
            <th className="px-1.5 py-2 text-center">SG</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-tinta-line/50">
          {linhas.map((l, i) => (
            <tr key={l.timeId ?? i} className={i === 0 ? 'bg-campo-50' : undefined}>
              <td className="py-2.5 pl-3 pr-1">
                <span
                  className={`grid h-5 w-5 place-items-center rounded font-display text-xs font-bold ${
                    i === 0 ? 'bg-gradient-to-b from-campo-300 to-campo-500 text-noite' : 'bg-gramado-sunk text-tinta-soft'
                  }`}
                >
                  {i + 1}
                </span>
              </td>
              <td className="py-2.5 pr-2 font-medium">{l.nome}</td>
              <td className="placar-num px-1.5 py-2.5 text-center text-campo-700">{l.pontos}</td>
              <td className="px-1.5 py-2.5 text-center text-tinta-soft">{l.jogos}</td>
              <td className="px-1.5 py-2.5 text-center text-tinta-soft">{l.saldo > 0 ? `+${l.saldo}` : l.saldo}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ListaJogos({ jogos, nomeTime }: { jogos: Jogo[]; nomeTime: (j: Jogo, lado: 'a' | 'b') => string }) {
  if (jogos.length === 0) return <p className="text-sm text-tinta-faint">Nenhum jogo ainda.</p>;
  return (
    <div className="flex flex-col gap-2">
      {jogos.map((j) => (
        <Link key={j.id} to={`/jogos/${j.id}`} className="block">
          <Card className="flex items-center gap-3 py-3 transition-shadow hover:shadow-pop">
            <p className="min-w-0 flex-1 truncate text-sm font-medium">
              {nomeTime(j, 'a')} <span className="text-tinta-faint">vs</span> {nomeTime(j, 'b')}
            </p>
            <Placar a={j.placar_a} b={j.placar_b} />
          </Card>
        </Link>
      ))}
    </div>
  );
}

export function Torneio() {
  const { torneioId = '' } = useParams();
  const { usuario } = useAuth();
  const qc = useQueryClient();
  const [erro, setErro] = useState<string | null>(null);
  const [novaFase, setNovaFase] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['torneio', torneioId],
    queryFn: () => api<TorneioResp>(`/torneios/${torneioId}`),
  });

  const org = usuario?.organizacoes.find((o) => o.id === data?.torneio.organizacao_id);
  const admin = org?.papel === 'admin' || org?.papel === 'admin_principal';
  const nomeTime = (j: Jogo, lado: 'a' | 'b') => {
    const id = lado === 'a' ? j.time_a_id : j.time_b_id;
    return data?.times.find((t) => t.id === id)?.nome ?? (lado === 'a' ? j.time_a_nome : j.time_b_nome) ?? '—';
  };

  const invalidar = () => qc.invalidateQueries({ queryKey: ['torneio', torneioId] });

  const criarFase = useMutation({
    mutationFn: (v: { nome: string; formato: string }) =>
      api(`/torneios/${torneioId}/fases`, { method: 'POST', json: v }),
    onSuccess: () => {
      setErro(null);
      setNovaFase(false);
      invalidar();
    },
    onError: (e) => setErro(e instanceof ApiError ? e.message : 'Erro ao criar a fase.'),
  });

  const removerFase = useMutation({
    mutationFn: (faseId: string) => api(`/fases/${faseId}`, { method: 'DELETE' }),
    onSuccess: invalidar,
    onError: (e) => setErro(e instanceof ApiError ? e.message : 'Erro ao remover a fase.'),
  });

  const criarJogo = useMutation({
    mutationFn: (v: { timeAId: string; timeBId: string; faseId: string }) =>
      api(`/torneios/${torneioId}/jogos`, { method: 'POST', json: v }),
    onSuccess: () => {
      setErro(null);
      invalidar();
    },
    onError: (e) => setErro(e instanceof ApiError ? e.message : 'Erro ao criar o jogo.'),
  });

  if (isLoading || !data) return <Spinner className="h-6 w-6 text-campo-600" />;

  const emAndamento = data.torneio.status === 'em_andamento';
  const jogosOrfaos = data.jogos.filter((j) => !data.fases.some((f) => f.id === j.fase_id));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link to="/torneios" className="font-display text-xs font-semibold uppercase tracking-[0.05em] text-tinta-faint">
          ← Torneios
        </Link>
        <div className="mt-1 flex items-center gap-2">
          <h1 className="font-display text-2xl font-bold tracking-tight">{data.torneio.nome}</h1>
          <Chip tom={emAndamento ? 'confirmado' : 'neutro'}>{data.torneio.status.replace('_', ' ')}</Chip>
        </div>
      </div>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {data.fases.length === 0 && (
        <Card>
          <p className="text-sm text-tinta-soft">
            Esse torneio ainda não tem fases. Crie a primeira — grupos, mata-mata ou pontos corridos — para
            começar a lançar jogos.
          </p>
        </Card>
      )}

      {data.fases.map((f) => {
        const jogosDaFase = data.jogos.filter((j) => j.fase_id === f.id);
        const linhas = data.classificacoes[f.id];
        return (
          <section key={f.id} className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-display text-base font-bold uppercase tracking-[0.02em] text-tinta">{f.nome}</p>
                <p className="text-xs text-tinta-faint">{ROTULO_FORMATO[f.formato]}</p>
              </div>
              {admin && emAndamento && (
                <button
                  type="button"
                  aria-label={`Remover a fase ${f.nome}`}
                  onClick={() => {
                    if (jogosDaFase.length > 0 && !confirm(`Remover "${f.nome}"? Os jogos dela continuam, só ficam sem fase.`)) return;
                    removerFase.mutate(f.id);
                  }}
                  className="shrink-0 text-xs font-semibold uppercase tracking-[0.04em] text-barro-600"
                >
                  Remover
                </button>
              )}
            </div>

            {linhas && linhas.length > 0 && <Tabela linhas={linhas} />}

            <ListaJogos jogos={jogosDaFase} nomeTime={nomeTime} />

            {admin && emAndamento && (
              <NovoJogo
                times={data.times}
                onCriar={(v) => criarJogo.mutate({ ...v, faseId: f.id })}
                pendente={criarJogo.isPending}
              />
            )}
          </section>
        );
      })}

      {jogosOrfaos.length > 0 && (
        <section>
          <Eyebrow>Sem fase</Eyebrow>
          <ListaJogos jogos={jogosOrfaos} nomeTime={nomeTime} />
        </section>
      )}

      {admin && emAndamento && (
        <Card>
          {novaFase ? (
            <NovaFase
              onCriar={(v) => criarFase.mutate(v)}
              onCancelar={() => setNovaFase(false)}
              pendente={criarFase.isPending}
            />
          ) : (
            <button
              className="inline-flex items-center gap-1.5 font-display text-sm font-semibold uppercase tracking-[0.04em] text-campo-700"
              onClick={() => setNovaFase(true)}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Nova fase
            </button>
          )}
        </Card>
      )}

      {admin && emAndamento && (
        <Button
          variante="perigo"
          onClick={() => api(`/torneios/${torneioId}/encerrar`, { method: 'POST' }).then(invalidar)}
        >
          Encerrar torneio
        </Button>
      )}
    </div>
  );
}

function NovaFase({
  onCriar,
  onCancelar,
  pendente,
}: {
  onCriar: (v: { nome: string; formato: string }) => void;
  onCancelar: () => void;
  pendente: boolean;
}) {
  const [nome, setNome] = useState('');
  const [formato, setFormato] = useState<(typeof FORMATOS_TORNEIO)[number]>('grupos');
  return (
    <div className="flex flex-col gap-3">
      <Field label="Nome da fase">
        <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Fase de grupos, Semifinal…" />
      </Field>
      <Field label="Formato desta fase">
        <Select value={formato} onChange={(e) => setFormato(e.target.value as typeof formato)}>
          <option value="grupos">Fase de grupos</option>
          <option value="pontos_corridos">Pontos corridos</option>
          <option value="mata_mata">Mata-mata</option>
        </Select>
      </Field>
      <div className="flex gap-2">
        <Button variante="secundario" className="flex-1" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button className="flex-1" disabled={pendente || nome.trim().length < 2} onClick={() => onCriar({ nome, formato })}>
          {pendente ? <Spinner /> : 'Criar fase'}
        </Button>
      </div>
    </div>
  );
}

function NovoJogo({
  times,
  onCriar,
  pendente,
}: {
  times: Time[];
  onCriar: (v: { timeAId: string; timeBId: string }) => void;
  pendente: boolean;
}) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  return (
    <Card>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Time A">
            <Select value={a} onChange={(e) => setA(e.target.value)}>
              <option value="">—</option>
              {times.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </Select>
          </Field>
          <Field label="Time B">
            <Select value={b} onChange={(e) => setB(e.target.value)}>
              <option value="">—</option>
              {times.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </Select>
          </Field>
        </div>
        <Button disabled={pendente || !a || !b || a === b} onClick={() => onCriar({ timeAId: a, timeBId: b })}>
          {pendente ? <Spinner /> : 'Adicionar jogo'}
        </Button>
      </div>
    </Card>
  );
}
