import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useOrg } from '../lib/org';
import { Avatar, Card, Eyebrow, Select, Spinner } from '../components/ui';

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

const MEDALHA = ['bg-ouro-500 text-white', 'bg-tinta-line text-tinta-soft', 'bg-barro-500/70 text-white'];

export function Artilharia() {
  const { orgId } = useOrg();
  const [periodo, setPeriodo] = useState('mes');

  const { data, isLoading } = useQuery({
    queryKey: ['artilharia', orgId, periodo],
    queryFn: () => api<ArtilhariaResp>(`/organizacoes/${orgId}/artilharia?periodo=${periodo}`),
    enabled: Boolean(orgId),
  });

  if (!orgId) return <Card><p className="text-sm text-tinta-soft">Sem organização.</p></Card>;

  const top3 = data?.ranking.slice(0, 3) ?? [];
  const resto = data?.ranking.slice(3) ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold tracking-tight">Artilharia</h1>
        <Select value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="max-w-[10rem]">
          <option value="mes">Este mês</option>
          <option value="ano">Este ano</option>
          <option value="sempre">Sempre</option>
        </Select>
      </div>

      {isLoading ? (
        <Spinner className="h-6 w-6 text-campo-600" />
      ) : !data || data.ranking.length === 0 ? (
        <Card><p className="text-sm text-tinta-faint">Nenhum gol ou assistência no período.</p></Card>
      ) : (
        <>
          {/* pódio */}
          <div className="overflow-hidden rounded-2xl bg-campo-700 bg-gramada p-4 text-white shadow-pop">
            <p className="font-display text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-white/70">
              Pódio de goleadores
            </p>
            <ul className="mt-3 flex flex-col gap-2.5">
              {top3.map((l, i) => (
                <li key={l.profileId} className="flex items-center gap-3">
                  <span className={`grid h-7 w-7 place-items-center rounded-full font-display text-sm font-bold ${MEDALHA[i]}`}>
                    {i + 1}
                  </span>
                  <Avatar src={l.fotoUrl} nome={l.nome} size={36} />
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
