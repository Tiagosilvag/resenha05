import { useState, type FormEvent } from 'react';
import { definirSenhaSchema } from '@resenha05/shared';
import { useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';
import { Aviso, Button, Field, Input, Spinner } from '../components/ui';
import { Logo } from '../components/Logo';

/**
 * Tela única de quem entrou com a senha provisória: o app não deixa usar mais
 * nada até a pessoa definir a própria senha.
 */
export function DefinirSenha() {
  const { usuario, definirSenha, sair } = useAuth();
  const [senha, setSenha] = useState('');
  const [repetir, setRepetir] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    const parsed = definirSenhaSchema.safeParse({ senhaNova: senha });
    if (!parsed.success) {
      setErro(parsed.error.issues[0]?.message ?? 'Confira a senha.');
      return;
    }
    if (senha !== repetir) {
      setErro('As duas senhas precisam ser iguais.');
      return;
    }
    setEnviando(true);
    try {
      await definirSenha(parsed.data.senhaNova);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível salvar a senha.');
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-col items-center bg-noite bg-brasao px-6 pb-14 pt-[calc(env(safe-area-inset-top)+3rem)] text-center text-white">
        <Logo size={92} />
        <h1 className="mt-3 font-display text-2xl font-bold uppercase tracking-tight text-campo-300">
          Defina sua senha
        </h1>
      </header>

      <div className="mx-auto -mt-9 w-full max-w-sm flex-1 px-6 pb-10">
        <form
          onSubmit={onSubmit}
          className="flex flex-col gap-4 rounded-2xl border border-tinta-line/60 bg-gramado-raised p-6 shadow-pop"
        >
          <p className="text-sm text-tinta-soft">
            {usuario?.nome ? `${usuario.nome.split(' ')[0]}, ` : ''}você entrou com a senha provisória. Crie uma senha só
            sua para continuar.
          </p>
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          <Field label="Nova senha" dica="Mínimo 8 caracteres.">
            <Input
              type="password"
              autoComplete="new-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
            />
          </Field>
          <Field label="Repita a nova senha">
            <Input
              type="password"
              autoComplete="new-password"
              value={repetir}
              onChange={(e) => setRepetir(e.target.value)}
              required
            />
          </Field>
          <Button type="submit" disabled={enviando}>
            {enviando ? <Spinner /> : 'Salvar senha'}
          </Button>
        </form>

        <button
          type="button"
          onClick={() => void sair()}
          className="mt-6 block w-full text-center font-display text-sm font-semibold uppercase tracking-[0.03em] text-tinta-soft"
        >
          Sair
        </button>
      </div>
    </div>
  );
}
