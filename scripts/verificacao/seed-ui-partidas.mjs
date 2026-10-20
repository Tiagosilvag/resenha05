import pg from 'pg';
const B = 'http://localhost:3000/api';
const req = async (metodo, caminho, token, corpo) => {
  const r = await fetch(B + caminho, {
    method: metodo,
    headers: { ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  let json = null;
  try { json = await r.json(); } catch {}
  return { status: r.status, json };
};
const cad = (nome, tel) => req('POST', '/auth/cadastro', null, { nome, telefone: tel, senha: 'senha12345' });
const dono = await cad('Tiago Dono', '+5511955550001');
const t = dono.json.accessToken;
const org = (await req('POST', '/organizacoes', t, { nome: 'Racha da Tela' })).json.id;
const c = new pg.Client({ connectionString: 'postgres://resenha05:resenha05@127.0.0.1:55432/resenha05' });
await c.connect();
await c.query(`update organizacoes set status_assinatura='ativa' where id='${org}'`);
await c.end();
const nomes = ['Bruno', 'Caio', 'Diego', 'Edu', 'Fabio', 'Gui', 'Hugo', 'Igor'];
const ids = [dono.json.usuario.id];
for (let i = 0; i < 8; i++) {
  const r = await cad(nomes[i], `+55119555500${String(i + 2).padStart(2, '0')}`);
  await req('POST', `/organizacoes/${org}/entrar`, r.json.accessToken);
  ids.push(r.json.usuario.id);
}
const estrelas = [5, 4, 4, 3, 3, 3, 2, 2, 1];
for (let i = 0; i < 9; i++) await req('POST', `/organizacoes/${org}/membros/estrelas`, t, { profileId: ids[i], estrelas: estrelas[i] });
const P = (await req('POST', `/organizacoes/${org}/peladas`, t, { data: '2026-10-24', valor: 0 })).json.id;
await req('POST', `/peladas/${P}/presencas/todos`, t);
await req('POST', `/peladas/${P}/sorteio`, t, { jogadoresPorTime: 4, seed: 5 });
await req('POST', `/peladas/${P}/sorteio/confirmar`, t);
await req('PUT', `/peladas/${P}/partidas/regras`, t, { duracaoMin: 10, golsLimite: 3 });
console.log(JSON.stringify({ org, P }));
