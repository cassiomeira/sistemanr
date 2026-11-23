// WhatsApp (Baileys) + Grok: recebe comprovantes/comandos e lança nas contas a pagar da empresa
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./database');
const grok = require('./grok');
const boletoLib = require('./boleto');

const dataDir = path.join(__dirname, 'data');
const authDir = path.join(dataDir, 'whatsapp', 'auth');
const cfgPath = path.join(dataDir, 'whatsapp.json');
const comprovantesDir = path.join(dataDir, 'comprovantes');
for (const d of [path.join(dataDir, 'whatsapp'), comprovantesDir]) if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });

const MARCA = '🤖'; // prefixo das respostas do próprio sistema (para não reprocessar)
const MAX_LOG = 60;

let deps = {}; // { atualizarConta(slug,id,fields,quem), criarConta(slug,item,quem) } — injetados pelo server.js
let sock = null, baileys = null, logger = null;
let estado = { status: 'desligado', qr: '', numero: '', erro: '', desde: '' };
let reconectarTimer = null, tentativas = 0, conectando = false;
const gruposCache = {}; // jid -> { nome, ultima }
const pendentes = {};   // jid -> pergunta aguardando resposta numérica
const logEventos = [];
const idsEnviados = new Set();

// ---------- configuração ----------
function lerConfig() {
  try { return Object.assign({ ativo: false, grok_api_key: '', grok_model: '', grupos: {}, autorizados: [], empresa_padrao: '', grupos_padrao: {}, resumo_diario: true }, JSON.parse(fs.readFileSync(cfgPath, 'utf8'))); }
  catch (e) { return { ativo: false, grok_api_key: '', grok_model: '', grupos: {}, autorizados: [], empresa_padrao: '', grupos_padrao: {}, resumo_diario: true }; }
}
function salvarConfig(novo) {
  const atual = lerConfig();
  const cfg = Object.assign({}, atual, novo);
  if (novo.grok_api_key === undefined) cfg.grok_api_key = atual.grok_api_key;
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  return cfg;
}
function grokCfg() { const c = lerConfig(); return { apiKey: c.grok_api_key, modelo: c.grok_model || grok.MODELO_PADRAO }; }

function registrar(tipo, texto, extra) {
  logEventos.unshift(Object.assign({ quando: new Date().toISOString(), tipo, texto }, extra || {}));
  if (logEventos.length > MAX_LOG) logEventos.length = MAX_LOG;
  console.log('[WhatsApp]', tipo, texto);
}

// ---------- conexão ----------
async function carregarBaileys() {
  if (baileys) return baileys;
  const mod = await import('@whiskeysockets/baileys');
  baileys = Object.assign({}, mod, { makeWASocket: mod.default || mod.makeWASocket });
  const pino = require('pino');
  logger = pino({ level: 'silent' });
  return baileys;
}

async function conectar() {
  if (conectando || (sock && estado.status === 'conectado')) return;
  conectando = true;
  clearTimeout(reconectarTimer);
  try {
    const b = await carregarBaileys();
    const { state, saveCreds } = await b.useMultiFileAuthState(authDir);
    let version;
    try { version = (await b.fetchLatestBaileysVersion()).version; } catch (e) { version = undefined; }
    estado = Object.assign(estado, { status: 'conectando', qr: '', erro: '' });
    sock = b.makeWASocket({
      version, logger,
      auth: { creds: state.creds, keys: b.makeCacheableSignalKeyStore(state.keys, logger) },
      browser: ['Sistema Nunes Rocha', 'Chrome', '1.0'],
      syncFullHistory: false,
      markOnlineOnConnect: false,
    });
    const meuSock = sock;
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', async (u) => {
      if (meuSock !== sock) return;
      if (u.qr) {
        try { estado.qr = await require('qrcode').toDataURL(u.qr, { margin: 1, width: 280 }); } catch (e) { estado.qr = ''; }
        estado.status = 'qr';
      }
      if (u.connection === 'open') {
        tentativas = 0;
        const id = (sock.user && (sock.user.id || '')) || '';
        estado = Object.assign(estado, { status: 'conectado', qr: '', erro: '', numero: id.split(':')[0].split('@')[0], desde: new Date().toISOString() });
        registrar('conexao', 'WhatsApp conectado como ' + estado.numero);
        salvarConfig({ ativo: true });
        atualizarGrupos().catch(() => {});
      }
      if (u.connection === 'close') {
        const code = u.lastDisconnect && u.lastDisconnect.error && u.lastDisconnect.error.output && u.lastDisconnect.error.output.statusCode;
        const saiu = code === b.DisconnectReason.loggedOut || code === 401;
        estado = Object.assign(estado, { status: 'desligado', qr: '' });
        sock = null;
        if (saiu) {
          registrar('conexao', 'Sessão encerrada no celular — é preciso ler o QR de novo');
          limparAuth();
          salvarConfig({ ativo: false });
          estado.erro = 'Sessão encerrada. Clique em Conectar e leia o QR novamente.';
        } else if (lerConfig().ativo) {
          tentativas++;
          const espera = Math.min(60000, 3000 * tentativas);
          const motivo = code === 440 ? 'sessão aberta em outro lugar (normal por alguns segundos durante um deploy)' : code === 408 ? 'tempo esgotado' : code === 428 ? 'conexão perdida' : code === 515 ? 'reinício pedido pelo WhatsApp' : 'código ' + code;
          estado.erro = 'Conexão caiu (' + motivo + '). Reconectando em ' + Math.round(espera / 1000) + 's...';
          registrar('conexao', 'Conexão caiu: ' + motivo);
          reconectarTimer = setTimeout(() => conectar().catch(e => registrar('erro', e.message)), espera);
        }
      }
    });
    sock.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const m of messages) tratarMensagem(m).catch(e => registrar('erro', 'Falha ao tratar mensagem: ' + e.message));
    });
  } catch (e) {
    estado = Object.assign(estado, { status: 'desligado', erro: 'Erro ao iniciar WhatsApp: ' + e.message });
    registrar('erro', e.message);
  } finally { conectando = false; }
}

function limparAuth() { try { fs.rmSync(authDir, { recursive: true, force: true }); } catch (e) {} }

async function desconectar(apagarSessao) {
  clearTimeout(reconectarTimer);
  salvarConfig({ ativo: false });
  const s = sock; sock = null;
  if (s) { try { if (apagarSessao) await s.logout(); else s.end(undefined); } catch (e) {} }
  if (apagarSessao) limparAuth();
  estado = Object.assign(estado, { status: 'desligado', qr: '', erro: '' });
  registrar('conexao', apagarSessao ? 'Sessão do WhatsApp removida' : 'WhatsApp desligado');
}

async function atualizarGrupos() {
  if (!sock || estado.status !== 'conectado') return gruposCache;
  try {
    const todos = await sock.groupFetchAllParticipating();
    for (const jid of Object.keys(todos)) gruposCache[jid] = Object.assign(gruposCache[jid] || {}, { nome: todos[jid].subject || jid });
  } catch (e) { registrar('erro', 'Não consegui listar grupos: ' + e.message); }
  return gruposCache;
}

// ---------- utilidades de mensagem ----------
function desembrulhar(msg) {
  let m = msg || {};
  for (let i = 0; i < 4; i++) {
    if (m.ephemeralMessage) m = m.ephemeralMessage.message || {};
    else if (m.viewOnceMessage) m = m.viewOnceMessage.message || {};
    else if (m.viewOnceMessageV2) m = m.viewOnceMessageV2.message || {};
    else if (m.documentWithCaptionMessage) m = m.documentWithCaptionMessage.message || {};
    else break;
  }
  return m;
}
const ehPn = j => /@s\.whatsapp\.net$/.test(j || '');
const soDigitos = s => String(s || '').replace(/\D/g, '');
function remetentePn(m) {
  const k = m.key || {};
  const cands = k.fromMe ? [estado.numero + '@s.whatsapp.net'] : [k.participant, k.participantAlt, k.remoteJid, k.remoteJidAlt];
  const pn = cands.find(ehPn) || '';
  return soDigitos(pn.split('@')[0].split(':')[0]);
}
function nomeAutorizado(numero, fromMe) {
  const cfg = lerConfig();
  const vs = variantesNumero(numero); // aceita o número com ou sem o 9 depois do DDD; número vazio nunca é autorizado
  if (vs.length) {
    const a = (cfg.autorizados || []).find(x => variantesNumero(x.numero).some(n => vs.includes(n)));
    if (a) return a.nome || numero;
  }
  if (fromMe) return (cfg.autorizados || [])[0] && (cfg.autorizados || [])[0].nome || 'WhatsApp';
  return null;
}
const fmtV = v => 'R$ ' + (parseFloat(v) || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const fmtD = d => (d && /^\d{4}-\d{2}-\d{2}/.test(d)) ? d.substring(0, 10).split('-').reverse().join('/') : (d || '');
const hojeISO = () => new Date(Date.now() - 3 * 3600000).toISOString().substring(0, 10); // Brasília
function somaDias(iso, n) { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().substring(0, 10); }

async function responder(jid, texto, quoted) {
  if (!sock) return;
  try {
    const r = await sock.sendMessage(jid, { text: MARCA + ' ' + texto }, quoted ? { quoted } : undefined);
    if (r && r.key && r.key.id) idsEnviados.add(r.key.id);
  } catch (e) { registrar('erro', 'Falha ao responder: ' + e.message); }
}

async function extrairPdfTexto(buffer) {
  try {
    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    try { const r = await parser.getText(); return (r && r.text || '').trim(); } finally { try { await parser.destroy(); } catch (e) {} }
  } catch (e) { return ''; }
}

async function transcreverPdf(buffer, nome) {
  try {
    const j = await grok.perguntarPdfJson(grokCfg(), buffer, nome, 'Este arquivo é um comprovante de pagamento/transferência brasileiro. Transcreva TODOS os textos legíveis e devolva SOMENTE JSON: {"texto":"transcrição completa, linha por linha","valor":0.00,"data":"YYYY-MM-DD","favorecido":"quem recebeu","pagador":"quem pagou","descricao":"tipo (PIX, boleto, TED...) e finalidade se houver"}. Valores com ponto decimal. Se algo não estiver legível, deixe vazio — nunca invente.');
    return { texto: (j.texto || '') + '\nVALOR: ' + (j.valor || '') + '\nDATA: ' + (j.data || '') + '\nFAVORECIDO: ' + (j.favorecido || '') + '\nPAGADOR: ' + (j.pagador || '') + '\nDESCRICAO: ' + (j.descricao || '') };
  } catch (e) { registrar('erro', 'Leitura do PDF: ' + e.message); return { error: e.message }; }
}

// ---------- histórico do fornecedor / normalização ----------
const PALAVRAS_VAZIAS = new Set(['ltda', 'me', 'epp', 'eireli', 'sa', 's', 'a', 'cia', 'de', 'da', 'do', 'das', 'dos', 'e', 'com', 'comercio']);
function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').split(' ').filter(w => w && !PALAVRAS_VAZIAS.has(w)).join(' ');
}
const chaveDesc = d => norm(d).split(' ').slice(0, 3).join(' ');

// Um registro por fornecedor (o lançamento mais recente) e, sem fornecedor, por início da descrição
function historico(slug) {
  const vistos = new Map();
  let lista = [];
  try { lista = db.historicoContas(slug); } catch (e) {}
  for (const c of lista) {
    const k = norm(c.fornecedor) ? 'f:' + norm(c.fornecedor) : (chaveDesc(c.descricao) ? 'd:' + chaveDesc(c.descricao) : '');
    if (!k || vistos.has(k)) continue;
    vistos.set(k, { fornecedor: c.fornecedor || '', descricao: c.descricao || '', categoria: c.categoria || '', tipo_nota: c.tipo_nota || '', recorrente: c.recorrente ? 1 : 0, valor: c.valor });
  }
  return [...vistos.values()];
}
function acharNoHistorico(hist, fornecedor, descricao) {
  const nf = norm(fornecedor);
  if (nf) {
    const exato = hist.find(x => x.fornecedor && norm(x.fornecedor) === nf);
    if (exato) return exato;
    const parecido = hist.find(x => { const n = norm(x.fornecedor); return n && Math.min(n.length, nf.length) >= 4 && (n.includes(nf) || nf.includes(n)); });
    if (parecido) return parecido;
  }
  const nd = chaveDesc(descricao);
  if (nd.length >= 4) return hist.find(x => chaveDesc(x.descricao) === nd) || null;
  return null;
}

