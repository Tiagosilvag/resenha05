import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatarTelefone } from '@resenha05/shared';
import { useAuth } from '../lib/auth';
import { useOrg } from '../lib/org';
import { api, ApiError } from '../lib/api';
import { enviarFoto } from '../lib/foto';
import { Avatar, Aviso, Button, Card, Eyebrow, Field, Input, Spinner } from '../components/ui';
import { Cartinha } from '../components/Cartinha';

export function Perfil() {
  const { usuario, recarregar, sair } = useAuth();
  const { orgId } = useOrg();
  const nav = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [nome, setNome] = useState(usuario?.nome ?? '');
  const [timeCoracao, setTimeCoracao] = useState(usuario?.timeCoracao ?? '');
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [fotoEtapa, setFotoEtapa] = useState<string | null>(null);
  const [recortar, setRecortar] = useState(true);

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
      setFotoEtapa(recortar ? 'Recortando…' : 'Enviando…');
      const { recortada } = await enviarFoto(f, { recortar });
      setFotoEtapa(null);
      await recarregar();
      setMsg({
        tipo: 'ok',
        texto:
          recortar && !recortada
            ? 'Foto atualizada — não deu pra recortar o fundo desta imagem.'
            : 'Foto atualizada.',
      });
    } catch (e) {
      setFotoEtapa(null);
      setMsg({ tipo: 'erro', texto: e instanceof ApiError ? e.message : 'Falha ao enviar a foto.' });
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
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-2xl font-bold tracking-tight">Meu perfil</h1>
      {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}

      <Card className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="relative rounded-full transition-transform active:scale-95"
        >
          <Avatar
            src={usuario?.fotoUrl}
            nome={usuario?.nome}
            size={64}
            recortada={usuario?.fotoRecortada}
          />
          <span className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full bg-campo-600 text-white ring-2 ring-white">
            {fotoEtapa ? (
              <Spinner className="h-3 w-3" />
            ) : (
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 7h3l2-2h6l2 2h3v12H4z" /><circle cx="12" cy="13" r="3.2" />
              </svg>
            )}
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <p className="font-display font-semibold uppercase tracking-[0.02em]">{usuario?.nome}</p>
          <p className="text-sm text-tinta-faint">
            {fotoEtapa ?? formatarTelefone(usuario?.telefone ?? '')}
          </p>
          <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-tinta-soft">
            <input
              type="checkbox"
              checked={recortar}
              onChange={(e) => setRecortar(e.target.checked)}
              className="h-4 w-4 shrink-0 accent-campo-600"
            />
            Recortar o fundo (estilo card)
          </label>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && trocarFoto(e.target.files[0])}
        />
      </Card>

      {usuario && orgId && (
        <section>
          <Eyebrow>Minha cartinha</Eyebrow>
          <Cartinha profileId={usuario.id} orgId={orgId} nome={usuario.nome} baixavel />
        </section>
      )}

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

      <Card className="flex flex-col gap-1">
        <Button variante="fantasma" className="w-full" onClick={() => sair().then(() => nav('/entrar'))}>
          Sair da conta
        </Button>
        <button
          onClick={excluirConta}
          className="w-full rounded-xl px-4 py-2.5 font-display text-sm font-semibold uppercase tracking-[0.03em] text-barro-600 hover:bg-barro-100/50"
        >
          Excluir conta e dados (LGPD)
        </button>
      </Card>
    </div>
  );
}
