import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatarTelefone } from '@resenha05/shared';
import { api } from '../../lib/api';
import { Card, Input, MiniCartinha, Spinner } from '../../components/ui';

interface Participante {
  profileId: string;
  nome: string | null;
  telefone: string;
  fotoUrl: string | null;
  criadoEm: string;
}

export function AdminParticipantes() {
  const [busca, setBusca] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(busca.trim()), 300);
    return () => clearTimeout(t);
  }, [busca]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-participantes', debounced],
    queryFn: () => api<Participante[]>(`/admin/participantes?q=${encodeURIComponent(debounced)}`),
  });

  return (
    <div className="flex flex-col gap-3">
      <Input placeholder="Buscar por nome ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} />
      {isLoading && <Spinner className="h-5 w-5 text-campo-600" />}
      {!isLoading && data?.length === 0 && (
        <p className="text-sm text-tinta-faint">Nenhum participante encontrado.</p>
      )}
      <div className="flex flex-col gap-2">
        {data?.map((p) => (
          <Card key={p.profileId} className="flex items-center gap-3 py-3">
            <MiniCartinha src={p.fotoUrl} nome={p.nome} largura={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{p.nome ?? 'Sem nome'}</p>
              <p className="text-xs text-tinta-faint">{formatarTelefone(p.telefone)}</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
