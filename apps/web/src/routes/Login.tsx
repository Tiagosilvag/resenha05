import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { formatarTelefone, normalizarTelefone } from '@resenha05/shared';
import { useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';
import { Button, Field, Input, Aviso, Spinner } from '../components/ui';
import { Logo } from '../components/Logo';

export function Login() {
  const { entrar } = useAuth();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { de?: string } };
  const [telefone, setTelefone] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await entrar(normalizarTelefone(telefone), senha);
      nav(loc.state?.de ?? '/', { replace: true });
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível entrar.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <Logo size={56} />
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Resenha05</h1>
          <p className="text-sm text-black/55">Organize a pelada do início ao fim.</p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <Field label="Telefone (WhatsApp)">
          <Input
            inputMode="tel"
            autoComplete="tel"
            placeholder="(11) 91234-5678"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            onBlur={() => telefone && setTelefone(formatarTelefone(normalizarTelefone(telefone)))}
            required
          />
        </Field>
        <Field label="Senha">
          <Input
            type="password"
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
          />
        </Field>
        <Button type="submit" disabled={enviando}>
          {enviando ? <Spinner /> : 'Entrar'}
        </Button>
      </form>

      <p className="text-center text-sm text-black/55">
        Ainda não tem conta?{' '}
        <Link to="/cadastro" className="font-semibold text-campo-700">
          Criar cadastro
        </Link>
      </p>
    </div>
  );
}
