#!/usr/bin/env node
/**
 * Busca os escudos oficiais dos times do catálogo (packages/shared/src/times.ts)
 * no Wikimedia Commons e salva em apps/api/assets/escudos/<id>.png.
 *
 * Por quê o Commons: os arquivos vêm com metadado de licença explícito
 * (`extmetadata.LicenseShortName` / `Restrictions`). A maioria dos brasões de
 * clube lá está marcada `Public domain` (forma geométrica/texto simples —
 * "PD-textlogo"/"PD-shape") + `Restrictions: trademarked`: pode reproduzir a
 * imagem, mas ela continua sendo marca do clube (não implica endosso, não é
 * pra revender). É exatamente o uso daqui — identificar o time do coração
 * da pessoa dentro do próprio app.
 *
 * APIs "oficiais" de futebol (football-data.org, API-FOOTBALL, TheSportsDB
 * com imagem) todas exigem cadastro/token — o Claude não cria conta em nome
 * de ninguém, então não dá pra automatizar por elas sem você.
 *
 * Busca automática por nome + heurística (SVG > PNG, título com
 * logo/crest/escudo/brasão, evita camisa/estádio/mapa/torcida). Sempre
 * confira o resultado — o script erra de vez em quando.
 *
 * Uso:
 *   node scripts/buscar-escudos.mjs                # todos os times sem escudo ainda
 *   node scripts/buscar-escudos.mjs flamengo vasco  # só os ids (refaz mesmo se já existir)
 *   node scripts/buscar-escudos.mjs --arquivo flamengo "Clube de Regatas do Flamengo logo.svg"
 *                                                    # força um arquivo específico do Commons
 */
import { writeFile, mkdir, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEMAS } from '../packages/shared/dist/times.js';

const aqui = dirname(fileURLToPath(import.meta.url));
const DIR_ESCUDOS = join(aqui, '..', 'apps', 'api', 'assets', 'escudos');
const LARGURA = 400;
const UA = 'Resenha05/1.0 (escudo do time do coracao; uso interno, contato via github.com/Tiagosilvag/resenha05)';

const PROIBIDAS =
  /\b(kit|jersey|uniform|shirt|camisa|stadium|estadio|arena|map|mapa|flag of|mascot|torcida|ultras|fan|celebrat|trophy|troféu|player|portrait|jogador|montage|collage|location|wordmark|igreja|church|iglesia|jesucristo|santos dos ultimos dias|latter.day|universidade|university|faculdade|fundação|fundacao|prefeitura|municipio|município|diocese|família|familia|brasão de|brasao de|coat of arms of|cidade de|city of)\b/i;
const BOAS = /\b(logo|crest|escudo|brasao|brasão|badge|shield|emblem)\b/i;

// nome completo/oficial pra desambiguar times cujo nome curto colide com
// outra coisa no Commons (cidade, santo, igreja, universidade, outro clube).
const CONSULTA_OFICIAL = {
  flamengo: 'Clube de Regatas do Flamengo',
  corinthians: 'Sport Club Corinthians Paulista',
  palmeiras: 'Sociedade Esportiva Palmeiras',
  'sao-paulo': 'São Paulo Futebol Clube',
  santos: 'Santos Futebol Clube',
  vasco: 'Club de Regatas Vasco da Gama futebol',
  botafogo: 'Botafogo de Futebol e Regatas',
  fluminense: 'Fluminense Football Club',
  gremio: 'Grêmio Foot-Ball Porto Alegrense',
  internacional: 'Sport Club Internacional',
  cruzeiro: 'Cruzeiro Esporte Clube',
  'atletico-mg': 'Clube Atlético Mineiro',
  'athletico-pr': 'Club Athletico Paranaense',
  bahia: 'Esporte Clube Bahia',
  vitoria: 'Esporte Clube Vitória futebol Bahia',
  sport: 'Sport Club do Recife',
  nautico: 'Clube Náutico Capibaribe',
  fortaleza: 'Fortaleza Esporte Clube',
  ceara: 'Ceará Sporting Club',
  goias: 'Goiás Esporte Clube',
  coritiba: 'Coritiba Foot Ball Club',
  bragantino: 'Red Bull Bragantino',
  cuiaba: 'Cuiabá Esporte Clube',
  mirassol: 'Mirassol Futebol Clube',
  remo: 'Clube do Remo',
  paysandu: 'Paysandu Sport Club',
  chapecoense: 'Associação Chapecoense de Futebol',
  selecao: 'Brazilian Football Confederation',
  'real-madrid': 'Real Madrid Club de Fútbol',
  barcelona: 'Futbol Club Barcelona',
  'manchester-united': 'Manchester United Football Club',
  liverpool: 'Liverpool Football Club',
  psg: 'Paris Saint-Germain Football Club',
  boca: 'Club Atlético Boca Juniors',
  river: 'Club Atlético River Plate',
  milan: 'Associazione Calcio Milan',
  'inter-milao': 'Football Club Internazionale Milano',
  bayern: 'FC Bayern Munich',
};

