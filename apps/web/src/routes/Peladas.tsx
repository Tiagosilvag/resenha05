import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DIAS_SEMANA, criarConfiguracaoSchema } from '@resenha05/shared';
import { api, ApiError } from '../lib/api';
import { useOrg } from '../lib/org';
import { Aviso, Button, Card, Chip, Field, Input, Select, Spinner } from '../components/ui';

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
  const { orgId, admin } = useOrg();
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
        <p className="text-sm text-tinta-soft">
          Você ainda não participa de nenhuma organização.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-2xl font-bold tracking-tight">Peladas</h1>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <p className="eyebrow">Configurações</p>
          {admin && (
            <button
              className="inline-flex items-center gap-1.5 font-display text-sm font-semibold uppercase tracking-[0.04em] text-campo-700"
              onClick={() => setNovaAberta((v) => !v)}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d={novaAberta ? 'M6 6l12 12M6 18 18 6' : 'M12 5v14M5 12h14'} />
              </svg>
              {novaAberta ? 'Fechar' : 'Nova'}
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
            <Card key={c.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate font-display font-semibold uppercase tracking-[0.02em]">{c.nome}</p>
                <p className="text-xs text-tinta-faint">
                  {DIAS_SEMANA[c.dia_semana]} · {c.horario_jogo.slice(0, 5)}
                  {c.local ? ` · ${c.local}` : ''}
                </p>
              </div>
              {admin && (
                <Button variante="secundario" onClick={() => gerar.mutate(c.id)} disabled={gerar.isPending}>
                  {gerar.isPending ? <Spinner /> : 'Gerar'}
                </Button>
              )}
            </Card>
          ))}
          {configs.data?.length === 0 && (
            <p className="text-sm text-tinta-faint">Nenhuma configuração ainda.</p>
          )}
        </div>
      </section>

      <section>
        <p className="eyebrow mb-2">Próximas e recentes</p>
        <div className="flex flex-col gap-2">
          {peladas.data?.map((p) => (
            <Link key={p.id} to={`/peladas/${p.id}`} className="block">
              <Card className="flex items-center gap-3 py-3 transition-shadow hover:shadow-pop">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-campo-100 text-center">
                  <span className="placar-num text-base leading-none text-campo-700">
                    {new Date(p.data.slice(0, 10) + 'T12:00:00').getDate()}
                  </span>
                  <span className="font-display text-[0.55rem] font-semibold uppercase leading-none text-campo-600">
                    {new Date(p.data.slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}
                  </span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium capitalize">
                    {new Date(p.data.slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long' })}
                    {p.hora ? ` · ${p.hora.slice(0, 5)}` : ''}
                  </p>
                  <p className="text-xs text-tinta-faint">{p.local ?? 'Local a definir'}</p>
                </div>
                <Chip tom={p.status === 'aberta' ? 'confirmado' : 'neutro'}>{p.status}</Chip>
              </Card>
            </Link>
          ))}
          {peladas.data?.length === 0 && <p className="text-sm text-tinta-faint">Nenhuma pelada ainda.</p>}
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
