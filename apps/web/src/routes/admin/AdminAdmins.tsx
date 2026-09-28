import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatarTelefone } from '@resenha05/shared';
import { api, ApiError } from '../../lib/api';
import { Aviso, Button, Card, Input, MiniCartinha, Spinner } from '../../components/ui';

interface AdminPlataforma {
  id: string;
  profileId: string;
  nome: string | null;
  telefone: string;
  criadoEm: string;
}

interface PerfilEncontrado {
  profileId: string;
  nome: string | null;
  telefone: string;
}

export function AdminAdmins() {
  const qc = useQueryClient();
  const [erro, setErro] = useState<string | null>(null);
  const [termo, setTermo] = useState('');
  const [termoDebounced, setTermoDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setTermoDebounced(termo.trim()), 300);
    return () => clearTimeout(t);
  }, [termo]);

  const { data: admins, isLoading } = useQuery({
    queryKey: ['admin-plataforma-admins'],
    queryFn: () => api<AdminPlataforma[]>('/admin/plataforma-admins'),
  });

  const busca = useQuery({
    queryKey: ['admin-plataforma-admins-buscar', termoDebounced],
    queryFn: () =>
      api<PerfilEncontrado[]>(`/admin/plataforma-admins/buscar?q=${encodeURIComponent(termoDebounced)}`),
    enabled: termoDebounced.length >= 2,
  });

  const adicionar = useMutation({
    mutationFn: (profileId: string) => api('/admin/plataforma-admins', { method: 'POST', json: { profileId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-plataforma-admins'] });
      setTermo('');
      setTermoDebounced('');
      setErro(null);
    },
    onError: (e) => setErro(e instanceof ApiError ? e.message : 'Não foi possível cadastrar.'),
  });

  const remover = useMutation({
    mutationFn: (id: string) => api(`/admin/plataforma-admins/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-plataforma-admins'] }),
    onError: (e) => setErro(e instanceof ApiError ? e.message : 'Não foi possível remover.'),
  });

  return (
    <div className="flex flex-col gap-3">
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <Card>
        <p className="eyebrow mb-1">Cadastrar admin de plataforma</p>
        <p className="mb-3 text-sm text-tinta-soft">Digite o nome ou telefone — a pessoa precisa já ter conta.</p>
        <div className="relative">
          <Input placeholder="Nome ou telefone" value={termo} onChange={(e) => setTermo(e.target.value)} />
          {termoDebounced.length >= 2 && (
            <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-tinta-line bg-gramado-raised shadow-pop">
              {busca.isFetching && (
                <div className="flex items-center gap-2 px-3 py-2.5 text-sm text-tinta-faint">
                  <Spinner className="h-4 w-4" /> Buscando…
                </div>
              )}
              {!busca.isFetching && busca.data?.length === 0 && (
                <p className="px-3 py-2.5 text-sm text-tinta-faint">Nenhum cadastro encontrado.</p>
              )}
              {!busca.isFetching &&
                busca.data?.map((p) => (
                  <button
                    key={p.profileId}
                    type="button"
                    disabled={adicionar.isPending}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-campo-50 disabled:opacity-50"
                    onClick={() => adicionar.mutate(p.profileId)}
                  >
                    <MiniCartinha nome={p.nome} largura={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{p.nome ?? 'Sem nome'}</p>
                      <p className="text-xs text-tinta-faint">{formatarTelefone(p.telefone)}</p>
                    </div>
                  </button>
                ))}
            </div>
          )}
        </div>
      </Card>

      {isLoading && <Spinner className="h-5 w-5 text-campo-600" />}
      <div className="flex flex-col gap-2">
        {admins?.map((a) => (
          <Card key={a.id} className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{a.nome ?? 'Sem nome'}</p>
              <p className="text-xs text-tinta-faint">{formatarTelefone(a.telefone)}</p>
            </div>
            <Button
              variante="perigo"
              className="!px-3 !text-[0.85rem]"
              onClick={() => {
                if (!confirm(`Remover ${a.nome ?? 'este admin'} de admin de plataforma?`)) return;
                remover.mutate(a.id);
              }}
            >
              Excluir
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
