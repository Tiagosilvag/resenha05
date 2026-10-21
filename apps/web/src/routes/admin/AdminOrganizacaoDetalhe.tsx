import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fimDoMes, formatarTelefone, proximoMesALiberar, type StatusAssinatura } from '@resenha05/shared';
import { api, ApiError } from '../../lib/api';
import { formatarCentavos } from '../../lib/dinheiro';
import { Aviso, Button, Chip, Spinner, StatTile } from '../../components/ui';

type StatusCiclo = 'pendente' | 'aprovado' | 'atrasado' | 'cancelado';

interface Detalhe {
  id: string;
  nome: string;
  codigo: string;
  statusAssinatura: StatusAssinatura;
  pagaPeloMercadoPago: boolean;
  liberadaManualmenteAte: string | null;
  criadoEm: string;
  dono: { profileId: string; nome: string | null; telefone: string };
  totais: { membros: number; admins: number; peladas: number; torneios: number };
  mercadoPagoDaOrganizacaoConectado: boolean;
  assinaturas: { periodoReferencia: string; status: StatusCiclo; valorCentavos: number; atualizadoEm: string }[];
}

const CICLO: Record<StatusCiclo, { rotulo: string; tom: 'confirmado' | 'pendente' | 'desistiu' }> = {
  aprovado: { rotulo: 'Aprovado', tom: 'confirmado' },
  pendente: { rotulo: 'Pendente', tom: 'pendente' },
  atrasado: { rotulo: 'Atrasado', tom: 'pendente' },
  cancelado: { rotulo: 'Cancelado', tom: 'desistiu' },
};

/** 'YYYY-MM-DD' → 'MM/AAAA' (sem passar por Date, para o fuso não mudar o mês). */
function mesAno(dataIso: string): string {
  const [ano, mes] = dataIso.slice(0, 10).split('-');
  return `${mes}/${ano}`;
}

/** Mês que o botão vai liberar, ou null se já bateu o limite adiante. */
function proximoMesDaLiberacao(liberadaAte: string | null): string | null {
  try {
    return proximoMesALiberar(liberadaAte ? `${liberadaAte.slice(0, 7)}-01` : null, new Date());
  } catch {
    return null;
  }
}