// ---------- utilidades ----------
function parseValorBR(s) {
  let t = String(s || '').replace(/[^\d.,]/g, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const v = parseFloat(t);
  return isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null;
}
function dataDoTexto(dia, mes, ano) {
  const hoje = hojeISO();
  let a = ano ? parseInt(ano, 10) : parseInt(hoje.substring(0, 4), 10);
  if (a < 100) a += 2000;
  const d = String(parseInt(dia, 10)).padStart(2, '0'), m = String(parseInt(mes, 10)).padStart(2, '0');
  if (+d < 1 || +d > 31 || +m < 1 || +m > 12) return null;
  let iso = a + '-' + m + '-' + d;
  if (!ano && iso < somaDias(hoje, -180)) iso = (a + 1) + '-' + m + '-' + d;
  return iso;
}
function somaMeses(iso, n) {
  const [a, m, d] = iso.split('-').map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + n, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  return alvo.getUTCFullYear() + '-' + String(alvo.getUTCMonth() + 1).padStart(2, '0') + '-' + String(Math.min(d, ultimo)).padStart(2, '0');
}
const novoId = () => crypto.randomBytes(5).toString('hex');
const estaPaga = c => !!(c && c.pago_por && c.pago_por !== 'A Pagar');
const txtDF = t => t === 'D' ? 'Dentro' : (t === 'F' ? 'Fora' : 'D/F não definido');

function resumoConta(c) {
  if (!c) return '';
  return '• ' + c.descricao + ' — *' + fmtV(c.valor) + '* — venc. ' + fmtD(c.vencimento)
    + (c.fornecedor ? '\n   Fornecedor: ' + c.fornecedor : '')
    + '\n   ' + (c.categoria || 'Outros') + ' · ' + txtDF(c.tipo_nota) + ' · ' + (c.recorrente ? 'recorrente' : 'não recorrente')
    + ' · ' + (estaPaga(c) ? 'paga (' + c.pago_por + ')' : 'pendente');
}
const DICA = '\n\n_Para corrigir, responda (pode juntar na mesma mensagem, ex.: "rec d" ou "valor 350 f"): D, F, rec, não rec, cat <categoria>, venc 10/12, valor 450, forn <nome>, desc <texto> ou desfazer._';

// ---------- comprovantes repetidos (hash do arquivo) ----------
const hashesPath = path.join(dataDir, 'whatsapp', 'hashes.json');
function lerHashes() { try { return JSON.parse(fs.readFileSync(hashesPath, 'utf8')); } catch (e) { return {}; } }
function hashArquivo(media) { return media && media.buffer ? crypto.createHash('sha1').update(media.buffer).digest('hex') : ''; }
function arquivoJaVisto(media) { const h = hashArquivo(media); return h ? lerHashes()[h] || null : null; }
function guardarHash(media, slug, contaId) {
  const h = hashArquivo(media); if (!h) return;
  const todos = lerHashes(); todos[h] = { slug, conta: contaId, quando: new Date().toISOString() };
  const chaves = Object.keys(todos); if (chaves.length > 3000) for (const k of chaves.slice(0, chaves.length - 3000)) delete todos[k];
  try { fs.writeFileSync(hashesPath, JSON.stringify(todos)); } catch (e) {}
}

// ---------- apelidos das empresas (grupo com várias empresas / conversa privada) ----------
// Nomes e CNPJs que aparecem no texto, no boleto (pagador/sacado) ou no comprovante (pagador) → slug da empresa.
const APELIDOS_PADRAO = {
  nunesrocha: ['nunes rocha', 'nr casa', 'casa nunes rocha', 'geraldo celso', 'geraldo celso rocha', 'llc.com', 'llc com', '20606315000194', '68378016000176'],
  spntelecom: ['spn', 'spn servicos', 'spn servicos net', 'spn telecom', 'suprinet', '20753858000134', '55010237000145'],
  tmtnetc: ['tmt', 'tmt servicos', 'tmt telecom', 'tmt net', 'tmtnet'],
  clc: ['clc', 'clc transportadora', '64139263000169'],
  drogaria: ['drogaria', 'drugstore', 'drugstore rocha', '05916046000179'],
};
function apelidosCfg(cfg) { return (cfg && cfg.apelidos && typeof cfg.apelidos === 'object') ? cfg.apelidos : APELIDOS_PADRAO; }
const ehCnpj = a => /^\d{14}$/.test(soDigitos(a)) && soDigitos(a).length === String(a).replace(/[\s.\/-]/g, '').length;
// Devolve { slug, motivo } quando só uma empresa bate; { varias: [slugs] } quando bate mais de uma; null quando nenhuma
function identificarEmpresa(texto, cfg) {
  if (!texto) return null;
  const empresas = db.getEmpresas();
  const valida = sl => empresas.some(e => e.slug === sl);
  const t = ' ' + norm(texto) + ' ';
  const cnpjs = new Set((String(texto).match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g) || []).map(soDigitos));
  const procura = mapa => {
    const achadas = {};
    for (const [slug, lista] of Object.entries(mapa)) {
      if (!valida(slug)) continue;
      for (const a of lista || []) {
        if (ehCnpj(a)) { if (cnpjs.has(soDigitos(a))) achadas[slug] = 'CNPJ ' + soDigitos(a); }
        else { const n = norm(a); if (n && t.includes(' ' + n + ' ') && !achadas[slug]) achadas[slug] = '"' + a + '"'; }
      }
    }
    return achadas;
  };
  let achadas = procura(apelidosCfg(cfg)); // apelidos têm prioridade sobre o nome cadastrado da empresa
  if (!Object.keys(achadas).length) achadas = procura(Object.fromEntries(empresas.map(e => [e.slug, [e.nome, e.slug]])));
  const k = Object.keys(achadas);
  if (k.length === 1) return { slug: k[0], motivo: achadas[k[0]] };
  return k.length ? { varias: k } : null;
}

// ---------- casar comprovante com boleto pela linha digitável / código de barras ----------
function paraCodigoBarras(d) {
  d = soDigitos(d);
  if (d.length === 44) return d;
  if (d.length === 47) return d.slice(0, 4) + d.slice(32, 33) + d.slice(33, 47) + d.slice(4, 9) + d.slice(10, 20) + d.slice(21, 31);
  if (d.length === 48) return d.slice(0, 11) + d.slice(12, 23) + d.slice(24, 35) + d.slice(36, 47);
  return '';
}
function codigosNoTexto(textos) {
  const out = new Set();
  for (const t of textos) {
    if (!t) continue;
    for (const m of String(t).match(/\d[\d\s.\-]{42,70}\d/g) || []) { const b = paraCodigoBarras(m); if (b) out.add(b); }
    const b = paraCodigoBarras(t); if (b) out.add(b);
  }
  return out;
}
function contaPelaLinha(textos, slugs) {
  const cods = codigosNoTexto(textos);
  if (!cods.size) return null;
  for (const slug of slugs) {
    let lista = [];
    try { lista = db.getContasComLinha(slug); } catch (e) {}
    const c = lista.find(x => cods.has(paraCodigoBarras(x.linha_digitavel)));
    if (c) return { slug, conta: c };
  }
  return null;
}

// ---------- números autorizados (com ou sem o 9 depois do DDD) ----------
function variantesNumero(n) {
  let d = soDigitos(n);
  if (!d) return [];
  if (d.length === 10 || d.length === 11) d = '55' + d;
  const v = new Set([d]);
  if (d.startsWith('55') && d.length === 13 && d[4] === '9') v.add(d.slice(0, 4) + d.slice(5));
  if (d.startsWith('55') && d.length === 12) v.add(d.slice(0, 4) + '9' + d.slice(4));
  return [...v];
}

// ---------- última ação por conversa (correção rápida / desfazer) ----------
const ultimos = {}; // jid -> { slug, ids, tipo: 'criar'|'alterar', antes: {id: snapshot}, quando }
function lembrarUltimo(jid, slug, ids, tipo, antes) { ultimos[jid] = { slug, ids, tipo, antes: antes || {}, quando: Date.now() }; }

