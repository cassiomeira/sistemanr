// WhatsApp (Baileys) + Grok: recebe comprovantes/comandos e lança nas contas a pagar da empresa
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./database');
const grok = require('./grok');

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
  try { return Object.assign({ ativo: false, grok_api_key: '', grok_model: '', grupos: {}, autorizados: [], empresa_padrao: '' }, JSON.parse(fs.readFileSync(cfgPath, 'utf8'))); }
  catch (e) { return { ativo: false, grok_api_key: '', grok_model: '', grupos: {}, autorizados: [], empresa_padrao: '' }; }
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
          estado.erro = 'Conexão caiu (código ' + code + '). Reconectando em ' + Math.round(espera / 1000) + 's...';
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
  const a = (cfg.autorizados || []).find(x => soDigitos(x.numero) && (numero.endsWith(soDigitos(x.numero)) || soDigitos(x.numero).endsWith(numero)));
  if (a) return a.nome || numero;
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

async function transcreverComGemini(slug, buffer, mimeType) {
  try {
    const pedidos = require('./pedidos');
    const r = await pedidos.chamarGemini(slug, buffer, mimeType, 'Este arquivo é um comprovante de pagamento/transferência brasileiro. Transcreva TODOS os textos legíveis e devolva SOMENTE JSON: {"texto":"transcrição completa, linha por linha","valor":0.00,"data":"YYYY-MM-DD","favorecido":"quem recebeu","pagador":"quem pagou","descricao":"tipo (PIX, boleto, TED...) e finalidade se houver"}. Valores com ponto decimal. Se algo não estiver legível, deixe vazio — nunca invente.');
    if (r.error) return { error: r.error };
    let j = {}; try { j = pedidos.parseJsonResposta(r.text); } catch (e) { return { texto: r.text }; }
    return { texto: (j.texto || '') + '\nVALOR: ' + (j.valor || '') + '\nDATA: ' + (j.data || '') + '\nFAVORECIDO: ' + (j.favorecido || '') + '\nPAGADOR: ' + (j.pagador || '') + '\nDESCRICAO: ' + (j.descricao || '') };
  } catch (e) { return { error: e.message }; }
}

// ---------- fluxo principal ----------
async function tratarMensagem(m) {
  if (!m || !m.message || !m.key) return;
  const jid = m.key.remoteJid || '';
  if (!jid || jid === 'status@broadcast' || /@newsletter$/.test(jid)) return;
  if (idsEnviados.has(m.key.id)) { idsEnviados.delete(m.key.id); return; }
  const msg = desembrulhar(m.message);
  if (msg.protocolMessage || msg.reactionMessage || msg.senderKeyDistributionMessage && Object.keys(msg).length === 1) return;

  const texto = (msg.conversation || (msg.extendedTextMessage && msg.extendedTextMessage.text) || (msg.imageMessage && msg.imageMessage.caption) || (msg.documentMessage && msg.documentMessage.caption) || '').trim();
  if (texto.startsWith(MARCA)) return;
  const ehGrupo = /@g\.us$/.test(jid);
  const cfg = lerConfig();

  if (ehGrupo) {
    gruposCache[jid] = Object.assign(gruposCache[jid] || { nome: jid }, { ultima: new Date().toISOString() });
    if (!gruposCache[jid].nome || gruposCache[jid].nome === jid) { try { gruposCache[jid].nome = (await sock.groupMetadata(jid)).subject || jid; } catch (e) {} }
  }
  const numero = remetentePn(m);
  const quem = nomeAutorizado(numero, !!m.key.fromMe);
  if (!quem) return; // só números autorizados (ou o próprio dono do WhatsApp)

  const empresaFixa = ehGrupo ? (cfg.grupos || {})[jid] || '' : (cfg.empresa_padrao || '');
  if (ehGrupo && !empresaFixa) return; // grupo não vinculado a empresa: ignora

  const media = msg.imageMessage || msg.documentMessage || null;
  if (!media && !texto) return;

  // Resposta a uma pergunta pendente ("1", "2", "cancelar")
  const pend = pendentes[jid];
  if (pend && !media) {
    if (/^(cancela|cancelar|não|nao|esquece)/i.test(texto)) { delete pendentes[jid]; await responder(jid, 'Ok, cancelado.', m); return; }
    const n = parseInt(texto, 10);
    if (n >= 1 && n <= pend.opcoes.length) {
      delete pendentes[jid];
      const escolha = pend.opcoes[n - 1];
      if (pend.tipo === 'empresa') return analisarEExecutar({ jid, m, texto: pend.texto, media: pend.media, quem, empresaFixa: escolha.slug, cfg });
      if (pend.tipo === 'conta') return executar({ jid, m, quem, slug: pend.slug, media: pend.media, analise: Object.assign({}, pend.analise, { acao: 'quitar', conta_id: escolha.id, confianca: 1 }) });
      if (pend.tipo === 'confirmar') {
        if (escolha.modo === 'cancelar') { await responder(jid, 'Ok, cancelado. Nada foi alterado.', m); return; }
        return executar({ jid, m, quem, slug: pend.slug, media: pend.media, analise: Object.assign({}, pend.analise, { forcar: escolha.modo }) });
      }
    }
    if (Date.now() - pend.quando > 15 * 60000) delete pendentes[jid]; // expirou: segue como mensagem nova
    else { await responder(jid, 'Responda com o número de uma das opções (1 a ' + pend.opcoes.length + ') ou "cancelar".', m); return; }
  }

  let arquivo = null;
  if (media) {
    try {
      const buffer = await baileys.downloadMediaMessage({ key: m.key, message: msg }, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage });
      arquivo = { buffer, mimeType: (media.mimetype || '').split(';')[0].toLowerCase(), nome: media.fileName || '' };
    } catch (e) { await responder(jid, 'Não consegui baixar o arquivo: ' + e.message, m); return; }
  }
  await analisarEExecutar({ jid, m, texto, media: arquivo, quem, empresaFixa, cfg });
}

