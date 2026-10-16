import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { StatusAssinatura } from '@resenha05/shared';
import { api } from '../../lib/api';
import { Card, Chip, Input, Spinner } from '../../components/ui';
import { AdminOrganizacaoDetalhe } from './AdminOrganizacaoDetalhe';

interface OrganizacaoAdmin {
  id: string;
  nome: string;
  codigo: string;
  statusAssinatura: StatusAssinatura;
  criadoEm: string;
}

const TOM: Record<StatusAssinatura, 'confirmado' | 'pendente' | 'desistiu'> = {
  ativa: 'confirmado',
  trial: 'pendente',
  inadimplente: 'pendente',
  cancelada: 'desistiu',
};

const ROTULO: Record<StatusAssinatura, string> = {
  ativa: 'Ativa',
  trial: 'Avaliação',
  inadimplente: 'Pendente',
  cancelada: 'Cancelada',
};

export function AdminOrganizacoes() {
  const [busca, setBusca] = useState('');
  const [debounced, setDebounced] = useState('');
  const [aberta, setAberta] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(busca.trim()), 300);
    return () => clearTimeout(t);
  }, [busca]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-organizacoes', debounced],
    queryFn: () => api<OrganizacaoAdmin[]>(`/admin/organizacoes?q=${encodeURIComponent(debounced)}`),
  });

  return (
    <div className="flex flex-col gap-3">
      <Input placeholder="Buscar por nome" value={busca} onChange={(e) => setBusca(e.target.value)} />
      {isLoading && <Spinner className="h-5 w-5 text-campo-600" />}
      {!isLoading && data?.length === 0 && (
        <p className="text-sm text-tinta-faint">Nenhuma organização encontrada.</p>
      )}
      <div className="flex flex-col gap-2">
        {data?.map((o) => (
          <Card key={o.id} className="flex flex-col gap-3">
            <button
              type="button"
              aria-expanded={aberta === o.id}
              className="flex w-full items-center gap-3 text-left"
              onClick={() => setAberta(aberta === o.id ? null : o.id)}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{o.nome}</p>
                <p className="text-xs text-tinta-faint">Código {o.codigo}</p>
              </div>
              <Chip tom={TOM[o.statusAssinatura]}>{ROTULO[o.statusAssinatura]}</Chip>
              <svg
                viewBox="0 0 24 24"
                className={`h-4 w-4 shrink-0 stroke-tinta-faint transition-transform ${aberta === o.id ? 'rotate-180' : ''}`}
                fill="none"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            {aberta === o.id && <AdminOrganizacaoDetalhe id={o.id} />}
          </Card>
        ))}
      </div>
    </div>
  );
}