// Lê uma ou mais correções na mesma mensagem: "rec d", "350 forn CEMIG rec sim", "ven 10", "D/F: D".
// Devolve null se sobrar texto que não é comando (aí a mensagem segue para a IA).
const FIM_CMD = String.raw`(?=\s+(?:d|f|dentro|fora|rec|recorrente|mensal|fixa|n[aã]o\s+rec\w*|ven\w*|valor|forn\w*|desc\w*|cat\w*)(?:[\s,;]|$)|\s*[,;]|$)`;
const REGRAS_CMD = [
  [/^(?:d\s*\/\s*f|d-f|df)\s*:?\s*/i, () => null],
  [/^(?:n[aã]o\s+rec(?:orrente)?|rec(?:orrente)?\s+n[aã]o|nrec|avulsa?)(?=[\s,;]|$)/i, () => ({ campo: 'recorrente', valor: 0 })],
  [/^(?:rec(?:orrente)?|mensal|fixa)(?:\s+sim)?(?=[\s,;]|$)/i, () => ({ campo: 'recorrente', valor: 1 })],
  [/^(?:dentro|d)(?=[\s,;]|$)/i, () => ({ campo: 'tipo_nota', valor: 'D' })],
  [/^(?:fora|f)(?=[\s,;]|$)/i, () => ({ campo: 'tipo_nota', valor: 'F' })],
  [/^ven(?:c|ce|cimento)?\s*(?:dia\s+)?(\d{1,2})(?:[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?)?(?=[\s,;]|$)/i, m => ({ campo: 'vencimento', dia: m[1], mes: m[2], ano: m[3] })],
  [/^valor\s*(?:r\$\s*)?([\d.,]+)(?=[\s,;]|$)/i, m => ({ campo: 'valor', valor: parseValorBR(m[1]) })],
  [/^(?:r\$\s*)?(\d[\d.,]*)(?=[\s,;]|$)/i, m => ({ campo: 'valor', valor: parseValorBR(m[1]) })],
  [new RegExp(String.raw`^cat(?:egoria)?\s+(.+?)` + FIM_CMD, 'i'), m => ({ campo: 'categoria', valor: m[1].trim() })],
  [new RegExp(String.raw`^forn(?:ecedor)?\s+(.+?)` + FIM_CMD, 'i'), m => ({ campo: 'fornecedor', valor: m[1].trim() })],
  [new RegExp(String.raw`^desc(?:ri[cç][aã]o)?\s+(.+?)` + FIM_CMD, 'i'), m => ({ campo: 'descricao', valor: m[1].trim() })],
];
function comandoRapido(texto) {
  let t = String(texto || '').trim().replace(/[.!]+$/, '');
  if (/^(desfazer|desfaz|desfaça|desfaca|apagar? (isso|o ultimo|o último|ultimo|último))$/i.test(t)) return { desfazer: true };
  const itens = [];
  for (let guarda = 0; t && guarda < 20; guarda++) {
    t = t.replace(/^[\s,;]+/, '');
    if (!t) break;
    let achou = false;
    for (const [re, fn] of REGRAS_CMD) {
      const m = t.match(re);
      if (m && m[0].length) { const it = fn(m); if (it) itens.push(it); t = t.slice(m[0].length); achou = true; break; }
    }
    if (!achou) return null;
  }
  return itens.length ? { itens } : null;
}

const NOME_TAB = { movimentacao: 'Movimentação', conta_dono: 'Conta do Celso' };
function linhaLanc(slug, l) {
  if (l.tabela === 'movimentacao') {
    const r = (db.getMovimentacao(slug) || []).find(x => x.id === l.id);
    return r ? '• Movimentação: ' + (r.saida ? '*SAÍDA* ' + fmtV(r.saida) : '*ENTRADA* ' + fmtV(r.entrada)) + ' — ' + r.descricao + ' — ' + fmtD(r.data) : '';
  }
  const r = (db.getContaDono(slug) || []).find(x => x.id === l.id);
  return r ? '• Conta do Celso: ' + (r.tipo === 'credito' ? '*CRÉDITO* (Celso pagou) ' : '*DÉBITO* (Celso deve) ') + fmtV(r.valor) + ' — ' + r.descricao + ' — ' + fmtD(r.data) : '';
}
async function aplicarComandoLanc({ jid, m, quem, cmd, u }) {
  const autor = 'WhatsApp (' + quem + ')';
  const { slug } = u;
  if (cmd.desfazer) {
    for (const l of u.lanc) {
      if (l.tabela === 'movimentacao') db.delMovimentacao(slug, l.id); else db.delContaDono(slug, l.id);
      db.addAuditLog(slug, autor, 'excluiu', l.tabela === 'movimentacao' ? 'Movimentação' : 'Conta Dono', 'ID: ' + l.id + ' (desfeito pelo WhatsApp)');
    }
    delete ultimos[jid];
    registrar('desfazer', 'Lançamento em ' + u.lanc.map(l => NOME_TAB[l.tabela]).join(' + '), { quem, empresa: slug });
    await responder(jid, '↩️ Desfeito: apaguei o lançamento em ' + u.lanc.map(l => NOME_TAB[l.tabela]).join(' e ') + '.', m);
    return;
  }
  const mov = {}, dono = {}, ignorados = [];
  for (const it of (cmd.itens || [])) {
    if (it.campo === 'valor' && it.valor) { mov.valor = it.valor; dono.valor = it.valor; }
    else if (it.campo === 'descricao') { mov.descricao = it.valor; dono.descricao = it.valor; }
    else if (it.campo === 'vencimento') {
      const iso = it.iso || dataDoTexto(it.dia, it.mes || hojeISO().substring(5, 7), it.ano);
      if (iso) { mov.data = iso; dono.data = iso; }
    } else ignorados.push(it.campo);
  }
  if (!Object.keys(mov).length) { await responder(jid, 'Em lançamento de Movimentação/Conta do Celso dá para corrigir: valor 9500, desc <texto>, venc 20/11 (data) ou desfazer.', m); return; }
  for (const l of u.lanc) {
    if (l.tabela === 'movimentacao') {
      const r = (db.getMovimentacao(slug) || []).find(x => x.id === l.id) || {};
      const f = {};
      if (mov.valor) { if (r.saida) f.saida = mov.valor; else f.entrada = mov.valor; }
      if (mov.descricao) f.descricao = mov.descricao;
      if (mov.data) f.data = mov.data;
      db.updateMovimentacao(slug, l.id, f);
      db.addAuditLog(slug, autor, 'alterou', 'Movimentação', 'ID: ' + l.id + ' - ' + JSON.stringify(f));
    } else {
      const f = {};
      if (dono.valor) f.valor = dono.valor;
      if (dono.descricao) f.descricao = dono.descricao;
      if (dono.data) f.data = dono.data;
      db.updateContaDono(slug, l.id, f);
      db.addAuditLog(slug, autor, 'alterou', 'Conta Dono', 'ID: ' + l.id + ' - ' + JSON.stringify(f));
    }
  }
  u.quando = Date.now();
  registrar('corrigir', 'Lançamento ' + Object.keys(mov).join(', '), { quem, empresa: slug });
  await responder(jid, '✏️ Corrigido:\n' + u.lanc.map(l => linhaLanc(slug, l)).filter(Boolean).join('\n'), m);
}

async function aplicarComando({ jid, m, quem, cmd }) {
  const u = ultimos[jid];
  if (u.tipo === 'lanc') return aplicarComandoLanc({ jid, m, quem, cmd, u });
  if (u.tipo === 'acerto_comp') {
    if (!cmd.desfazer) { await responder(jid, 'O último foi só o anexo do comprovante num lançamento do Acerto — não tem o que corrigir aí. Para tirar o anexo, responda "desfazer".', m); return; }
    const a = db.getAcertoById(u.slug, u.ids[0]);
    if (a && a.comprovante) { const abs = comprovantePath(a.comprovante); if (abs) { try { fs.unlinkSync(abs); } catch (e) {} } db.setAcertoComprovante(u.slug, a.id, ''); }
    delete ultimos[jid];
    registrar('desfazer', 'Anexo do comprovante no Acerto' + (a ? ': ' + a.descricao : ''), { quem, empresa: u.slug });
    await responder(jid, '↩️ Desfeito: tirei o comprovante do lançamento do Acerto' + (a ? ' "' + a.descricao + '"' : '') + '.', m);
    return;
  }
  const { slug, ids } = u;
  const contas = ids.map(id => db.getContaPagarById(slug, id)).filter(Boolean);
  if (!contas.length) { delete ultimos[jid]; await responder(jid, 'Não achei mais o último lançamento (pode ter sido apagado no sistema).', m); return; }
  const autor = 'WhatsApp (' + quem + ')';

  if (cmd.desfazer) {
    const nomes = [];
    for (const c of contas) {
      if (u.tipo === 'criar') {
        db.delAcertoPorConta(slug, c.id);
        for (const rel of [c.comprovante, c.boleto_arquivo]) { const abs = comprovantePath(rel); if (abs) { try { fs.unlinkSync(abs); } catch (e) {} } }
        deps.excluirConta(slug, c.id, autor);
      } else {
        const a = u.antes[c.id] || {};
        if (!estaPaga(a) && estaPaga(c)) db.delAcertoPorConta(slug, c.id);
        if (c.comprovante && c.comprovante !== a.comprovante) { const abs = comprovantePath(c.comprovante); if (abs) { try { fs.unlinkSync(abs); } catch (e) {} } }
        if (c.boleto_arquivo && c.boleto_arquivo !== a.boleto_arquivo) { const abs = comprovantePath(c.boleto_arquivo); if (abs) { try { fs.unlinkSync(abs); } catch (e) {} } } // apaga só o boleto novo; o anterior volta
        db.updateContaPagar(slug, c.id, { pago_por: a.pago_por || '', comprovante: a.comprovante || '', valor: a.valor, vencimento: a.vencimento, descricao: a.descricao, categoria: a.categoria, fornecedor: a.fornecedor || '', recorrente: a.recorrente ? 1 : 0, tipo_nota: a.tipo_nota || '', boleto_chegou: a.boleto_chegou, linha_digitavel: a.linha_digitavel || '', boleto_arquivo: a.boleto_arquivo || '' });
        db.addAuditLog(slug, autor, 'alterou', 'Contas a Pagar', 'ID: ' + c.id + ' - desfeito pelo WhatsApp');
      }
      nomes.push(c.descricao + ' (' + fmtV(c.valor) + ')');
    }
    delete ultimos[jid];
    registrar('desfazer', nomes.join('; '), { quem, empresa: slug });
    await responder(jid, '↩️ Desfeito: ' + (u.tipo === 'criar' ? 'apaguei ' : 'voltei como estava ') + nomes.join('; ') + '.', m);
    return;
  }

  const campos = {};
  for (const it of (cmd.itens || [])) {
    if (it.campo === 'categoria') {
      const cats = db.getConfig(slug).categoriasLoja || [];
      const alvo = norm(it.valor);
      const cat = cats.find(c => norm(c) === alvo) || cats.find(c => norm(c).startsWith(alvo)) || cats.find(c => norm(c).includes(alvo));
      if (!cat) { await responder(jid, 'Não achei a categoria "' + it.valor + '". Categorias desta empresa: ' + cats.join(', ') + '\nNada foi alterado.', m); return; }
      campos.categoria = cat;
    } else if (it.campo === 'vencimento') {
      if (contas.length > 1) { await responder(jid, 'O último lançamento tem ' + contas.length + ' parcelas; ajuste os vencimentos pelo sistema. Nada foi alterado.', m); return; }
      const mesAtual = contas[0].vencimento ? contas[0].vencimento.substring(5, 7) : hojeISO().substring(5, 7);
      const iso = it.iso || dataDoTexto(it.dia, it.mes || mesAtual, it.ano);
      if (!iso) { await responder(jid, 'Data inválida. Ex.: venc 10/12. Nada foi alterado.', m); return; }
      campos.vencimento = iso;
    } else if (it.campo === 'valor') {
      if (!it.valor) { await responder(jid, 'Valor inválido. Ex.: valor 450,00. Nada foi alterado.', m); return; }
      campos.valor = it.valor;
    } else campos[it.campo] = it.valor;
  }
  if (!Object.keys(campos).length) { await responder(jid, 'Não entendi o que corrigir. Ex.: D, F, rec, cat energia, venc 10/12, valor 450.', m); return; }

  for (const c of contas) {
    deps.atualizarConta(slug, c.id, campos, autor);
    db.updateAcertoPorConta(slug, c.id, campos);
  }
  u.quando = Date.now();
  const atual = ids.map(id => db.getContaPagarById(slug, id)).filter(Boolean);
  registrar('corrigir', Object.keys(campos).map(k => k + '=' + campos[k]).join(', ') + ' em ' + atual.length + ' conta(s)', { quem, empresa: slug });
  await responder(jid, '✏️ Corrigido:\n' + (atual.length > 3 ? resumoConta(atual[0]) + '\n(e mais ' + (atual.length - 1) + ' parcela(s) com a mesma alteração)' : atual.map(resumoConta).join('\n')), m);
}

// ---------- fluxo principal ----------
async function tratarMensagem(m) {
  if (!m || !m.message || !m.key) return;
  const jid = m.key.remoteJid || '';
  if (!jid || jid === 'status@broadcast' || /@newsletter$/.test(jid)) return;
  if (idsEnviados.has(m.key.id)) { idsEnviados.delete(m.key.id); return; }
  const msg = desembrulhar(m.message);
  if (msg.protocolMessage || msg.reactionMessage || msg.senderKeyDistributionMessage && Object.keys(msg).length === 1) return;

  let texto = (msg.conversation || (msg.extendedTextMessage && msg.extendedTextMessage.text) || (msg.imageMessage && msg.imageMessage.caption) || (msg.documentMessage && msg.documentMessage.caption) || '').trim();
  if (texto.startsWith(MARCA)) return;
  if (m.key.fromMe && /^\d{44,48}$/.test(texto)) return; // linha digitável enviada pelo próprio sistema
  const ehGrupo = /@g\.us$/.test(jid);
  const cfg = lerConfig();

  if (ehGrupo) {
    gruposCache[jid] = Object.assign(gruposCache[jid] || { nome: jid }, { ultima: new Date().toISOString() });
    if (!gruposCache[jid].nome || gruposCache[jid].nome === jid) { try { gruposCache[jid].nome = (await sock.groupMetadata(jid)).subject || jid; } catch (e) {} }
  }
  const empresaFixa = ehGrupo ? (cfg.grupos || {})[jid] || '' : (cfg.empresa_padrao || '');
  if (ehGrupo && !empresaFixa) return; // grupo não vinculado a empresa: ignora

  const numero = remetentePn(m);
  const quem = nomeAutorizado(numero, !!m.key.fromMe);
  if (!quem) {
    if (ehGrupo) registrar('ignorado', 'Mensagem no grupo "' + (gruposCache[jid].nome || jid) + '" de número não autorizado: ' + (numero || 'não identificado') + ' (inclua em Números autorizados)');
    return;
  }
  const padraoGrupo = ehGrupo ? ((cfg.grupos_padrao || {})[jid] || {}) : {};

  const audio = msg.audioMessage || null;
  const media = msg.imageMessage || msg.documentMessage || null;
  if (!media && !texto && !audio) return;

  // Áudio: transcreve com o Grok e segue como se fosse texto
  if (audio) {
    let buffer;
    try { buffer = await baileys.downloadMediaMessage({ key: m.key, message: msg }, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage }); }
    catch (e) { await responder(jid, 'Não consegui baixar o áudio: ' + e.message, m); return; }
    const t = await transcreverAudio(buffer, (audio.mimetype || 'audio/ogg').split(';')[0].toLowerCase());
    if (t.error || !t.texto) { await responder(jid, 'Não consegui entender o áudio' + (t.error ? ': ' + t.error : '') + '. Pode mandar por escrito?', m); return; }
    texto = t.texto;
    await responder(jid, '🎤 Entendi: "' + texto + '"', m);
  }

  // Resposta a uma pergunta pendente ("1", "2", "cancelar")
  const pend = pendentes[jid];
  if (pend && !media) {
    if (/^(cancela|cancelar|não|nao|esquece)/i.test(texto)) { delete pendentes[jid]; await responder(jid, 'Ok, cancelado.', m); return; }
    const n = parseInt(texto, 10);
    if (n >= 1 && n <= pend.opcoes.length && /^\d+$/.test(texto.trim())) {
      delete pendentes[jid];
      const escolha = pend.opcoes[n - 1];
      if (pend.tipo === 'empresa') return analisarEExecutar({ jid, m, texto: pend.texto, media: pend.media, quem, empresaFixa: escolha.slug, cfg, padraoGrupo });
      if (pend.tipo === 'conta') return executar({ jid, m, quem, slug: pend.slug, media: pend.media, padraoGrupo, analise: Object.assign({}, pend.analise, { acao: pend.analise.acao === 'boleto' ? 'boleto' : 'quitar', conta_id: escolha.id, confianca: 1 }) });
      if (pend.tipo === 'confirmar') {
        if (escolha.modo === 'cancelar') { await responder(jid, 'Ok, cancelado. Nada foi alterado.', m); return; }
        return executar({ jid, m, quem, slug: pend.slug, media: pend.media, padraoGrupo, analise: Object.assign({}, pend.analise, { forcar: escolha.modo }) });
      }
      if (pend.tipo === 'lanc_tipo') {
        const l = Object.assign({}, pend.analise.lancamento, { [pend.campo]: escolha.v });
        return executar({ jid, m, quem, slug: pend.slug, media: pend.media, padraoGrupo, analise: Object.assign({}, pend.analise, { lancamento: l }) });
      }
      if (pend.tipo === 'boleto_troca') {
        return executar({ jid, m, quem, slug: pend.slug, media: pend.media, padraoGrupo, analise: Object.assign({}, pend.analise, escolha.novo ? { conta_id: null, forcarNovo: true } : { conta_id: escolha.id }) });
      }
      if (pend.tipo === 'acerto_comp') {
        if (escolha.cancelar) { await responder(jid, 'Ok, cancelado. Nada foi alterado.', m); return; }
        if (escolha.adiantar) return executar({ jid, m, quem, slug: pend.slug, media: pend.media, padraoGrupo, analise: Object.assign({}, pend.analise, { adiantado: true }) });
        if (escolha.novo) return executar({ jid, m, quem, slug: pend.slug, media: pend.media, padraoGrupo, analise: Object.assign({}, pend.analise, { ignorarAcerto: true }) });
        return anexarNoAcerto({ jid, m, quem, slug: pend.slug, media: pend.media, acertoId: escolha.id });
      }
      if (pend.tipo === 'duplicado') {
        if (escolha.modo === 'cancelar') { await responder(jid, 'Ok, não lancei de novo.', m); return; }
        return executar({ jid, m, quem, slug: pend.slug, media: pend.media, padraoGrupo, analise: Object.assign({}, pend.analise, { ignorarDup: true }) });
      }
    }
    if (Date.now() - pend.quando > 15 * 60000) delete pendentes[jid]; // expirou: segue como mensagem nova
    else if (ultimos[jid] && Date.now() - ultimos[jid].quando < 3 * 3600000 && comandoRapido(texto)) { /* correção do último lançamento: segue abaixo, a pergunta continua valendo */ }
    else { await responder(jid, 'Responda com o número de uma das opções (1 a ' + pend.opcoes.length + ') ou "cancelar".', m); return; }
  }

  // Correção rápida do último lançamento (D, F, rec, cat ..., venc ..., valor ..., desfazer)
  if (!media && ultimos[jid] && Date.now() - ultimos[jid].quando < 3 * 3600000) {
    const cmd = comandoRapido(texto);
    if (cmd) return aplicarComando({ jid, m, quem, cmd });
  }

  let arquivo = null;
  if (media) {
    try {
      const buffer = await baileys.downloadMediaMessage({ key: m.key, message: msg }, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage });
      arquivo = { buffer, mimeType: (media.mimetype || '').split(';')[0].toLowerCase(), nome: media.fileName || '' };
    } catch (e) { await responder(jid, 'Não consegui baixar o arquivo: ' + e.message, m); return; }
  }
  await analisarEExecutar({ jid, m, texto, media: arquivo, quem, empresaFixa, cfg, padraoGrupo });
}

