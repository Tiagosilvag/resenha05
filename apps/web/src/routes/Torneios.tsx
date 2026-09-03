import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { criarTorneioSchema, FORMATOS_TORNEIO } from '@resenha05/shared';
import { api, ApiError } from '../lib/api';
import { useOrg } from '../lib/org';
import { Aviso, Button, Card, Chip, Field, Input, Select, Spinner, Textarea } from '../components/ui';

interface Torneio {
  id: string;
  nome: string;
  formato: string;
  status: string;
  criado_em: string;
}

const ROTULO_FORMATO: Record<string, string> = {
  grupos: 'Fase de grupos',
  mata_mata: 'Mata-mata',
  pontos_corridos: 'Pontos corridos',
};

export function Torneios() {
  const { orgId, admin } = useOrg();
  const qc = useQueryClient();
  const [novo, setNovo] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['torneios', orgId],
    queryFn: () => api<Torneio[]>(`/organizacoes/${orgId}/torneios`),
    enabled: Boolean(orgId),
  });

  if (!orgId) {
    return <Card><p className="text-sm text-tinta-soft">Você não participa de nenhuma organização.</p></Card>;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="font-display text-2xl font-bold tracking-tight">Torneios e copas</h1>
        <Link
          to="/artilharia"
          className="font-display text-xs font-semibold uppercase tracking-[0.05em] text-campo-700"
        >
          Artilharia →
        </Link>
      </div>

      {admin && (
        <button
          className="inline-flex items-center gap-1.5 self-start font-display text-sm font-semibold uppercase tracking-[0.04em] text-campo-700"
          onClick={() => setNovo((v) => !v)}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d={novo ? 'M6 6l12 12M6 18 18 6' : 'M12 5v14M5 12h14'} />
          </svg>
          {novo ? 'Fechar' : 'Novo torneio'}
        </button>
      )}
      {admin && novo && <NovoTorneio orgId={orgId} onCriado={() => { setNovo(false); qc.invalidateQueries({ queryKey: ['torneios', orgId] }); }} />}

      {isLoading ? (
        <Spinner className="h-6 w-6 text-campo-600" />
      ) : (
        <div className="flex flex-col gap-2">
          {data?.map((t) => (
            <Link key={t.id} to={`/torneios/${t.id}`} className="block">
              <Card className="flex items-center justify-between gap-3 py-3 transition-shadow hover:shadow-pop">
                <div className="min-w-0">
                  <p className="truncate font-display font-semibold uppercase tracking-[0.02em]">{t.nome}</p>
                  <p className="text-xs text-tinta-faint">{ROTULO_FORMATO[t.formato] ?? t.formato}</p>
                </div>
                <Chip tom={t.status === 'em_andamento' ? 'confirmado' : 'neutro'}>{t.status.replace('_', ' ')}</Chip>
              </Card>
            </Link>
          ))}
          {data?.length === 0 && <p className="text-sm text-tinta-faint">Nenhum torneio ainda.</p>}
        </div>
      )}
    </div>
  );
}

function NovoTorneio({ orgId, onCriado }: { orgId: string; onCriado: () => void }) {
  const [nome, setNome] = useState('');
  const [formato, setFormato] = useState<(typeof FORMATOS_TORNEIO)[number]>('pontos_corridos');
  const [timesTexto, setTimesTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const criar = useMutation({
    mutationFn: () => {
      const times = timesTexto
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((nome) => ({ nome }));
      const dados = criarTorneioSchema.parse({ nome, formato, times });
      return api(`/organizacoes/${orgId}/torneios`, { method: 'POST', json: dados });
    },
    onSuccess: onCriado,
    onError: (e) => setErro(e instanceof ApiError ? e.message : 'Confira os campos (mín. 2 times).'),
  });

  return (
    <Card>
      <div className="flex flex-col gap-3">
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <Field label="Nome">
          <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Copa de Verão" />
        </Field>
        <Field label="Formato">
          <Select value={formato} onChange={(e) => setFormato(e.target.value as typeof formato)}>
            <option value="pontos_corridos">Pontos corridos</option>
            <option value="grupos">Fase de grupos</option>
            <option value="mata_mata">Mata-mata</option>
          </Select>
        </Field>
        <Field label="Times (um por linha)">
          <Textarea
            rows={5}
            value={timesTexto}
            onChange={(e) => setTimesTexto(e.target.value)}
            placeholder={'Time do Zé\nAmigos da Bola\nResenha FC'}
          />
        </Field>
        <Button onClick={() => criar.mutate()} disabled={criar.isPending}>
          {criar.isPending ? <Spinner /> : 'Criar torneio'}
        </Button>
      </div>
    </Card>
  );
}
