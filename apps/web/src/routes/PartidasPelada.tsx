import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { rankearSubstitutos } from '@resenha05/shared';
import { api, ApiError } from '../lib/api';
import { Aviso, Button, Card, Chip, Eyebrow, Input, MiniCartinha, Select, Spinner } from '../components/ui';

type StatusPartida = 'agendado' | 'em_andamento' | 'pausado' | 'encerrado';

interface JogadorTime {
  profileId: string;
  nome: string | null;
  estrelas: number;
}
interface TimeAtual {
  id: string;
  numero: number;
  nome: string;
  jogadores: JogadorTime[];
  totalEstrelas: number;
}
interface Gol {
  id: string;
  timeId: string;
  profileId: string;
  nome: string | null;
  criadoEm: string;
}
interface Partida {
  id: string;
  status: StatusPartida;
  timeA: { id: string; nome: string };
  timeB: { id: string; nome: string };
  placarA: number;
  placarB: number;
  duracaoMin: number | null;
  golsLimite: number | null;
  decorridoSeg: number;
  restanteSeg: number | null;
  rodando: boolean;
  iniciadoEm: string | null;
  encerradoEm: string | null;
  encerramento: 'tempo' | 'gols' | 'manual' | null;
  observacao: string | null;
  vencedorTimeId: string | null;
  perdedorTimeId: string | null;
  concluida: boolean;
  redistribuicao: {
    sobraTimeId: string;
    movidos: { profileId: string; nome: string | null; estrelas: number }[];
    totalNovoTime: number;
    totalReferencia: number;
    diferenca: number;
  } | null;
  jogadores: { timeId: string; profileId: string; nome: string | null; estrelas: number; ativo: boolean }[];
  substituicoes: {
    id: string;
    timeId: string;
    saiu: string | null;
    entrou: string | null;
    destino: string | null;
    criadoEm: string;
  }[];
  gols: Gol[];
}
interface Resp {
  souAdmin: boolean;
  /** Times esperando, do próximo a jogar ao último (só com partida aberta). */
  fila: string[];
  pelada: { data: string; local: string | null };
  regras: { duracaoMin: number | null; golsLimite: number | null };
  sorteio: { confirmado: boolean } | null;
  times: TimeAtual[];
  porTime: number;
  partidas: Partida[];
  sugestao: { timeAId: string; timeBId: string } | null;
  ajusteRedistribuicao: { incompletoTimeId: string; outroTimeId: string } | null;
  artilharia: { profileId: string; nome: string | null; fotoUrl: string | null; fotoRecortada: boolean; gols: number }[];
}

const ESTADO: Record<StatusPartida, { rotulo: string; tom: 'confirmado' | 'pendente' | 'desistiu' | 'neutro' }> = {
  agendado: { rotulo: 'Aguardando', tom: 'neutro' },
  em_andamento: { rotulo: 'Em andamento', tom: 'confirmado' },
  pausado: { rotulo: 'Pausada', tom: 'pendente' },
  encerrado: { rotulo: 'Encerrada', tom: 'desistiu' },
};

const MOTIVO = {
  tempo: 'O tempo acabou.',
  gols: 'Um time chegou ao limite de gols.',
  manual: 'Encerrada pelo organizador.',
} as const;

function mmss(seg: number): string {
  const s = Math.max(0, Math.floor(seg));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** Segundos corridos agora: o que o servidor mandou + o tempo desde que a resposta chegou. */
function useDecorrido(p: Partida | undefined, recebidoEm: number): number {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!p?.rodando) return;
    const i = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(i);
  }, [p?.rodando, p?.id]);
  if (!p) return 0;
  return p.decorridoSeg + (p.rodando ? Math.max(0, (Date.now() - recebidoEm) / 1000) : 0);
}

