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
        setAviso(
          e instanceof FotoIndisponivel
            ? 'Conta criada. O envio de foto ainda não está ativo — adicione no Perfil depois.'
            : 'Conta criada, mas a foto não subiu. Tente de novo no Perfil.',
        );
      }
      await recarregar();
      nav('/', { replace: true });
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível concluir o cadastro.');
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="safe-top flex flex-col items-center bg-campo-700 bg-gramada px-6 pb-14 pt-12 text-center text-white">
        <Logo size={46} aro />
        <h1 className="mt-3 font-display text-2xl font-bold uppercase tracking-tight text-white">Criar cadastro</h1>
      </header>

      <div className="mx-auto -mt-9 w-full max-w-sm flex-1 px-6 pb-10">
        <form
          onSubmit={onSubmit}
          className="animate-fade-up flex flex-col gap-4 rounded-2xl border border-tinta-line/60 bg-gramado-raised p-6 shadow-pop"
        >
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          {aviso && <Aviso tipo="ok">{aviso}</Aviso>}

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="relative rounded-full transition-transform active:scale-95"
            >
              <Avatar src={previa} nome={nome} size={68} />
              <span className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full bg-campo-600 text-white ring-2 ring-white">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </span>
            </button>
            <div className="text-sm">
              <p className="font-semibold text-tinta">Foto de perfil</p>
              <p className="text-xs text-tinta-faint">Obrigatória. JPEG, PNG ou WebP.</p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="user"
              className="hidden"
              onChange={(e) => escolherFoto(e.target.files?.[0] ?? null)}
            />
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

          <Button type="submit" disabled={enviando} className="mt-1">
            {enviando ? <Spinner /> : 'Concluir cadastro'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-tinta-soft">
          Já tem conta?{' '}
          <Link to="/entrar" className="font-display font-semibold uppercase tracking-[0.03em] text-campo-700">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}