async function transcreverAudio(buffer, mimeType) {
  try { return { texto: await grok.transcreverAudio(grokCfg(), buffer, mimeType || 'audio/ogg') }; }
  catch (e) { registrar('erro', 'Transcrição do áudio: ' + e.message); return { error: e.message }; }
}

function montarContexto(slugs, cfg) {
  const hoje = hojeISO();
  const dias = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const empresas = db.getEmpresas();
  const ctx = { hoje, dia_semana: dias[new Date(hoje + 'T12:00:00Z').getUTCDay()], empresas: empresas.filter(e => slugs.includes(e.slug)).map(e => slugs.length > 1 ? { slug: e.slug, nome: e.nome, tambem_aparece_como: (apelidosCfg(cfg)[e.slug] || []) } : { slug: e.slug, nome: e.nome }), contas_pendentes: [], colaboradores: {}, categorias: {}, fornecedores_conhecidos: {} };
  for (const slug of slugs) {
    try {
      ctx.contas_pendentes.push(...db.getContasPagarPendentes(slug, somaDias(hoje, -120), somaDias(hoje, 90)).map(c => ({ id: c.id, empresa: slug, vencimento: c.vencimento, descricao: c.descricao, valor: c.valor, fornecedor: c.fornecedor || '' })));
      ctx.colaboradores[slug] = db.getColaboradores(slug).map(c => c.nome);
      ctx.categorias[slug] = db.getConfig(slug).categoriasLoja || [];
      if (slugs.length <= 2) ctx.fornecedores_conhecidos[slug] = [...new Set(historico(slug).map(h => h.fornecedor).filter(Boolean))].slice(0, 150);
    } catch (e) {}
  }
  return ctx;
}

const SYSTEM = `Você é o assistente financeiro do sistema Nunes Rocha. O dono das empresas te manda, pelo WhatsApp, comprovantes de pagamento (foto/PDF), boletos a pagar, perguntas e textos curtos como "lavagem caminhão branco pago da clc", "criar conta energia 450 vence dia 10 fora mensal" ou "o que vence hoje?".
Decida UMA ação e devolva SOMENTE um JSON com este formato:
{"acao":"quitar"|"criar"|"boleto"|"alterar"|"lancamento"|"consultar"|"corrigir"|"perguntar"|"ignorar","empresa":slug|null,"conta_id":string|null,"candidatos":[ids],"valor":number|null,"data_pagamento":"YYYY-MM-DD"|null,"descricao":string|null,"fornecedor":string|null,"categoria":string|null,"vencimento":"YYYY-MM-DD"|null,"pago":true|false,"pago_por":string|null,"tipo_nota":"D"|"F"|null,"recorrente":true|false|null,"parcelas":{"qtd":number,"valor_parcela":number,"primeiro_vencimento":"YYYY-MM-DD"}|null,"linha_digitavel":string|null,"pagador":string|null,"consulta":{"status":"pendentes"|"pagas"|"todas","de":"YYYY-MM-DD"|null,"ate":"YYYY-MM-DD"|null,"categoria":string|null,"texto":string|null}|null,"lancamento":{"movimentacao":true|false,"tipo_mov":"entrada"|"saida"|null,"conta_celso":true|false,"tipo_celso":"debito"|"credito"|null,"valor":number,"data":"YYYY-MM-DD"|null,"descricao":string}|null,"correcao":{"tipo_nota":"D"|"F"|null,"recorrente":true|false|null,"categoria":string|null,"vencimento":"YYYY-MM-DD"|null,"valor":number|null,"fornecedor":string|null,"descricao":string|null,"desfazer":true|false}|null,"confianca":0..1,"mensagem":"texto curto em português para o usuário"}
Regras:
- "corrigir": a mensagem ajusta o "Último lançamento desta conversa" (ex.: "rec d", "muda pra dentro", "é recorrente", "categoria aluguel", "vence dia 15", "o valor é 350", "apaga esse"). Preencha em correcao SÓ os campos citados (os outros null); "apaga/cancela esse lançamento" = desfazer true.
- NUNCA diga em "mensagem" que você alterou, criou ou quitou algo: quem executa e confirma é o sistema.
- Em comprovante de pagamento de boleto, se aparecer o código de barras ou a linha digitável, copie os dígitos em linha_digitavel (o sistema usa para achar a conta exata).
- "quitar": é um COMPROVANTE de pagamento (ou o texto diz que pagou) e existe uma conta pendente que corresponde (compare descrição, fornecedor, valor com tolerância de 3% e vencimento próximo). Preencha conta_id e data_pagamento (data do comprovante, ou hoje). NUNCA quite uma parcela/conta com vencimento mais de 20 dias depois da data do comprovante (é parcela futura; o pagamento provavelmente já foi lançado) — nesse caso use "criar" com pago=true e data_pagamento.
- Se houver 2 ou mais contas plausíveis e não dá para decidir, use "perguntar" com candidatos (até 5 ids, do mais provável ao menos).
- "boleto": o anexo é um BOLETO/FATURA DE COBRANÇA ainda a pagar (tem linha digitável/código de barras e vencimento, sem autenticação de pagamento). Preencha valor, vencimento, fornecedor (beneficiário), linha_digitavel (só dígitos, se legível) e conta_id se uma conta pendente corresponder a esse boleto (mesmo fornecedor e valor ±3%); senão conta_id=null. Comprovante de pagamento de boleto NÃO é "boleto": é "quitar"/"criar". Se a conta pendente foi lançada à mão com outro nome/sem fornecedor mas tem o mesmo valor (±3%) e vencimento próximo, é a mesma conta: use conta_id dela. Boleto REEMITIDO/ALTERADO (mesmo fornecedor de uma conta pendente, com outro vencimento ou outro valor, ou o texto diz "novo boleto", "mudou", "prorrogou") também é "boleto" com conta_id da conta pendente — o sistema troca valor e vencimento.
- "alterar": o TEXTO pede para mudar uma conta pendente que NÃO é o último lançamento (ex.: "o boleto da ISPS mudou pra dia 30", "a conta da Cemig agora é 480"). Preencha conta_id (das contas_pendentes) e correcao só com os campos citados.
- "criar": despesa que NÃO está nas pendentes. Se veio comprovante ou o texto diz "pago/paguei", pago=true e vencimento=data do pagamento; se fala em vencimento/a pagar, pago=false e vencimento=data informada (ano atual, ou o próximo se a data já passou). descricao curta e clara, valor, fornecedor (quem recebeu) e categoria (escolha entre as da empresa, senão "Outros").
- fornecedor: se corresponder a um nome em fornecedores_conhecidos da empresa, use EXATAMENTE aquele nome.
- tipo_nota: "D" se o texto disser dentro / com nota; "F" se disser fora / sem nota; senão null (o sistema usa o histórico).
- recorrente: true se disser mensal / todo mês / fixa / recorrente; false se disser avulsa / única; senão null.
- parcelas: só quando falar em parcelas ("3x", "em 4 parcelas", "10 vezes"). valor_parcela = valor de CADA parcela (se informou o total, divida pela quantidade, 2 casas). primeiro_vencimento = data da 1ª parcela (se não disser, hoje + 30 dias). Nesse caso preencha também valor = valor_parcela.
- "lancamento": SÓ quando a mensagem citar a aba MOVIMENTAÇÃO ("movimentação", "mov", "na movimentação") e/ou a CONTA DO CELSO ("conta do Celso", "conta do dono", "Celso deve", "Celso pagou", "retirada do Celso"). Não é conta a pagar. movimentacao=true se citar movimentação; conta_celso=true se citar conta do Celso (pode ser as duas). tipo_mov: "entrada" ou "saida" pelo texto (null se não disser). tipo_celso: "debito" = Celso deve (retirou/pegou dinheiro, a empresa pagou algo dele); "credito" = Celso pagou (colocou dinheiro, pagou algo da empresa); null se não der para saber. descricao curta (ex.: "Reserva"), data só se citada.
- "consultar": perguntas sobre as contas ("o que vence hoje", "quanto falta pagar essa semana", "quais estão atrasadas", "quanto paguei de combustível em novembro"). Preencha consulta: status ("pendentes" para a vencer/atrasadas, "pagas" para o que já foi pago, "todas"), de/ate (período pelo vencimento; atrasadas = de hoje-365 até ontem; "essa semana" = hoje até domingo), categoria (se citar uma categoria da empresa) e texto (palavra para filtrar descrição/fornecedor, ex.: "combustível", "cemig"). empresa = slug se a pergunta citar uma empresa, senão null (todas).
- Se a empresa não estiver definida e a mensagem não deixar claro qual é (exceto "consultar"), use "perguntar" com empresa=null (o sistema lista as empresas).
- pago_por: só preencha se a mensagem citar quem pagou e o nome existir em colaboradores da empresa; senão null.
- "ignorar": conversa sem relação com finanças (cumprimentos etc.). Nunca invente valores: se não houver valor legível, deixe null.
- Datas no formato YYYY-MM-DD. "mensagem" deve resumir o que você entendeu (1 ou 2 frases).`;

