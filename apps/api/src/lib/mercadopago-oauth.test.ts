import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { gerarPkce, renovarToken, trocarCodigo, urlDeAutorizacao } from './mercadopago-oauth.js';

function respostaFalsa(corpo: unknown, status = 200) {
  const chamadas: { url: string; corpo: any }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    chamadas.push({ url, corpo: JSON.parse(String(init.body)) });
    return { ok: status < 400, status, json: async () => corpo };
  }) as unknown as typeof fetch;
  return { fn, chamadas };
}

describe('urlDeAutorizacao', () => {
  it('monta a URL com cliente, código, estado e retorno', () => {
    const u = new URL(
      urlDeAutorizacao({ clientId: '123', redirectUri: 'https://app/api/oauth/mercadopago/callback', estado: 'abc' }),
    );
    expect(u.origin + u.pathname).toBe('https://auth.mercadopago.com/authorization');
    expect(u.searchParams.get('client_id')).toBe('123');
    expect(u.searchParams.get('response_type')).toBe('code');
    expect(u.searchParams.get('platform_id')).toBe('mp');
    expect(u.searchParams.get('state')).toBe('abc');
    expect(u.searchParams.get('redirect_uri')).toBe('https://app/api/oauth/mercadopago/callback');
    expect(u.searchParams.get('code_challenge')).toBeNull();
  });
  it('com PKCE, leva o desafio e o método S256', () => {
    const u = new URL(urlDeAutorizacao({ clientId: '1', redirectUri: 'https://a/b', estado: 's', codeChallenge: 'xyz' }));
    expect(u.searchParams.get('code_challenge')).toBe('xyz');
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
  });
});

describe('gerarPkce', () => {
  it('o desafio é o SHA-256 do verificador em base64url', () => {
    const { verifier, challenge } = gerarPkce();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'));
    expect(gerarPkce().verifier).not.toBe(verifier);
  });
});

describe('trocarCodigo / renovarToken', () => {
  const resposta = {
    access_token: 'APP_USR-novo',
    refresh_token: 'TG-novo',
    user_id: 555,
    expires_in: 15552000,
    public_key: 'APP_USR-pk',
    scope: 'read write offline_access',
  };

  it('troca o código pelos tokens, mandando tudo no corpo (nunca na URL)', async () => {
    const { fn, chamadas } = respostaFalsa(resposta);
    const t = await trocarCodigo(
      { clientId: '1', clientSecret: 'seg', code: 'codigo', redirectUri: 'https://a/cb', codeVerifier: 'ver' },
      fn,
    );
    expect(t).toEqual({
      accessToken: 'APP_USR-novo',
      refreshToken: 'TG-novo',
      userId: '555',
      expiraEmSeg: 15552000,
      publicKey: 'APP_USR-pk',
    });
    expect(chamadas[0]!.url.endsWith('/oauth/token')).toBe(true);
    expect(chamadas[0]!.url.includes('?')).toBe(false);
    expect(chamadas[0]!.corpo).toMatchObject({
      grant_type: 'authorization_code',
      code: 'codigo',
      redirect_uri: 'https://a/cb',
      code_verifier: 'ver',
      client_secret: 'seg',
    });
  });

  it('renova com o refresh_token', async () => {
    const { fn, chamadas } = respostaFalsa(resposta);
    const t = await renovarToken({ clientId: '1', clientSecret: 'seg', refreshToken: 'TG-velho' }, fn);
    expect(t.refreshToken).toBe('TG-novo');
    expect(chamadas[0]!.corpo).toMatchObject({ grant_type: 'refresh_token', refresh_token: 'TG-velho' });
    expect(chamadas[0]!.corpo.code).toBeUndefined();
  });

  it('erro do Mercado Pago (código vencido ou usado) vira exceção com o status', async () => {
    const { fn } = respostaFalsa({ message: 'invalid_grant' }, 400);
    await expect(
      trocarCodigo({ clientId: '1', clientSecret: 's', code: 'c', redirectUri: 'u' }, fn),
    ).rejects.toMatchObject({ status: 400, message: 'invalid_grant' });
  });
});
