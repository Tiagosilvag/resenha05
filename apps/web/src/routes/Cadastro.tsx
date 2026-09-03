import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { cadastroSchema, formatarTelefone, normalizarTelefone } from '@resenha05/shared';
import { useAuth } from '../lib/auth';
import { api, ApiError } from '../lib/api';
import { enviarFoto, FotoIndisponivel } from '../lib/foto';
import { Button, Field, Input, Aviso, Spinner, Avatar } from '../components/ui';
import { Logo } from '../components/Logo';

const TIMES = [
  'Flamengo', 'Corinthians', 'Palmeiras', 'São Paulo', 'Vasco', 'Grêmio',
  'Internacional', 'Cruzeiro', 'Atlético-MG', 'Santos', 'Botafogo', 'Fluminense',
  'Bahia', 'Sport', 'Athletico-PR', 'Fortaleza', 'Ceará', 'Goiás',
];

export function Cadastro() {
  const { cadastrar, recarregar } = useAuth();
  const nav = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [senha, setSenha] = useState('');
  const [timeCoracao, setTimeCoracao] = useState('');
  const [foto, setFoto] = useState<File | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  function escolherFoto(f: File | null) {
    setFoto(f);
    setPrevia(f ? URL.createObjectURL(f) : null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setAviso(null);

    const parsed = cadastroSchema.safeParse({
      nome,
      telefone,
      senha,
      timeCoracao: timeCoracao || null,
    });
    if (!parsed.success) {
      setErro(parsed.error.issues[0]?.message ?? 'Confira os dados.');
      return;
    }
    if (!foto) {
      setErro('A foto é obrigatória para o cadastro.');
      return;
    }

    setEnviando(true);
    try {
      await cadastrar(parsed.data);
      try {
        const fotoUrl = await enviarFoto(foto);
        await api('/perfil', { method: 'PATCH', json: { fotoUrl } });
      } catch (e) {
        if (e instanceof FotoIndisponivel) {
          setAviso('Conta criada. O envio de foto ainda não está ativo — adicione no Perfil depois.');
        } else {
          setAviso('Conta criada, mas a foto não subiu. Tente de novo no Perfil.');
        }
      }
      await recarregar();
      nav('/', { replace: true });
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível concluir o cadastro.');
      setEnviando(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6 py-10">
      <div className="flex flex-col items-center gap-2 text-center">
        <Logo size={48} />
        <h1 className="text-xl font-extrabold tracking-tight">Criar cadastro</h1>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        {aviso && <Aviso tipo="ok">{aviso}</Aviso>}

        <div className="flex items-center gap-4">
          <Avatar src={previa} nome={nome} size={64} />
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="user"
              className="hidden"
              onChange={(e) => escolherFoto(e.target.files?.[0] ?? null)}
            />
            <Button type="button" variante="secundario" onClick={() => fileRef.current?.click()}>
              {foto ? 'Trocar foto' : 'Adicionar foto'}
            </Button>
            <p className="mt-1 text-xs text-black/50">Obrigatória. JPEG, PNG ou WebP.</p>
          </div>
        </div>

        <Field label="Nome">
          <Input value={nome} onChange={(e) => setNome(e.target.value)} required />
        </Field>
        <Field label="Telefone (WhatsApp)" dica="Só um número por pessoa.">
          <Input
            inputMode="tel"
            placeholder="(11) 91234-5678"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            onBlur={() => telefone && setTelefone(formatarTelefone(normalizarTelefone(telefone)))}
            required
          />
        </Field>
        <Field label="Senha" dica="Mínimo 8 caracteres.">
          <Input type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
        </Field>
        <Field label="Time do coração (opcional)">
          <Input list="times" value={timeCoracao} onChange={(e) => setTimeCoracao(e.target.value)} placeholder="Ex.: Flamengo" />
          <datalist id="times">
            {TIMES.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>

        <Button type="submit" disabled={enviando}>
          {enviando ? <Spinner /> : 'Concluir cadastro'}
        </Button>
      </form>

      <p className="text-center text-sm text-black/55">
        Já tem conta?{' '}
        <Link to="/entrar" className="font-semibold text-campo-700">
          Entrar
        </Link>
      </p>
    </div>
  );
}
