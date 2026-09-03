/**
 * Cliente HTTP da API. Base:
 *  - dev: `/api` (proxy do Vite para localhost:3000)
 *  - prod: VITE_API_URL (ex.: https://api-resenha05.coffetech.com.br/api),
 *    definida como build arg no Coolify. Cai para `/api` se não houver.
 * Guarda os tokens no localStorage e renova o access token com o refresh.
 */
const BASE = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '');

const CHAVE_ACCESS = 'r5.access';
const CHAVE_REFRESH = 'r5.refresh';

export const tokens = {
  get access() {
    return localStorage.getItem(CHAVE_ACCESS);
  },
  get refresh() {
    return localStorage.getItem(CHAVE_REFRESH);
  },
  set({ accessToken, refreshToken }: { accessToken: string; refreshToken: string }) {
    localStorage.setItem(CHAVE_ACCESS, accessToken);
    localStorage.setItem(CHAVE_REFRESH, refreshToken);
  },
  limpar() {
    localStorage.removeItem(CHAVE_ACCESS);
    localStorage.removeItem(CHAVE_REFRESH);
  },
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

let renovando: Promise<boolean> | null = null;

async function renovar(): Promise<boolean> {
  if (!tokens.refresh) return false;
  renovando ??= (async () => {
    try {
      const r = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: tokens.refresh }),
      });
      if (!r.ok) return false;
      const dados = (await r.json()) as { accessToken: string; refreshToken: string };
      tokens.set(dados);
      return true;
    } catch {
      return false;
    } finally {
      renovando = null;
    }
  })();
  return renovando;
}

export async function api<T = unknown>(
  path: string,
  opcoes: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, ...init } = opcoes;
  const headers = new Headers(init.headers);
  if (json !== undefined) {
    headers.set('content-type', 'application/json');
    init.body = JSON.stringify(json);
  }
  if (tokens.access) headers.set('authorization', `Bearer ${tokens.access}`);

  let resp = await fetch(`${BASE}${path}`, { ...init, headers });

  if (resp.status === 401 && tokens.refresh && path !== '/auth/refresh') {
    const ok = await renovar();
    if (ok) {
      headers.set('authorization', `Bearer ${tokens.access}`);
      resp = await fetch(`${BASE}${path}`, { ...init, headers });
    }
  }

  if (resp.status === 204) return undefined as T;

  const corpo = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new ApiError(resp.status, (corpo as { erro?: string }).erro ?? 'Erro inesperado.');
  }
  return corpo as T;
}
