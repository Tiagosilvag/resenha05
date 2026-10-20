// Mercado Pago de mentira (só para teste local): /users/me, /checkout/preferences,
// /v1/payments/:id e /oauth/token
import http from 'node:http';

const pagamentos = new Map();
const preferencias = [];
const chamadasOauth = [];

http
  .createServer((req, res) => {
    let corpo = '';
    req.on('data', (c) => (corpo += c));
    req.on('end', () => {
      const json = (status, obj) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(obj));
      };
      const url = new URL(req.url, 'http://x');
      if (req.method === 'GET' && url.pathname === '/users/me') {
        return json(200, { id: 1001, nickname: 'LOJA_TESTE', email: 'loja@teste.com', site_id: 'MLB', tags: [] });
      }
      if (req.method === 'POST' && url.pathname === '/checkout/preferences') {
        const b = JSON.parse(corpo);
        const id = `pref_${preferencias.length + 1}`;
        preferencias.push({ id, authorization: req.headers.authorization ?? null, ...b });
        return json(201, { id, init_point: `http://localhost:4010/pagar?pref_id=${id}` });
      }
      if (req.method === 'POST' && url.pathname === '/oauth/token') {
        const b = JSON.parse(corpo);
        chamadasOauth.push(b);
        if (b.grant_type === 'authorization_code') {
          if (b.code !== 'codigo_valido') return json(400, { message: 'invalid_grant' });
          return json(200, { access_token: 'APP_USR-oauth-access', refresh_token: 'TG-refresh-1', user_id: 4242, expires_in: 15552000, public_key: 'APP_USR-pk', scope: 'read write offline_access' });
        }
        if (b.grant_type === 'refresh_token') {
          if (b.refresh_token !== 'TG-refresh-1') return json(400, { message: 'invalid_grant' });
          return json(200, { access_token: 'APP_USR-oauth-access-2', refresh_token: 'TG-refresh-2', user_id: 4242, expires_in: 15552000 });
        }
        return json(400, { message: 'grant_type invalido' });
      }
      const m = /^\/v1\/payments\/(\d+)$/.exec(url.pathname);
      if (req.method === 'GET' && m) {
        const p = pagamentos.get(m[1]);
        return p ? json(200, p) : json(404, { message: 'Payment not found', error: 'not_found' });
      }
      // controle do teste
      if (req.method === 'POST' && url.pathname === '/_pagamento') {
        const p = JSON.parse(corpo);
        pagamentos.set(String(p.id), p);
        return json(200, { ok: true });
      }
      if (req.method === 'GET' && url.pathname === '/_preferencias') return json(200, preferencias);
      if (req.method === 'GET' && url.pathname === '/_oauth') return json(200, chamadasOauth);
      json(404, { message: 'rota desconhecida no mock' });
    });
  })
  .listen(4010, () => console.log('mock MP em 4010'));
