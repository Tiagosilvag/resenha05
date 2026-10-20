import pg from 'pg';

const B = 'http://localhost:3000/api';
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
  try {
    json = await r.json();
  } catch {}
  return { status: r.status, json };
};
const sql = async (q) => {
  const c = new pg.Client({ connectionString: 'postgres://resenha05:resenha05@127.0.0.1:55432/resenha05' });
  await c.connect();
  const r = await c.query(q);
  await c.end();
  return r.rows;
};

// ---- montagem: dono + 8 jogadores = 9, todos na lista, times 4+4+1 ----------
const cad = (nome, tel) => req('POST', '/auth/cadastro', null, { nome, telefone: tel, senha: 'senha12345' });
const dono = await cad('Dono Bola', '+5511944440001');
const t = dono.json.accessToken;
const org = (await req('POST', '/organizacoes', t, { nome: 'Racha Partidas' })).json.id;
await sql(`update organizacoes set status_assinatura='ativa' where id='${org}'`);
const jogadores = [{ id: dono.json.usuario.id, nome: 'Dono Bola', token: t }];
for (let i = 1; i <= 8; i++) {
  const r = await cad(`Craque ${i}`, `+551194444000${i + 1}`);
  await req('POST', `/organizacoes/${org}/entrar`, r.json.accessToken);
  jogadores.push({ id: r.json.usuario.id, nome: `Craque ${i}`, token: r.json.accessToken });
}
// estrelas variadas: 5,4,4,3,3,3,2,2,1
const estrelas = [5, 4, 4, 3, 3, 3, 2, 2, 1];
for (let i = 0; i < 9; i++) {
  await req('POST', `/organizacoes/${org}/membros/estrelas`, t, { profileId: jogadores[i].id, estrelas: estrelas[i] });
}
const nova = async (data) => {
  const p = (await req('POST', `/organizacoes/${org}/peladas`, t, { data, valor: 0 })).json.id;
  await req('POST', `/peladas/${p}/presencas/todos`, t);
  return p;
};
const P = await nova('2026-10-24');
const sorteio = await req('POST', `/peladas/${P}/sorteio`, t, { jogadoresPorTime: 4, seed: 11 });
ok(sorteio.status === 201 && sorteio.json.times.map((x) => x.jogadores.length).join() === '4,4,1', 'sorteio 9 jogadores / 4 por time => 4,4,1');

// antes de confirmar o sorteio não dá para criar partida
let g = await req('GET', `/peladas/${P}/partidas`, t);
const times0 = g.json.times;
ok(g.json.sugestao && times0.length === 3, 'GET partidas lista os 3 times e sugere partida');
let r = await req('POST', `/peladas/${P}/partidas`, t, { timeAId: times0[0].id, timeBId: times0[1].id });
ok(r.status === 409, 'não cria partida com sorteio ainda em rascunho');
await req('POST', `/peladas/${P}/sorteio/confirmar`, t);

// regras por pelada
r = await req('PUT', `/peladas/${P}/partidas/regras`, t, { duracaoMin: 10, golsLimite: 3 });
ok(r.status === 200, 'salva regras da pelada (10 min / 3 gols)');
r = await req('PUT', `/peladas/${P}/partidas/regras`, jogadores[1].token, { duracaoMin: 5, golsLimite: 1 });
ok(r.status === 403, 'jogador comum não altera regras');

g = await req('GET', `/peladas/${P}/partidas`, t);
const [tA, tB, tC] = g.json.times;
ok(g.json.sugestao.timeAId === tA.id && g.json.sugestao.timeBId === tB.id, 'sugestão: dois times completos (não o da sobra)');

// ---- partida 1 ------------------------------------------------------------
r = await req('POST', `/peladas/${P}/partidas`, t, { timeAId: tA.id, timeBId: tB.id });
ok(r.status === 201, 'cria partida 1');
const J1 = r.json.id;
r = await req('POST', `/peladas/${P}/partidas`, t, { timeAId: tA.id, timeBId: tB.id });
ok(r.status === 409, 'segunda partida aberta é recusada');
r = await req('POST', `/partidas/${J1}/gols`, t, { timeId: tA.id, profileId: tA.jogadores[0].profileId });
ok(r.status === 409, 'não registra gol antes de iniciar');
const [i1, i2] = await Promise.all([req('POST', `/partidas/${J1}/iniciar`, t), req('POST', `/partidas/${J1}/iniciar`, t)]);
ok(i1.status === 200 && i2.status === 200, 'iniciar duas vezes ao mesmo tempo não quebra');
g = await req('GET', `/peladas/${P}/partidas`, t);
let p1 = g.json.partidas[0];
ok(p1.status === 'em_andamento' && p1.rodando && p1.restanteSeg > 590, 'partida em andamento com ~10min restantes');

