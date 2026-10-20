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
    headers: { ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  let json = null;
  try { json = await r.json(); } catch {}
  return { status: r.status, json };
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
const ultimaPref = async () => (await (await fetch(MOCK + '/_preferencias')).json()).at(-1);
const fimDoMes = (periodo) => {
  const [a, m] = periodo.split('-').map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
};

// --- montagem: admin da plataforma (Tiago), conta MP conectada (mock), org nova pendente --
// Admin de plataforma criado aqui mesmo (o roteiro não depende de outro seed).
const login = await req('POST', '/auth/cadastro', null, { nome: 'Admin Plataforma', telefone: '+5511955559999', senha: 'senha12345' });
const admin = login.json.accessToken;
await sql(`insert into plataforma_admins (profile_id, cadastrado_por) values ('${login.json.usuario.id}','${login.json.usuario.id}')`);
let r = await req('POST', '/admin/mercadopago', admin, { accessToken: 'TOKEN_DE_TESTE_DA_PLATAFORMA_123' });
ok(r.status === 200 && r.json.conta === 'real', 'credencial da plataforma salva (validada no MP de mentira)');
await req('PUT', '/admin/configuracoes', admin, { valorCentavos: 500 });

const org = (await req('POST', '/organizacoes', admin, { nome: 'Racha Sem Conta' })).json.id;
const jog = await req('POST', '/auth/cadastro', null, { nome: 'Jogador Comum', telefone: '+5511966660001', senha: 'senha12345' });
await sql(`update organizacoes set status_assinatura='inadimplente' where id='${org}'`);
let o = (await req('GET', `/organizacoes/${org}`, admin)).json;
ok(o.statusAssinatura === 'inadimplente' && o.assinaturaAutomatica === false && o.venceEm === null, 'org nasce pendente, sem assinatura automática nem vencimento');
const mesAtual = o.proximoMesAvulso;
ok(/^\d{4}-\d{2}-01$/.test(mesAtual) && o.mensalidadeCentavos === 500, `próximo mês a pagar = ${mesAtual}, R$ 5,00`);

// --- permissões ---------------------------------------------------------------------------
await req('POST', `/organizacoes/${org}/entrar`, jog.json.accessToken); // pendente: entra? (bloqueado)
r = await req('POST', `/organizacoes/${org}/assinatura/avulso`, jog.json.accessToken);
ok(r.status === 403, 'quem não é o dono não inicia pagamento avulso');

// --- 1) iniciar pagamento avulso ---------------------------------------------------------
r = await req('POST', `/organizacoes/${org}/assinatura/avulso`, admin);
ok(r.status === 200 && r.json.checkoutUrl.startsWith('http://localhost:4010/pagar'), 'cria a preferência e devolve o link de pagamento');
const pref1 = await ultimaPref();
ok(pref1.items[0].unit_price === 5 && pref1.items[0].currency_id === 'BRL', 'preferência com R$ 5,00 em BRL');
ok(/^avulso:[0-9a-f-]{36}$/.test(pref1.external_reference), 'external_reference aponta para a cobrança pendente');
ok(pref1.back_urls.success.endsWith(`/org/${org}/assinatura`) && pref1.notification_url.endsWith('/api/webhooks/mercadopago/assinatura'), 'URLs de retorno e de aviso corretas');
let linhas = await sql(`select status, periodo_referencia::text as p, mp_preapproval_id from assinaturas where organizacao_id='${org}' order by criado_em`);
ok(linhas.length === 1 && linhas[0].status === 'pendente' && linhas[0].mp_preapproval_id.startsWith('avulso-'), 'cobrança fica pendente no banco');
ok((await req('GET', `/organizacoes/${org}`, admin)).json.statusAssinatura === 'inadimplente', 'iniciar o pagamento não libera nada');

// --- 2) volta do comprador: pendente, recusado, valor errado ------------------------------
await pagamento(900000001, { status: 'pending', status_detail: 'pending_waiting_transfer', transaction_amount: 5, external_reference: pref1.external_reference });
r = await req('POST', `/organizacoes/${org}/assinatura/avulso/conferir`, admin, { paymentId: '900000001' });
ok(r.status === 200 && r.json.resultado === 'nao_aprovado' && r.json.statusMp === 'pending', 'Pix ainda pendente: não libera');
await pagamento(900000002, { status: 'approved', status_detail: 'accredited', transaction_amount: 1, external_reference: pref1.external_reference });
r = await req('POST', `/organizacoes/${org}/assinatura/avulso/conferir`, admin, { paymentId: '900000002' });
ok(r.json.resultado === 'valor_insuficiente', 'pagamento com valor menor que o cobrado não libera');
await pagamento(900000003, { status: 'approved', transaction_amount: 5, external_reference: 'avulso:00000000-0000-0000-0000-000000000000' });
r = await req('POST', `/organizacoes/${org}/assinatura/avulso/conferir`, admin, { paymentId: '900000003' });
ok(r.json.resultado === 'desconhecido', 'pagamento que não aponta para uma cobrança nossa é ignorado');
r = await req('POST', `/organizacoes/${org}/assinatura/avulso/conferir`, admin, { paymentId: '123' });
ok(r.status === 422, 'número de pagamento inválido é recusado');
r = await req('POST', `/organizacoes/${org}/assinatura/avulso/conferir`, admin, { paymentId: '999999999' });
ok(r.status >= 400, 'pagamento que não existe no Mercado Pago dá erro (não libera)');
ok((await req('GET', `/organizacoes/${org}`, admin)).json.statusAssinatura === 'inadimplente', 'nada disso liberou o mês');

// --- 3) aprovado: libera o mês ----------------------------------------------------------
await pagamento(900000004, { status: 'approved', status_detail: 'accredited', transaction_amount: 5, external_reference: pref1.external_reference });
r = await req('POST', `/organizacoes/${org}/assinatura/avulso/conferir`, admin, { paymentId: '900000004' });
ok(r.json.resultado === 'aplicar', 'Pix aprovado libera o mês');
o = (await req('GET', `/organizacoes/${org}`, admin)).json;
ok(o.statusAssinatura === 'ativa' && o.venceEm === fimDoMes(mesAtual), `organização ativa, paga até ${o.venceEm}`);
ok(o.assinaturaAutomatica === false, 'continua sem assinatura automática (vale só o mês)');
const prox = o.proximoMesAvulso;
ok(prox > mesAtual, `agora o próximo a pagar é ${prox}`);
linhas = await sql(`select status, mp_payment_id from assinaturas where organizacao_id='${org}'`);
ok(linhas[0].status === 'aprovado' && linhas[0].mp_payment_id === '900000004', 'linha aprovada guarda o número do pagamento');
r = await req('POST', `/organizacoes/${org}/assinatura/avulso/conferir`, admin, { paymentId: '900000004' });
ok(r.json.resultado === 'ja_aplicado', 'conferir de novo não libera outra vez');
const [c1, c2] = await Promise.all([
  req('POST', `/organizacoes/${org}/assinatura/avulso/conferir`, admin, { paymentId: '900000004' }),
  req('POST', `/organizacoes/${org}/assinatura/avulso/conferir`, admin, { paymentId: '900000004' }),
]);
ok(c1.status === 200 && c2.status === 200, 'conferências simultâneas não quebram');
ok((await sql(`select count(*)::int as n from assinaturas where organizacao_id='${org}' and status='aprovado'`))[0].n === 1, 'continua uma só linha aprovada');

// --- 4) webhook de pagamento (comprador fechou a aba) --------------------------------------
r = await req('POST', `/organizacoes/${org}/assinatura/avulso`, admin);
ok(r.status === 200, 'dono paga também o mês seguinte antes do atual acabar');
const pref2 = await ultimaPref();
await pagamento(900000005, { status: 'approved', transaction_amount: 5, external_reference: pref2.external_reference });
const wh = await fetch(B + '/webhooks/mercadopago/assinatura?data.id=900000005&type=payment', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ type: 'payment', action: 'payment.updated', data: { id: '900000005' } }),
});
ok(wh.status === 200, 'webhook de pagamento é aceito');
o = (await req('GET', `/organizacoes/${org}`, admin)).json;
ok(o.venceEm === fimDoMes(prox), `webhook liberou o mês seguinte: paga até ${o.venceEm}`);
const wh2 = await fetch(B + '/webhooks/mercadopago/assinatura?topic=payment&id=900000005', { method: 'POST' });
ok(wh2.status === 200, 'formato antigo (topic=payment&id=) também é aceito, sem efeito repetido');
ok((await sql(`select count(*)::int as n from assinaturas where organizacao_id='${org}' and status='aprovado'`))[0].n === 2, 'duas linhas aprovadas, nenhuma duplicada');
const whForjado = await fetch(B + '/webhooks/mercadopago/assinatura?data.id=900000777&type=payment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'payment', data: { id: '900000777' } }) });
ok(whForjado.status === 200, 'notificação de pagamento inexistente não libera nada (reconsulta ao MP)');
o = (await req('GET', `/organizacoes/${org}`, admin)).json;
ok(o.venceEm === fimDoMes(prox), 'vencimento não mudou com a notificação forjada');

// --- 5) vencimento: passado o mês, volta a pendente ----------------------------------------
await sql(`update assinaturas set periodo_referencia = '2026-06-01' where organizacao_id='${org}' and status='aprovado' and mp_payment_id='900000004'`);
await sql(`update assinaturas set periodo_referencia = '2026-07-01' where organizacao_id='${org}' and status='aprovado' and mp_payment_id='900000005'`);
o = (await req('GET', `/organizacoes/${org}`, admin)).json;
ok(o.statusAssinatura === 'inadimplente', 'meses vencidos: volta a pendente');
ok(o.venceEm === '2026-07-31' && o.proximoMesAvulso === mesAtual, 'mostra que venceu em 31/07 e volta a oferecer o mês atual');

// --- 6) quem tem assinatura automática não paga avulso -------------------------------------
await sql(`insert into assinaturas (organizacao_id, mp_preapproval_id, periodo_referencia, valor_centavos, status) values ('${org}','pre_mp_real_1','2026-10-01',500,'aprovado')`);
r = await req('POST', `/organizacoes/${org}/assinatura/avulso`, admin);
ok(r.status === 409, 'com assinatura automática aprovada, o pagamento avulso é recusado');
console.log(falhas === 0 ? '\nTUDO OK' : `\n${falhas} FALHA(S)`);
console.log(JSON.stringify({ org }));
process.exit(falhas === 0 ? 0 : 1);
