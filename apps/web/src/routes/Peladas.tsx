import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DIAS_SEMANA, criarConfiguracaoSchema } from '@resenha05/shared';
import { api, ApiError } from '../lib/api';
import { useOrg } from '../lib/org';
import { formatarReais } from '../lib/dinheiro';
import { Aviso, Button, Card, Chip, Field, Input, Select, Spinner } from '../components/ui';

interface Config {
  id: string;
  nome: string;
  dia_semana: number;
  horario_jogo: string;
  horario_lista: string;
  local: string | null;
  valor_padrao: string | null;
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
  const { orgId, org, admin } = useOrg();
  const souDono = org?.papel === 'admin_principal';
  const qc = useQueryClient();
  const [erro, setErro] = useState<string | null>(null);
  const [novaAberta, setNovaAberta] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);

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

  const excluirConfig = useMutation({
    mutationFn: (configId: string) => api(`/configuracoes/${configId}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['configs', orgId] });
      setErro(null);
    },
    onError: (e) =>
      setErro(e instanceof ApiError ? e.message : 'Não foi possível excluir a configuração.'),
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
              onClick={() => {
                setEditandoId(null);
                setNovaAberta((v) => !v);
              }}
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
            souDono={souDono}
            onCriada={() => {
              setNovaAberta(false);
              configs.refetch();
            }}
          />
        )}

        <div className="mt-2 flex flex-col gap-2">
          {configs.data?.map((c) =>
            editandoId === c.id ? (
              <EditarConfig
                key={c.id}
                config={c}
                souDono={souDono}
                onSalva={() => {
                  setEditandoId(null);
                  configs.refetch();
                }}
                onCancelar={() => setEditandoId(null)}
              />
            ) : (
              <Card key={c.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate font-display font-semibold uppercase tracking-[0.02em]">{c.nome}</p>
                  <p className="text-xs text-tinta-faint">
                    {DIAS_SEMANA[c.dia_semana]} · {c.horario_jogo.slice(0, 5)}
                    {c.local ? ` · ${c.local}` : ''}
                    {c.valor_padrao != null ? ` · ${formatarReais(c.valor_padrao)}` : ''}
                  </p>
                </div>
                {admin && (
                  <div className="flex shrink-0 items-center gap-2">
                    <Button variante="secundario" onClick={() => gerar.mutate(c.id)} disabled={gerar.isPending}>
                      {gerar.isPending ? <Spinner /> : 'Gerar'}
                    </Button>
                    <button
                      type="button"
                      aria-label={`Editar a configuração ${c.nome}`}
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-barro-100 text-tinta-soft transition-colors hover:bg-barro-100/50"
                      onClick={() => {
                        setNovaAberta(false);
                        setEditandoId(c.id);
                      }}
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      aria-label={`Excluir a configuração ${c.nome}`}
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-barro-100 text-barro-600 transition-colors hover:bg-barro-100/50"
                      onClick={() => {
                        if (!confirm(`Excluir a configuração "${c.nome}"? As peladas já geradas continuam.`)) return;
                        excluirConfig.mutate(c.id);
                      }}
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 7h16M9 7V5h6v2m-9 0 1 13h10l1-13" />
                      </svg>
                    </button>
                  </div>
                )}
              </Card>
            ),
          )}
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
                  <p className="font-medium first-letter:uppercase">
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

/** Converte o texto digitado ("10", "10,50") em número de reais, ou null se vazio. Lança se inválido. */
function valorDoCampo(texto: string): number | null {
  const limpo = texto.trim();
  if (!limpo) return null;
  const n = Number(limpo.replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) throw new Error('Valor inválido.');
  return n;
}

function CampoValor({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  return (
    <Field label="Valor da pelada (opcional)">
      <Input inputMode="decimal" placeholder="0,00" value={valor} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

function NovaConfig({ orgId, souDono, onCriada }: { orgId: string; souDono: boolean; onCriada: () => void }) {
  const [form, setForm] = useState({
    nome: '',
    diaSemana: 2,
    horarioJogo: '20:00',
    horarioLista: '08:00',
    local: '',
    valor: '',
  });
  const [erro, setErro] = useState<string | null>(null);
  const criar = useMutation({
    mutationFn: () => {
      const valorPadrao = souDono ? valorDoCampo(form.valor) : undefined;
      const dados = criarConfiguracaoSchema.parse({
        nome: form.nome,
        diaSemana: Number(form.diaSemana),
        horarioJogo: form.horarioJogo,
        horarioLista: form.horarioLista,
        local: form.local || null,
        ...(valorPadrao !== undefined ? { valorPadrao } : {}),
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
        {souDono ? (
          <CampoValor valor={form.valor} onChange={(v) => setForm({ ...form, valor: v })} />
        ) : (
          <p className="text-xs text-tinta-faint">Só o admin principal define o valor cobrado dos jogadores.</p>
        )}
        <Button onClick={() => criar.mutate()} disabled={criar.isPending}>
          {criar.isPending ? <Spinner /> : 'Criar configuração'}
        </Button>
      </div>
    </Card>
  );
}

function EditarConfig({
  config,
  souDono,
  onSalva,
  onCancelar,
}: {
  config: Config;
  souDono: boolean;
  onSalva: () => void;
  onCancelar: () => void;
}) {
  const [form, setForm] = useState({
    nome: config.nome,
    diaSemana: config.dia_semana,
    horarioJogo: config.horario_jogo.slice(0, 5),
    horarioLista: config.horario_lista.slice(0, 5),
    local: config.local ?? '',
    valor: config.valor_padrao != null ? String(config.valor_padrao) : '',
  });
  const [erro, setErro] = useState<string | null>(null);
  const salvar = useMutation({
    mutationFn: () => {
      const valorPadrao = souDono ? valorDoCampo(form.valor) : undefined;
      const dados = criarConfiguracaoSchema.partial().parse({
        nome: form.nome,
        diaSemana: Number(form.diaSemana),
        horarioJogo: form.horarioJogo,
        horarioLista: form.horarioLista,
        local: form.local || null,
        ...(valorPadrao !== undefined ? { valorPadrao } : {}),
      });
      return api(`/configuracoes/${config.id}`, { method: 'PATCH', json: dados });
    },
    onSuccess: onSalva,
    onError: (e) => setErro(e instanceof ApiError ? e.message : 'Confira os campos.'),
  });

  return (
    <Card className="mt-2">
      <div className="flex flex-col gap-3">
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <Field label="Nome">
          <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
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
        {souDono ? (
          <CampoValor valor={form.valor} onChange={(v) => setForm({ ...form, valor: v })} />
        ) : (
          <p className="text-xs text-tinta-faint">Só o admin principal define o valor cobrado dos jogadores.</p>
        )}
        <div className="flex gap-2">
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
            {salvar.isPending ? <Spinner /> : 'Salvar'}
          </Button>
          <Button variante="secundario" onClick={onCancelar} disabled={salvar.isPending}>
            Cancelar
          </Button>
        </div>
      </div>
    </Card>
  );
}