function montarContexto(slugs, texto) {
  const hoje = hojeISO();
  const empresas = db.getEmpresas();
  const ctx = { hoje, empresas: empresas.filter(e => slugs.includes(e.slug)).map(e => ({ slug: e.slug, nome: e.nome })), contas_pendentes: [], colaboradores: {}, categorias: {} };
  for (const slug of slugs) {
    try {
      ctx.contas_pendentes.push(...db.getContasPagarPendentes(slug, somaDias(hoje, -120), somaDias(hoje, 90)).map(c => ({ id: c.id, empresa: slug, vencimento: c.vencimento, descricao: c.descricao, valor: c.valor, fornecedor: c.fornecedor || '' })));
      ctx.colaboradores[slug] = db.getColaboradores(slug).map(c => c.nome);
      ctx.categorias[slug] = db.getConfig(slug).categoriasLoja || [];
    } catch (e) {}
  }
  return ctx;
}

const SYSTEM = `Você é o assistente financeiro do sistema Nunes Rocha. O dono das empresas te manda, pelo WhatsApp, comprovantes de pagamento (foto/PDF) e textos curtos como "lavagem caminhão branco pago da clc" ou "criar conta energia 450 vence dia 10".
Sua tarefa é decidir UMA ação e devolver SOMENTE um JSON com este formato:
{"acao":"quitar"|"criar"|"perguntar"|"ignorar","empresa":slug|null,"conta_id":string|null,"candidatos":[ids],"valor":number|null,"data_pagamento":"YYYY-MM-DD"|null,"descricao":string|null,"fornecedor":string|null,"categoria":string|null,"vencimento":"YYYY-MM-DD"|null,"pago":true|false,"pago_por":string|null,"confianca":0..1,"mensagem":"texto curto em português para o usuário"}
Regras:
- "quitar": existe uma conta pendente que corresponde à mensagem/comprovante (compare descrição, fornecedor, valor com tolerância de 3% e vencimento próximo). Preencha conta_id e data_pagamento (data do comprovante, ou hoje).
- Se houver 2 ou mais contas plausíveis e não dá para decidir, use "perguntar" com candidatos (até 5 ids, do mais provável ao menos).
- "criar": a mensagem descreve uma despesa que NÃO está nas pendentes. Se veio comprovante ou o texto diz "pago/paguei", marque pago=true, vencimento=data do pagamento; se o texto fala em vencimento/boleto/a pagar, pago=false e vencimento=data informada (ano atual, ou próximo se já passou). Preencha descricao curta e clara, valor (do comprovante se houver), fornecedor (quem recebeu) e categoria (escolha entre as da empresa, senão "Outros").
- Se a empresa não estiver definida e a mensagem não deixar claro qual é, use "perguntar" com empresa=null (o sistema lista as empresas).
- pago_por: só preencha se a mensagem citar quem pagou e o nome existir em colaboradores da empresa; senão null.
- "ignorar": conversa sem relação com finanças (cumprimentos, etc.). Nunca invente valores: se não houver valor legível, deixe null.
- Datas no formato YYYY-MM-DD. "mensagem" deve resumir o que você entendeu (1 ou 2 frases).`;