export function PartidasPelada() {
  const { peladaId = '' } = useParams();
  const qc = useQueryClient();
  const [erro, setErro] = useState<string | null>(null);

  const { data, isLoading, dataUpdatedAt, refetch } = useQuery({
    queryKey: ['partidas', peladaId],
    queryFn: () => api<Resp>(`/peladas/${peladaId}/partidas`),
    refetchInterval: (q) => (q.state.data?.partidas.some((p) => !p.concluida) ? 3000 : 15000),
  });

  const aberta = data?.partidas.find((p) => !p.concluida);
  const decorrido = useDecorrido(aberta, dataUpdatedAt);

  // Quando o cronômetro local zera, pede o estado ao servidor: é ele quem encerra.
  const zerou =
    aberta?.rodando && aberta.duracaoMin != null && decorrido >= aberta.duracaoMin * 60;
  useEffect(() => {
    if (zerou) void refetch();
  }, [zerou, refetch]);

  function depois() {
    setErro(null);
    qc.invalidateQueries({ queryKey: ['partidas', peladaId] });
    qc.invalidateQueries({ queryKey: ['sorteio', peladaId] });
    qc.invalidateQueries({ queryKey: ['artilharia'] });
  }
  const falhou = (e: unknown) => setErro(e instanceof ApiError ? e.message : 'Não foi possível concluir.');

  const acao = useMutation({
    mutationFn: (v: { caminho: string; metodo?: 'POST' | 'DELETE' | 'PUT'; json?: unknown }) =>
      api(v.caminho, { method: v.metodo ?? 'POST', ...(v.json !== undefined ? { json: v.json } : {}) }),
    onSuccess: depois,
    onError: falhou,
  });
  const concluir = useMutation({
    mutationFn: (perdedorTimeId: string | null) =>
      api(`/partidas/${aberta!.id}/concluir`, { method: 'POST', json: { perdedorTimeId } }),
    onSuccess: depois,
    onError: falhou,
  });

  if (isLoading || !data) return <Spinner className="h-6 w-6 text-campo-600" />;

  const { souAdmin, times, regras } = data;
  const historico = data.partidas.filter((p) => p.concluida).reverse();
  const dataFmt = new Date(data.pelada.data.slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link to={`/peladas/${peladaId}`} className="text-sm font-medium text-campo-700">
          ← Voltar à pelada
        </Link>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight first-letter:uppercase">Partidas</h1>
        <p className="text-sm text-tinta-soft first-letter:uppercase">
          {dataFmt}
          {data.pelada.local ? ` · ${data.pelada.local}` : ''}
        </p>
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {!data.sorteio || (!data.sorteio.confirmado && !souAdmin) ? (
        <Aviso>Os times ainda não foram sorteados e confirmados.</Aviso>
      ) : (
        <>
          {!data.sorteio.confirmado && (
            <Aviso>Confirme o sorteio na tela da pelada para começar as partidas.</Aviso>
          )}

          {aberta ? (
            <PartidaAtual
              partida={aberta}
              times={times}
              fila={data.fila}
              decorrido={decorrido}
              souAdmin={souAdmin}
              ocupado={acao.isPending || concluir.isPending}
              onAcao={(caminho, metodo, json) => acao.mutate({ caminho, metodo, json })}
              onConcluir={(perdedor) => concluir.mutate(perdedor)}
            />
          ) : (
            souAdmin &&
            data.sorteio.confirmado && (
              <NovaPartida
                times={times}
                sugestao={data.sugestao}
                ocupado={acao.isPending}
                onCriar={(timeAId, timeBId) =>
                  acao.mutate({ caminho: `/peladas/${peladaId}/partidas`, json: { timeAId, timeBId } })
                }
              />
            )
          )}

          <RegrasDaPelada
            regras={regras}
            souAdmin={souAdmin}
            travado={Boolean(aberta)}
            salvando={acao.isPending}
            onSalvar={(duracaoMin, golsLimite) =>
              acao.mutate({
                caminho: `/peladas/${peladaId}/partidas/regras`,
                metodo: 'PUT',
                json: { duracaoMin, golsLimite },
              })
            }
          />

          {!aberta && !souAdmin && data.partidas.length === 0 && (
            <Aviso>Nenhuma partida começou ainda.</Aviso>
          )}

          <TimesDeAgora times={times} porTime={data.porTime} />

          {souAdmin && data.ajusteRedistribuicao && (
            <AjustarRedistribuicao
              times={times}
              porTime={data.porTime}
              ajuste={data.ajusteRedistribuicao}
              ocupado={acao.isPending}
              onMover={(profileId) =>
                acao.mutate({ caminho: `/peladas/${peladaId}/times/mover`, json: { profileId } })
              }
            />
          )}

          {historico.length > 0 && (
            <section>
              <Eyebrow>Partidas jogadas</Eyebrow>
              <div className="flex flex-col gap-2">
                {historico.map((p) => (
                  <ResumoDaPartida key={p.id} partida={p} />
                ))}
              </div>
            </section>
          )}

          {data.artilharia.length > 0 && (
            <section>
              <Eyebrow>Artilharia da pelada</Eyebrow>
              <div className="overflow-hidden rounded-2xl border border-tinta-line/70 bg-gramado-raised">
                <ul className="divide-y divide-tinta-line/50">
                  {data.artilharia.map((l, i) => (
                    <li key={l.profileId} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                      <span className="placar-num w-5 text-center text-tinta-faint">{i + 1}</span>
                      <MiniCartinha src={l.fotoUrl} nome={l.nome} recortada={l.fotoRecortada} largura={28} />
                      <span className="min-w-0 flex-1 truncate font-medium">{l.nome ?? 'Jogador'}</span>
                      <span className="placar-num text-campo-700">{l.gols}</span>
                      <span className="text-xs text-tinta-faint">{l.gols === 1 ? 'gol' : 'gols'}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function RegrasDaPelada({
  regras,
  souAdmin,
  travado,
  salvando,
  onSalvar,
}: {
  regras: { duracaoMin: number | null; golsLimite: number | null };
  souAdmin: boolean;
  travado: boolean;
  salvando: boolean;
  onSalvar: (duracaoMin: number | null, golsLimite: number | null) => void;
}) {
  const [duracao, setDuracao] = useState(regras.duracaoMin?.toString() ?? '');
  const [gols, setGols] = useState(regras.golsLimite?.toString() ?? '');
  useEffect(() => {
    setDuracao(regras.duracaoMin?.toString() ?? '');
    setGols(regras.golsLimite?.toString() ?? '');
  }, [regras.duracaoMin, regras.golsLimite]);

  const resumo = [
    regras.duracaoMin ? `${regras.duracaoMin} min` : 'sem limite de tempo',
    regras.golsLimite ? `vence quem fizer ${regras.golsLimite} gol${regras.golsLimite > 1 ? 's' : ''} primeiro` : 'sem limite de gols',
  ].join(' · ');

  if (!souAdmin) {
    return (
      <p className="text-sm text-tinta-soft">
        <span className="font-semibold text-tinta">Regras:</span> {resumo}.
      </p>
    );
  }

  const num = (v: string) => (v.trim() === '' ? null : Math.round(Number(v)));
  const invalido = [duracao, gols].some((v) => v.trim() !== '' && !(Number(v) >= 1));
  const mudou = num(duracao) !== regras.duracaoMin || num(gols) !== regras.golsLimite;

  return (
    <Card as="section">
      <Eyebrow>Regras das partidas desta pelada</Eyebrow>
      <p className="-mt-1 text-sm text-tinta-soft">Valem para todas as partidas. Em branco = sem limite.</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.05em] text-tinta-faint">
          Duração (min)
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={180}
            value={duracao}
            disabled={travado}
            onChange={(e) => setDuracao(e.target.value)}
            placeholder="ex.: 10"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.05em] text-tinta-faint">
          Gols para vencer
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={99}
            value={gols}
            disabled={travado}
            onChange={(e) => setGols(e.target.value)}
            placeholder="ex.: 3"
          />
        </label>
      </div>
      <Button
        variante="secundario"
        className="mt-3 w-full"
        disabled={travado || salvando || invalido || !mudou}
        onClick={() => onSalvar(num(duracao), num(gols))}
      >
        {salvando ? <Spinner /> : 'Salvar regras'}
      </Button>
      {travado && <p className="mt-2 text-xs text-tinta-faint">Conclua a partida atual para mudar as regras.</p>}
    </Card>
  );
}

function NovaPartida({
  times,
  sugestao,
  ocupado,
  onCriar,
}: {
  times: TimeAtual[];
  sugestao: { timeAId: string; timeBId: string } | null;
  ocupado: boolean;
  onCriar: (a: string, b: string) => void;
}) {
  const [escolhaA, setA] = useState(sugestao?.timeAId ?? times[0]?.id ?? '');
  const [escolhaB, setB] = useState(sugestao?.timeBId ?? times[1]?.id ?? '');
  // Depois de um novo sorteio os ids antigos não existem mais: cai nos primeiros times.
  const a = times.some((t) => t.id === escolhaA) ? escolhaA : (times[0]?.id ?? '');
  const b = times.some((t) => t.id === escolhaB) ? escolhaB : (times[1]?.id ?? '');
  // Se a sugestão muda (depois de concluir uma partida), acompanha.
  useEffect(() => {
    if (sugestao) {
      setA(sugestao.timeAId);
      setB(sugestao.timeBId);
    }
  }, [sugestao?.timeAId, sugestao?.timeBId]);

  return (
    <Card as="section">
      <Eyebrow>Próxima partida</Eyebrow>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <Select aria-label="Time A" value={a} onChange={(e) => setA(e.target.value)}>
          {times.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome} ({t.jogadores.length})
            </option>
          ))}
        </Select>
        <span className="font-display text-sm font-bold text-tinta-faint">×</span>
        <Select aria-label="Time B" value={b} onChange={(e) => setB(e.target.value)}>
          {times.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome} ({t.jogadores.length})
            </option>
          ))}
        </Select>
      </div>
      <Button className="mt-3 w-full" disabled={ocupado || !a || !b || a === b} onClick={() => onCriar(a, b)}>
        {ocupado ? <Spinner /> : 'Criar partida'}
      </Button>
      {a === b && a && <p className="mt-2 text-xs text-barro-600">Escolha dois times diferentes.</p>}
    </Card>
  );
}

function PartidaAtual({
  partida: p,
  times,
  fila,
  decorrido,
  souAdmin,
  ocupado,
  onAcao,
  onConcluir,
}: {
  partida: Partida;
  times: TimeAtual[];
  fila: string[];
  decorrido: number;
  souAdmin: boolean;
  ocupado: boolean;
  onAcao: (caminho: string, metodo?: 'POST' | 'DELETE' | 'PUT', json?: unknown) => void;
  onConcluir: (perdedorTimeId: string | null) => void;
}) {
  const [golDe, setGolDe] = useState<'a' | 'b' | null>(null);
  const [saindo, setSaindo] = useState<string | null>(null);
  const encerrada = p.status === 'encerrado';
  const podeMarcar = souAdmin && (p.status === 'em_andamento' || p.status === 'pausado');
  const relogio = p.duracaoMin != null ? p.duracaoMin * 60 - decorrido : decorrido;
  const estado = ESTADO[p.status];

  // Só quem está em quadra; quem saiu numa substituição fica só no histórico.
  const doTime = (timeId: string) => p.jogadores.filter((j) => j.timeId === timeId && j.ativo);
  const podeTrocar = souAdmin && !encerrada;
  const golsDe = (profileId: string) => p.gols.filter((g) => g.profileId === profileId).length;

  return (
    <Card as="section" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <Eyebrow className="!mb-0">Partida atual</Eyebrow>
        <Chip tom={estado.tom}>{estado.rotulo}</Chip>
      </div>

      {/* placar + cronômetro */}
      <div className="overflow-hidden rounded-2xl bg-noite bg-brasao p-4 text-white shadow-pop">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
          <p className="truncate font-display text-sm font-bold uppercase tracking-[0.06em]">{p.timeA.nome}</p>
          <span />
          <p className="truncate font-display text-sm font-bold uppercase tracking-[0.06em]">{p.timeB.nome}</p>
          <p className="placar-num text-6xl leading-none text-ouro-300" aria-label={`${p.timeA.nome}: ${p.placarA} gols`}>
            {p.placarA}
          </p>
          <p className="font-display text-2xl font-bold text-white/50">×</p>
          <p className="placar-num text-6xl leading-none text-ouro-300" aria-label={`${p.timeB.nome}: ${p.placarB} gols`}>
            {p.placarB}
          </p>
        </div>
        <div className="mt-3 text-center">
          <p
            className={`placar-num text-4xl leading-none ${
              p.duracaoMin != null && relogio <= 30 && p.status !== 'agendado' && !encerrada ? 'text-barro-300' : ''
            }`}
            aria-label="cronômetro"
          >
            {p.status === 'agendado' ? mmss((p.duracaoMin ?? 0) * 60) : mmss(Math.max(0, relogio))}
          </p>
          <p className="mt-1 text-xs text-white/60">
            {p.duracaoMin != null ? `${p.duracaoMin} min` : 'sem limite de tempo'}
            {p.golsLimite != null ? ` · primeiro a ${p.golsLimite} gol${p.golsLimite > 1 ? 's' : ''}` : ''}
          </p>
        </div>
      </div>

      {/* controles */}
      {souAdmin && !encerrada && (
        <div className="flex flex-col gap-2">
          {p.status === 'agendado' && (
            <>
              <Button disabled={ocupado} onClick={() => onAcao(`/partidas/${p.id}/iniciar`)}>
                {ocupado ? <Spinner /> : 'Iniciar partida'}
              </Button>
              <Button
                variante="fantasma"
                disabled={ocupado}
                onClick={() => {
                  if (confirm('Cancelar esta partida? Ela ainda não começou.')) onAcao(`/partidas/${p.id}`, 'DELETE');
                }}
              >
                Cancelar partida
              </Button>
            </>
          )}
          {(p.status === 'em_andamento' || p.status === 'pausado') && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Button variante="secundario" disabled={ocupado} onClick={() => setGolDe('a')}>
                  Gol {p.timeA.nome}
                </Button>
                <Button variante="secundario" disabled={ocupado} onClick={() => setGolDe('b')}>
                  Gol {p.timeB.nome}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {p.status === 'em_andamento' ? (
                  <Button variante="secundario" disabled={ocupado} onClick={() => onAcao(`/partidas/${p.id}/pausar`)}>
                    Pausar
                  </Button>
                ) : (
                  <Button disabled={ocupado} onClick={() => onAcao(`/partidas/${p.id}/retomar`)}>
                    Retomar
                  </Button>
                )}
                <Button
                  variante="perigo"
                  disabled={ocupado}
                  onClick={() => {
                    if (confirm('Encerrar a partida agora?')) onAcao(`/partidas/${p.id}/encerrar`);
                  }}
                >
                  Encerrar
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* jogadores de cada time */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { time: p.timeA, lado: 'a' as const },
          { time: p.timeB, lado: 'b' as const },
        ].map(({ time }) => (
          <div key={time.id}>
            <p className="eyebrow mb-1 truncate">{time.nome}</p>
            <ul className="flex flex-col gap-1 text-sm">
              {doTime(time.id).map((j) => (
                <li key={j.profileId} className="flex items-center justify-between gap-1">
                  <span className="truncate">{j.nome ?? 'Jogador'}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {golsDe(j.profileId) > 0 && (
                      <span className="rounded-full bg-campo-100 px-1.5 text-[0.7rem] font-bold text-campo-800">
                        ⚽ {golsDe(j.profileId)}
                      </span>
                    )}
                    {podeTrocar && (
                      <button
                        type="button"
                        aria-label={`Substituir ${j.nome ?? 'jogador'}`}
                        disabled={ocupado}
                        onClick={() => setSaindo(j.profileId)}
                        className="grid h-6 w-6 place-items-center rounded-full text-campo-700 hover:bg-campo-100"
                      >
                        ⇄
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {p.substituicoes.length > 0 && (
        <div>
          <p className="eyebrow mb-1">Substituições</p>
          <ul className="flex flex-col gap-1 text-sm text-tinta-soft">
            {p.substituicoes.map((x) => (
              <li key={x.id}>
                <span className="text-xs text-tinta-faint">{hora(x.criadoEm)}</span> ⇄ saiu{' '}
                <span className="font-medium text-tinta">{x.saiu ?? 'Jogador'}</span>, entrou{' '}
                <span className="font-medium text-tinta">{x.entrou ?? 'Jogador'}</span>
                {x.destino ? ` · ${x.saiu ?? 'ele'} foi para o ${x.destino}` : ' · não joga mais hoje'}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* gols marcados */}
      {p.gols.length > 0 && (
        <div>
          <p className="eyebrow mb-1">Gols</p>
          <ul className="divide-y divide-tinta-line/50 overflow-hidden rounded-xl border border-tinta-line/70 text-sm">
            {p.gols.map((g) => (
              <li key={g.id} className="flex items-center gap-2 px-3 py-2">
                <span className="text-xs text-tinta-faint">{hora(g.criadoEm)}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{g.nome ?? 'Jogador'}</span>
                <span className="truncate text-xs text-tinta-soft">
                  {g.timeId === p.timeA.id ? p.timeA.nome : p.timeB.nome}
                </span>
                {souAdmin && (
                  <button
                    type="button"
                    aria-label={`Remover gol de ${g.nome ?? 'jogador'}`}
                    disabled={ocupado}
                    onClick={() => {
                      if (confirm(`Remover o gol de ${g.nome ?? 'este jogador'}?`)) {
                        onAcao(`/partidas/${p.id}/gols/${g.id}`, 'DELETE');
                      }
                    }}
                    className="grid h-6 w-6 place-items-center rounded-full text-tinta-faint hover:bg-barro-100/60 hover:text-barro-600"
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {encerrada && <FimDeJogo partida={p} souAdmin={souAdmin} ocupado={ocupado} onConcluir={onConcluir} />}

      {saindo && (
        <SubstituirModal
          partida={p}
          saindoId={saindo}
          times={times}
          fila={fila}
          ocupado={ocupado}
          onFechar={() => setSaindo(null)}
          onConfirmar={(entraProfileId, voltaAJogar) => {
            onAcao(`/partidas/${p.id}/substituicoes`, 'POST', {
              saiProfileId: saindo,
              entraProfileId,
              voltaAJogar,
            });
            setSaindo(null);
          }}
        />
      )}

      {golDe && (
        <MarcarGol
          timeNome={golDe === 'a' ? p.timeA.nome : p.timeB.nome}
          jogadores={doTime(golDe === 'a' ? p.timeA.id : p.timeB.id)}
          golsDe={golsDe}
          ocupado={ocupado}
          onFechar={() => setGolDe(null)}
          onConfirmar={(profileId) => {
            onAcao(`/partidas/${p.id}/gols`, 'POST', {
              timeId: golDe === 'a' ? p.timeA.id : p.timeB.id,
              profileId,
            });
            setGolDe(null);
          }}
        />
      )}
    </Card>
  );
}

function FimDeJogo({
  partida: p,
  souAdmin,
  ocupado,
  onConcluir,
}: {
  partida: Partida;
  souAdmin: boolean;
  ocupado: boolean;
  onConcluir: (perdedorTimeId: string | null) => void;
}) {
  const vencedor = p.vencedorTimeId === p.timeA.id ? p.timeA : p.vencedorTimeId === p.timeB.id ? p.timeB : null;
  // Sugere perdedor quem fez menos gols; no empate, ninguém.
  const sugerido = vencedor ? (vencedor.id === p.timeA.id ? p.timeB.id : p.timeA.id) : '';
  const [perdedor, setPerdedor] = useState(sugerido);
  useEffect(() => setPerdedor(sugerido), [sugerido]);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-campo-200 bg-campo-50 p-3.5">
      <div>
        <p className="font-display text-lg font-bold uppercase tracking-[0.04em] text-campo-900">
          {vencedor ? `${vencedor.nome} venceu` : 'Empate'}
        </p>
        <p className="text-sm text-tinta-soft">
          {p.timeA.nome} {p.placarA} × {p.placarB} {p.timeB.nome}
          {p.encerramento ? ` · ${MOTIVO[p.encerramento]}` : ''}
          {p.observacao ? ` (${p.observacao})` : ''}
        </p>
      </div>
      {souAdmin ? (
        <>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="eyebrow mb-1">Qual time perdeu?</legend>
            {[p.timeA, p.timeB].map((t) => (
              <label key={t.id} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={`perdedor-${p.id}`}
                  checked={perdedor === t.id}
                  onChange={() => setPerdedor(t.id)}
                  className="accent-campo-600"
                />
                {t.nome}
              </label>
            ))}
            <label className="flex items-center gap-2 text-sm text-tinta-soft">
              <input
                type="radio"
                name={`perdedor-${p.id}`}
                checked={perdedor === ''}
                onChange={() => setPerdedor('')}
                className="accent-campo-600"
              />
              Ninguém (empate, sem redistribuir)
            </label>
          </fieldset>
          <Button disabled={ocupado} onClick={() => onConcluir(perdedor || null)}>
            {ocupado ? <Spinner /> : perdedor ? 'Concluir e redistribuir' : 'Concluir partida'}
          </Button>
          <p className="text-xs text-tinta-faint">
            Se houver um time incompleto esperando, o time que perdeu se desfaz para completá-lo, equilibrando as estrelas.
          </p>
        </>
      ) : (
        <p className="text-sm text-tinta-soft">Aguardando o organizador confirmar o resultado.</p>
      )}
    </div>
  );
}

function MarcarGol({
  timeNome,
  jogadores,
  golsDe,
  ocupado,
  onFechar,
  onConfirmar,
}: {
  timeNome: string;
  jogadores: { profileId: string; nome: string | null; estrelas: number }[];
  golsDe: (profileId: string) => number;
  ocupado: boolean;
  onFechar: () => void;
  onConfirmar: (profileId: string) => void;
}) {
  const [escolhido, setEscolhido] = useState<string | null>(null);
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && onFechar();
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [onFechar]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center" onClick={onFechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Gol do ${timeNome}`}
        className="flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-gramado-raised shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between bg-gramado-dark px-4 py-3">
          <h2 className="font-display text-base font-bold uppercase tracking-[0.05em] text-white">
            Gol do {timeNome}
          </h2>
          <button type="button" aria-label="Fechar" onClick={onFechar} className="text-white/80 hover:text-white">
            ✕
          </button>
        </div>
        <div className="overflow-y-auto p-4">
          <p className="mb-2 text-sm text-tinta-soft">Quem fez o gol?</p>
          <div className="grid grid-cols-2 gap-2">
            {jogadores.map((j) => (
              <button
                key={j.profileId}
                type="button"
                aria-pressed={escolhido === j.profileId}
                onClick={() => setEscolhido(j.profileId)}
                className={`rounded-xl border px-3 py-3 text-left text-sm font-medium transition-colors ${
                  escolhido === j.profileId
                    ? 'border-campo-500 bg-campo-100 text-campo-900'
                    : 'border-tinta-line hover:bg-campo-50'
                }`}
              >
                <span className="block truncate">{j.nome ?? 'Jogador'}</span>
                {golsDe(j.profileId) > 0 && <span className="text-xs text-tinta-faint">⚽ {golsDe(j.profileId)} na partida</span>}
              </button>
            ))}
          </div>
        </div>
        <div className="border-t border-tinta-line/60 p-3">
          <Button className="w-full" disabled={!escolhido || ocupado} onClick={() => escolhido && onConfirmar(escolhido)}>
            Confirmar gol
          </Button>
        </div>
      </div>
    </div>
  );
}

function SubstituirModal({
  partida: p,
  saindoId,
  times,
  fila,
  ocupado,
  onFechar,
  onConfirmar,
}: {
  partida: Partida;
  saindoId: string;
  times: TimeAtual[];
  fila: string[];
  ocupado: boolean;
  onFechar: () => void;
  onConfirmar: (entraProfileId: string, voltaAJogar: boolean) => void;
}) {
  const emQuadra = p.jogadores.filter((j) => j.ativo);
  const saindo = emQuadra.find((j) => j.profileId === saindoId);
  const meuTime = emQuadra.filter((j) => j.timeId === saindo?.timeId);
  const adversario = emQuadra.filter((j) => j.timeId !== saindo?.timeId);
  const meuTimeNome = saindo?.timeId === p.timeA.id ? p.timeA.nome : p.timeB.nome;

  // Quem espera, na ordem da fila; dentro de cada time, do melhor encaixe ao pior.
  const grupos = useMemo(() => {
    if (!saindo) return [];
    return fila
      .map((id) => times.find((t) => t.id === id))
      .filter((t): t is TimeAtual => t !== undefined && t.jogadores.length > 0)
      .map((t) => ({
        time: t,
        candidatos: rankearSubstitutos({ saindo, meuTime, adversario, candidatos: t.jogadores }),
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saindo?.profileId, fila.join(), times, p.jogadores]);

  const sugerido = grupos[0]?.candidatos[0]?.profileId ?? null;
  const [escolhido, setEscolhido] = useState<string | null>(sugerido);
  const [volta, setVolta] = useState(true);
  useEffect(() => setEscolhido(sugerido), [sugerido]);
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && onFechar();
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [onFechar]);

  const ultimo = grupos[grupos.length - 1]?.time ?? null;
  const mediaAdversario = adversario.length ? adversario.reduce((s, j) => s + j.estrelas, 0) / adversario.length : 0;
  if (!saindo) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center" onClick={onFechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Substituir ${saindo.nome ?? 'jogador'}`}
        className="flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-gramado-raised shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between bg-gramado-dark px-4 py-3">
          <h2 className="font-display text-base font-bold uppercase tracking-[0.05em] text-white">
            Sai {saindo.nome ?? 'jogador'} ({saindo.estrelas}★)
          </h2>
          <button type="button" aria-label="Fechar" onClick={onFechar} className="text-white/80 hover:text-white">
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto p-4">
          {grupos.length === 0 ? (
            <Aviso>Não há jogadores esperando para entrar.</Aviso>
          ) : (
            <>
              <p className="text-sm text-tinta-soft">
                Quem entra pelo {meuTimeNome}. O primeiro é o que melhor equilibra contra o adversário.
              </p>
              {grupos.map((g, gi) => (
                <section key={g.time.id}>
                  <p className="eyebrow mb-1.5">{gi === 0 ? `Próximo a jogar: ${g.time.nome}` : g.time.nome}</p>
                  <ul className="flex flex-col gap-1.5">
                    {g.candidatos.map((c, ci) => (
                      <li key={c.profileId}>
                        <button
                          type="button"
                          aria-pressed={escolhido === c.profileId}
                          onClick={() => setEscolhido(c.profileId)}
                          className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
                            escolhido === c.profileId ? 'border-campo-500 bg-campo-100' : 'border-tinta-line hover:bg-campo-50'
                          }`}
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium">
                              {g.time.jogadores.find((j) => j.profileId === c.profileId)?.nome ?? 'Jogador'}
                              {gi === 0 && ci === 0 && (
                                <span className="ml-2 rounded-full bg-grama-100 px-1.5 py-0.5 text-[0.65rem] font-bold uppercase text-grama-800">
                                  melhor encaixe
                                </span>
                              )}
                            </span>
                            <span className="text-xs text-tinta-faint">
                              {c.estrelas}★ · time fica com média {c.mediaDoTime.toFixed(1)} contra {mediaAdversario.toFixed(1)}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}

              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={volta}
                  onChange={(e) => setVolta(e.target.checked)}
                  className="mt-0.5 accent-campo-600"
                />
                <span>
                  {saindo.nome ?? 'Ele'} ainda vai jogar hoje
                  <span className="block text-xs text-tinta-faint">
                    {volta
                      ? `Vai para o último time da fila (${ultimo?.nome ?? 'fim da fila'}).`
                      : 'Sai dos times e não joga mais hoje (ex.: lesão).'}
                  </span>
                </span>
              </label>
            </>
          )}
        </div>

        <div className="border-t border-tinta-line/60 p-3">
          <Button
            className="w-full"
            disabled={!escolhido || ocupado || grupos.length === 0}
            onClick={() => escolhido && onConfirmar(escolhido, volta)}
          >
            Confirmar troca
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Ajuste manual entre o time incompleto e quem perdeu por último — sempre
 * disponível (não só quando a redistribuição automática falha), pra poder
 * sobrescrever quem subiu, ou completar na mão quando ela não rolou.
 */
function AjustarRedistribuicao({
  times,
  porTime,
  ajuste,
  ocupado,
  onMover,
}: {
  times: TimeAtual[];
  porTime: number;
  ajuste: { incompletoTimeId: string; outroTimeId: string };
  ocupado: boolean;
  onMover: (profileId: string) => void;
}) {
  const incompleto = times.find((t) => t.id === ajuste.incompletoTimeId);
  const outro = times.find((t) => t.id === ajuste.outroTimeId);
  if (!incompleto || !outro) return null;
  const cheio = incompleto.jogadores.length >= porTime;

  return (
    <Card as="section">
      <Eyebrow>Ajustar time incompleto</Eyebrow>
      <p className="-mt-1 text-sm text-tinta-soft">
        {incompleto.nome} está faltando {porTime - incompleto.jogadores.length} jogador(es). Suba quem quiser de{' '}
        {outro.nome} — ou devolva alguém pra lá, mesmo que a redistribuição automática já tenha decidido diferente.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="eyebrow mb-1.5">
            {incompleto.nome} ({incompleto.jogadores.length}/{porTime})
          </p>
          {incompleto.jogadores.length === 0 ? (
            <p className="text-sm text-tinta-faint">Ninguém ainda.</p>
          ) : (
            <ul className="divide-y divide-tinta-line/50 overflow-hidden rounded-xl border border-tinta-line/70 text-sm">
              {incompleto.jogadores.map((j) => (
                <li key={j.profileId} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="min-w-0 truncate">{j.nome ?? 'Jogador'}</span>
                  <Button
                    variante="secundario"
                    className="shrink-0 !px-3 !py-1.5 !text-[0.8rem]"
                    disabled={ocupado}
                    onClick={() => onMover(j.profileId)}
                  >
                    Devolver
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="eyebrow mb-1.5">{outro.nome}</p>
          <ul className="divide-y divide-tinta-line/50 overflow-hidden rounded-xl border border-tinta-line/70 text-sm">
            {outro.jogadores.map((j) => (
              <li key={j.profileId} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="min-w-0 truncate">{j.nome ?? 'Jogador'}</span>
                <Button
                  className="shrink-0 !px-3 !py-1.5 !text-[0.8rem]"
                  disabled={ocupado || cheio}
                  onClick={() => onMover(j.profileId)}
                >
                  Subir
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}

function TimesDeAgora({ times, porTime }: { times: TimeAtual[]; porTime: number }) {
  if (times.length === 0) return null;
  return (
    <section>
      <Eyebrow>Times agora</Eyebrow>
      <div className="grid gap-2 sm:grid-cols-2">
        {times.map((t) => (
          <Card key={t.id} className="!p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-display text-sm font-bold uppercase tracking-[0.05em]">{t.nome}</p>
              <span className="text-xs text-tinta-faint">
                {t.jogadores.length} jogador(es) · {t.totalEstrelas}★
                {t.jogadores.length < porTime ? ' · incompleto' : ''}
              </span>
            </div>
            <p className="mt-1 text-sm text-tinta-soft">{t.jogadores.map((j) => j.nome ?? 'Jogador').join(', ')}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}

function ResumoDaPartida({ partida: p }: { partida: Partida }) {
  const vencedor = p.vencedorTimeId === p.timeA.id ? p.timeA : p.vencedorTimeId === p.timeB.id ? p.timeB : null;
  const porAutor = useMemo(() => {
    const m = new Map<string, { nome: string; n: number }>();
    for (const g of p.gols) {
      const atual = m.get(g.profileId) ?? { nome: g.nome ?? 'Jogador', n: 0 };
      atual.n++;
      m.set(g.profileId, atual);
    }
    return [...m.values()];
  }, [p.gols]);
  const perdedor = p.perdedorTimeId === p.timeA.id ? p.timeA : p.perdedorTimeId === p.timeB.id ? p.timeB : null;

  return (
    <Card className="!p-3.5">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">
          {p.timeA.nome} <span className="placar-num text-campo-700">{p.placarA}</span> ×{' '}
          <span className="placar-num text-campo-700">{p.placarB}</span> {p.timeB.nome}
        </p>
        <Chip tom={vencedor ? 'confirmado' : 'pendente'}>{vencedor ? `${vencedor.nome} venceu` : 'Empate'}</Chip>
      </div>
      <p className="mt-1 text-xs text-tinta-faint">
        {p.encerramento ? MOTIVO[p.encerramento] : ''}
        {p.encerradoEm ? ` · ${hora(p.encerradoEm)}` : ''}
        {perdedor ? ` · perdeu: ${perdedor.nome}` : ''}
      </p>
      {porAutor.length > 0 && (
        <p className="mt-1.5 text-sm text-tinta-soft">
          ⚽ {porAutor.map((a) => (a.n > 1 ? `${a.nome} (${a.n})` : a.nome)).join(', ')}
        </p>
      )}
      {p.redistribuicao && (
        <p className="mt-1.5 text-xs text-tinta-soft">
          Redistribuição: {p.redistribuicao.movidos.map((m) => m.nome ?? 'Jogador').join(', ')} completaram o time que sobrou
          ({p.redistribuicao.totalNovoTime}★ contra {p.redistribuicao.totalReferencia}★ do vencedor).
        </p>
      )}
    </Card>
  );
}
