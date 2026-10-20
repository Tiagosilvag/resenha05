import pg from 'pg';

const B = 'http://localhost:3000/api';
const MOCK = 'http://localhost:4010';
let falhas = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) falhas++;
};
const req = async (metodo, caminho, token, corpo) => {
  const r = await fetch(B + caminho, {
    method: metodo,
    redirect: 'manual',
    headers: { ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  let json = null;
  try { json = await r.json(); } catch {}
  return { status: r.status, json, location: r.headers.get('location') };
};
const sql = async (q) => {
  const c = new pg.Client({ connectionString: 'postgres://resenha05:resenha05@127.0.0.1:55432/resenha05' });
  await c.connect();
  const r = await c.query(q);
  await c.end();
  return r.rows;
};
const pagamento = (id, extra) =>
  fetch(MOCK + '/_pagamento', { method: 'POST', body: JSON.stringify({ id, payment_method_id: 'pix', payer: { id: 777, email: 'convidado@x.com' }, ...extra }) });
const prefs = async () => (await fetch(MOCK + '/_preferencias')).json();

const cad = (nome, tel) => req('POST', '/auth/cadastro', null, { nome, telefone: tel, senha: 'senha12345' });
const dono = await cad('Dono Pgto', '+5511977770001');
const tD = dono.json.accessToken;
const org = (await req('POST', '/organizacoes', tD, { nome: 'Racha Pgto' })).json.id;
await sql(`update organizacoes set status_assinatura='ativa' where id='${org}'`);
const mk = async (nome, tel, papel) => {
  const r = await cad(nome, tel);
  await req('POST', `/organizacoes/${org}/entrar`, r.json.accessToken);
  if (papel) await req('POST', `/organizacoes/${org}/membros/promover`, tD, { profileId: r.json.usuario.id, papel });
  return { id: r.json.usuario.id, t: r.json.accessToken };
};
const adm = await mk('Admin Pgto', '+5511977770002', 'admin');
const j1 = await mk('Jogador Um', '+5511977770003');
const j2 = await mk('Jogador Dois', '+5511977770004');
const P = (await req('POST', `/organizacoes/${org}/peladas`, tD, { data: '2026-11-07', valor: 30 })).json.id;
await req('POST', `/peladas/${P}/presencas/todos`, tD);
const linhaPresenca = async (id) => (await sql(`select * from presencas where pelada_id='${P}' and profile_id='${id}'`))[0];

// ===== Fase 1: o "pago" fica protegido e com trilha ==========================================
let r = await req('POST', `/peladas/${P}/pagamento`, adm.t, { profileId: j1.id, pago: true });
let l = await linhaPresenca(j1.id);
ok(r.status === 200 && l.status === 'pago' && l.pago_metodo === 'manual' && l.pago_valor === '30.00' && l.pago_por === adm.id && l.pago_em, 'admin marca pago: grava quem, quando, quanto e o meio');
r = await req('DELETE', `/peladas/${P}/presenca`, j1.t);
ok(r.status === 409, 'jogador pago não consegue "sair da lista" (apagaria o pagamento)');
r = await req('POST', `/peladas/${P}/presenca`, j1.t, { status: 'confirmado' });
ok((await linhaPresenca(j1.id)).status === 'pago', 'confirmar presença de novo não rebaixa o "pago"');
r = await req('POST', `/peladas/${P}/presenca`, j1.t, { status: 'desistiu' });
ok((await linhaPresenca(j1.id)).status === 'pago', 'marcar "desisti" também não apaga o pagamento');
await req('POST', `/peladas/${P}/presencas`, adm.t, { profileId: j1.id });
ok((await linhaPresenca(j1.id)).status === 'pago', 'admin adicionar de novo não rebaixa quem já pagou');
await req('POST', `/peladas/${P}/pagamento`, adm.t, { profileId: j1.id, pago: false });
l = await linhaPresenca(j1.id);
ok(l.status === 'confirmado' && !l.pago_em && !l.pago_por && !l.pago_metodo, 'admin desmarca: volta a confirmado e limpa a trilha');

// ===== Configuração: o dono decide ===========================================================
r = await req('PUT', `/organizacoes/${org}/pagamento-jogadores`, adm.t, { modo: 'manual' });
ok(r.status === 403, 'admin que não é o dono não muda o modo de pagamento');
r = await req('PUT', `/organizacoes/${org}/pagamento-jogadores`, tD, { modo: 'pix' });
ok(r.status === 422, 'modo Pix exige a chave');
r = await req('PUT', `/organizacoes/${org}/pagamento-jogadores`, tD, { modo: 'mercadopago' });
ok(r.status === 409, 'modo automático exige conta do Mercado Pago conectada');
r = await req('PUT', `/organizacoes/${org}/pagamento-jogadores`, tD, { modo: 'pix', pixChave: 'dono@exemplo.com', pixFavorecido: 'Dono Pgto', pixInstrucoes: 'Mande o comprovante' });
ok(r.status === 200, 'dono escolhe Pix com a chave');
let g = (await req('GET', `/peladas/${P}`, j1.t)).json;
ok(g.pagamento.modo === 'pix' && g.pagamento.valorCentavos === 3000 && g.pagamento.pix.chave === 'dono@exemplo.com', 'jogador vê o valor e a chave Pix na pelada');

// ===== Opção A: "já paguei" ===================================================================
r = await req('POST', `/peladas/${P}/pagamento/declarar`, j1.t);
ok(r.status === 200 && r.json.status === 'aguardando_confirmacao', 'jogador avisa que pagou (fica aguardando o admin)');
ok((await linhaPresenca(j1.id)).status === 'confirmado', 'avisar não marca como pago: só o admin confirma');
g = (await req('GET', `/peladas/${P}`, adm.t)).json;
ok(g.presencas.find((x) => x.profileId === j1.id).declaradoPagoEm !== null, 'admin vê quem avisou que pagou');
g = (await req('GET', `/peladas/${P}`, j2.t)).json;
ok(g.presencas.find((x) => x.profileId === j1.id).declaradoPagoEm === null, 'outros jogadores não veem quem avisou');
await req('POST', `/peladas/${P}/pagamento`, adm.t, { profileId: j1.id, pago: true });
l = await linhaPresenca(j1.id);
ok(l.status === 'pago' && l.pago_metodo === 'pix' && l.pagamento_declarado_em === null, 'admin confirma: pago por Pix, aviso resolvido');
await req('POST', `/peladas/${P}/pagamento`, adm.t, { profileId: j1.id, pago: false });
await req('PUT', `/organizacoes/${org}/pagamento-jogadores`, tD, { modo: 'manual' });
r = await req('POST', `/peladas/${P}/pagamento/declarar`, j2.t);
ok(r.status === 409, 'no modo manual não há "já paguei"');
await req('PUT', `/organizacoes/${org}/pagamento-jogadores`, tD, { modo: 'pix', pixChave: 'dono@exemplo.com' });
await req('POST', `/peladas/${P}/presenca`, j2.t, { status: 'desistiu' });
r = await req('POST', `/peladas/${P}/pagamento/declarar`, j2.t);
ok(r.status === 409, 'quem desistiu não avisa pagamento');
await req('POST', `/peladas/${P}/presenca`, j2.t, { status: 'confirmado' });

// ===== Opção B: Mercado Pago (token colado, jeito antigo) ====================================
r = await req('POST', `/organizacoes/${org}/mercadopago`, tD, { accessToken: 'APP_USR-token-colado-1234567890' });
ok(r.status === 200, 'dono cola o token (jeito antigo continua valendo)');
r = await req('PUT', `/organizacoes/${org}/pagamento-jogadores`, tD, { modo: 'mercadopago' });
ok(r.status === 200, 'agora o modo automático pode ser escolhido');
r = await req('POST', `/peladas/${P}/pagamento/mercadopago`, j1.t);
ok(r.status === 200 && r.json.checkoutUrl.startsWith('http://localhost:4010/pagar'), 'jogador recebe o link de pagamento');
let pf = (await prefs()).at(-1);
ok(pf.items[0].unit_price === 30 && /^jogador:[0-9a-f-]{36}$/.test(pf.external_reference), 'cobrança de R$ 30 com referência ao jogador');
ok(pf.notification_url.endsWith(`/api/webhooks/mercadopago/pagamento-jogador/${org}`) && pf.back_urls.success.endsWith(`/peladas/${P}`), 'avisos e retorno apontam para esta organização e pelada');
ok(pf.authorization === 'Bearer APP_USR-token-colado-1234567890', 'cobra com o token da organização (o dinheiro vai para ela)');
ok((await sql(`select status from pagamentos_jogador where profile_id='${j1.id}'`))[0].status === 'pendente', 'cobrança fica pendente');
ok((await linhaPresenca(j1.id)).status === 'confirmado', 'iniciar o pagamento não marca como pago');

await pagamento(920000001, { status: 'pending', transaction_amount: 30, external_reference: pf.external_reference });
r = await req('POST', `/peladas/${P}/pagamento/mercadopago/conferir`, j1.t, { paymentId: '920000001' });
ok(r.json.resultado === 'nao_aprovado', 'Pix pendente: não marca pago');
await pagamento(920000002, { status: 'approved', transaction_amount: 10, external_reference: pf.external_reference });
r = await req('POST', `/peladas/${P}/pagamento/mercadopago/conferir`, j1.t, { paymentId: '920000002' });
ok(r.json.resultado === 'valor_insuficiente', 'valor menor que o cobrado: não marca pago');
r = await req('POST', `/peladas/${P}/pagamento/mercadopago/conferir`, j2.t, { paymentId: '920000002' });
ok(r.json.resultado === 'outro_jogador' || r.json.resultado === 'valor_insuficiente', 'um jogador não consegue usar o pagamento de outro');
await pagamento(920000003, { status: 'approved', transaction_amount: 30, external_reference: pf.external_reference });
r = await req('POST', `/peladas/${P}/pagamento/mercadopago/conferir`, j2.t, { paymentId: '920000003' });
ok(r.json.resultado === 'outro_jogador', 'pagamento aprovado de outro jogador não vale para este');
ok((await linhaPresenca(j2.id)).status === 'confirmado', 'o outro jogador continua sem pagar');
r = await req('POST', `/peladas/${P}/pagamento/mercadopago/conferir`, j1.t, { paymentId: '920000003' });
ok(r.json.resultado === 'aplicar', 'pagamento aprovado: jogador marcado como pago');
l = await linhaPresenca(j1.id);
ok(l.status === 'pago' && l.pago_metodo === 'mercadopago' && l.mp_payment_id === '920000003' && l.pago_valor === '30.00' && l.pago_por === null, 'trilha: meio, número do pagamento e valor');
r = await req('POST', `/peladas/${P}/pagamento/mercadopago/conferir`, j1.t, { paymentId: '920000003' });
ok(r.json.resultado === 'ja_aplicado', 'conferir de novo não faz nada');
r = await req('POST', `/peladas/${P}/pagamento`, adm.t, { profileId: j1.id, pago: false });
ok(r.status === 409, 'admin não desfaz pagamento feito pelo Mercado Pago (estorno é lá)');
r = await req('POST', `/peladas/${P}/pagamento/mercadopago`, j1.t);
ok(r.status === 409, 'quem já pagou não paga de novo');

// aviso (webhook): jogador 2 paga e fecha a aba
r = await req('POST', `/peladas/${P}/pagamento/mercadopago`, j2.t);
pf = (await prefs()).at(-1);
await pagamento(920000004, { status: 'approved', transaction_amount: 30, external_reference: pf.external_reference });
const wh = await fetch(`${B}/webhooks/mercadopago/pagamento-jogador/${org}?data.id=920000004&type=payment`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'payment', data: { id: '920000004' } }),
});
ok(wh.status === 200 && (await linhaPresenca(j2.id)).status === 'pago', 'aviso do Mercado Pago marca o jogador como pago sozinho');
const wh2 = await fetch(`${B}/webhooks/mercadopago/pagamento-jogador/${org}?topic=payment&id=920000004`, { method: 'POST' });
ok(wh2.status === 200, 'aviso repetido (formato antigo) é aceito sem efeito');
const wh3 = await fetch(`${B}/webhooks/mercadopago/pagamento-jogador/${org}?data.id=920000999&type=payment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'payment', data: { id: '920000999' } }) });
ok(wh3.status === 200, 'aviso de pagamento que não existe é ignorado');
const wh4 = await fetch(`${B}/webhooks/mercadopago/pagamento-jogador/00000000-0000-0000-0000-000000000000?data.id=920000004&type=payment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'payment', data: { id: '920000004' } }) });
ok(wh4.status === 200, 'aviso para organização inexistente é ignorado');
ok((await sql(`select count(*)::int as n from pagamentos_jogador where status='aprovado'`))[0].n === 2, 'duas cobranças aprovadas, sem duplicar');

