import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LinhaClassificacao } from '@resenha05/shared';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Aviso, Button, Card, Chip, Eyebrow, Field, Placar, Select, Spinner } from '../components/ui';

interface Time { id: string; nome: string; grupo: string | null }
interface Jogo {
  id: string;
  fase: string | null;
  time_a_id: string | null;
  time_b_id: string | null;
  time_a_nome: string | null;
  time_b_nome: string | null;
  placar_a: number | null;
  placar_b: number | null;
  status: string;
}
interface TorneioResp {
  torneio: { id: string; organizacao_id: string; nome: string; formato: string; status: string };
  times: Time[];
  jogos: Jogo[];
  classificacao: LinhaClassificacao[];
}

const ROTULO_FORMATO: Record<string, string> = {
  grupos: 'Fase de grupos',
  mata_mata: 'Mata-mata',
  pontos_corridos: 'Pontos corridos',
};

export function Torneio() {
  const { torneioId = '' } = useParams();
  const { usuario } = useAuth();
  const qc = useQueryClient();
  const [erro, setErro] = useState<string | null>(null);

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

  const criarJogo = useMutation({
    mutationFn: (v: { timeAId: string; timeBId: string; fase?: string }) =>
      api(`/torneios/${torneioId}/jogos`, { method: 'POST', json: v }),
    onSuccess: () => { setErro(null); qc.invalidateQueries({ queryKey: ['torneio', torneioId] }); },
    onError: (e) => setErro(e instanceof ApiError ? e.message : 'Erro ao criar o jogo.'),
  });

  if (isLoading || !data) return <Spinner className="h-6 w-6 text-campo-600" />;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link to="/torneios" className="font-display text-xs font-semibold uppercase tracking-[0.05em] text-tinta-faint">
          ← Torneios
        </Link>
        <div className="mt-1 flex items-center gap-2">
          <h1 className="font-display text-2xl font-bold tracking-tight">{data.torneio.nome}</h1>
          <Chip tom={data.torneio.status === 'em_andamento' ? 'confirmado' : 'neutro'}>
            {data.torneio.status.replace('_', ' ')}
          </Chip>
        </div>
        <p className="text-sm text-tinta-faint">{ROTULO_FORMATO[data.torneio.formato] ?? data.torneio.formato}</p>
      </div>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <section>
        <Eyebrow>Classificação</Eyebrow>
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
              {data.classificacao.map((l, i) => (
                <tr key={l.timeId ?? i} className={i === 0 ? 'bg-campo-50' : undefined}>
                  <td className="py-2.5 pl-3 pr-1">
                    <span
                      className={`grid h-5 w-5 place-items-center rounded font-display text-xs font-bold ${
                        i === 0 ? 'bg-campo-600 text-white' : 'bg-gramado-sunk text-tinta-soft'
                      }`}
                    >
                      {i + 1}
                    </span>
                  </td>
                  <td className="py-2.5 pr-2 font-medium">{l.nome}</td>
                  <td className="placar-num px-1.5 py-2.5 text-center text-campo-700">{l.pontos}</td>
                  <td className="px-1.5 py-2.5 text-center text-tinta-soft">{l.jogos}</td>
                  <td className="px-1.5 py-2.5 text-center text-tinta-soft">
                    {l.saldo > 0 ? `+${l.saldo}` : l.saldo}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <Eyebrow>Jogos</Eyebrow>
        {admin && data.torneio.status === 'em_andamento' && (
          <NovoJogo times={data.times} onCriar={(v) => criarJogo.mutate(v)} pendente={criarJogo.isPending} />
        )}
        <div className="mt-2 flex flex-col gap-2">
          {data.jogos.map((j) => (
            <Link key={j.id} to={`/jogos/${j.id}`} className="block">
              <Card className="flex items-center gap-3 py-3 transition-shadow hover:shadow-pop">
                <div className="min-w-0 flex-1">
                  {j.fase && (
                    <p className="font-display text-[0.62rem] font-semibold uppercase tracking-[0.08em] text-tinta-faint">
                      {j.fase}
                    </p>
                  )}
                  <p className="truncate text-sm font-medium">
                    {nomeTime(j, 'a')} <span className="text-tinta-faint">vs</span> {nomeTime(j, 'b')}
                  </p>
                </div>
                <Placar a={j.placar_a} b={j.placar_b} />
              </Card>
            </Link>
          ))}
          {data.jogos.length === 0 && <p className="text-sm text-tinta-faint">Nenhum jogo ainda.</p>}
        </div>
      </section>

      {admin && data.torneio.status === 'em_andamento' && (
        <Button
          variante="perigo"
          onClick={() =>
            api(`/torneios/${torneioId}/encerrar`, { method: 'POST' }).then(() =>
              qc.invalidateQueries({ queryKey: ['torneio', torneioId] }),
            )
          }
        >
          Encerrar torneio
        </Button>
      )}
    </div>
  );
}

function NovoJogo({
  times,
  onCriar,
  pendente,
}: {
  times: Time[];
  onCriar: (v: { timeAId: string; timeBId: string; fase?: string }) => void;
  pendente: boolean;
}) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [fase, setFase] = useState('');
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
        <Field label="Fase (opcional)">
          <Select value={fase} onChange={(e) => setFase(e.target.value)}>
            <option value="">—</option>
            {['Rodada 1', 'Rodada 2', 'Rodada 3', 'Semifinal', 'Final', 'Grupo A', 'Grupo B'].map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </Select>
        </Field>
        <Button
          disabled={pendente || !a || !b || a === b}
          onClick={() => onCriar({ timeAId: a, timeBId: b, fase: fase || undefined })}
        >
          {pendente ? <Spinner /> : 'Adicionar jogo'}
        </Button>
      </div>
    </Card>
  );
}