async function analisarEExecutar({ jid, m, texto, media, quem, empresaFixa, cfg, padraoGrupo }) {
  const g = grokCfg();
  if (!g.apiKey) { await responder(jid, 'A chave da API do Grok não está configurada no sistema (Configurações → WhatsApp).', m); return; }
  const empresas = db.getEmpresas();
  const multi = !empresaFixa || empresaFixa === '*';
  const slugs = multi ? empresas.map(e => e.slug) : [empresaFixa];
  const ctx = montarContexto(slugs, cfg);
  const peloTexto = multi ? identificarEmpresa(texto, cfg) : null;
  const imagens = [];
  let anexoTexto = '', boletoPdf = null;
  if (media) {
    if (/^image\/(jpe?g|png)$/.test(media.mimeType)) imagens.push({ buffer: media.buffer, mimeType: media.mimeType });
    else if (media.mimeType === 'application/pdf') {
      anexoTexto = await extrairPdfTexto(media.buffer);
      if (!anexoTexto || anexoTexto.length < 25) {
        // PDF escaneado (só imagem): o Grok lê o PDF pela API de arquivos
        const t = await transcreverPdf(media.buffer, media.nome);
        if (t.error) { await responder(jid, 'O PDF veio sem texto (escaneado) e não consegui ler com a IA: ' + t.error + '\nManda uma foto/print do comprovante.', m); return; }
        anexoTexto = '(transcrito por OCR da IA — confira o valor)\n' + t.texto;
      } else {
        try { const b = boletoLib.parseBoletoPdf(anexoTexto); if (b.linha) boletoPdf = b; } catch (e) {}
      }
    } else { await responder(jid, 'Formato ' + (media.mimeType || 'desconhecido') + ' não suportado. Envie foto (JPG/PNG) ou PDF.', m); return; }
  }
  const ult = !media && ultimos[jid] && ultimos[jid].tipo !== 'lanc' && Date.now() - ultimos[jid].quando < 3 * 3600000 ? ultimos[jid] : null;
  const ultimoCtx = ult ? ult.ids.slice(0, 3).map(id => db.getContaPagarById(ult.slug, id)).filter(Boolean).map(c => ({ descricao: c.descricao, valor: c.valor, vencimento: c.vencimento, fornecedor: c.fornecedor, categoria: c.categoria, tipo_nota: c.tipo_nota, recorrente: !!c.recorrente })) : null;
  const prompt = 'Mensagem do usuário: ' + (texto ? JSON.stringify(texto) : '(sem texto, só o anexo)') + '\n'
    + (!multi ? 'Empresa desta conversa (fixa): ' + empresaFixa + '\n'
      : 'Esta conversa tem VÁRIAS empresas. Descubra a empresa nesta ordem: 1) nome citado no texto da mensagem; 2) se for BOLETO, o pagador/sacado (devedor); 3) se for COMPROVANTE, o pagador (quem pagou). Compare com "nome" e "tambem_aparece_como" (inclui CNPJs) das empresas; um apelido vale mais que o nome — use o slug da empresa a que o apelido pertence. Preencha "pagador" com o nome/CNPJ do pagador que você leu.\n'
        + (peloTexto && peloTexto.slug ? 'O sistema identificou pelo texto a empresa ' + peloTexto.slug + ' (' + peloTexto.motivo + ').\n' : ''))
    + (imagens.length ? 'Há uma imagem anexa (comprovante ou boleto): leia valor, data/vencimento, quem recebeu, descrição e a linha digitável se houver.\n' : '')
    + (anexoTexto ? 'Texto extraído do PDF anexo:\n"""' + anexoTexto.slice(0, 6000) + '"""\n' : '')
    + (ultimoCtx ? 'Último lançamento desta conversa (se a mensagem for uma correção dele, use acao "corrigir"): ' + JSON.stringify(ultimoCtx) + '\n' : '')
    + (boletoPdf ? 'O PDF tem uma linha digitável de boleto: ' + JSON.stringify(boletoPdf) + ' (decida se é um boleto a pagar ou o comprovante de pagamento dele).\n' : '')
    + 'Contexto (JSON): ' + JSON.stringify(ctx);
  let analise;
  try { analise = await grok.perguntarJson(g, { system: SYSTEM, texto: prompt, imagens }); }
  catch (e) { registrar('erro', 'Grok: ' + e.message, { quem }); await responder(jid, 'Não consegui consultar a IA agora: ' + e.message, m); return; }
  registrar('analise', (analise.acao || '?') + ' — ' + (analise.mensagem || ''), { quem, texto, empresa: analise.empresa || empresaFixa });
  if (boletoPdf) analise.boletoPdf = boletoPdf;

  if (analise.acao === 'ignorar') return;
  if (analise.acao === 'corrigir' && ult) {
    const c = analise.correcao || {}, itens = [];
    if (c.tipo_nota === 'D' || c.tipo_nota === 'F') itens.push({ campo: 'tipo_nota', valor: c.tipo_nota });
    if (c.recorrente === true || c.recorrente === false) itens.push({ campo: 'recorrente', valor: c.recorrente ? 1 : 0 });
    if (c.categoria) itens.push({ campo: 'categoria', valor: c.categoria });
    if (c.vencimento && /^\d{4}-\d{2}-\d{2}$/.test(c.vencimento)) itens.push({ campo: 'vencimento', iso: c.vencimento });
    if (c.valor) itens.push({ campo: 'valor', valor: parseFloat(c.valor) });
    if (c.fornecedor) itens.push({ campo: 'fornecedor', valor: c.fornecedor });
    if (c.descricao) itens.push({ campo: 'descricao', valor: c.descricao });
    return aplicarComando({ jid, m, quem, cmd: c.desfazer ? { desfazer: true } : { itens } });
  }
  if (analise.acao === 'alterar' && analise.conta_id) {
    const slugA = !multi ? empresaFixa : ((analise.empresa && empresas.some(e => e.slug === analise.empresa)) ? analise.empresa : (empresas.find(e => db.getContaPagarById(e.slug, analise.conta_id)) || {}).slug);
    const contaA = slugA && db.getContaPagarById(slugA, analise.conta_id);
    if (contaA) {
      lembrarUltimo(jid, slugA, [contaA.id], 'alterar', { [contaA.id]: Object.assign({}, contaA) });
      const c = analise.correcao || {}, itens = [];
      if (c.tipo_nota === 'D' || c.tipo_nota === 'F') itens.push({ campo: 'tipo_nota', valor: c.tipo_nota });
      if (c.recorrente === true || c.recorrente === false) itens.push({ campo: 'recorrente', valor: c.recorrente ? 1 : 0 });
      if (c.categoria) itens.push({ campo: 'categoria', valor: c.categoria });
      if (c.vencimento && /^\d{4}-\d{2}-\d{2}$/.test(c.vencimento)) itens.push({ campo: 'vencimento', iso: c.vencimento });
      if (c.valor) itens.push({ campo: 'valor', valor: parseFloat(c.valor) });
      if (c.fornecedor) itens.push({ campo: 'fornecedor', valor: c.fornecedor });
      if (c.descricao) itens.push({ campo: 'descricao', valor: c.descricao });
      return aplicarComando({ jid, m, quem, cmd: { itens } });
    }
  }
  if (analise.acao === 'consultar') {
    const alvo = !multi ? [empresaFixa] : (peloTexto && peloTexto.slug ? [peloTexto.slug] : (analise.empresa && empresas.some(e => e.slug === analise.empresa) ? [analise.empresa] : empresas.map(e => e.slug)));
    return executarConsulta({ jid, m, slugs: alvo, c: analise.consulta || {} });
  }
  let slug = multi ? '' : empresaFixa;
  if (multi) {
    // texto do usuário > pagador lido no documento (apelidos/CNPJ) > escolha da IA > nomes no PDF
    const pagador = identificarEmpresa(analise.pagador, cfg);
    const noPdf = boletoPdf || anexoTexto ? identificarEmpresa(anexoTexto, cfg) : null;
    slug = (peloTexto && peloTexto.slug) || (pagador && pagador.slug) || (empresas.some(e => e.slug === analise.empresa) ? analise.empresa : '') || (noPdf && noPdf.slug) || '';
    if (slug) registrar('empresa', 'Empresa ' + slug + (peloTexto && peloTexto.slug === slug ? ' pelo texto (' + peloTexto.motivo + ')' : pagador && pagador.slug === slug ? ' pelo pagador (' + pagador.motivo + ')' : ' pela IA'), { quem });
  }
  // Comprovante que traz a linha digitável / código de barras de um boleto já lançado: quita essa conta direto
  if (media && analise.acao !== 'boleto') {
    const achada = contaPelaLinha([analise.linha_digitavel, boletoPdf && boletoPdf.linha, anexoTexto], slug ? [slug] : empresas.map(e => e.slug));
    if (achada) {
      slug = achada.slug;
      analise = Object.assign({}, analise, { acao: 'quitar', conta_id: achada.conta.id, confianca: 1, pelaLinha: true });
      registrar('empresa', 'Comprovante casado pela linha digitável com "' + achada.conta.descricao + '" (' + slug + ')', { quem });
    }
  }
  if (!slug || !empresas.some(e => e.slug === slug)) {
    const opcoes = empresas.map(e => ({ slug: e.slug, nome: e.nome }));
    pendentes[jid] = { tipo: 'empresa', opcoes, texto, media, quando: Date.now() };
    await responder(jid, 'De qual empresa é esse lançamento? Responda com o número:\n' + opcoes.map((o, i) => (i + 1) + '. ' + o.nome).join('\n'), m);
    return;
  }
  if (analise.acao === 'perguntar' || (analise.acao === 'quitar' && (!analise.conta_id || (analise.confianca || 0) < 0.6))) {
    const ids = (analise.candidatos && analise.candidatos.length ? analise.candidatos : [analise.conta_id]).filter(Boolean).slice(0, 5);
    const opcoes = ids.map(id => db.getContaPagarById(slug, id)).filter(Boolean);
    if (opcoes.length) {
      pendentes[jid] = { tipo: 'conta', opcoes, slug, media, analise, quando: Date.now() };
      await responder(jid, (analise.mensagem ? analise.mensagem + '\n' : '') + 'Qual conta é esta? Responda com o número:\n' + opcoes.map((c, i) => (i + 1) + '. ' + fmtD(c.vencimento) + ' — ' + c.descricao + ' — ' + fmtV(c.valor)).join('\n') + '\n(ou "cancelar")', m);
      return;
    }
    if (analise.acao === 'perguntar') { await responder(jid, analise.mensagem || 'Não entendi. Pode detalhar (empresa, descrição e valor)?', m); return; }
  }
  await executar({ jid, m, quem, slug, media, analise, padraoGrupo });
}

