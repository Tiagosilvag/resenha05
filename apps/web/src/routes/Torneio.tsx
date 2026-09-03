import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LinhaClassificacao } from '@resenha05/shared';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Aviso, Button, Card, Field, Select, Spinner } from '../components/ui';

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
    <div className="flex flex-col gap-4">
      <div>
        <Link to="/torneios" className="text-sm text-black/45">← Torneios</Link>
        <h1 className="text-xl font-extrabold tracking-tight">{data.torneio.nome}</h1>
      </div>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-black/45">Classificação</h2>
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/5 text-left text-xs uppercase text-black/40">
                <th className="px-3 py-2">Time</th>
                <th className="px-2 py-2 text-center">P</th>
                <th className="px-2 py-2 text-center">J</th>
                <th className="px-2 py-2 text-center">SG</th>
              </tr>
            </thead>
            <tbody>
              {data.classificacao.map((l, i) => (
                <tr key={l.timeId ?? i} className="border-b border-black/5 last:border-0">
                  <td className="px-3 py-2 font-medium">{i + 1}. {l.nome}</td>
                  <td className="px-2 py-2 text-center font-bold text-campo-700">{l.pontos}</td>
                  <td className="px-2 py-2 text-center">{l.jogos}</td>
                  <td className="px-2 py-2 text-center">{l.saldo > 0 ? `+${l.saldo}` : l.saldo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-black/45">Jogos</h2>
        {admin && data.torneio.status === 'em_andamento' && (
          <NovoJogo times={data.times} onCriar={(v) => criarJogo.mutate(v)} pendente={criarJogo.isPending} />
        )}
        <div className="mt-2 flex flex-col gap-2">
          {data.jogos.map((j) => (
            <Link key={j.id} to={`/jogos/${j.id}`}>
              <Card>
                <div className="flex items-center justify-between">
                  <span className="text-sm">
                    {j.fase && <span className="mr-2 text-xs text-black/40">{j.fase}</span>}
                    {nomeTime(j, 'a')} <strong>{j.placar_a ?? '–'} x {j.placar_b ?? '–'}</strong> {nomeTime(j, 'b')}
                  </span>
                  <span className="text-xs uppercase text-black/40">{j.status.replace('_', ' ')}</span>
                </div>
              </Card>
            </Link>
          ))}
          {data.jogos.length === 0 && <p className="text-sm text-black/45">Nenhum jogo ainda.</p>}
        </div>
      </section>

      {admin && data.torneio.status === 'em_andamento' && (
        <Button
          variante="secundario"
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
