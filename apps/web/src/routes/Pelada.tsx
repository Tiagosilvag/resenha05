import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../lib/auth';
import { api, ApiError } from '../lib/api';
import { Avatar, Aviso, Button, Card, Chip, Estrelas, Eyebrow, Spinner, StatTile } from '../components/ui';

interface Presenca {
  profileId: string;
  nome: string | null;
  fotoUrl: string | null;
  status: 'confirmado' | 'pago' | 'desistiu';
  estrelas: number | null;
}
interface PeladaResp {
  pelada: {
    id: string;
    organizacao_id: string;
    status: string;
    data: string;
    hora: string | null;
    local: string | null;
  };
  presencas: Presenca[];
  minhaPresenca: Presenca | null;
}

export function Pelada() {
  const { peladaId = '' } = useParams();
  const { usuario } = useAuth();
  const qc = useQueryClient();
  const [erro, setErro] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['pelada', peladaId],
    queryFn: () => api<PeladaResp>(`/peladas/${peladaId}`),
    refetchInterval: 8000,
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
  const pagos = data.presencas.filter((p) => p.status === 'pago').length;
  const dataFmt = new Date(data.pelada.data + 'T00:00:00').toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });
  const dentro = data.minhaPresenca && data.minhaPresenca.status !== 'desistiu';

  return (
    <div className="flex flex-col gap-5">
      {/* cabeçalho */}
      <div className="overflow-hidden rounded-2xl bg-campo-700 bg-gramada p-5 text-white shadow-pop">
        <p className="font-display text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-white/70">
          Próxima pelada
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold capitalize tracking-tight text-white">{dataFmt}</h1>
        <p className="mt-0.5 text-sm text-white/80">
          {data.pelada.hora ? data.pelada.hora.slice(0, 5) : 'horário a definir'}
          {data.pelada.local ? ` · ${data.pelada.local}` : ''}
        </p>
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

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

      <section>
        <Eyebrow>Lista de presença</Eyebrow>
        <div className="divide-y divide-tinta-line/60 overflow-hidden rounded-2xl border border-tinta-line/70 bg-gramado-raised">
          {data.presencas.map((p) => (
            <div
              key={p.profileId}
              className={`flex items-center gap-3 px-3.5 py-2.5 ${p.status === 'desistiu' ? 'opacity-55' : ''}`}
            >
              <Avatar src={p.fotoUrl} nome={p.nome} size={34} />
              <span className={`flex-1 truncate text-sm font-medium ${p.status === 'desistiu' ? 'line-through' : ''}`}>
                {p.nome ?? 'Jogador'}
              </span>
              {p.estrelas != null && <Estrelas n={p.estrelas} />}
              <Chip tom={p.status}>{p.status}</Chip>
            </div>
          ))}
          {data.presencas.length === 0 && (
            <p className="px-3.5 py-6 text-center text-sm text-tinta-faint">Ninguém confirmou ainda.</p>
          )}
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
    <Card as="section">
      <Eyebrow>Sorteio de times</Eyebrow>
      <p className="-mt-1 text-sm text-tinta-soft">{confirmados} confirmado(s) para dividir.</p>
      {erro && <div className="mt-2"><Aviso tipo="erro">{erro}</Aviso></div>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="font-display text-sm font-semibold uppercase tracking-[0.03em] text-tinta-soft">Times</span>
        <input
          type="number"
          min={2}
          max={32}
          value={nTimes}
          onChange={(e) => setNTimes(Math.max(2, Math.min(32, Number(e.target.value))))}
          className="w-16 rounded-lg border border-tinta-line bg-white px-2 py-1.5 text-center placar-num text-base"
        />
        <Button onClick={() => sortear.mutate()} disabled={sortear.isPending}>
          {sortear.isPending ? <Spinner /> : times.length ? 'Re-sortear' : 'Sortear'}
        </Button>
      </div>

      {sortear.data && (
        <p className="mt-2 text-xs text-tinta-faint">
          Diferença entre o time mais forte e o mais fraco: {sortear.data.amplitudeEstrelas} estrela(s).
        </p>
      )}

      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
        {times.map((t) => (
          <div key={t.numero} className="overflow-hidden rounded-xl border border-tinta-line/70">
            <div className="flex items-center justify-between bg-gramado-dark px-3 py-2 text-white">
              <span className="font-display text-sm font-bold uppercase tracking-[0.05em]">Time {t.numero}</span>
              <Estrelas n={t.totalEstrelas / Math.max(1, t.jogadores.length)} />
            </div>
            <ul className="divide-y divide-tinta-line/50 bg-gramado-raised text-sm">
              {t.jogadores.map((j) => (
                <li key={j.profileId} className="flex items-center justify-between px-3 py-1.5">
                  <span className="truncate text-tinta">{j.nome ?? 'Jogador'}</span>
                  <Estrelas n={j.estrelas} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}
