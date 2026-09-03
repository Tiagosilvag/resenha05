import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { perfilExtraSchema } from '@resenha05/shared';
import { api, ApiError } from '../lib/api';
import { Aviso, Button, Card, Field, Input, Select, Spinner } from '../components/ui';

interface ExtraResp {
  progresso: number;
  extra: {
    dataNascimento: string | null;
    email: string | null;
    cidade: string | null;
    posicao: string | null;
    pePreferido: string | null;
    tamanhoCamisa: string | null;
    aceiteMarketing: boolean;
  } | null;
}

const vazio = {
  dataNascimento: '',
  email: '',
  cidade: '',
  posicao: '',
  pePreferido: '',
  tamanhoCamisa: '',
  aceiteMarketing: false,
};

export function CompletarCadastro() {
  const { data, refetch } = useQuery({ queryKey: ['perfil-extra'], queryFn: () => api<ExtraResp>('/perfil/extra') });
  const [form, setForm] = useState(vazio);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (data?.extra) {
      setForm({
        dataNascimento: data.extra.dataNascimento ?? '',
        email: data.extra.email ?? '',
        cidade: data.extra.cidade ?? '',
        posicao: data.extra.posicao ?? '',
        pePreferido: data.extra.pePreferido ?? '',
        tamanhoCamisa: data.extra.tamanhoCamisa ?? '',
        aceiteMarketing: data.extra.aceiteMarketing,
      });
    }
  }, [data]);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function salvar() {
    setMsg(null);
    const payload = perfilExtraSchema.safeParse({
      dataNascimento: form.dataNascimento || null,
      email: form.email || null,
      cidade: form.cidade || null,
      posicao: form.posicao || null,
      pePreferido: form.pePreferido || null,
      tamanhoCamisa: form.tamanhoCamisa || null,
      aceiteMarketing: form.aceiteMarketing,
    });
    if (!payload.success) {
      setMsg({ tipo: 'erro', texto: payload.error.issues[0]?.message ?? 'Confira os dados.' });
      return;
    }
    setSalvando(true);
    try {
      await api('/perfil/extra', { method: 'PUT', json: payload.data });
      await refetch();
      setMsg({ tipo: 'ok', texto: 'Dados salvos.' });
    } catch (e) {
      setMsg({ tipo: 'erro', texto: e instanceof ApiError ? e.message : 'Erro ao salvar.' });
    } finally {
      setSalvando(false);
    }
  }

  if (!data) return <Spinner className="h-6 w-6 text-campo-600" />;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Complete seu cadastro</h1>
        <p className="text-sm text-tinta-soft">Tudo opcional. Nada aqui bloqueia o uso do app.</p>
      </div>
      <div className="flex items-center gap-3">
        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-campo-100">
          <div className="h-full rounded-full bg-campo-600 transition-[width] duration-500" style={{ width: `${data.progresso}%` }} />
        </div>
        <span className="placar-num text-sm text-campo-700">{data.progresso}%</span>
      </div>
      {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}

      <Card>
        <div className="flex flex-col gap-4">
          <Field label="Data de nascimento">
            <Input type="date" value={form.dataNascimento} onChange={(e) => set('dataNascimento', e.target.value)} />
          </Field>
          <Field label="E-mail">
            <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
          </Field>
          <Field label="Cidade">
            <Input value={form.cidade} onChange={(e) => set('cidade', e.target.value)} />
          </Field>
          <Field label="Posição em campo">
            <Select value={form.posicao} onChange={(e) => set('posicao', e.target.value)}>
              <option value="">—</option>
              <option value="goleiro">Goleiro</option>
              <option value="zagueiro">Zagueiro</option>
              <option value="lateral">Lateral</option>
              <option value="meio">Meio</option>
              <option value="atacante">Atacante</option>
            </Select>
          </Field>
          <Field label="Pé preferido">
            <Select value={form.pePreferido} onChange={(e) => set('pePreferido', e.target.value)}>
              <option value="">—</option>
              <option value="direito">Direito</option>
              <option value="esquerdo">Esquerdo</option>
              <option value="ambidestro">Ambidestro</option>
            </Select>
          </Field>
          <Field label="Tamanho de camisa">
            <Select value={form.tamanhoCamisa} onChange={(e) => set('tamanhoCamisa', e.target.value)}>
              <option value="">—</option>
              {['PP', 'P', 'M', 'G', 'GG', 'XG'].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <Card className="bg-campo-50">
        <label className="flex items-start gap-3 text-sm text-tinta-soft">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-campo-600"
            checked={form.aceiteMarketing}
            onChange={(e) => set('aceiteMarketing', e.target.checked)}
          />
          <span>
            Aceito receber ofertas e campanhas do Resenha05 (uniformes, eventos). Você pode
            desmarcar quando quiser — seus dados ficam salvos de qualquer forma.
          </span>
        </label>
      </Card>

      <Button onClick={salvar} disabled={salvando}>
        {salvando ? <Spinner /> : 'Salvar'}
      </Button>
    </div>
  );
}
