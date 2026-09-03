import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatarTelefone } from '@resenha05/shared';
import { useAuth } from '../lib/auth';
import { api, ApiError } from '../lib/api';
import { enviarFoto, FotoIndisponivel } from '../lib/foto';
import { Avatar, Aviso, Button, Card, Field, Input, Spinner } from '../components/ui';

export function Perfil() {
  const { usuario, recarregar, sair } = useAuth();
  const nav = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [nome, setNome] = useState(usuario?.nome ?? '');
  const [timeCoracao, setTimeCoracao] = useState(usuario?.timeCoracao ?? '');
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setSalvando(true);
    setMsg(null);
    try {
      await api('/perfil', {
        method: 'PATCH',
        json: { nome, timeCoracao: timeCoracao || null },
      });
      await recarregar();
      setMsg({ tipo: 'ok', texto: 'Perfil atualizado.' });
    } catch (e) {
      setMsg({ tipo: 'erro', texto: e instanceof ApiError ? e.message : 'Erro ao salvar.' });
    } finally {
      setSalvando(false);
    }
  }

  async function trocarFoto(f: File) {
    setMsg(null);
    try {
      const url = await enviarFoto(f);
      await api('/perfil', { method: 'PATCH', json: { fotoUrl: url } });
      await recarregar();
      setMsg({ tipo: 'ok', texto: 'Foto atualizada.' });
    } catch (e) {
      setMsg({
        tipo: 'erro',
        texto: e instanceof FotoIndisponivel ? 'Envio de foto ainda não configurado.' : 'Falha ao enviar a foto.',
      });
    }
  }

  async function excluirConta() {
    if (!confirm('Excluir sua conta e todos os seus dados? Isso não pode ser desfeito.')) return;
    try {
      await api('/perfil', { method: 'DELETE' });
      await sair();
      nav('/entrar', { replace: true });
    } catch (e) {
      setMsg({ tipo: 'erro', texto: e instanceof ApiError ? e.message : 'Não foi possível excluir.' });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-extrabold tracking-tight">Meu perfil</h1>
      {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}

      <Card>
        <div className="flex items-center gap-4">
          <Avatar src={usuario?.fotoUrl} nome={usuario?.nome} size={64} />
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && trocarFoto(e.target.files[0])}
            />
            <Button variante="secundario" onClick={() => fileRef.current?.click()}>
              Trocar foto
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex flex-col gap-4">
          <Field label="Nome">
            <Input value={nome} onChange={(e) => setNome(e.target.value)} />
          </Field>
          <Field label="Telefone">
            <Input value={formatarTelefone(usuario?.telefone ?? '')} disabled />
          </Field>
          <Field label="Time do coração">
            <Input value={timeCoracao} onChange={(e) => setTimeCoracao(e.target.value)} />
          </Field>
          <Button onClick={salvar} disabled={salvando}>
            {salvando ? <Spinner /> : 'Salvar'}
          </Button>
        </div>
      </Card>

      <Card>
        <Button variante="fantasma" className="w-full" onClick={() => sair().then(() => nav('/entrar'))}>
          Sair da conta
        </Button>
        <button
          onClick={excluirConta}
          className="mt-2 w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50"
        >
          Excluir conta e dados (LGPD)
        </button>
      </Card>
    </div>
  );
}