function salvarComprovante(slug, contaId, media, prefixo) {
  if (!media || !media.buffer) return '';
  const ext = media.mimeType === 'application/pdf' ? 'pdf' : (media.mimeType === 'image/png' ? 'png' : 'jpg');
  const dir = path.join(comprovantesDir, slug);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const nome = (prefixo || '') + contaId + '_' + Date.now() + '.' + ext;
  fs.writeFileSync(path.join(dir, nome), media.buffer);
  return slug + '/' + nome;
}

// Completa categoria / D-F / recorrente / fornecedor: texto da mensagem > padrão do grupo > histórico do fornecedor
function completarCampos(slug, analise, padraoGrupo) {
  const cats = db.getConfig(slug).categoriasLoja || [];
  const h = acharNoHistorico(historico(slug), analise.fornecedor, analise.descricao);
  const out = {
    fornecedor: (h && h.fornecedor && analise.fornecedor && norm(h.fornecedor) !== norm(analise.fornecedor) && (norm(h.fornecedor).includes(norm(analise.fornecedor)) || norm(analise.fornecedor).includes(norm(h.fornecedor)))) ? h.fornecedor : (analise.fornecedor || (h && h.fornecedor) || ''),
    categoria: (h && h.categoria && cats.includes(h.categoria) ? h.categoria : '') || (cats.includes(analise.categoria) ? analise.categoria : 'Outros'),
    tipo_nota: analise.tipo_nota === 'D' || analise.tipo_nota === 'F' ? analise.tipo_nota : (padraoGrupo && (padraoGrupo.tipo_nota === 'D' || padraoGrupo.tipo_nota === 'F') ? padraoGrupo.tipo_nota : (h && h.tipo_nota) || ''),
    recorrente: analise.recorrente === true ? 1 : (analise.recorrente === false ? 0 : (h ? h.recorrente : 0)),
    doHistorico: !!h,
  };
  out.copiados = [];
  if (h && h.categoria && out.categoria === h.categoria && !(cats.includes(analise.categoria) && analise.categoria === h.categoria)) out.copiados.push('categoria');
  if (h && h.tipo_nota && out.tipo_nota === h.tipo_nota && analise.tipo_nota !== h.tipo_nota && !(padraoGrupo && padraoGrupo.tipo_nota)) out.copiados.push('D/F');
  if (h && (analise.recorrente === null || analise.recorrente === undefined)) out.copiados.push('recorrente');
  return out;
}

async function avisarDuplicado({ jid, m, slug, media, analise, texto }) {
  pendentes[jid] = { tipo: 'duplicado', opcoes: [{ modo: 'seguir' }, { modo: 'cancelar' }], slug, media, analise, quando: Date.now() };
  await responder(jid, '⚠️ ' + texto + '\n1. Lançar mesmo assim\n2. Cancelar', m);
}

