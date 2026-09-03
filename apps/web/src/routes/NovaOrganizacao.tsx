import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { criarOrganizacaoSchema } from '@resenha05/shared';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useOrg } from '../lib/org';
import { Aviso, Button, Card, Field, Input, Spinner } from '../components/ui';

export function NovaOrganizacao() {
  const { recarregar } = useAuth();
  const { setOrgId } = useOrg();
  const nav = useNavigate();
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = criarOrganizacaoSchema.safeParse({ nome });
    if (!parsed.success) {
      setErro(parsed.error.issues[0]?.message ?? 'Dê um nome válido.');
      return;
    }
    setEnviando(true);
    setErro(null);
    try {
      const org = await api<{ id: string }>('/organizacoes', { method: 'POST', json: parsed.data });
      await recarregar();
      setOrgId(org.id);
      nav('/peladas', { replace: true });
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível criar a organização.');
      setEnviando(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Criar organização</h1>
        <p className="text-sm text-tinta-soft">
          Você vira o administrador principal. Depois configura as peladas e convida os jogadores.
        </p>
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <Card>
          <Field label="Nome da organização" dica="Ex.: Pelada dos Amigos, Fut de Quinta">
            <Input value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
          </Field>
        </Card>
        <Button type="submit" disabled={enviando}>
          {enviando ? <Spinner /> : 'Criar'}
        </Button>
      </form>
    </div>
  );
}