// pausa e retomada preservam o tempo
await new Promise((r) => setTimeout(r, 2200));
await req('POST', `/partidas/${J1}/pausar`, t);
g = await req('GET', `/peladas/${P}/partidas`, t);
p1 = g.json.partidas[0];
const decPausa = p1.decorridoSeg;
ok(p1.status === 'pausado' && decPausa >= 2 && decPausa <= 4, `pausou com ${decPausa}s corridos`);
await new Promise((r) => setTimeout(r, 1500));
g = await req('GET', `/peladas/${P}/partidas`, t);
ok(g.json.partidas[0].decorridoSeg === decPausa, 'cronômetro parado durante a pausa');
await req('POST', `/partidas/${J1}/retomar`, t);
g = await req('GET', `/peladas/${P}/partidas`, t);
ok(g.json.partidas[0].status === 'em_andamento' && g.json.partidas[0].decorridoSeg >= decPausa, 'retomou de onde parou');

// gols
r = await req('POST', `/partidas/${J1}/gols`, t, { timeId: tA.id, profileId: tB.jogadores[0].profileId });
ok(r.status === 422, 'gol de jogador que não é do time é recusado');
const golA1 = await req('POST', `/partidas/${J1}/gols`, t, { timeId: tA.id, profileId: tA.jogadores[0].profileId });
await req('POST', `/partidas/${J1}/gols`, t, { timeId: tB.id, profileId: tB.jogadores[1].profileId });
await req('POST', `/partidas/${J1}/gols`, t, { timeId: tA.id, profileId: tA.jogadores[1].profileId });
g = await req('GET', `/peladas/${P}/partidas`, t);
p1 = g.json.partidas[0];
ok(p1.placarA === 2 && p1.placarB === 1 && p1.status === 'em_andamento', 'placar 2x1 e partida segue');
// terceiro gol do A encerra por limite; gols simultâneos não encerram duas vezes
const sim = await Promise.all([
  req('POST', `/partidas/${J1}/gols`, t, { timeId: tA.id, profileId: tA.jogadores[2].profileId }),
  req('POST', `/partidas/${J1}/gols`, t, { timeId: tA.id, profileId: tA.jogadores[3].profileId }),
]);
g = await req('GET', `/peladas/${P}/partidas`, t);
p1 = g.json.partidas[0];
ok(p1.status === 'encerrado' && p1.encerramento === 'gols', 'limite de 3 gols encerrou a partida');
ok(sim.filter((x) => x.status === 201).length === 1 && sim.filter((x) => x.status === 409).length === 1, 'gols simultâneos: um registra, o outro é recusado (partida já encerrada)');
ok(p1.vencedorTimeId === tA.id && p1.placarA === 3 && p1.placarB === 1, 'vencedor = time A (3x1)');
r = await req('POST', `/partidas/${J1}/gols`, t, { timeId: tB.id, profileId: tB.jogadores[0].profileId });
ok(r.status === 409, 'não aceita gol em partida encerrada');
const rodEncerrado = (await sql(`select retomado_em, acumulado_seg from jogos where id='${J1}'`))[0];
ok(rodEncerrado.retomado_em === null, 'cronômetro congelado após encerrar');

// correção: remove o gol que fechou a partida => volta pausada
const gols1 = p1.gols.filter((x) => x.timeId === tA.id);
r = await req('DELETE', `/partidas/${J1}/gols/${gols1[gols1.length - 1].id}`, t);
g = await req('GET', `/peladas/${P}/partidas`, t);
p1 = g.json.partidas[0];
ok(r.status === 204 && p1.placarA === 2 && p1.status === 'pausado' && p1.encerramento === null, 'remover o gol decisivo reabre a partida (pausada) e recalcula o placar');
const removidos = await sql(`select count(*)::int as n from sumula_eventos where jogo_id='${J1}' and removido_em is not null and removido_por is not null`);
ok(removidos[0].n === 1, 'gol removido fica registrado com quem removeu');
await req('POST', `/partidas/${J1}/retomar`, t);
await req('POST', `/partidas/${J1}/gols`, t, { timeId: tA.id, profileId: tA.jogadores[2].profileId });
g = await req('GET', `/peladas/${P}/partidas`, t);
p1 = g.json.partidas[0];
ok(p1.status === 'encerrado' && p1.placarA === 3, 'novo gol volta a encerrar por limite');