async function executar({ jid, m, quem, slug, media, analise, padraoGrupo }) {
  const nomeEmp = (db.getEmpresas().find(e => e.slug === slug) || {}).nome || slug;
  const colabs = db.getColaboradores(slug).map(c => c.nome);
  const achaColab = n => n && colabs.find(c => c.toLowerCase() === String(n).toLowerCase());
  const pagoPor = achaColab(analise.pago_por) || achaColab(padraoGrupo && padraoGrupo.pago_por) || (padraoGrupo && padraoGrupo.pago_por) || achaColab(quem) || quem;
  const autor = 'WhatsApp (' + quem + ')';

  // Mesmo arquivo já lançado antes?
  if (media && !analise.ignorarDup) {
    const visto = arquivoJaVisto(media);
    if (visto) {
      const c = db.getContaPagarById(visto.slug, visto.conta);
      if (c) return avisarDuplicado({ jid, m, slug, media, analise, texto: 'Esse mesmo arquivo já foi enviado em ' + fmtD(visto.quando.substring(0, 10)) + ' (conta "' + c.descricao + '", ' + fmtV(c.valor) + ').' });
    }
  }

  if (analise.acao === 'lancamento') return executarLancamento({ jid, m, quem, slug, nomeEmp, analise, media });

  if (analise.acao === 'quitar') {
    const conta = db.getContaPagarById(slug, analise.conta_id);
    if (!conta) { await responder(jid, 'Não achei essa conta no sistema. Pode detalhar?', m); return; }
    const jaPaga = estaPaga(conta);
    const diverge = analise.valor && Math.abs(analise.valor - conta.valor) > Math.max(0.05, conta.valor * 0.03);
    if (diverge && !analise.forcar) {
      pendentes[jid] = { tipo: 'confirmar', opcoes: [{ modo: 'manter' }, { modo: 'corrigir' }, { modo: 'cancelar' }], slug, media, analise, quando: Date.now() };
      await responder(jid, '⚠️ O comprovante é de ' + fmtV(analise.valor) + ', mas a conta "' + conta.descricao + '" está lançada com ' + fmtV(conta.valor) + ' (venc. ' + fmtD(conta.vencimento) + ').\n1. Quitar mesmo assim (mantém ' + fmtV(conta.valor) + ')\n2. Quitar e corrigir o valor para ' + fmtV(analise.valor) + '\n3. Cancelar', m);
      return;
    }
    const dataPg = /^\d{4}-\d{2}-\d{2}$/.test(analise.data_pagamento || '') ? analise.data_pagamento : hojeISO();
    if (media && !jaPaga && !analise.pelaLinha && !analise.adiantado && conta.vencimento > somaDias(dataPg, 20)) {
      // parcela futura: o mais provável é o comprovante ser de um pagamento que já está no Acerto
      let cands = [];
      try { cands = db.acertoSemComprovante(slug, analise.valor || conta.valor, somaDias(dataPg, -10), somaDias(dataPg, 5)); } catch (e) {}
      if (cands.length === 1) return anexarNoAcerto({ jid, m, quem, slug, media, acertoId: cands[0].id });
      const opcoes = cands.map(c => ({ id: c.id })).concat([{ adiantar: true }, { cancelar: true }]);
      pendentes[jid] = { tipo: 'acerto_comp', opcoes, slug, media, analise, quando: Date.now() };
      await responder(jid, '📎 Comprovante de ' + fmtV(analise.valor || conta.valor) + ' (' + fmtD(dataPg) + '). A conta pendente parecida é "' + conta.descricao + '" com vencimento ' + fmtD(conta.vencimento) + ' — muito à frente, então não quitei sozinho.\n'
        + cands.map((c, i) => (i + 1) + '. Anexar no Acerto: ' + c.descricao + ' — ' + fmtV(c.saida) + ' — ' + fmtD(c.data)).join('\n') + (cands.length ? '\n' : '')
        + (cands.length + 1) + '. Quitar "' + conta.descricao + '" adiantado\n' + (cands.length + 2) + '. Cancelar', m);
      return;
    }
    const antes = { [conta.id]: Object.assign({}, conta) };
    if (analise.forcar === 'corrigir' && analise.valor) { deps.atualizarConta(slug, conta.id, { valor: analise.valor }, autor); conta.valor = analise.valor; }
    const comprovante = salvarComprovante(slug, conta.id, media);
    const fields = {};
    if (!jaPaga) fields.pago_por = pagoPor;
    if (comprovante) fields.comprovante = comprovante;
    if (Object.keys(fields).length) deps.atualizarConta(slug, conta.id, fields, autor);
    guardarHash(media, slug, conta.id);
    lembrarUltimo(jid, slug, [conta.id], 'alterar', antes);
    registrar('quitar', nomeEmp + ': ' + conta.descricao + ' ' + fmtV(conta.valor), { quem, empresa: slug });
    const atual = db.getContaPagarById(slug, conta.id);
    await responder(jid, '✅ *' + nomeEmp + '* — ' + (analise.pelaLinha ? '(comprovante reconhecido pela linha digitável do boleto) ' : '') + (jaPaga ? 'a conta já estava paga' + (comprovante ? '; anexei o comprovante.' : '.') : 'marquei como paga' + (comprovante ? ' e anexei o comprovante.' : '.')) + '\n' + resumoConta(atual)
      + (analise.valor && Math.abs(analise.valor - atual.valor) > 0.01 ? '\n⚠️ Valor do comprovante (' + fmtV(analise.valor) + ') difere do lançado (' + fmtV(atual.valor) + ').' : '') + DICA, m);
    return;
  }

  if (analise.acao === 'boleto') {
    // valores da linha digitável têm prioridade (são exatos)
    const linha = soDigitos((analise.boletoPdf && analise.boletoPdf.linha) || analise.linha_digitavel || '');
    const dec = linha.length >= 44 ? boletoLib.decodeLinhaDigitavel(linha) : { valido: false };
    let dados = { linha: dec.valido ? linha : '', valor: (dec.valido && dec.valor) || analise.valor || (analise.boletoPdf && analise.boletoPdf.valor) || null, vencimento: (dec.valido && dec.vencimento) || (analise.boletoPdf && analise.boletoPdf.vencimento) || analise.vencimento || '', cnpj: (analise.boletoPdf && analise.boletoPdf.cnpj) || '', beneficiario: analise.fornecedor || (analise.boletoPdf && analise.boletoPdf.beneficiario) || '' };
    try { const e = boletoLib.enriquecer(slug, dados); if (e.fornecedor) dados.fornecedor = e.fornecedor; if (e.nota_numero) dados.nota = e.nota_numero; } catch (e) {}
    // a data calculada da linha pode errar (ciclo do fator de vencimento): se ficar longe da data lida no boleto, vale a lida
    if (analise.vencimento && dados.vencimento && Math.abs(new Date(dados.vencimento) - new Date(analise.vencimento)) > 60 * 86400000) dados.vencimento = analise.vencimento;
    // data fora do razoável (fator de vencimento mal lido): não usa
    if (dados.vencimento && (dados.vencimento < somaDias(hojeISO(), -120) || dados.vencimento > somaDias(hojeISO(), 400))) dados.vencimento = analise.vencimento || '';
    if (!dados.valor) { await responder(jid, 'Não consegui ler o valor do boleto. Manda o PDF ou uma foto mais nítida (ou escreva o valor).', m); return; }
    const conta = analise.conta_id ? db.getContaPagarById(slug, analise.conta_id) : null;
    if (conta && !estaPaga(conta)) {
      // boleto novo/reemitido de uma conta que já existe: anexa e atualiza vencimento e valor
      const antes = { [conta.id]: Object.assign({}, conta) };
      const arq = salvarComprovante(slug, conta.id, media, 'boleto_');
      const f = { boleto_chegou: 1 };
      if (dados.linha) f.linha_digitavel = dados.linha;
      if (arq) f.boleto_arquivo = arq;
      const mudou = [];
      if (dados.vencimento && dados.vencimento !== conta.vencimento) { f.vencimento = dados.vencimento; mudou.push('vencimento ' + fmtD(conta.vencimento) + ' → *' + fmtD(dados.vencimento) + '*'); }
      if (dados.valor && Math.abs(dados.valor - conta.valor) > 0.009) { f.valor = dados.valor; mudou.push('valor ' + fmtV(conta.valor) + ' → *' + fmtV(dados.valor) + '*'); }
      deps.atualizarConta(slug, conta.id, f, autor);
      guardarHash(media, slug, conta.id);
      lembrarUltimo(jid, slug, [conta.id], 'alterar', antes);
      registrar('boleto', nomeEmp + ': boleto anexado em ' + conta.descricao + (mudou.length ? ' (' + mudou.join('; ').replace(/\*/g, '') + ')' : ''), { quem, empresa: slug });
      await responder(jid, '📄 *' + nomeEmp + '* — boleto anexado à conta que já existia' + (analise.porValorData ? ' (mesmo valor e vencimento)' : '') + (antes[conta.id].linha_digitavel || antes[conta.id].boleto_arquivo ? ' (substituiu o boleto anterior)' : '') + ':\n'
        + (mudou.length ? '🔁 Atualizei: ' + mudou.join('; ') + '\n' : '') + resumoConta(db.getContaPagarById(slug, conta.id)) + DICA, m);
      if (dados.linha) await enviarLinha(jid, dados.linha);
      return;
    }
    // IA não achou a conta: se há conta pendente do mesmo fornecedor, pergunta se é troca de boleto
    if (!analise.forcarNovo) {
      const nomeB = norm(dados.fornecedor || dados.beneficiario || analise.fornecedor || '');
      const hoje = hojeISO();
      const diasEntre = (x, y) => (x && y) ? Math.abs(new Date(x) - new Date(y)) / 86400000 : 999;
      const mesmoNome = c => { const n = norm(c.fornecedor || c.descricao); return nomeB.length >= 3 && n && (n === nomeB || (Math.min(n.length, nomeB.length) >= 4 && (n.includes(nomeB) || nomeB.includes(n)))); };
      // conta lançada à mão com outro nome: mesmo valor (±1%) e vencimento até 15 dias de diferença
      const mesmoValor = c => Math.abs((c.valor || 0) - dados.valor) <= Math.max(0.05, dados.valor * 0.01) && diasEntre(c.vencimento, dados.vencimento || hoje) <= 15;
      const pend = db.getContasPagarPendentes(slug, somaDias(hoje, -120), somaDias(hoje, 180));
      const exatas = dados.vencimento ? pend.filter(c => Math.abs((c.valor || 0) - dados.valor) < 0.01 && c.vencimento === dados.vencimento) : [];
      if (exatas.length === 1) return executar({ jid, m, quem, slug, media, padraoGrupo, analise: Object.assign({}, analise, { conta_id: exatas[0].id, porValorData: true }) });
      const mesmas = pend.filter(c => mesmoNome(c) || mesmoValor(c))
        .sort((x, y) => (mesmoNome(y) && mesmoValor(y)) - (mesmoNome(x) && mesmoValor(x)) || diasEntre(x.vencimento, dados.vencimento) - diasEntre(y.vencimento, dados.vencimento)).slice(0, 4);
      if (mesmas.length) {
        const opcoes = mesmas.map(c => ({ id: c.id })).concat([{ novo: true }]);
        pendentes[jid] = { tipo: 'boleto_troca', opcoes, slug, media, analise, quando: Date.now() };
        await responder(jid, '📄 Boleto de ' + (dados.fornecedor || dados.beneficiario || analise.fornecedor) + ': ' + fmtV(dados.valor) + ', venc. ' + fmtD(dados.vencimento) + '.\nJá existe conta pendente que pode ser deste boleto (mesmo fornecedor, ou mesmo valor e vencimento próximo). Anexo o boleto nela (atualizo valor e vencimento)?\n'
          + mesmas.map((c, i) => (i + 1) + '. Anexar em: ' + c.descricao + ' — ' + fmtV(c.valor) + ' — venc. ' + fmtD(c.vencimento)).join('\n') + '\n' + (mesmas.length + 1) + '. Não, é uma conta nova', m);
        return;
      }
    }
    const fornBol = dados.fornecedor || dados.beneficiario || analise.fornecedor || '';
    analise = Object.assign({}, analise, { acao: 'criar', pago: false, valor: dados.valor, vencimento: dados.vencimento || analise.vencimento, fornecedor: fornBol, descricao: analise.descricao || ('Boleto ' + fornBol).trim(), ehBoleto: dados });
  }

  if (analise.acao === 'criar') {
    if (!analise.valor) { await responder(jid, 'Não consegui ler o valor. Me diz o valor (ex.: "350,00") junto com a descrição.', m); return; }
    const comp = completarCampos(slug, analise, padraoGrupo);
    const qtd = analise.parcelas && parseInt(analise.parcelas.qtd, 10) > 1 ? Math.min(parseInt(analise.parcelas.qtd, 10), 60) : 1;
    const valorParc = qtd > 1 ? (parseFloat(analise.parcelas.valor_parcela) || Math.round(parseFloat(analise.valor) / qtd * 100) / 100) : parseFloat(analise.valor);
    const primeiro = (qtd > 1 && analise.parcelas.primeiro_vencimento) || analise.vencimento || analise.data_pagamento || hojeISO();
    const pago = !!(analise.pago || (media && !analise.ehBoleto));

    // Comprovante de um pagamento que já está no Acerto (lançado à mão ou por uma conta paga sem comprovante): anexa nele
    if (media && pago && !analise.ehBoleto && qtd === 1 && !analise.ignorarAcerto) {
      let cands = [];
      try { cands = db.acertoSemComprovante(slug, valorParc, somaDias(primeiro, -10), somaDias(primeiro, 5)); } catch (e) {}
      if (cands.length === 1) return anexarNoAcerto({ jid, m, quem, slug, media, acertoId: cands[0].id });
      if (cands.length > 1) {
        pendentes[jid] = { tipo: 'acerto_comp', opcoes: cands.map(c => ({ id: c.id })).concat([{ novo: true }]), slug, media, analise, quando: Date.now() };
        await responder(jid, '📎 Comprovante de ' + fmtV(valorParc) + '. Já tem pagamento desse valor no Acerto. Em qual anexo?\n'
          + cands.map((c, i) => (i + 1) + '. ' + c.descricao + ' — ' + fmtV(c.saida) + ' — ' + fmtD(c.data)).join('\n') + '\n' + (cands.length + 1) + '. Nenhum, é um pagamento novo', m);
        return;
      }
    }

    if (!analise.ignorarDup) {
      const parecidas = db.contasParecidas(slug, valorParc, primeiro, 3);
      if (parecidas.length) return avisarDuplicado({ jid, m, slug, media, analise, texto: 'Já existe conta de ' + fmtV(valorParc) + ' perto dessa data: "' + parecidas[0].descricao + '" (venc. ' + fmtD(parecidas[0].vencimento) + ', ' + (estaPaga(parecidas[0]) ? 'paga' : 'pendente') + '). Pode ser repetido.' });
    }

    const grupo = qtd > 1 ? 'grp_' + Date.now().toString(36) + crypto.randomBytes(2).toString('hex') : '';
    const descBase = analise.descricao || 'Lançamento via WhatsApp';
    const ids = [];
    for (let i = 0; i < qtd; i++) {
      const item = {
        id: novoId(),
        vencimento: qtd > 1 ? somaMeses(primeiro, i) : primeiro,
        descricao: qtd > 1 ? descBase + ' (' + (i + 1) + '/' + qtd + ')' : descBase,
        valor: valorParc, recorrente: comp.recorrente, boleto_chegou: (media || pago) ? 1 : 0,
        pago_por: '', categoria: comp.categoria, tipo_nota: comp.tipo_nota,
        fornecedor: comp.fornecedor, a_chegar: 0, grupo_parcela: grupo,
        linha_digitavel: i === 0 && analise.ehBoleto ? analise.ehBoleto.linha || '' : '',
      };
      deps.criarConta(slug, item, autor);
      ids.push(item.id);
      if (i === 0) {
        const fields = {};
        if (analise.ehBoleto) { const arq = salvarComprovante(slug, item.id, media, 'boleto_'); if (arq) fields.boleto_arquivo = arq; }
        else {
          if (pago) fields.pago_por = pagoPor;
          const comprovante = salvarComprovante(slug, item.id, media);
          if (comprovante) fields.comprovante = comprovante;
        }
        if (Object.keys(fields).length) deps.atualizarConta(slug, item.id, fields, autor);
      }
    }
    guardarHash(media, slug, ids[0]);
    lembrarUltimo(jid, slug, ids, 'criar');
    const contas = ids.map(id => db.getContaPagarById(slug, id));
    registrar('criar', nomeEmp + ': ' + descBase + ' ' + fmtV(valorParc) + (qtd > 1 ? ' em ' + qtd + 'x' : '') + (pago ? ' (paga)' : ' (pendente)'), { quem, empresa: slug });
    let txt = (analise.ehBoleto ? '📄' : '🆕') + ' *' + nomeEmp + '* — ' + (analise.ehBoleto ? 'boleto lançado como conta a pagar' : (qtd > 1 ? 'criei ' + qtd + ' parcelas' : 'criei a conta')) + (comp.copiados.length ? ' (' + comp.copiados.join(', ') + ' copiado(s) do último lançamento deste fornecedor)' : '') + ':\n';
    if (qtd > 1) txt += resumoConta(contas[0]) + '\n   Parcelas: ' + contas.map(c => fmtD(c.vencimento)).join(', ') + ' — ' + fmtV(valorParc) + ' cada (total ' + fmtV(valorParc * qtd) + ')';
    else txt += resumoConta(contas[0]);
    if (!comp.tipo_nota) txt += '\n⚠️ Dentro/Fora não definido — responda D ou F.';
    await responder(jid, txt + DICA, m);
    if (analise.ehBoleto && analise.ehBoleto.linha) await enviarLinha(jid, analise.ehBoleto.linha);
    return;
  }
  await responder(jid, analise.mensagem || 'Não entendi o que fazer com essa mensagem.', m);
}

// Anexa o comprovante a um lançamento que já está no Acerto (não cria conta nova)
async function anexarNoAcerto({ jid, m, quem, slug, media, acertoId }) {
  const nomeEmp = (db.getEmpresas().find(e => e.slug === slug) || {}).nome || slug;
  const a = db.getAcertoById(slug, acertoId);
  if (!a) { await responder(jid, 'Não achei mais esse lançamento no Acerto.', m); return; }
  const conta = a.origem_conta_pagar ? db.getContaPagarById(slug, a.origem_conta_pagar) : null;
  const autor = 'WhatsApp (' + quem + ')';
  if (conta && !conta.comprovante) {
    // saída veio de uma conta a pagar já paga: o comprovante vai na conta (aparece nas duas telas)
    const antes = { [conta.id]: Object.assign({}, conta) };
    const rel = salvarComprovante(slug, conta.id, media);
    deps.atualizarConta(slug, conta.id, { comprovante: rel }, autor);
    lembrarUltimo(jid, slug, [conta.id], 'alterar', antes);
  } else {
    const rel = salvarComprovante(slug, a.id, media, 'acerto_');
    db.setAcertoComprovante(slug, a.id, rel);
    db.addAuditLog(slug, autor, 'alterou', 'Acerto', 'ID: ' + a.id + ' - anexou comprovante');
    lembrarUltimo(jid, slug, [a.id], 'acerto_comp');
  }
  guardarHash(media, slug, a.id);
  registrar('quitar', nomeEmp + ': comprovante anexado no Acerto "' + a.descricao + '" ' + fmtV(a.saida), { quem, empresa: slug });
  await responder(jid, '📎 *' + nomeEmp + '* — esse pagamento já estava no Acerto: "' + a.descricao + '" ' + fmtV(a.saida) + ' em ' + fmtD(a.data) + '. Anexei o comprovante nele (não lancei de novo).\nSe não for esse, responda "desfazer".', m);
}

