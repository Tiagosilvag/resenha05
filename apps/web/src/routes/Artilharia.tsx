import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useOrg } from '../lib/org';
import { Avatar, Card, Select, Spinner } from '../components/ui';

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

export function Artilharia() {
  const { orgId } = useOrg();
  const [periodo, setPeriodo] = useState('mes');

  const { data, isLoading } = useQuery({
    queryKey: ['artilharia', orgId, periodo],
    queryFn: () => api<ArtilhariaResp>(`/organizacoes/${orgId}/artilharia?periodo=${periodo}`),
    enabled: Boolean(orgId),
  });

  if (!orgId) return <Card><p className="text-sm text-black/55">Sem organização.</p></Card>;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-extrabold tracking-tight">Artilharia</h1>

      <Select value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="max-w-[12rem]">
        <option value="mes">Este mês</option>
        <option value="ano">Este ano</option>
        <option value="sempre">Desde sempre</option>
      </Select>

      {isLoading ? (
        <Spinner className="h-6 w-6 text-campo-600" />
      ) : !data || data.ranking.length === 0 ? (
        <Card><p className="text-sm text-black/45">Nenhum gol ou assistência no período.</p></Card>
      ) : (
        <>
          {data.artilheiro && (
            <Card className="bg-campo-50">
              <div className="flex items-center gap-3">
                <Avatar src={data.artilheiro.fotoUrl} nome={data.artilheiro.nome} size={48} />
                <div>
                  <p className="text-xs font-semibold uppercase text-campo-700">Artilheiro do período</p>
                  <p className="font-bold">{data.artilheiro.nome ?? 'Jogador'}</p>
                  <p className="text-sm text-black/55">{data.artilheiro.gols} gols · {data.artilheiro.assistencias} assist.</p>
                </div>
              </div>
            </Card>
          )}
          <Card className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/5 text-left text-xs uppercase text-black/40">
                  <th className="px-3 py-2">Jogador</th>
                  <th className="px-2 py-2 text-center">Gols</th>
                  <th className="px-2 py-2 text-center">Assist.</th>
                </tr>
              </thead>
              <tbody>
                {data.ranking.map((l, i) => (
                  <tr key={l.profileId} className="border-b border-black/5 last:border-0">
                    <td className="px-3 py-2 font-medium">{i + 1}. {l.nome ?? 'Jogador'}</td>
                    <td className="px-2 py-2 text-center font-bold text-campo-700">{l.gols}</td>
                    <td className="px-2 py-2 text-center">{l.assistencias}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
