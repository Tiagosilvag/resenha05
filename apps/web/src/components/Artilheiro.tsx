import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PERIODOS_ARTILHARIA, ROTULO_PERIODO, type PeriodoArtilharia } from '@resenha05/shared';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useOrg } from '../lib/org';
import { Cartinha } from './Cartinha';
import { Button, Card, Eyebrow, MiniCartinha, Spinner } from './ui';

export interface LinhaArtilharia {
  profileId: string;
  nome: string | null;
  fotoUrl: string | null;
  fotoRecortada: boolean;
  gols: number;
  assistencias: number;
}

export interface ArtilhariaResp {
  periodo: { tipo: string; de: string; ate: string };
  periodoDaOrganizacao: PeriodoArtilharia;
  artilheiro: LinhaArtilharia | null;
  ranking: LinhaArtilharia[];
}

/** "Artilheiro do mês", "da semana"… conforme o período configurado. */
function comoDizer(periodo: string): string {
  if (periodo === 'semana') return 'da semana';
  if (periodo === 'trimestre') return 'do trimestre';
  return 'do mês';
}

export function useArtilharia(orgId: string | undefined) {
  return useQuery({
    queryKey: ['artilharia-org', orgId],
    queryFn: () => api<ArtilhariaResp>(`/organizacoes/${orgId}/artilharia`),
    enabled: Boolean(orgId),
  });
}

/** Painel da artilharia dentro da organização: campeão em destaque + ranking. */
export function PainelArtilheiro({ orgId, souDono }: { orgId: string; souDono: boolean }) {
  const { data, isLoading, refetch } = useArtilharia(orgId);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function trocarPeriodo(periodo: PeriodoArtilharia) {
    setSalvando(true);
    setErro(null);
    try {
      await api(`/organizacoes/${orgId}/artilharia/periodo`, { method: 'POST', json: { periodo } });
      await refetch();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível mudar o período.');
    } finally {
      setSalvando(false);
    }
  }

  if (isLoading) return <Spinner className="h-6 w-6 text-campo-600" />;

  const quando = comoDizer(data?.periodo.tipo ?? 'mes');
  const artilheiro = data?.artilheiro ?? null;

  return (
    <Card as="section">
      <Eyebrow>Artilharia {quando}</Eyebrow>

      {souDono && (
        <div className="mb-3 flex gap-2">
          {PERIODOS_ARTILHARIA.map((p) => (
            <button
              key={p}
              type="button"
              disabled={salvando}
              onClick={() => void trocarPeriodo(p)}
              className={`flex-1 rounded-xl border px-2 py-2 font-display text-xs font-semibold uppercase tracking-[0.04em] transition-colors disabled:opacity-50 ${
                data?.periodoDaOrganizacao === p
                  ? 'border-campo-400 bg-campo-50 text-campo-800'
                  : 'border-tinta-line text-tinta-soft'
              }`}
            >
              {ROTULO_PERIODO[p]}
            </button>
          ))}
        </div>
      )}
      {erro && <p className="mb-2 text-sm text-barro-600">{erro}</p>}

      {!artilheiro ? (
        <p className="text-sm text-tinta-faint">Nenhum gol no período ainda. Bola pra frente.</p>
      ) : (
        <>
          <div className="flex flex-col items-center gap-2 rounded-2xl bg-noite bg-brasao px-4 py-4 text-white">
            <p className="font-display text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ouro-300">
              Artilheiro {quando}
            </p>
            <Cartinha
              profileId={artilheiro.profileId}
              orgId={orgId}
              nome={artilheiro.nome}
              chave={`artilheiro-${data?.periodo.de}`}
            />
            <p className="font-display text-xl font-bold uppercase tracking-[0.02em]">
              {artilheiro.nome ?? 'Jogador'}
            </p>
            <p className="text-sm text-white/80">
              {artilheiro.gols} gol{artilheiro.gols === 1 ? '' : 's'}
              {artilheiro.assistencias > 0
                ? ` · ${artilheiro.assistencias} assistência${artilheiro.assistencias === 1 ? '' : 's'}`
                : ''}
            </p>
          </div>

          {data && data.ranking.length > 1 && (
            <ul className="mt-3 divide-y divide-tinta-line/50">
              {data.ranking.slice(1, 5).map((l, i) => (
                <li key={l.profileId} className="flex items-center gap-3 py-2">
                  <span className="placar-num w-5 shrink-0 text-center text-xs text-tinta-faint">
                    {i + 2}
                  </span>
                  <MiniCartinha
                    src={l.fotoUrl}
                    nome={l.nome}
                    recortada={l.fotoRecortada}
                    largura={30}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {l.nome ?? 'Jogador'}
                  </span>
                  <span className="placar-num text-base text-campo-700">{l.gols}</span>
                  <span className="text-xs text-tinta-faint">gols</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}

/**
 * Parabeniza o artilheiro uma vez por período, na primeira vez que a pessoa
 * abre o app. O "já vi" fica no aparelho — não vale a pena uma tabela só para
 * isso, e reaparecer depois de trocar de celular não atrapalha ninguém.
 */
export function PopupArtilheiro() {
  const { orgId } = useOrg();
  const { usuario } = useAuth();
  const { data } = useArtilharia(orgId);
  const [aberto, setAberto] = useState(false);

  const artilheiro = data?.artilheiro ?? null;
  const chave = artilheiro ? `r5.artilheiro.${orgId}.${data?.periodo.de}` : null;

  useEffect(() => {
    if (!chave) return;
    try {
      if (localStorage.getItem(chave) !== 'visto') setAberto(true);
    } catch {
      /* navegador sem storage: melhor não mostrar do que mostrar sempre */
    }
  }, [chave]);

  function fechar() {
    setAberto(false);
    try {
      if (chave) localStorage.setItem(chave, 'visto');
    } catch {
      /* ok */
    }
  }

  if (!aberto || !artilheiro || !orgId) return null;

  const souEu = usuario?.id === artilheiro.profileId;
  const quando = comoDizer(data?.periodo.tipo ?? 'mes');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-6"
      role="dialog"
      aria-label={`Artilheiro ${quando}`}
      onClick={fechar}
    >
      <div
        className="flex max-h-full w-full max-w-xs flex-col items-center gap-3 overflow-y-auto rounded-2xl bg-noite bg-brasao p-5 text-center text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-display text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-ouro-300">
          Artilheiro {quando}
        </p>
        <h2 className="font-display text-2xl font-bold uppercase tracking-tight text-white">
          {souEu ? 'É você! 🎉' : `${artilheiro.nome ?? 'Jogador'} 🎉`}
        </h2>
        <Cartinha profileId={artilheiro.profileId} orgId={orgId} nome={artilheiro.nome} />
        <p className="text-sm text-white/85">
          {artilheiro.gols} gol{artilheiro.gols === 1 ? '' : 's'} {quando}
          {souEu ? ' — segue metendo!' : ' — parabéns!'}
        </p>
        <Button variante="secundario" className="w-full" onClick={fechar}>
          Fechar
        </Button>
      </div>
    </div>
  );
}
