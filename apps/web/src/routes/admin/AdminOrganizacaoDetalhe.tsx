import { useQuery } from '@tanstack/react-query';
import { formatarTelefone } from '@resenha05/shared';
import { api } from '../../lib/api';
import { formatarCentavos } from '../../lib/dinheiro';
import { Aviso, Chip, Spinner, StatTile } from '../../components/ui';

type StatusCiclo = 'pendente' | 'aprovado' | 'atrasado' | 'cancelado';

interface Detalhe {
  id: string;
  nome: string;
  codigo: string;
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

export function AdminOrganizacaoDetalhe({ id }: { id: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-organizacao', id],
    queryFn: () => api<Detalhe>(`/admin/organizacoes/${id}`),
  });

  if (isLoading) return <Spinner className="h-5 w-5 text-campo-600" />;
  if (isError || !data) return <Aviso tipo="erro">Não foi possível carregar os detalhes.</Aviso>;

  return (
    <div className="flex flex-col gap-3 border-t border-tinta-line/60 pt-3">
      <div>
        <p className="eyebrow mb-0.5">Dono</p>
        <p className="text-sm font-semibold">{data.dono.nome ?? 'Sem nome'}</p>
        <p className="text-xs text-tinta-faint">{formatarTelefone(data.dono.telefone)}</p>
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