// artilharia
const art = (await req('GET', `/peladas/${P}/artilharia`, jogadores[3].token)).json.ranking;
const golsDe = (id) => art.find((x) => x.profileId === id)?.gols ?? 0;
ok(golsDe(tA.jogadores[0].profileId) === 1 && golsDe(tA.jogadores[1].profileId) === 1 && golsDe(tA.jogadores[2].profileId) === 1, 'artilharia da pelada conta cada autor (gol removido fora)');
const artOrg = (await req('GET', `/organizacoes/${org}/artilharia?periodo=sempre`, t)).json;
ok(artOrg.ranking.reduce((s, x) => s + x.gols, 0) === 4, 'artilharia da organização soma 4 gols válidos');
const artPel = (await req('GET', `/organizacoes/${org}/artilharia?peladaId=${P}`, t)).json;
ok(artPel.ranking.reduce((s, x) => s + x.gols, 0) === 4, 'artilharia filtrada por pelada soma 4');

// concluir: antes de encerrar não deixa; duplo clique idempotente; redistribui
const antesTimes = (await req('GET', `/peladas/${P}/partidas`, t)).json.times;
ok(antesTimes[2].jogadores.length === 1, 'antes: time da sobra tem 1 jogador');
const perdedor = tB.id;
const [c1, c2] = await Promise.all([
  req('POST', `/partidas/${J1}/concluir`, t, { perdedorTimeId: perdedor }),
  req('POST', `/partidas/${J1}/concluir`, t, { perdedorTimeId: perdedor }),
]);
ok(c1.status === 200 && c2.status === 200, 'concluir duas vezes ao mesmo tempo não quebra');
g = await req('GET', `/peladas/${P}/partidas`, t);
const depTimes = g.json.times;
const tam = (id) => depTimes.find((x) => x.id === id).jogadores.length;
const soma = (id) => depTimes.find((x) => x.id === id).totalEstrelas;
ok(tam(tA.id) === 4 && tam(tC.id) === 4 && tam(tB.id) === 1, 'depois: vencedor 4, ex-sobra completou com 4, perdedor ficou com 1 (novo time incompleto)');
const todos = depTimes.flatMap((x) => x.jogadores.map((j) => j.profileId));
ok(new Set(todos).size === 9, 'ninguém perdido nem duplicado (9 jogadores)');
const red = g.json.partidas[0].redistribuicao;
ok(red && red.movidos.length === 3 && Math.abs(soma(tC.id) - soma(tA.id)) === red.diferenca, `registro da redistribuição guardado (diferença de ${red?.diferenca} estrela(s) para o vencedor)`);
// histórico preservado: partida 1 continua mostrando a composição original
const hist = g.json.partidas[0].jogadores;
ok(hist.filter((x) => x.timeId === tB.id).length === 4, 'histórico: partida 1 ainda lista os 4 jogadores originais do time perdedor');
r = await req('DELETE', `/partidas/${J1}/gols/${p1.gols[0].id}`, t);
ok(r.status === 409, 'não corrige gol de partida já concluída');
ok(g.json.sugestao.timeAId === tA.id && g.json.sugestao.timeBId === tC.id, 'próxima partida sugerida: vencedor x time que completou');

// ---- partida 2: tempo + empate -----------------------------------------------
r = await req('POST', `/peladas/${P}/partidas`, t, { timeAId: tA.id, timeBId: tC.id });
const J2 = r.json.id;
await req('POST', `/partidas/${J2}/iniciar`, t);
await req('POST', `/partidas/${J2}/gols`, t, { timeId: tA.id, profileId: depTimes.find((x) => x.id === tA.id).jogadores[0].profileId });
await req('POST', `/partidas/${J2}/gols`, t, { timeId: tC.id, profileId: depTimes.find((x) => x.id === tC.id).jogadores[0].profileId });
await sql(`update jogos set retomado_em = now() - interval '11 minutes', iniciado_em = now() - interval '11 minutes' where id='${J2}'`);
g = await req('GET', `/peladas/${P}/partidas`, t);
const p2 = g.json.partidas[1];
ok(p2.status === 'encerrado' && p2.encerramento === 'tempo', 'cronômetro zerou: encerrou por tempo ao consultar');
ok(p2.placarA === 1 && p2.placarB === 1 && p2.vencedorTimeId === null, 'empate: nenhum vencedor inventado');
const fim = (await sql(`select extract(epoch from (encerrado_em - iniciado_em))::int as d from jogos where id='${J2}'`))[0].d;
ok(fim === 600, `horário de fim = início + 10min exatos (${fim}s)`);
r = await req('POST', `/partidas/${J2}/gols`, t, { timeId: tA.id, profileId: depTimes.find((x) => x.id === tA.id).jogadores[0].profileId });
ok(r.status === 409, 'sem gol depois do tempo');
const timesAntesEmpate = JSON.stringify(g.json.times.map((x) => [x.id, x.jogadores.map((j) => j.profileId).sort()]));
r = await req('POST', `/partidas/${J2}/concluir`, t, { perdedorTimeId: null });
g = await req('GET', `/peladas/${P}/partidas`, t);
ok(r.status === 200 && g.json.partidas[1].concluida && g.json.partidas[1].perdedorTimeId === null, 'empate concluído sem perdedor');
ok(JSON.stringify(g.json.times.map((x) => [x.id, x.jogadores.map((j) => j.profileId).sort()])) === timesAntesEmpate, 'sem perdedor, nenhum time é redistribuído');