// ===== OAuth: "Conectar com Mercado Pago" ======================================================
r = await req('POST', `/organizacoes/${org}/mercadopago/oauth/iniciar`, adm.t);
ok(r.status === 403, 'só o dono inicia a conexão');
r = await req('POST', `/organizacoes/${org}/mercadopago/oauth/iniciar`, tD);
ok(r.status === 200, 'dono inicia a conexão e recebe a URL de autorização');
const u = new URL(r.json.url);
ok(u.searchParams.get('client_id') === '1234567890' && u.searchParams.get('redirect_uri').endsWith('/api/oauth/mercadopago/callback') && u.searchParams.get('response_type') === 'code', 'URL com o cliente da plataforma, retorno e resposta em código');
const estado = u.searchParams.get('state');
ok((await sql(`select count(*)::int as n from oauth_estados where estado='${estado}'`))[0].n === 1, 'estado guardado para validar o retorno');
let cb = await req('GET', `/oauth/mercadopago/callback?code=codigo_valido&state=estado_forjado`);
ok(cb.status === 302 && cb.location.includes('mercadopago=erro'), 'retorno com estado desconhecido é recusado');
ok((await sql(`select mp_oauth_access_cipher from organizacoes where id='${org}'`))[0].mp_oauth_access_cipher === null, 'e nada foi conectado');
cb = await req('GET', `/oauth/mercadopago/callback?code=codigo_valido&state=${estado}`);
ok(cb.status === 302 && cb.location.endsWith(`/org/${org}/mercadopago?conectado=1`), 'retorno válido: conecta e volta para a tela da organização');
let o = (await sql(`select mp_oauth_user_id, mp_oauth_conectado_em, mp_oauth_expira_em, encode(mp_oauth_access_cipher,'hex') as ac from organizacoes where id='${org}'`))[0];
ok(o.mp_oauth_user_id === '4242' && o.mp_oauth_conectado_em && o.ac && !Buffer.from(o.ac, 'hex').toString('utf8').includes('APP_USR'), 'tokens guardados cifrados (nunca em claro)');
cb = await req('GET', `/oauth/mercadopago/callback?code=codigo_valido&state=${estado}`);
ok(cb.location.includes('mercadopago=erro'), 'o mesmo estado não vale duas vezes');
let cfg = (await req('GET', `/organizacoes/${org}/pagamento-jogadores`, tD)).json;
ok(cfg.mercadoPago.conectado && cfg.mercadoPago.origem === 'oauth' && cfg.mercadoPago.oauthDisponivel === true, 'tela mostra conectado por OAuth');
const j3 = await mk('Jogador Tres', '+5511977770005');
await req('POST', `/peladas/${P}/presencas`, tD, { profileId: j3.id });
await req('POST', `/peladas/${P}/pagamento/mercadopago`, j3.t);
pf = (await prefs()).at(-1);
ok(pf.authorization === 'Bearer APP_USR-oauth-access', 'passa a cobrar com o token do OAuth (em vez do colado)');

