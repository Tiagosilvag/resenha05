import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TIPOS_EVENTO } from '@resenha05/shared';
import { api, ApiError } from '../lib/api';
import { Aviso, Button, Card, Input, Select, Spinner } from '../components/ui';

interface Evento {
  id: string;
  tipo: string;
  minuto: number | null;
  profileId: string;
  nome: string | null;
}
interface JogoResp {
  jogo: {
    id: string;
    torneio_id: string | null;
    organizacaoId: string;
    time_a_nome: string | null;
    time_b_nome: string | null;
    placar_a: number | null;
    placar_b: number | null;
    status: string;
  };
  eventos: Evento[];
  souAdmin: boolean;
}
interface Membro { profileId: string; nome: string | null }

const ROTULO_EVENTO: Record<string, string> = {
  gol: '⚽ Gol',
  gol_contra: '🔴 Gol contra',
  assistencia: '🅰️ Assistência',
  cartao_amarelo: '🟨 Amarelo',
  cartao_vermelho: '🟥 Vermelho',
};

export function Jogo() {
  const { jogoId = '' } = useParams();
  const qc = useQueryClient();
  const [erro, setErro] = useState<string | null>(null);
  const [placarA, setPlacarA] = useState('');
  const [placarB, setPlacarB] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['jogo', jogoId],
    queryFn: () => api<JogoResp>(`/jogos/${jogoId}`),
  });

  const orgId = data?.jogo.organizacaoId;
  const admin = data?.souAdmin ?? false;
  const { data: membros } = useQuery({
    queryKey: ['membros-jogo', orgId],
    queryFn: () => api<Membro[]>(`/organizacoes/${orgId}/membros`),
    enabled: Boolean(orgId && admin),
  });

  const salvarPlacar = useMutation({
    mutationFn: () =>
      api(`/jogos/${jogoId}/placar`, {
        method: 'POST',
        json: { placarA: Number(placarA || 0), placarB: Number(placarB || 0), status: 'encerrado' },
      }),
    onSuccess: () => { setErro(null); qc.invalidateQueries({ queryKey: ['jogo', jogoId] }); },
    onError: (e) => setErro(e instanceof ApiError ? e.message : 'Erro ao salvar o placar.'),
  });

  const addEvento = useMutation({
    mutationFn: (v: { profileId: string; tipo: string; minuto?: number }) =>
      api(`/jogos/${jogoId}/eventos`, { method: 'POST', json: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jogo', jogoId] }),
    onError: (e) => setErro(e instanceof ApiError ? e.message : 'Erro ao registrar o evento.'),
  });

  const removerEvento = useMutation({
    mutationFn: (id: string) => api(`/jogos/${jogoId}/eventos/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jogo', jogoId] }),
  });

  if (isLoading || !data) return <Spinner className="h-6 w-6 text-campo-600" />;
  const j = data.jogo;
  const nomeA = j.time_a_nome ?? 'Time A';
  const nomeB = j.time_b_nome ?? 'Time B';

  return (
    <div className="flex flex-col gap-4">
      {j.torneio_id && <Link to={`/torneios/${j.torneio_id}`} className="text-sm text-black/45">← Torneio</Link>}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <Card>
        <div className="flex items-center justify-center gap-4 text-lg font-bold">
          <span>{nomeA}</span>
          <span className="text-2xl text-campo-700">{j.placar_a ?? '–'} : {j.placar_b ?? '–'}</span>
          <span>{nomeB}</span>
        </div>
        {admin && (
          <div className="mt-3 flex items-end justify-center gap-2">
            <Input className="w-16 text-center" inputMode="numeric" placeholder={String(j.placar_a ?? 0)} value={placarA} onChange={(e) => setPlacarA(e.target.value)} />
            <span className="pb-2">x</span>
            <Input className="w-16 text-center" inputMode="numeric" placeholder={String(j.placar_b ?? 0)} value={placarB} onChange={(e) => setPlacarB(e.target.value)} />
            <Button onClick={() => salvarPlacar.mutate()} disabled={salvarPlacar.isPending}>
              {salvarPlacar.isPending ? <Spinner /> : 'Salvar'}
            </Button>
          </div>
        )}
      </Card>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-black/45">Súmula</h2>
        {admin && membros && <NovoEvento membros={membros} onAdd={(v) => addEvento.mutate(v)} pendente={addEvento.isPending} />}
        <div className="mt-2 flex flex-col gap-1.5">
          {data.eventos.map((ev) => (
            <div key={ev.id} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm">
              {ev.minuto != null && <span className="w-8 text-black/40">{ev.minuto}'</span>}
              <span className="flex-1">{ROTULO_EVENTO[ev.tipo] ?? ev.tipo} — {ev.nome ?? 'Jogador'}</span>
              {admin && (
                <button className="text-xs text-red-500" onClick={() => removerEvento.mutate(ev.id)}>
                  remover
                </button>
              )}
            </div>
          ))}
          {data.eventos.length === 0 && <p className="text-sm text-black/45">Nenhum lance registrado.</p>}
        </div>
      </section>
    </div>
  );
}

function NovoEvento({
  membros,
  onAdd,
  pendente,
}: {
  membros: Membro[];
  onAdd: (v: { profileId: string; tipo: string; minuto?: number }) => void;
  pendente: boolean;
}) {
  const [profileId, setProfileId] = useState('');
  const [tipo, setTipo] = useState<string>('gol');
  const [minuto, setMinuto] = useState('');
  return (
    <Card>
      <div className="flex flex-col gap-3">
        <Select value={profileId} onChange={(e) => setProfileId(e.target.value)}>
          <option value="">Jogador…</option>
          {membros.map((m) => <option key={m.profileId} value={m.profileId}>{m.nome ?? 'Sem nome'}</option>)}
        </Select>
        <div className="grid grid-cols-2 gap-3">
          <Select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {TIPOS_EVENTO.map((t) => <option key={t} value={t}>{ROTULO_EVENTO[t]}</option>)}
          </Select>
          <Input inputMode="numeric" placeholder="minuto" value={minuto} onChange={(e) => setMinuto(e.target.value)} />
        </div>
        <Button
          disabled={pendente || !profileId}
          onClick={() => onAdd({ profileId, tipo, minuto: minuto ? Number(minuto) : undefined })}
        >
          {pendente ? <Spinner /> : 'Registrar lance'}
        </Button>
      </div>
    </Card>
  );
}