// ---- partida 3: encerramento manual ------------------------------------------
r = await req('POST', `/peladas/${P}/partidas`, t, { timeAId: tA.id, timeBId: tC.id });
const J3 = r.json.id;
r = await req('POST', `/partidas/${J3}/encerrar`, t);
ok(r.status === 409, 'não encerra partida que não começou');
await req('POST', `/partidas/${J3}/iniciar`, t);
const [e1, e2] = await Promise.all([req('POST', `/partidas/${J3}/encerrar`, t, { observacao: 'chuva' }), req('POST', `/partidas/${J3}/encerrar`, t, { observacao: 'chuva' })]);
g = await req('GET', `/peladas/${P}/partidas`, t);
ok(e1.status === 200 && e2.status === 200 && g.json.partidas[2].encerramento === 'manual' && g.json.partidas[2].observacao === 'chuva', 'encerramento manual com motivo, repetido sem efeito colateral');
r = await req('POST', `/partidas/${J3}/concluir`, t, { perdedorTimeId: tC.id });
ok(r.status === 200, 'concluir partida manual');
// cancelar confirmação do sorteio com tudo concluído é permitido; criar partida e tentar com uma aberta
r = await req('POST', `/peladas/${P}/partidas`, t, { timeAId: tA.id, timeBId: tC.id });
const J4 = r.json.id;
r = await req('POST', `/peladas/${P}/sorteio/cancelar-confirmacao`, t);
ok(r.status === 409, 'não cancela a confirmação do sorteio com partida em aberto');
r = await req('PUT', `/peladas/${P}/partidas/regras`, t, { duracaoMin: 5, golsLimite: 2 });
ok(r.status === 409, 'não muda regras com partida em aberto');
r = await req('DELETE', `/partidas/${J4}`, t);
ok(r.status === 204, 'cancela partida que não começou');

// ---- outra pelada com regras diferentes --------------------------------------
const P2 = await nova('2026-10-31');
await req('POST', `/peladas/${P2}/sorteio`, t, { nTimes: 2, seed: 3 });
await req('POST', `/peladas/${P2}/sorteio/confirmar`, t);
await req('PUT', `/peladas/${P2}/partidas/regras`, t, { duracaoMin: 7, golsLimite: 5 });
const g2 = await req('GET', `/peladas/${P2}/partidas`, t);
const g1 = await req('GET', `/peladas/${P}/partidas`, t);
ok(g2.json.regras.duracaoMin === 7 && g2.json.regras.golsLimite === 5 && g1.json.regras.duracaoMin === 10 && g1.json.regras.golsLimite === 3, 'duas peladas, regras diferentes, sem interferência');
ok(g2.json.partidas.length === 0, 'partidas de uma pelada não aparecem na outra');
ok(g1.json.partidas.every((x) => x.duracaoMin === 10 && x.golsLimite === 3), 'todas as partidas da pelada 1 usam as mesmas regras (10min/3 gols)');

// ---- jogador comum só lê ------------------------------------------------------
r = await req('POST', `/peladas/${P}/partidas`, jogadores[2].token, { timeAId: tA.id, timeBId: tC.id });
ok(r.status === 403, 'jogador comum não cria partida');
r = await req('GET', `/peladas/${P}/partidas`, jogadores[2].token);
ok(r.status === 200 && r.json.souAdmin === false, 'jogador comum consegue acompanhar');

console.log(falhas === 0 ? '\nTUDO OK' : `\n${falhas} FALHA(S)`);
console.log(JSON.stringify({ org, P, P2, dono: dono.json.usuario.id }));
process.exit(falhas === 0 ? 0 : 1);
