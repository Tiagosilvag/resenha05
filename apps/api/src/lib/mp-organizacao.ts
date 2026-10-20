import { db } from '../db/index.js';
import { env } from '../env.js';
import { cifrarTokenOuErro, decifrarToken } from './cripto.js';
import { renovarToken } from './mercadopago-oauth.js';

const MARGEM_DE_RENOVACAO_MS = 7 * 24 * 60 * 60 * 1000;

export function oauthConfigurado(): boolean {
  return Boolean(env.MP_OAUTH_CLIENT_ID && env.MP_OAUTH_CLIENT_SECRET);
}

export interface TokenDaOrganizacao {
  token: string;
  /** `oauth`: ligada pelo botão "Conectar"; `token`: Access Token colado à mão (jeito antigo). */
  origem: 'oauth' | 'token';
}

/**
 * Access Token com que cobramos em nome da organização (jogador paga direto para ela).
 * Prefere o da conexão OAuth, renovando-o antes de vencer; sem ele, usa o colado à mão.
 */
export async function tokenDaOrganizacao(orgId: string): Promise<TokenDaOrganizacao | null> {
  const o = await db
    .selectFrom('organizacoes')
    .select([
      'mp_oauth_access_cipher',
      'mp_oauth_access_nonce',
      'mp_oauth_refresh_cipher',
      'mp_oauth_refresh_nonce',
      'mp_oauth_expira_em',
      'mp_token_cipher',
      'mp_token_nonce',
    ])
    .where('id', '=', orgId)
    .executeTakeFirst();
  if (!o) return null;

  if (o.mp_oauth_access_cipher && o.mp_oauth_access_nonce) {
    const venceEm = o.mp_oauth_expira_em ? new Date(o.mp_oauth_expira_em).getTime() : null;
    const precisaRenovar = venceEm !== null && venceEm - Date.now() < MARGEM_DE_RENOVACAO_MS;

    if (precisaRenovar && oauthConfigurado() && o.mp_oauth_refresh_cipher && o.mp_oauth_refresh_nonce) {
      try {
        const novo = await renovarToken({
          clientId: env.MP_OAUTH_CLIENT_ID!,
          clientSecret: env.MP_OAUTH_CLIENT_SECRET!,
          refreshToken: decifrarToken(o.mp_oauth_refresh_cipher, o.mp_oauth_refresh_nonce),
        });
        const access = cifrarTokenOuErro(novo.accessToken);
        const refresh = cifrarTokenOuErro(novo.refreshToken);
        await db
          .updateTable('organizacoes')
          .set({
            mp_oauth_access_cipher: access.cipher,
            mp_oauth_access_nonce: access.nonce,
            mp_oauth_refresh_cipher: refresh.cipher,
            mp_oauth_refresh_nonce: refresh.nonce,
            mp_oauth_expira_em: new Date(Date.now() + novo.expiraEmSeg * 1000),
          })
          .where('id', '=', orgId)
          .execute();
        return { token: novo.accessToken, origem: 'oauth' };
      } catch {
        // Falhou renovar: se o atual ainda não venceu, segue com ele; o dono vê "Reconectar" ao vencer.
        if (venceEm !== null && venceEm <= Date.now()) return fallbackColado(o);
      }
    } else if (venceEm !== null && venceEm <= Date.now()) {
      return fallbackColado(o);
    }
    return { token: decifrarToken(o.mp_oauth_access_cipher, o.mp_oauth_access_nonce), origem: 'oauth' };
  }
  return fallbackColado(o);
}

function fallbackColado(o: { mp_token_cipher: Buffer | null; mp_token_nonce: Buffer | null }): TokenDaOrganizacao | null {
  if (!o.mp_token_cipher || !o.mp_token_nonce) return null;
  return { token: decifrarToken(o.mp_token_cipher, o.mp_token_nonce), origem: 'token' };
}