function normaliza(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

async function chamarApi(params, tentativa = 0) {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.search = new URLSearchParams({ format: 'json', ...params }).toString();
  const resp = await fetch(url, { headers: { 'user-agent': UA } });
  const texto = await resp.text();
  if (!resp.ok || texto.startsWith('You are making too many requests')) {
    if (tentativa < 3) {
      await pausa(2000 * (tentativa + 1));
      return chamarApi(params, tentativa + 1);
    }
    throw new Error(`Commons respondeu ${resp.status}: ${texto.slice(0, 80)}`);
  }
  return JSON.parse(texto);
}

async function buscarCandidatos(id, nomeCurto) {
  const oficial = CONSULTA_OFICIAL[id];
  const consultas = oficial
    ? [`${oficial} logo`, `${oficial} crest`]
    : [`${nomeCurto} logo`, `${nomeCurto} crest`, `${nomeCurto} escudo`];

  const vistos = new Set();
  const candidatos = [];
  for (const consulta of consultas) {
    const d = await chamarApi({ action: 'query', list: 'search', srnamespace: '6', srlimit: '8', srsearch: consulta });
    for (const r of d.query?.search ?? []) {
      if (vistos.has(r.title)) continue;
      vistos.add(r.title);
      const arquivo = r.title.replace(/^File:/, '');
      // só imagem de verdade — Commons também indexa PDF/DjVu de jornal,
      // partitura etc. que batem por palavra-chave mas não são o escudo
      if (!/\.(svg|png|jpe?g|gif|webp)$/i.test(arquivo)) continue;
      candidatos.push(arquivo);
    }
    await pausa(1200);
  }
  return candidatos;
}

function pontuar(arquivo, id, nomeCurto) {
  let p = 0;
  const t = normaliza(arquivo);
  const alvo = normaliza(CONSULTA_OFICIAL[id] ?? nomeCurto);
  const palavras = alvo.split(' ').filter((w) => w.length >= 3 && !['futebol', 'clube', 'esporte', 'sport', 'club', 'football', 'fc', 'ec', 'sc'].includes(w));
  const bateu = palavras.filter((w) => t.includes(w)).length;
  // precisa bater pelo menos metade das palavras "fortes" do nome oficial —
  // é isso que evita pegar "Igreja dos Santos" quando o time é "Santos"
  if (palavras.length > 0 && bateu / palavras.length >= 0.5) p += 6;
  else p -= 8;
  if (normaliza(nomeCurto).length >= 4 && t.includes(normaliza(nomeCurto))) p += 2;
  if (/\.svg$/i.test(arquivo)) p += 3;
  if (BOAS.test(arquivo)) p += 3;
  if (PROIBIDAS.test(arquivo)) p -= 12;
  return p;
}

async function buscarInfo(arquivo) {
  const d = await chamarApi({ action: 'query', titles: `File:${arquivo}`, prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: String(LARGURA) });
  const pagina = Object.values(d.query?.pages ?? {})[0];
  const info = pagina?.imageinfo?.[0];
  if (!info) throw new Error('arquivo não encontrado no Commons');
  return info;
}

async function baixarArquivo(id, arquivo) {
  const info = await buscarInfo(arquivo);
  const licenca = info.extmetadata?.LicenseShortName?.value ?? '(sem info de licença — confira)';
  const restricoes = info.extmetadata?.Restrictions?.value ?? '';
  const urlImagem = info.thumburl ?? info.url;
  const resp = await fetch(urlImagem, { headers: { 'user-agent': UA } });
  if (!resp.ok) throw new Error(`download falhou (${resp.status})`);
  const buf = Buffer.from(await resp.arrayBuffer());
  await writeFile(join(DIR_ESCUDOS, `${id}.png`), buf);
  return { arquivo, licenca, restricoes, urlImagem, bytes: buf.length };
}

async function existeArquivo(caminho) {
  try {
    await access(caminho);
    return true;
  } catch {
    return false;
  }
}

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await mkdir(DIR_ESCUDOS, { recursive: true });
  const args = process.argv.slice(2);

  if (args[0] === '--arquivo') {
    const [, id, arquivo] = args;
    const r = await baixarArquivo(id, arquivo);
    console.log(`✓ ${id}: ${r.arquivo} — ${r.licenca}${r.restricoes ? ` (${r.restricoes})` : ''}`);
    console.log(`  origem: ${r.urlImagem}`);
    return;
  }

  const pedidos = args;
  const alvos = pedidos.length > 0 ? TEMAS.filter((t) => pedidos.includes(t.id)) : TEMAS;
  console.log(`Buscando escudo de ${alvos.length} time(s) no Wikimedia Commons...\n`);

  const resultados = [];
  for (const tema of alvos) {
    const destino = join(DIR_ESCUDOS, `${tema.id}.png`);
    if (pedidos.length === 0 && (await existeArquivo(destino))) {
      console.log(`- ${tema.id.padEnd(18)} já existe, pulando`);
      continue;
    }
    try {
      const candidatos = await buscarCandidatos(tema.id, tema.nome);
      if (candidatos.length === 0) throw new Error('nenhum resultado');
      const melhor = candidatos.map((a) => [a, pontuar(a, tema.id, tema.nome)]).sort((a, b) => b[1] - a[1])[0];
      if (melhor[1] < 4) throw new Error(`nenhum candidato confiável (melhor: "${melhor[0]}", pontos ${melhor[1]})`);
      const r = await baixarArquivo(tema.id, melhor[0]);
      console.log(`✓ ${tema.id.padEnd(18)} ${r.arquivo}`);
      console.log(`    ${r.licenca}${r.restricoes ? ` · ${r.restricoes}` : ''} — ${(r.bytes / 1024).toFixed(0)} KB`);
      resultados.push({ id: tema.id, ok: true, arquivo: r.arquivo });
    } catch (e) {
      console.log(`✗ ${tema.id.padEnd(18)} ${e.message}`);
      resultados.push({ id: tema.id, ok: false, erro: e.message });
    }
    await pausa(1500);
  }

  const falhas = resultados.filter((r) => !r.ok);
  console.log(`\n${resultados.length - falhas.length}/${resultados.length} baixados.`);
  if (falhas.length) console.log('Sem escudo (ficam com o genérico sigla+cores):', falhas.map((f) => f.id).join(', '));
  console.log('\nCONFIRA as imagens em apps/api/assets/escudos/*.png antes de subir — a busca automática');
  console.log('erra de vez em quando. Pra corrigir um: node scripts/buscar-escudos.mjs --arquivo <id> "Nome do arquivo.svg"');
  console.log('Depois suba o VERSAO_LAYOUT em apps/api/src/modules/cartinha/rotas.ts pra regerar as cartas em cache.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
