import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { SessaoUsuario } from '@resenha05/shared';
import { api, tokens, ApiError } from './api';

interface RespostaAuth {
  usuario: SessaoUsuario;
  accessToken: string;
  refreshToken: string;
}

interface AuthCtx {
  usuario: SessaoUsuario | null;
  carregando: boolean;
  entrar: (telefone: string, senha: string) => Promise<void>;
  cadastrar: (dados: {
    nome: string;
    telefone: string;
    senha: string;
    timeCoracao?: string | null;
  }) => Promise<void>;
  sair: () => Promise<void>;
  recarregar: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<SessaoUsuario | null>(null);
  const [carregando, setCarregando] = useState(true);

  async function recarregar() {
    if (!tokens.access && !tokens.refresh) {
      setUsuario(null);
      setCarregando(false);
      return;
    }
    try {
      setUsuario(await api<SessaoUsuario>('/auth/eu'));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        tokens.limpar();
        setUsuario(null);
      }
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void recarregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function aplicar(resp: RespostaAuth) {
    tokens.set(resp);
    setUsuario(resp.usuario);
  }

  const valor = useMemo<AuthCtx>(
    () => ({
      usuario,
      carregando,
      async entrar(telefone, senha) {
        await aplicar(await api<RespostaAuth>('/auth/login', { method: 'POST', json: { telefone, senha } }));
      },
      async cadastrar(dados) {
        await aplicar(await api<RespostaAuth>('/auth/cadastro', { method: 'POST', json: dados }));
      },
      async sair() {
        try {
          await api('/auth/logout', { method: 'POST' });
        } catch {
          /* ignora */
        }
        tokens.limpar();
        setUsuario(null);
      },
      recarregar,
    }),
    [usuario, carregando],
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth fora do AuthProvider');
  return c;
}