async function analisarEExecutar({ jid, m, texto, media, quem, empresaFixa, cfg }) {
  const g = grokCfg();
  if (!g.apiKey) { await responder(jid, 'A chave da API do Grok não está configurada no sistema (Configurações → WhatsApp).', m); return; }
  const empresas = db.getEmpresas();
  const slugs = empresaFixa ? [empresaFixa] : empresas.map(e => e.slug);
  const ctx = montarContexto(slugs, texto);
  const imagens = [];
  let anexoTexto = '';
  if (media) {
    if (/^image\/(jpe?g|png)$/.test(media.mimeType)) imagens.push({ buffer: media.buffer, mimeType: media.mimeType });
    else if (media.mimeType === 'application/pdf') {
      anexoTexto = await extrairPdfTexto(media.buffer);
      if (!anexoTexto || anexoTexto.length < 25) {
        // PDF escaneado (só imagem): o Gemini lê PDF nativamente — usa ele para transcrever
        const t = await transcreverComGemini(slugs[0], media.buffer, 'application/pdf');
        if (t.error) { await responder(jid, 'O PDF veio sem texto (escaneado) e não consegui ler com a IA: ' + t.error + '\nManda uma foto/print do comprovante.', m); return; }
        anexoTexto = '(transcrito por OCR da IA — confira o valor)\n' + t.texto;
      }
    } else { await responder(jid, 'Formato ' + (media.mimeType || 'desconhecido') + ' não suportado. Envie foto (JPG/PNG) ou PDF.', m); return; }
  }
  const prompt = 'Mensagem do usuário: ' + (texto ? JSON.stringify(texto) : '(sem texto, só o comprovante)') + '\n'
    + (empresaFixa ? 'Empresa desta conversa (fixa): ' + empresaFixa + '\n' : 'Empresa não definida — descubra pelo texto (nomes/slugs abaixo).\n')
    + (imagens.length ? 'Há uma imagem de comprovante anexa: leia valor, data, quem recebeu e descrição.\n' : '')
    + (anexoTexto ? 'Texto extraído do PDF do comprovante:\n"""' + anexoTexto.slice(0, 6000) + '"""\n' : '')
    + 'Contexto (JSON): ' + JSON.stringify(ctx);
  let analise;
  try { analise = await grok.perguntarJson(g, { system: SYSTEM, texto: prompt, imagens }); }
  catch (e) { registrar('erro', 'Grok: ' + e.message, { quem }); await responder(jid, 'Não consegui consultar a IA agora: ' + e.message, m); return; }
  registrar('analise', (analise.acao || '?') + ' — ' + (analise.mensagem || ''), { quem, texto, empresa: analise.empresa || empresaFixa });

  const slug = empresaFixa || analise.empresa || '';
  if (analise.acao === 'ignorar') return;
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
  await executar({ jid, m, quem, slug, media, analise });
}

function salvarComprovante(slug, contaId, media) {
  if (!media || !media.buffer) return '';
  const ext = media.mimeType === 'application/pdf' ? 'pdf' : (media.mimeType === 'image/png' ? 'png' : 'jpg');
  const dir = path.join(comprovantesDir, slug);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const nome = contaId + '_' + Date.now() + '.' + ext;
  fs.writeFileSync(path.join(dir, nome), media.buffer);
  return slug + '/' + nome;
}

