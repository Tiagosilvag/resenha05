import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DIAS_SEMANA, criarConfiguracaoSchema } from '@resenha05/shared';
import { useAuth } from '../lib/auth';
import { api, ApiError } from '../lib/api';
import { Aviso, Button, Card, Field, Input, Select, Spinner } from '../components/ui';

interface Config {
  id: string;
  nome: string;
  dia_semana: number;
  horario_jogo: string;
  horario_lista: string;
  local: string | null;
  ativo: boolean;
}
interface Pelada {
  id: string;
  data: string;
  hora: string | null;
  local: string | null;
  tipo: string;
  status: string;
}

export function Peladas() {
  const { usuario } = useAuth();
  const orgs = usuario?.organizacoes ?? [];
  const [orgId, setOrgId] = useState(orgs[0]?.id ?? '');
  const org = orgs.find((o) => o.id === orgId);
  const admin = org?.papel === 'admin' || org?.papel === 'admin_principal';
  const qc = useQueryClient();
  const [erro, setErro] = useState<string | null>(null);
  const [novaAberta, setNovaAberta] = useState(false);

  const configs = useQuery({
    queryKey: ['configs', orgId],
    queryFn: () => api<Config[]>(`/organizacoes/${orgId}/configuracoes`),
    enabled: Boolean(orgId),
  });
  const peladas = useQuery({
    queryKey: ['peladas', orgId],
    queryFn: () => api<Pelada[]>(`/organizacoes/${orgId}/peladas`),
    enabled: Boolean(orgId),
  });

  const gerar = useMutation({
    mutationFn: (configId: string) =>
      api<{ id: string }>('/peladas/da-config', { method: 'POST', json: { configId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['peladas', orgId] });
      setErro(null);
    },
    onError: (e) => setErro(e instanceof ApiError ? e.message : 'Erro ao gerar a pelada.'),
  });

  if (!orgId) {
    return (
      <Card>
        <p className="text-sm text-black/55">
          Você ainda não participa de nenhuma organização.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-extrabold tracking-tight">Peladas</h1>

      {orgs.length > 1 && (
        <Select value={orgId} onChange={(e) => setOrgId(e.target.value)}>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nome}
            </option>
          ))}
        </Select>
      )}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-black/45">Configurações</h2>
          {admin && (
            <button className="text-sm font-semibold text-campo-700" onClick={() => setNovaAberta((v) => !v)}>
              {novaAberta ? 'Fechar' : '+ Nova'}
            </button>
          )}
        </div>

        {admin && novaAberta && (
          <NovaConfig
            orgId={orgId}
            onCriada={() => {
              setNovaAberta(false);
              configs.refetch();
            }}
          />
        )}

        <div className="mt-2 flex flex-col gap-2">
          {configs.data?.map((c) => (
            <Card key={c.id}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{c.nome}</p>
                  <p className="text-xs text-black/50">
                    {DIAS_SEMANA[c.dia_semana]} · {c.horario_jogo.slice(0, 5)}
                    {c.local ? ` · ${c.local}` : ''}
                  </p>
                </div>
                {admin && (
                  <Button variante="secundario" onClick={() => gerar.mutate(c.id)} disabled={gerar.isPending}>
                    {gerar.isPending ? <Spinner /> : 'Gerar pelada'}
                  </Button>
                )}
              </div>
            </Card>
          ))}
          {configs.data?.length === 0 && (
            <p className="text-sm text-black/45">Nenhuma configuração ainda.</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-black/45">Próximas e recentes</h2>
        <div className="flex flex-col gap-2">
          {peladas.data?.map((p) => (
            <Link key={p.id} to={`/peladas/${p.id}`}>
              <Card>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">
                      {new Date(p.data + 'T00:00:00').toLocaleDateString('pt-BR', {
                        weekday: 'short',
                        day: '2-digit',
                        month: '2-digit',
                      })}
                      {p.hora ? ` · ${p.hora.slice(0, 5)}` : ''}
                    </p>
                    <p className="text-xs text-black/50">{p.local ?? 'Local a definir'}</p>
                  </div>
                  <span className="text-xs font-semibold uppercase text-campo-700">{p.status}</span>
                </div>
              </Card>
            </Link>
          ))}
          {peladas.data?.length === 0 && <p className="text-sm text-black/45">Nenhuma pelada ainda.</p>}
        </div>
      </section>
    </div>
  );
}

function NovaConfig({ orgId, onCriada }: { orgId: string; onCriada: () => void }) {
  const [form, setForm] = useState({
    nome: '',
    diaSemana: 2,
    horarioJogo: '20:00',
    horarioLista: '08:00',
    local: '',
  });
  const [erro, setErro] = useState<string | null>(null);
  const criar = useMutation({
    mutationFn: () => {
      const dados = criarConfiguracaoSchema.parse({
        nome: form.nome,
        diaSemana: Number(form.diaSemana),
        horarioJogo: form.horarioJogo,
        horarioLista: form.horarioLista,
        local: form.local || null,
      });
      return api(`/organizacoes/${orgId}/configuracoes`, { method: 'POST', json: dados });
    },
    onSuccess: onCriada,
    onError: (e) => setErro(e instanceof ApiError ? e.message : 'Confira os campos.'),
  });

  return (
    <Card className="mt-2">
      <div className="flex flex-col gap-3">
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <Field label="Nome">
          <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Pelada de terça" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Dia">
            <Select value={form.diaSemana} onChange={(e) => setForm({ ...form, diaSemana: Number(e.target.value) })}>
              {DIAS_SEMANA.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Hora do jogo">
            <Input type="time" value={form.horarioJogo} onChange={(e) => setForm({ ...form, horarioJogo: e.target.value })} />
          </Field>
        </div>
        <Field label="Hora de gerar a lista">
          <Input type="time" value={form.horarioLista} onChange={(e) => setForm({ ...form, horarioLista: e.target.value })} />
        </Field>
        <Field label="Local (opcional)">
          <Input value={form.local} onChange={(e) => setForm({ ...form, local: e.target.value })} />
        </Field>
        <Button onClick={() => criar.mutate()} disabled={criar.isPending}>
          {criar.isPending ? <Spinner /> : 'Criar configuração'}
        </Button>
      </div>
    </Card>
  );
}
