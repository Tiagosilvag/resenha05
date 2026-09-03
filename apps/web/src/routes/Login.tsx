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
    <div className="flex min-h-screen flex-col">
      <header className="safe-top flex flex-col items-center bg-campo-700 bg-gramada px-6 pb-16 pt-16 text-center text-white">
        <Logo size={60} aro />
        <h1 className="mt-4 font-display text-3xl font-bold uppercase tracking-tight text-white">Resenha05</h1>
        <p className="mt-1 text-sm text-white/80">A pelada organizada do início ao fim.</p>
      </header>

      <div className="mx-auto -mt-10 w-full max-w-sm flex-1 px-6">
        <form
          onSubmit={onSubmit}
          className="animate-fade-up flex flex-col gap-4 rounded-2xl border border-tinta-line/60 bg-gramado-raised p-6 shadow-pop"
        >
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
          <Button type="submit" disabled={enviando} className="mt-1">
            {enviando ? <Spinner /> : 'Entrar'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-tinta-soft">
          Ainda não tem conta?{' '}
          <Link to="/cadastro" className="font-display font-semibold uppercase tracking-[0.03em] text-campo-700">
            Criar cadastro
          </Link>
        </p>
      </div>
    </div>
  );
}