async function executar({ jid, m, quem, slug, media, analise }) {
  const nomeEmp = (db.getEmpresas().find(e => e.slug === slug) || {}).nome || slug;
  const colabs = db.getColaboradores(slug).map(c => c.nome);
  const pagoPor = (analise.pago_por && colabs.find(c => c.toLowerCase() === String(analise.pago_por).toLowerCase())) || colabs.find(c => c.toLowerCase() === String(quem).toLowerCase()) || quem;

  if (analise.acao === 'quitar') {
    const conta = db.getContaPagarById(slug, analise.conta_id);
    if (!conta) { await responder(jid, 'Não achei essa conta no sistema. Pode detalhar?', m); return; }
    const jaPaga = conta.pago_por && conta.pago_por !== 'A Pagar';
    const diverge = analise.valor && Math.abs(analise.valor - conta.valor) > Math.max(0.05, conta.valor * 0.03);
    if (diverge && !analise.forcar) {
      pendentes[jid] = { tipo: 'confirmar', opcoes: [{ modo: 'manter' }, { modo: 'corrigir' }, { modo: 'cancelar' }], slug, media, analise, quando: Date.now() };
      await responder(jid, '⚠️ O comprovante é de ' + fmtV(analise.valor) + ', mas a conta "' + conta.descricao + '" está lançada com ' + fmtV(conta.valor) + ' (venc. ' + fmtD(conta.vencimento) + ').\n1. Quitar mesmo assim (mantém ' + fmtV(conta.valor) + ')\n2. Quitar e corrigir o valor para ' + fmtV(analise.valor) + '\n3. Cancelar', m);
      return;
    }
    if (analise.forcar === 'corrigir' && analise.valor) { deps.atualizarConta(slug, conta.id, { valor: analise.valor }, 'WhatsApp (' + quem + ')'); conta.valor = analise.valor; }
    const comprovante = salvarComprovante(slug, conta.id, media);
    const fields = {};
    if (!jaPaga) fields.pago_por = pagoPor;
    if (comprovante) fields.comprovante = comprovante;
    if (Object.keys(fields).length) deps.atualizarConta(slug, conta.id, fields, 'WhatsApp (' + quem + ')');
    registrar('quitar', nomeEmp + ': ' + conta.descricao + ' ' + fmtV(conta.valor), { quem, empresa: slug });
    await responder(jid, '✅ *' + nomeEmp + '* — ' + conta.descricao + ' (' + fmtV(conta.valor) + ', venc. ' + fmtD(conta.vencimento) + ')'
      + (jaPaga ? ' já estava paga' + (comprovante ? '; anexei o comprovante.' : '.') : ' marcada como paga por ' + pagoPor + (comprovante ? ', comprovante anexado.' : '.'))
      + (analise.valor && Math.abs(analise.valor - conta.valor) > 0.01 ? '\n⚠️ Valor do comprovante (' + fmtV(analise.valor) + ') difere do lançado (' + fmtV(conta.valor) + ').' : ''), m);
    return;
  }
  if (analise.acao === 'criar') {
    if (!analise.valor) { await responder(jid, 'Não consegui ler o valor. Me diz o valor (ex.: "350,00") junto com a descrição.', m); return; }
    const cats = db.getConfig(slug).categoriasLoja || [];
    const item = {
      id: crypto.randomBytes(5).toString('hex'),
      vencimento: analise.vencimento || analise.data_pagamento || hojeISO(),
      descricao: analise.descricao || 'Lançamento via WhatsApp',
      valor: parseFloat(analise.valor), recorrente: 0, boleto_chegou: 1,
      pago_por: '', categoria: cats.includes(analise.categoria) ? analise.categoria : 'Outros',
      fornecedor: analise.fornecedor || '', a_chegar: 0,
    };
    deps.criarConta(slug, item, 'WhatsApp (' + quem + ')');
    const comprovante = salvarComprovante(slug, item.id, media);
    const fields = {};
    if (analise.pago || media) fields.pago_por = pagoPor;
    if (comprovante) fields.comprovante = comprovante;
    if (Object.keys(fields).length) deps.atualizarConta(slug, item.id, fields, 'WhatsApp (' + quem + ')');
    registrar('criar', nomeEmp + ': ' + item.descricao + ' ' + fmtV(item.valor) + (fields.pago_por ? ' (paga)' : ' (pendente)'), { quem, empresa: slug });
    await responder(jid, '🆕 *' + nomeEmp + '* — criei "' + item.descricao + '" de ' + fmtV(item.valor) + (item.fornecedor ? ' (' + item.fornecedor + ')' : '')
      + (fields.pago_por ? ', já paga por ' + pagoPor + (comprovante ? ' com comprovante anexado.' : '.') : ', vencendo em ' + fmtD(item.vencimento) + ' (pendente).'), m);
    return;
  }
  await responder(jid, analise.mensagem || 'Não entendi o que fazer com essa mensagem.', m);
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
    grupos: Object.keys(gruposCache).map(jid => ({ jid, nome: gruposCache[jid].nome || jid, empresa: (cfg.grupos || {})[jid] || '' })).sort((a, b) => a.nome.localeCompare(b.nome)),
    gruposConfig: cfg.grupos || {}, autorizados: cfg.autorizados || [], empresa_padrao: cfg.empresa_padrao || '',
    log: logEventos,
  };
}
function comprovantePath(rel) {
  const abs = path.resolve(comprovantesDir, rel || '');
  if (!rel || !abs.startsWith(path.resolve(comprovantesDir) + path.sep)) return null;
  return abs;
}

module.exports = { init, conectar, desconectar, status, atualizarGrupos, lerConfig, salvarConfig, grokCfg, salvarComprovante, comprovantePath, comprovantesDir,
  _interno: { tratarMensagem, setSock(s) { sock = s; }, setEstado(e) { Object.assign(estado, e); }, setBaileys(b) { baileys = b; } } };
