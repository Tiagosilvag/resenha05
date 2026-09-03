import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { criarTorneioSchema, FORMATOS_TORNEIO } from '@resenha05/shared';
import { api, ApiError } from '../lib/api';
import { useOrgSelecionada } from '../lib/org';
import { Aviso, Button, Card, Field, Input, Select, Spinner } from '../components/ui';

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
  const { orgs, orgId, setOrgId, admin } = useOrgSelecionada();
  const qc = useQueryClient();
  const [novo, setNovo] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['torneios', orgId],
    queryFn: () => api<Torneio[]>(`/organizacoes/${orgId}/torneios`),
    enabled: Boolean(orgId),
  });

  if (!orgId) {
    return <Card><p className="text-sm text-black/55">Você não participa de nenhuma organização.</p></Card>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold tracking-tight">Torneios e copas</h1>
        <Link to="/artilharia" className="text-sm font-semibold text-campo-700">Artilharia →</Link>
      </div>

      {orgs.length > 1 && (
        <Select value={orgId} onChange={(e) => setOrgId(e.target.value)}>
          {orgs.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
        </Select>
      )}

      {admin && (
        <button className="self-start text-sm font-semibold text-campo-700" onClick={() => setNovo((v) => !v)}>
          {novo ? 'Fechar' : '+ Novo torneio'}
        </button>
      )}
      {admin && novo && <NovoTorneio orgId={orgId} onCriado={() => { setNovo(false); qc.invalidateQueries({ queryKey: ['torneios', orgId] }); }} />}

      {isLoading ? (
        <Spinner className="h-6 w-6 text-campo-600" />
      ) : (
        <div className="flex flex-col gap-2">
          {data?.map((t) => (
            <Link key={t.id} to={`/torneios/${t.id}`}>
              <Card>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{t.nome}</p>
                    <p className="text-xs text-black/50">{ROTULO_FORMATO[t.formato] ?? t.formato}</p>
                  </div>
                  <span className="text-xs font-semibold uppercase text-campo-700">{t.status.replace('_', ' ')}</span>
                </div>
              </Card>
            </Link>
          ))}
          {data?.length === 0 && <p className="text-sm text-black/45">Nenhum torneio ainda.</p>}
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
          <textarea
            className="w-full rounded-xl border border-black/10 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-campo-400 focus:ring-2 focus:ring-campo-100"
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
