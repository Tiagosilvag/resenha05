import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { useOrg } from '../lib/org';
import { Aviso, Card, Eyebrow, MiniCartinha, Select, Spinner } from '../components/ui';

interface LinhaRanking {
  profileId: string;
  nome: string | null;
  fotoUrl: string | null;
  gols: number;
  assistencias: number;
}
interface ArtilhariaResp {
  artilheiro: LinhaRanking | null;
  ranking: LinhaRanking[];
}

interface GolEditavel {
  id: string;
  jogoId: string;
  partida: string;
  timeNome: string;
  profileId: string;
  nome: string | null;
  jogadores: { profileId: string; nome: string | null }[];
}

/** Admin corrige quem fez cada gol da pelada escolhida (inclusive de partidas já concluídas). */
function EditarGols({ peladaId }: { peladaId: string }) {
  const qc = useQueryClient();
  const gols = useQuery({
    queryKey: ['gols-editaveis', peladaId],
    queryFn: () => api<{ gols: GolEditavel[] }>(`/peladas/${peladaId}/gols`),
  });
  const trocar = useMutation({
    mutationFn: (v: { jogoId: string; id: string; profileId: string }) =>
      api(`/partidas/${v.jogoId}/gols/${v.id}`, { method: 'PATCH', json: { profileId: v.profileId } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['gols-editaveis', peladaId] });
      void qc.invalidateQueries({ queryKey: ['artilharia'] });
    },
  });

  if (gols.isLoading) return <Spinner className="h-5 w-5 text-campo-600" />;
  if (!gols.data || gols.data.gols.length === 0) return null;

  return (
    <section>
      <Eyebrow>Corrigir gols</Eyebrow>
      {trocar.error && (
        <Aviso tipo="erro">{trocar.error instanceof ApiError ? trocar.error.message : 'Não foi possível salvar.'}</Aviso>
      )}
      <ul className="mt-2 flex flex-col gap-2">
        {gols.data.gols.map((g) => (
          <li key={g.id} className="rounded-2xl border border-tinta-line/70 bg-gramado-raised p-3">
            <p className="text-xs text-tinta-faint">{g.partida} · gol do {g.timeNome}</p>
            <Select
              aria-label="Autor do gol"
              className="mt-1.5"
              value={g.profileId}
              disabled={trocar.isPending}
              onChange={(e) => trocar.mutate({ jogoId: g.jogoId, id: g.id, profileId: e.target.value })}
            >
              {g.jogadores.map((j) => (
                <option key={j.profileId} value={j.profileId}>
                  {j.nome ?? 'Jogador'}
                </option>
              ))}
            </Select>
          </li>
        ))}
      </ul>
    </section>
  );
}

const MEDALHA = ['bg-ouro-500 text-white', 'bg-tinta-line text-tinta-soft', 'bg-barro-500/70 text-white'];

export function Artilharia() {
  const { orgId, admin } = useOrg();
  const [periodo, setPeriodo] = useState('mes');
  // Vazio = todas; com uma pelada escolhida, o período não se aplica.
  const [peladaId, setPeladaId] = useState('');

  const peladas = useQuery({
    queryKey: ['artilharia-peladas', orgId],
    queryFn: () => api<{ peladaId: string; data: string; gols: number }[]>(`/organizacoes/${orgId}/artilharia/peladas`),
    enabled: Boolean(orgId),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['artilharia', orgId, periodo, peladaId],
    queryFn: () =>
      api<ArtilhariaResp>(
        `/organizacoes/${orgId}/artilharia?periodo=${periodo}${peladaId ? `&peladaId=${peladaId}` : ''}`,
      ),
    enabled: Boolean(orgId),
  });

  if (!orgId) return <Card><p className="text-sm text-tinta-soft">Sem organização.</p></Card>;

  const top3 = data?.ranking.slice(0, 3) ?? [];
  const resto = data?.ranking.slice(3) ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold tracking-tight">Artilharia</h1>
        <Select
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value)}
          disabled={Boolean(peladaId)}
          className="max-w-[10rem]"
        >
          <option value="mes">Este mês</option>
          <option value="ano">Este ano</option>
          <option value="sempre">Sempre</option>
        </Select>
      </div>

      {(peladas.data?.length ?? 0) > 0 && (
        <Select
          aria-label="Filtrar por pelada"
          value={peladaId}
          onChange={(e) => setPeladaId(e.target.value)}
        >
          <option value="">Todas as peladas</option>
          {peladas.data!.map((p) => (
            <option key={p.peladaId} value={p.peladaId}>
              Pelada de {new Date(p.data.slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR')} — {p.gols} gol(s)
            </option>
          ))}
        </Select>
      )}

      {admin && peladaId && <EditarGols peladaId={peladaId} />}

      {isLoading ? (
        <Spinner className="h-6 w-6 text-campo-600" />
      ) : !data || data.ranking.length === 0 ? (
        <Card><p className="text-sm text-tinta-faint">Nenhum gol ou assistência no período.</p></Card>
      ) : (
        <>
          {/* pódio */}
          <div className="overflow-hidden rounded-2xl bg-noite bg-brasao p-4 text-white shadow-pop">
            <p className="font-display text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-white/70">
              Pódio de goleadores
            </p>
            <ul className="mt-3 flex flex-col gap-2.5">
              {top3.map((l, i) => (
                <li key={l.profileId} className="flex items-center gap-3">
                  <span className={`grid h-7 w-7 place-items-center rounded-full font-display text-sm font-bold ${MEDALHA[i]}`}>
                    {i + 1}
                  </span>
                  <MiniCartinha src={l.fotoUrl} nome={l.nome} largura={36} />
                  <span className="flex-1 truncate font-medium">{l.nome ?? 'Jogador'}</span>
                  <span className="placar-num text-xl text-ouro-300">{l.gols}</span>
                  <span className="text-xs text-white/50">gols</span>
                </li>
              ))}
            </ul>
          </div>

          {resto.length > 0 && (
            <section>
              <Eyebrow>Ranking completo</Eyebrow>
              <div className="overflow-hidden rounded-2xl border border-tinta-line/70 bg-gramado-raised">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gramado-sunk font-display text-[0.66rem] font-semibold uppercase tracking-[0.06em] text-tinta-faint">
                      <th className="py-2 pl-3 text-left">Jogador</th>
                      <th className="px-2 py-2 text-center">Gols</th>
                      <th className="px-2 py-2 text-center">Assist.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-tinta-line/50">
                    {resto.map((l, i) => (
                      <tr key={l.profileId}>
                        <td className="py-2.5 pl-3 font-medium">{i + 4}. {l.nome ?? 'Jogador'}</td>
                        <td className="placar-num px-2 py-2.5 text-center text-campo-700">{l.gols}</td>
                        <td className="px-2 py-2.5 text-center text-tinta-soft">{l.assistencias}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