// renovação automática antes de vencer
await sql(`update organizacoes set mp_oauth_expira_em = now() + interval '1 day' where id='${org}'`);
const j4 = await mk('Jogador Quatro', '+5511977770006');
await req('POST', `/peladas/${P}/presencas`, tD, { profileId: j4.id });
await req('POST', `/peladas/${P}/pagamento/mercadopago`, j4.t);
pf = (await prefs()).at(-1);
const chamadas = await (await fetch(MOCK + '/_oauth')).json();
ok(chamadas.some((c) => c.grant_type === 'refresh_token' && c.refresh_token === 'TG-refresh-1'), 'token perto de vencer é renovado sozinho com o refresh_token');
ok(pf.authorization === 'Bearer APP_USR-oauth-access-2', 'e a cobrança já usa o token renovado');
o = (await sql(`select extract(epoch from (mp_oauth_expira_em - now()))/86400 as dias from organizacoes where id='${org}'`))[0];
ok(Number(o.dias) > 170, `novo vencimento em ~${Math.round(Number(o.dias))} dias`);
// desconectar
r = await req('DELETE', `/organizacoes/${org}/mercadopago/oauth`, tD);
cfg = (await req('GET', `/organizacoes/${org}/pagamento-jogadores`, tD)).json;
ok(r.status === 204 && cfg.mercadoPago.origem === 'token' && cfg.modo === 'mercadopago', 'desconectar o OAuth volta ao token colado e mantém o modo');
await sql(`update organizacoes set mp_token_cipher = null, mp_token_nonce = null where id='${org}'`);
await req('POST', `/organizacoes/${org}/mercadopago/oauth/iniciar`, tD);
const est2 = (await sql(`select estado from oauth_estados limit 1`))[0].estado;
await req('GET', `/oauth/mercadopago/callback?code=codigo_valido&state=${est2}`);
await req('DELETE', `/organizacoes/${org}/mercadopago/oauth`, tD);
cfg = (await req('GET', `/organizacoes/${org}/pagamento-jogadores`, tD)).json;
ok(cfg.modo === 'manual' && !cfg.mercadoPago.conectado, 'sem nenhuma conta ligada, o pagamento automático volta para o manual');
cb = await req('GET', `/oauth/mercadopago/callback?code=codigo_invalido&state=${est2}`);
ok(cb.location.includes('mercadopago=erro'), 'estado já usado continua recusado');

console.log(falhas === 0 ? '\nTUDO OK' : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
