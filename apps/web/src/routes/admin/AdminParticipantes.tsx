import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatarTelefone } from '@resenha05/shared';
import { useAuth } from '../../lib/auth';
import { api, ApiError } from '../../lib/api';
import { Aviso, Button, Card, Input, MiniCartinha, Spinner } from '../../components/ui';

interface Participante {
  profileId: string;
  nome: string | null;
  telefone: string;
  fotoUrl: string | null;
  criadoEm: string;
}

export function AdminParticipantes() {
  const { usuario } = useAuth();
  const souDev = usuario?.papelPlataforma === 'dev';
  const qc = useQueryClient();
  const [busca, setBusca] = useState('');
  const [debounced, setDebounced] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(busca.trim()), 300);
    return () => clearTimeout(t);
  }, [busca]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-participantes', debounced],
    queryFn: () => api<Participante[]>(`/admin/participantes?q=${encodeURIComponent(debounced)}`),
  });

  const excluir = useMutation({
    mutationFn: (profileId: string) => api(`/admin/participantes/${profileId}`, { method: 'DELETE' }),
    onSuccess: () => {
      setErro(null);
      qc.invalidateQueries({ queryKey: ['admin-participantes'] });
    },
    onError: (e) => setErro(e instanceof ApiError ? e.message : 'Não foi possível excluir.'),
  });

  return (
    <div className="flex flex-col gap-3">
      <Input placeholder="Buscar por nome ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} />
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
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
            {souDev && (
              <Button
                variante="perigo"
                className="!px-3 !text-[0.85rem]"
                disabled={excluir.isPending}
                onClick={() => {
                  if (
                    !confirm(
                      `Excluir ${p.nome ?? 'este participante'} e todos os dados da conta? Isso não pode ser desfeito.`,
                    )
                  )
                    return;
                  excluir.mutate(p.profileId);
                }}
              >
                Excluir
              </Button>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
