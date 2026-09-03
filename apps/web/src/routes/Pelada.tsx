import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../lib/auth';
import { api, ApiError } from '../lib/api';
import { Avatar, Aviso, Button, Card, Estrelas, Spinner } from '../components/ui';

interface Presenca {
  profileId: string;
  nome: string | null;
  fotoUrl: string | null;
  status: 'confirmado' | 'pago' | 'desistiu';
  estrelas: number | null;
}
interface PeladaResp {
  pelada: { id: string; organizacao_id: string; status: string; data: string; hora: string | null; local: string | null };
  presencas: Presenca[];
  minhaPresenca: Presenca | null;
}

const CORES: Record<string, string> = {
  confirmado: 'bg-campo-100 text-campo-700',
  pago: 'bg-emerald-100 text-emerald-700',
  desistiu: 'bg-black/5 text-black/40 line-through',
};

export function Pelada() {
  const { peladaId = '' } = useParams();
  const { usuario } = useAuth();
  const qc = useQueryClient();
  const [erro, setErro] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['pelada', peladaId],
    queryFn: () => api<PeladaResp>(`/peladas/${peladaId}`),
    refetchInterval: 8000, // lista "ao vivo" via polling (MVP)
  });

  const org = usuario?.organizacoes.find((o) => o.id === data?.pelada.organizacao_id);
  const admin = org?.papel === 'admin' || org?.papel === 'admin_principal';

  const confirmar = useMutation({
    mutationFn: (status: 'confirmado' | 'desistiu') =>
      api(`/peladas/${peladaId}/presenca`, { method: 'POST', json: { status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pelada', peladaId] }),
    onError: (e) => setErro(e instanceof ApiError ? e.message : 'Erro.'),
  });

  const sairDaLista = useMutation({
    mutationFn: () => api(`/peladas/${peladaId}/presenca`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pelada', peladaId] }),
  });

  if (isLoading || !data) return <Spinner className="h-6 w-6 text-campo-600" />;

  const confirmados = data.presencas.filter((p) => p.status !== 'desistiu');

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight">
          {new Date(data.pelada.data + 'T00:00:00').toLocaleDateString('pt-BR', {
            weekday: 'long',
            day: '2-digit',
            month: 'long',
          })}
        </h1>
        <p className="text-sm text-black/55">
          {data.pelada.hora ? data.pelada.hora.slice(0, 5) : 'horário a definir'}
          {data.pelada.local ? ` · ${data.pelada.local}` : ''} · {confirmados.length} na lista
        </p>
      </div>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {data.pelada.status === 'aberta' ? (
        <div className="flex gap-2">
          {data.minhaPresenca && data.minhaPresenca.status !== 'desistiu' ? (
            <Button variante="secundario" className="flex-1" onClick={() => sairDaLista.mutate()}>
              Sair da lista
            </Button>
          ) : (
            <Button className="flex-1" onClick={() => confirmar.mutate('confirmado')} disabled={confirmar.isPending}>
              {confirmar.isPending ? <Spinner /> : 'Confirmar presença'}
            </Button>
          )}
        </div>
      ) : (
        <Aviso>A lista desta pelada está {data.pelada.status}.</Aviso>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-black/45">Lista de presença</h2>
        <div className="flex flex-col gap-1.5">
          {data.presencas.map((p) => (
            <div key={p.profileId} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2">
              <Avatar src={p.fotoUrl} nome={p.nome} size={32} />
              <span className="flex-1 truncate text-sm font-medium">{p.nome ?? 'Jogador'}</span>
              {p.estrelas != null && <Estrelas n={p.estrelas} className="text-xs" />}
              <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${CORES[p.status]}`}>
                {p.status}
              </span>
            </div>
          ))}
          {data.presencas.length === 0 && <p className="text-sm text-black/45">Ninguém confirmou ainda.</p>}
        </div>
      </section>

      {admin && <PainelSorteio peladaId={peladaId} confirmados={confirmados.length} />}
    </div>
  );
}

interface TimeResultado {
  numero: number;
  totalEstrelas: number;
  jogadores: { profileId: string; nome: string | null; estrelas: number }[];
}

function PainelSorteio({ peladaId, confirmados }: { peladaId: string; confirmados: number }) {
  const qc = useQueryClient();
  const [nTimes, setNTimes] = useState(2);
  const [erro, setErro] = useState<string | null>(null);

  const atual = useQuery({
    queryKey: ['sorteio', peladaId],
    queryFn: () => api<{ times: TimeResultado[] }>(`/peladas/${peladaId}/sorteio`),
  });

  const sortear = useMutation({
    mutationFn: () =>
      api<{ times: TimeResultado[]; amplitudeEstrelas: number }>(`/peladas/${peladaId}/sorteio`, {
        method: 'POST',
        json: { nTimes },
      }),
    onSuccess: () => {
      setErro(null);
      qc.invalidateQueries({ queryKey: ['sorteio', peladaId] });
    },
    onError: (e) => setErro(e instanceof ApiError ? e.message : 'Erro no sorteio.'),
  });

  const times = sortear.data?.times ?? atual.data?.times ?? [];

  return (
    <Card>
      <h2 className="font-semibold">Sorteio de times</h2>
      <p className="text-sm text-black/55">{confirmados} confirmado(s) para dividir.</p>
      {erro && <div className="mt-2"><Aviso tipo="erro">{erro}</Aviso></div>}

      <div className="mt-3 flex items-center gap-2">
        <label className="text-sm">Times:</label>
        <input
          type="number"
          min={2}
          max={32}
          value={nTimes}
          onChange={(e) => setNTimes(Math.max(2, Math.min(32, Number(e.target.value))))}
          className="w-16 rounded-lg border border-black/10 px-2 py-1 text-sm"
        />
        <Button onClick={() => sortear.mutate()} disabled={sortear.isPending}>
          {sortear.isPending ? <Spinner /> : times.length ? 'Re-sortear' : 'Sortear'}
        </Button>
      </div>

      {sortear.data && (
        <p className="mt-2 text-xs text-black/50">
          Diferença de estrelas entre o time mais forte e o mais fraco: {sortear.data.amplitudeEstrelas}
        </p>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {times.map((t) => (
          <div key={t.numero} className="rounded-xl border border-black/5 p-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-semibold">Time {t.numero}</span>
              <Estrelas n={t.totalEstrelas / Math.max(1, t.jogadores.length)} className="text-xs" />
            </div>
            <ul className="text-sm text-black/70">
              {t.jogadores.map((j) => (
                <li key={j.profileId} className="flex justify-between">
                  <span className="truncate">{j.nome ?? 'Jogador'}</span>
                  <span className="text-amber-500">{'★'.repeat(j.estrelas)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}
