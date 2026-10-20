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
  try { json = await r.json(); } catch {}
  return { status: r.status, json };
};
const cad = (nome, tel) => req('POST', '/auth/cadastro', null, { nome, telefone: tel, senha: 'senha12345' });

async function montar(prefixoTel, nJogadores, porTime, nomeOrg) {
  const dono = await cad(`Dono ${nomeOrg}`, `+55119${prefixoTel}0000`.slice(0, 14));
  const t = dono.json.accessToken;
  const org = (await req('POST', '/organizacoes', t, { nome: nomeOrg })).json.id;
  const pg = (await import('pg')).default;
  const c = new pg.Client({ connectionString: 'postgres://resenha05:resenha05@127.0.0.1:55432/resenha05' });
  await c.connect();
  await c.query(`update organizacoes set status_assinatura='ativa' where id='${org}'`);
  await c.end();
  const ids = [dono.json.usuario.id];
  for (let i = 1; i < nJogadores; i++) {
    const r = await cad(`${nomeOrg} J${i}`, `+55119${prefixoTel}${String(i).padStart(4, '0')}`);
    await req('POST', `/organizacoes/${org}/entrar`, r.json.accessToken);
    ids.push(r.json.usuario.id);
  }
  const estrelas = [5, 4, 4, 3, 3, 3, 2, 2, 1, 4, 3, 2, 3];
  for (let i = 0; i < nJogadores; i++) await req('POST', `/organizacoes/${org}/membros/estrelas`, t, { profileId: ids[i], estrelas: estrelas[i % estrelas.length] });
  const P = (await req('POST', `/organizacoes/${org}/peladas`, t, { data: '2026-11-07', valor: 0 })).json.id;
  await req('POST', `/peladas/${P}/presencas/todos`, t);
  await req('POST', `/peladas/${P}/sorteio`, t, { jogadoresPorTime: porTime, seed: 9 });
  await req('POST', `/peladas/${P}/sorteio/confirmar`, t);
  await req('PUT', `/peladas/${P}/partidas/regras`, t, { duracaoMin: 10, golsLimite: 5 });
  return { t, P, org, ids };
}

// ======== Cenário A: 9 jogadores (4+4+1) — único time esperando ===================
{
  const { t, P } = await montar('5501', 9, 4, 'SubA');
  let g = (await req('GET', `/peladas/${P}/partidas`, t)).json;
  const [A, Bt, C] = g.times;
  ok(A.jogadores.length === 4 && Bt.jogadores.length === 4 && C.jogadores.length === 1, 'A: times 4,4,1');
  const J = (await req('POST', `/peladas/${P}/partidas`, t, { timeAId: A.id, timeBId: Bt.id })).json.id;
  await req('POST', `/partidas/${J}/iniciar`, t);
  g = (await req('GET', `/peladas/${P}/partidas`, t)).json;
  ok(g.fila.length === 1 && g.fila[0] === C.id, 'A: fila de espera = só o time incompleto');

  const saindo = A.jogadores[0];
  const entrando = C.jogadores[0];
  let r = await req('POST', `/partidas/${J}/substituicoes`, t, { saiProfileId: saindo.profileId, entraProfileId: entrando.profileId, voltaAJogar: true });
  ok(r.status === 201 && r.json.destinoTimeId === C.id, 'A: troca feita; quem saiu foi para o único time da fila');
  g = (await req('GET', `/peladas/${P}/partidas`, t)).json;
  const tam = (id) => g.times.find((x) => x.id === id).jogadores.map((j) => j.profileId);
  ok(tam(A.id).includes(entrando.profileId) && !tam(A.id).includes(saindo.profileId) && tam(A.id).length === 4, 'A: time 1 continua com 4, agora com o substituto');
  ok(tam(C.id).includes(saindo.profileId) && tam(C.id).length === 1, 'A: time 3 ficou com quem saiu');
  const p = g.partidas[0];
  ok(p.jogadores.filter((x) => x.timeId === A.id && x.ativo).length === 4, 'A: 4 jogadores em quadra pelo time 1');
  ok(p.jogadores.find((x) => x.profileId === saindo.profileId).ativo === false, 'A: quem saiu consta como fora de quadra (histórico mantido)');
  ok(p.substituicoes.length === 1 && p.substituicoes[0].destino === C.nome, 'A: troca registrada com destino');

  r = await req('POST', `/partidas/${J}/gols`, t, { timeId: A.id, profileId: saindo.profileId });
  ok(r.status === 422, 'A: quem saiu não pode marcar gol');
  r = await req('POST', `/partidas/${J}/gols`, t, { timeId: A.id, profileId: entrando.profileId });
  ok(r.status === 201, 'A: o substituto marca gol pelo time 1');
  r = await req('POST', `/partidas/${J}/substituicoes`, t, { saiProfileId: Bt.jogadores[0].profileId, entraProfileId: A.jogadores[1].profileId, voltaAJogar: true });
  ok(r.status === 422, 'A: quem entra tem que estar num time que espera (não no adversário)');
  r = await req('POST', `/partidas/${J}/substituicoes`, t, { saiProfileId: saindo.profileId, entraProfileId: Bt.jogadores[1].profileId, voltaAJogar: true });
  ok(r.status === 422, 'A: quem já saiu não sai de novo');
  r = await req('POST', `/partidas/${J}/substituicoes`, t, { saiProfileId: A.jogadores[1].profileId, entraProfileId: A.jogadores[1].profileId });
  ok(r.status === 422, 'A: sair e entrar o mesmo jogador é recusado');
  r = await req('POST', `/partidas/${J}/substituicoes`, jogadoresDeUmNaoAdmin(g), { });
  await req('POST', `/partidas/${J}/encerrar`, t);
  r = await req('POST', `/partidas/${J}/substituicoes`, t, { saiProfileId: A.jogadores[1].profileId, entraProfileId: saindo.profileId, voltaAJogar: true });
  ok(r.status === 409, 'A: não troca em partida encerrada');
  // concluir usa a composição atual (com a troca)
  r = await req('POST', `/partidas/${J}/concluir`, t, { perdedorTimeId: Bt.id });
  g = (await req('GET', `/peladas/${P}/partidas`, t)).json;
  const todos = g.times.flatMap((x) => x.jogadores.map((j) => j.profileId));
  ok(r.status === 200 && new Set(todos).size === 9, 'A: concluir depois da troca mantém os 9 jogadores sem duplicar');
}