/** 'YYYY-MM-DD' → 'DD/MM/AAAA' (sem passar por Date, para o fuso não mudar o dia). */
export function dataBr(dataIso: string): string {
  const [ano, mes, dia] = dataIso.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

interface Participante {
  profileId: string;
  nome: string | null;
  telefone: string;
}

function TrocarDono({ orgId, orgNome, donoId }: { orgId: string; orgNome: string; donoId: string }) {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const q = busca.trim();
  const { data } = useQuery({
    queryKey: ['admin-participantes', q],
    queryFn: () => api<Participante[]>(`/admin/participantes?q=${encodeURIComponent(q)}`),
    enabled: aberto && q.length >= 2,
  });
  const trocar = useMutation({
    mutationFn: (profileId: string) =>
      api(`/admin/organizacoes/${orgId}/dono`, { method: 'PUT', json: { profileId } }),
    onSuccess: () => {
      setErro(null);
      setAberto(false);
      setBusca('');
      qc.invalidateQueries({ queryKey: ['admin-organizacao', orgId] });
    },
    onError: (e) => setErro(e instanceof ApiError ? e.message : 'Não foi possível trocar o dono.'),
  });

  if (!aberto) {
    return (
      <Button variante="secundario" className="mt-2 w-full" onClick={() => setAberto(true)}>
        Trocar dono
      </Button>
    );
  }
  return (
    <div className="mt-2 flex flex-col gap-2">
      <input
        className="w-full rounded-lg border border-tinta-line px-3 py-2 text-sm"
        placeholder="Buscar novo dono por nome ou telefone"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        autoFocus
      />
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {(data ?? [])
        .filter((p) => p.profileId !== donoId)
        .map((p) => (
          <button
            key={p.profileId}
            type="button"
            disabled={trocar.isPending}
            className="rounded-lg border border-tinta-line/60 px-3 py-2 text-left"
            onClick={() => {
              if (!confirm(`Tornar ${p.nome ?? 'esta pessoa'} a dona de "${orgNome}"? O dono atual passa a admin.`)) return;
              trocar.mutate(p.profileId);
            }}
          >
            <span className="block text-sm font-semibold">{p.nome ?? 'Sem nome'}</span>
            <span className="block text-xs text-tinta-faint">{formatarTelefone(p.telefone)}</span>
          </button>
        ))}
      <Button variante="secundario" onClick={() => setAberto(false)}>
        Cancelar
      </Button>
    </div>
  );
}

export function AdminOrganizacaoDetalhe({ id }: { id: string }) {
  const qc = useQueryClient();
  const [erro, setErro] = useState<string | null>(null);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-organizacao', id],
    queryFn: () => api<Detalhe>(`/admin/organizacoes/${id}`),
  });

  const liberar = useMutation({
    mutationFn: () => api<{ periodoReferencia: string; venceEm: string }>(`/admin/organizacoes/${id}/liberar-mes`, { method: 'POST' }),
    onSuccess: () => {
      setErro(null);
      qc.invalidateQueries({ queryKey: ['admin-organizacao', id] });
      qc.invalidateQueries({ queryKey: ['admin-organizacoes'] });
    },
    onError: (e) => setErro(e instanceof ApiError ? e.message : 'Não foi possível liberar o mês.'),
  });

  if (isLoading) return <Spinner className="h-5 w-5 text-campo-600" />;
  if (isError || !data) return <Aviso tipo="erro">Não foi possível carregar os detalhes.</Aviso>;

  const proximoMes = proximoMesDaLiberacao(data.liberadaManualmenteAte);

  return (
    <div className="flex flex-col gap-3 border-t border-tinta-line/60 pt-3">
      <div>
        <p className="eyebrow mb-0.5">Dono</p>
        <p className="text-sm font-semibold">{data.dono.nome ?? 'Sem nome'}</p>
        <p className="text-xs text-tinta-faint">{formatarTelefone(data.dono.telefone)}</p>
        <TrocarDono orgId={id} orgNome={data.nome} donoId={data.dono.profileId} />
      </div>

      <div className="grid grid-cols-4 gap-2">
        <StatTile valor={data.totais.membros} rotulo="Membros" />
        <StatTile valor={data.totais.admins} rotulo="Admins" />
        <StatTile valor={data.totais.peladas} rotulo="Peladas" />
        <StatTile valor={data.totais.torneios} rotulo="Torneios" />
      </div>

      <p className="text-xs text-tinta-faint">
        Criada em {new Date(data.criadoEm).toLocaleDateString('pt-BR')} · Mercado Pago da organização:{' '}
        {data.mercadoPagoDaOrganizacaoConectado ? 'conectado' : 'não conectado'}
      </p>

      <div>
        <p className="eyebrow mb-1">Mensalidade</p>
        <p className="text-sm text-tinta-soft">
          {data.pagaPeloMercadoPago
            ? 'Paga pelo Mercado Pago (renovação automática).'
            : data.liberadaManualmenteAte
              ? `Liberada à mão ${data.statusAssinatura === 'ativa' ? 'até' : '— venceu em'} ${dataBr(data.liberadaManualmenteAte)}.`
              : data.statusAssinatura === 'ativa'
                ? 'Ativa, sem vencimento (organização anterior à cobrança).'
                : 'Sem mensalidade em dia.'}
        </p>
        {data.pagaPeloMercadoPago && data.liberadaManualmenteAte && (
          <p className="text-xs text-tinta-faint">
            Liberação manual também registrada até {dataBr(data.liberadaManualmenteAte)}.
          </p>
        )}
        {erro && <div className="mt-2"><Aviso tipo="erro">{erro}</Aviso></div>}
        {proximoMes && (
          <Button
            variante="secundario"
            className="mt-2 w-full"
            disabled={liberar.isPending}
            onClick={() => {
              if (!confirm(`Liberar a mensalidade de ${mesAno(proximoMes)} para "${data.nome}"? Vence em ${dataBr(fimDoMes(proximoMes))}.`)) return;
              liberar.mutate();
            }}
          >
            {liberar.isPending ? <Spinner /> : `Liberar ${mesAno(proximoMes)}`}
          </Button>
        )}
      </div>

      <div>
        <p className="eyebrow mb-1">Histórico da mensalidade</p>
        {data.assinaturas.length === 0 ? (
          <p className="text-sm text-tinta-faint">Nenhuma cobrança iniciada ainda.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {data.assinaturas.map((a) => (
              <div key={`${a.periodoReferencia}-${a.atualizadoEm}`} className="flex items-center gap-2 text-sm">
                <span className="placar-num w-16 text-campo-800">{mesAno(a.periodoReferencia)}</span>
                <span className="flex-1 text-tinta-soft">{formatarCentavos(a.valorCentavos)}</span>
                <Chip tom={CICLO[a.status].tom}>{CICLO[a.status].rotulo}</Chip>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