// Lançamento direto em Movimentação e/ou Conta do Celso
async function executarLancamento({ jid, m, quem, slug, nomeEmp, analise, media }) {
  const l = Object.assign({}, analise.lancamento || {});
  const valor = parseFloat(l.valor || analise.valor);
  if (!valor) { await responder(jid, 'Não entendi o valor do lançamento. Ex.: "saída 10.000 reserva na movimentação".', m); return; }
  if (!l.movimentacao && !l.conta_celso) l.movimentacao = true;
  // falta saber entrada/saída ou débito/crédito: pergunta
  if (l.movimentacao && l.tipo_mov !== 'entrada' && l.tipo_mov !== 'saida') {
    pendentes[jid] = { tipo: 'lanc_tipo', campo: 'tipo_mov', opcoes: [{ v: 'entrada' }, { v: 'saida' }], slug, media, analise: Object.assign({}, analise, { lancamento: l }), quando: Date.now() };
    await responder(jid, 'Na Movimentação, ' + fmtV(valor) + ' é:\n1. Entrada\n2. Saída', m); return;
  }
  if (l.conta_celso && l.tipo_celso !== 'debito' && l.tipo_celso !== 'credito') {
    pendentes[jid] = { tipo: 'lanc_tipo', campo: 'tipo_celso', opcoes: [{ v: 'debito' }, { v: 'credito' }], slug, media, analise: Object.assign({}, analise, { lancamento: l }), quando: Date.now() };
    await responder(jid, 'Na Conta do Celso, ' + fmtV(valor) + ' é:\n1. Débito (Celso deve)\n2. Crédito (Celso pagou)', m); return;
  }
  const data = /^\d{4}-\d{2}-\d{2}$/.test(l.data || '') ? l.data : hojeISO();
  const desc = String(l.descricao || analise.descricao || 'Lançamento via WhatsApp').trim();
  const autor = 'WhatsApp (' + quem + ')';
  const feitos = [];
  if (l.movimentacao) {
    const item = { id: novoId(), data, descricao: desc, entrada: l.tipo_mov === 'entrada' ? valor : 0, saida: l.tipo_mov === 'saida' ? valor : 0, diferenca: 0 };
    db.addMovimentacao(slug, item);
    db.addAuditLog(slug, autor, 'criou', 'Movimentação', 'ID: ' + item.id + ' - ' + desc + ' - Entrada: ' + item.entrada + ' Saída: ' + item.saida);
    feitos.push({ tabela: 'movimentacao', id: item.id });
  }
  if (l.conta_celso) {
    const item = { id: novoId(), data, tipo: l.tipo_celso, descricao: desc, valor };
    db.addContaDono(slug, item);
    db.addAuditLog(slug, autor, 'criou', 'Conta Dono', 'ID: ' + item.id + ' - ' + desc + ' - R$ ' + valor);
    feitos.push({ tabela: 'conta_dono', id: item.id });
  }
  ultimos[jid] = { slug, ids: [], tipo: 'lanc', lanc: feitos, quando: Date.now() };
  registrar('criar', nomeEmp + ': ' + feitos.map(f => NOME_TAB[f.tabela]).join(' + ') + ' — ' + desc + ' ' + fmtV(valor), { quem, empresa: slug });
  await responder(jid, '💰 *' + nomeEmp + '* — lancei:\n' + feitos.map(f => linhaLanc(slug, f)).filter(Boolean).join('\n')
    + (media ? '\n(o anexo não fica guardado nessas abas)' : '')
    + '\n\n_Para corrigir: valor 9500, desc <texto>, venc 20/11 (muda a data) ou desfazer._', m);
}

// Linha digitável numa mensagem separada, só com os números (fácil de copiar para pagar)
async function enviarLinha(jid, linha) {
  if (!sock || !linha) return;
  try { const r = await sock.sendMessage(jid, { text: linha }); if (r && r.key && r.key.id) idsEnviados.add(r.key.id); } catch (e) {}
}

// ---------- perguntas ----------
async function executarConsulta({ jid, m, slugs, c }) {
  const hoje = hojeISO();
  const f = { status: c.status === 'pagas' ? 'pagas' : (c.status === 'todas' ? '' : 'pendentes'), de: c.de || null, ate: c.ate || null, categoria: c.categoria || null, texto: c.texto || null };
  if (!f.de && !f.ate) { if (f.status === 'pendentes') { f.de = somaDias(hoje, -365); f.ate = somaDias(hoje, 7); } else { f.de = hoje.substring(0, 8) + '01'; f.ate = hoje; } }
  const empresas = db.getEmpresas();
  const blocos = []; let total = 0, qtd = 0;
  for (const slug of slugs) {
    let rows = [];
    try { rows = db.consultarContas(slug, f); } catch (e) { continue; }
    if (!rows.length) continue;
    const soma = rows.reduce((s, r) => s + (r.valor || 0), 0);
    total += soma; qtd += rows.length;
    const nome = (empresas.find(e => e.slug === slug) || {}).nome || slug;
    blocos.push('*' + nome + '* — ' + rows.length + ' conta(s), ' + fmtV(soma) + '\n' + rows.slice(0, 12).map(r => '• ' + fmtD(r.vencimento) + ' ' + r.descricao + ' — ' + fmtV(r.valor) + (f.status === 'pendentes' && r.vencimento < hoje ? ' ⚠️ atrasada' : '') + (f.status !== 'pagas' && estaPaga(r) ? ' (paga)' : '')).join('\n') + (rows.length > 12 ? '\n… e mais ' + (rows.length - 12) : ''));
  }
  const titulo = (f.status === 'pagas' ? 'Pagas' : f.status === 'pendentes' ? 'A pagar' : 'Contas') + ' de ' + fmtD(f.de) + ' a ' + fmtD(f.ate) + (f.categoria ? ' · categoria ' + f.categoria : '') + (f.texto ? ' · "' + f.texto + '"' : '');
  registrar('consulta', titulo + ': ' + qtd + ' conta(s) ' + fmtV(total));
  if (!qtd) { await responder(jid, '🔎 ' + titulo + ': nenhuma conta encontrada.', m); return; }
  let txt = '🔎 ' + titulo + '\n\n' + blocos.join('\n\n');
  if (blocos.length > 1) txt += '\n\n💰 Total geral: *' + fmtV(total) + '* (' + qtd + ' contas)';
  if (txt.length > 3800) txt = txt.slice(0, 3800) + '\n… (lista cortada — refine a pergunta)';
  await responder(jid, txt, m);
}

// ---------- resumo diário ----------
async function jidDoNumero(numero) {
  for (const v of variantesNumero(numero)) {
    try { const r = await sock.onWhatsApp(v + '@s.whatsapp.net'); const ok = (r || []).find(x => x.exists); if (ok) return ok.jid; } catch (e) {}
  }
  const vs = variantesNumero(numero);
  return vs.length ? vs[vs.length - 1] + '@s.whatsapp.net' : '';
}
function montarResumoDiario() {
  const hoje = hojeISO(), amanha = somaDias(hoje, 1);
  const blocos = []; let totalHoje = 0, totalAtras = 0;
  for (const e of db.getEmpresas()) {
    let pend = [];
    try { pend = db.consultarContas(e.slug, { status: 'pendentes', de: somaDias(hoje, -90), ate: amanha }); } catch (err) { continue; }
    const atras = pend.filter(c => c.vencimento < hoje), deHoje = pend.filter(c => c.vencimento === hoje), deAmanha = pend.filter(c => c.vencimento === amanha);
    if (!atras.length && !deHoje.length && !deAmanha.length) continue;
    const soma = l => l.reduce((s, c) => s + (c.valor || 0), 0);
    totalHoje += soma(deHoje); totalAtras += soma(atras);
    let b = '*' + e.nome + '*';
    if (deHoje.length) b += '\nHoje (' + fmtV(soma(deHoje)) + '):\n' + deHoje.slice(0, 10).map(c => '• ' + c.descricao + ' — ' + fmtV(c.valor)).join('\n');
    if (atras.length) b += '\n⚠️ Atrasadas: ' + atras.length + ' (' + fmtV(soma(atras)) + ')' + (atras.length <= 5 ? '\n' + atras.map(c => '• ' + fmtD(c.vencimento) + ' ' + c.descricao + ' — ' + fmtV(c.valor)).join('\n') : '');
    if (deAmanha.length) b += '\nAmanhã: ' + deAmanha.length + ' (' + fmtV(soma(deAmanha)) + ')';
    blocos.push(b);
  }
  if (!blocos.length) return '☀️ Bom dia! Contas a pagar de ' + fmtD(hoje) + ': nada vencendo hoje nem atrasado. ✅';
  return '☀️ Bom dia! Contas a pagar — ' + fmtD(hoje) + '\n💰 Vence hoje: *' + fmtV(totalHoje) + '*' + (totalAtras ? ' · atrasadas: *' + fmtV(totalAtras) + '*' : '') + '\n\n' + blocos.join('\n\n');
}
async function enviarResumoDiario(forcar) {
  const cfg = lerConfig();
  if (!forcar && cfg.resumo_diario === false) return { ok: false, motivo: 'resumo desligado' };
  if (!sock || estado.status !== 'conectado') return { ok: false, motivo: 'WhatsApp desconectado' };
  const dono = (cfg.autorizados || [])[0];
  if (!dono) return { ok: false, motivo: 'nenhum número autorizado cadastrado' };
  const jid = await jidDoNumero(dono.numero);
  if (!jid) return { ok: false, motivo: 'número inválido' };
  const txt = montarResumoDiario();
  await responder(jid, txt);
  registrar('resumo', 'Resumo diário enviado para ' + (dono.nome || dono.numero));
  return { ok: true };
}

// ---------- API para o server ----------
function init(d) {
  deps = d || {};
  const cfg = lerConfig();
  if (cfg.ativo && fs.existsSync(path.join(authDir, 'creds.json'))) setTimeout(() => conectar().catch(e => registrar('erro', e.message)), 3000);
}
function status() {
  const cfg = lerConfig();
  return {
    status: estado.status, qr: estado.qr, numero: estado.numero, erro: estado.erro, desde: estado.desde,
    ativo: cfg.ativo, temSessao: fs.existsSync(path.join(authDir, 'creds.json')),
    grok_model: cfg.grok_model || grok.MODELO_PADRAO, temGrokKey: !!cfg.grok_api_key,
    grupos: Object.keys(gruposCache).map(jid => ({ jid, nome: gruposCache[jid].nome || jid, empresa: (cfg.grupos || {})[jid] || '', padrao: (cfg.grupos_padrao || {})[jid] || {} })).sort((a, b) => a.nome.localeCompare(b.nome)),
    gruposConfig: cfg.grupos || {}, autorizados: cfg.autorizados || [], empresa_padrao: cfg.empresa_padrao || '',
    grupos_padrao: cfg.grupos_padrao || {}, resumo_diario: cfg.resumo_diario !== false, apelidos: apelidosCfg(cfg),
    log: logEventos,
  };
}
function comprovantePath(rel) {
  const abs = path.resolve(comprovantesDir, rel || '');
  if (!rel || !abs.startsWith(path.resolve(comprovantesDir) + path.sep)) return null;
  return abs;
}

module.exports = { init, conectar, desconectar, status, atualizarGrupos, lerConfig, salvarConfig, grokCfg, salvarComprovante, comprovantePath, comprovantesDir, enviarResumoDiario,
  _interno: { tratarMensagem, identificarEmpresa, comandoRapido, variantesNumero, parseValorBR, somaMeses, dataDoTexto, norm, acharNoHistorico, montarResumoDiario, setSock(s) { sock = s; }, setEstado(e) { Object.assign(estado, e); }, setBaileys(b) { baileys = b; } } };
