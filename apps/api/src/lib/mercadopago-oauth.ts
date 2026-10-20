import { createHash, randomBytes } from 'node:crypto';
import { mpApi } from './mercadopago-base.js';
import { erroDoMp } from './mercadopago-preapproval.js';

/** Onde o dono entra na conta dele e autoriza a plataforma (OAuth do Mercado Pago). */
export function urlDeAutorizacao(e: {
  clientId: string;
  redirectUri: string;
  estado: string;
  codeChallenge?: string;
  base?: string;
}): string {
  const u = new URL(e.base ?? 'https://auth.mercadopago.com/authorization');
  u.searchParams.set('client_id', e.clientId);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('platform_id', 'mp');
  u.searchParams.set('state', e.estado);
  u.searchParams.set('redirect_uri', e.redirectUri);
  if (e.codeChallenge) {
    u.searchParams.set('code_challenge', e.codeChallenge);
    u.searchParams.set('code_challenge_method', 'S256');
  }
  return u.toString();
}

/** PKCE: o verificador fica só no servidor e o desafio (hash) vai na URL de autorização. */
export function gerarPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export interface TokensOAuth {
  accessToken: string;
  refreshToken: string;
  userId: string;
  /** Em quantos segundos o access token vence (a documentação indica 180 dias). */
  expiraEmSeg: number;
  publicKey: string | null;
}

async function pedirToken(corpo: Record<string, string>, fetchFn: typeof fetch): Promise<TokensOAuth> {
  const resp = await fetchFn(`${mpApi()}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(corpo),
  });
  if (!resp.ok) throw await erroDoMp(resp);
  const j = (await resp.json()) as {
    access_token: string;
    refresh_token: string;
    user_id: number | string;
    expires_in?: number;
    public_key?: string;
  };
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    userId: String(j.user_id),
    expiraEmSeg: j.expires_in ?? 15552000,
    publicKey: j.public_key ?? null,
  };
}

/** Troca o código que o Mercado Pago devolveu (vale 10 min, uma vez) pelos tokens do vendedor. */
export function trocarCodigo(
  e: { clientId: string; clientSecret: string; code: string; redirectUri: string; codeVerifier?: string; teste?: boolean },
  fetchFn: typeof fetch = fetch,
): Promise<TokensOAuth> {
  return pedirToken(
    {
      client_id: e.clientId,
      client_secret: e.clientSecret,
      code: e.code,
      grant_type: 'authorization_code',
      redirect_uri: e.redirectUri,
      ...(e.codeVerifier ? { code_verifier: e.codeVerifier } : {}),
      ...(e.teste ? { test_token: 'true' } : {}),
    },
    fetchFn,
  );
}

/** Renova o token sem o dono entrar de novo; vem um refresh_token novo, que precisa ser guardado. */
export function renovarToken(
  e: { clientId: string; clientSecret: string; refreshToken: string },
  fetchFn: typeof fetch = fetch,
): Promise<TokensOAuth> {
  return pedirToken(
    {
      client_id: e.clientId,
      client_secret: e.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: e.refreshToken,
    },
    fetchFn,
  );
}