function jogadoresDeUmNaoAdmin() { return null; }

// ======== Cenário B: 13 jogadores (4+4+4+1) — fila com 2 times esperando ===========
{
  const { t, P } = await montar('5502', 13, 4, 'SubB');
  let g = (await req('GET', `/peladas/${P}/partidas`, t)).json;
  const [T1, T2, T3, T4] = g.times;
  ok([T1, T2, T3, T4].map((x) => x.jogadores.length).join() === '4,4,4,1', 'B: times 4,4,4,1');
  const J = (await req('POST', `/peladas/${P}/partidas`, t, { timeAId: T1.id, timeBId: T2.id })).json.id;
  await req('POST', `/partidas/${J}/iniciar`, t);
  g = (await req('GET', `/peladas/${P}/partidas`, t)).json;
  ok(g.fila.join() === [T3.id, T4.id].join(), 'B: fila = Time 3 (completo) depois Time 4 (incompleto)');

  const saindo = T1.jogadores[1];
  const entrando = T3.jogadores[0];
  let r = await req('POST', `/partidas/${J}/substituicoes`, t, { saiProfileId: saindo.profileId, entraProfileId: entrando.profileId, voltaAJogar: true });
  ok(r.status === 201 && r.json.destinoTimeId === T4.id, 'B: quem saiu foi para o ÚLTIMO time da fila (Time 4), não para o do substituto');
  g = (await req('GET', `/peladas/${P}/partidas`, t)).json;
  const ids = (id) => g.times.find((x) => x.id === id).jogadores.map((j) => j.profileId);
  ok(ids(T1.id).length === 4 && ids(T1.id).includes(entrando.profileId), 'B: Time 1 segue com 4 (agora com o substituto)');
  ok(ids(T3.id).length === 3 && !ids(T3.id).includes(entrando.profileId), 'B: Time 3 (próximo) ficou com 3');
  ok(ids(T4.id).length === 2 && ids(T4.id).includes(saindo.profileId), 'B: Time 4 (fim da fila) ficou com 2, incluindo quem saiu');

  // lesão: não volta a jogar hoje
  const machucado = T2.jogadores[0];
  const entra2 = T3.jogadores[1];
  r = await req('POST', `/partidas/${J}/substituicoes`, t, { saiProfileId: machucado.profileId, entraProfileId: entra2.profileId, voltaAJogar: false });
  g = (await req('GET', `/peladas/${P}/partidas`, t)).json;
  const todos = g.times.flatMap((x) => x.jogadores.map((j) => j.profileId));
  ok(r.status === 201 && r.json.destinoTimeId === null && !todos.includes(machucado.profileId), 'B: lesionado sai dos times e não volta a jogar hoje');
  ok(g.partidas[0].substituicoes[1].destino === null, 'B: registro da troca marca que não volta');
  ok(g.partidas[0].jogadores.filter((x) => x.timeId === T2.id && x.ativo).length === 4, 'B: Time 2 continua com 4 em quadra');
  ok(g.partidas[0].jogadores.length === 8 + 2, 'B: histórico guarda os 8 originais + 2 substitutos');
}

console.log(falhas === 0 ? '\nTUDO OK' : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
