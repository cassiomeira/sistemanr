// Módulo NF-e: consulta notas emitidas contra o CNPJ via SEFAZ Distribuição DF-e
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DistribuicaoDFe, RecepcaoEvento } = require('node-mde');
const db = require('./database');
const telegram = require('./telegram');

const certsDir = path.join(__dirname, 'data', 'certs');
if (!fs.existsSync(certsDir)) fs.mkdirSync(certsDir, { recursive: true });

const uid = () => 'nf_' + crypto.randomBytes(6).toString('hex');

function certPath(slug) { return path.join(certsDir, slug + '.pfx'); }

function getNfeConfig(slug) {
  const cfg = db.getConfig(slug);
  return {
    cnpj: (cfg.nfe_cnpj || '').replace(/\D/g, ''),
    senha: cfg.nfe_senha || '',
    uf: cfg.nfe_uf || '31',
    auto: cfg.nfe_auto === '1',
    ultNSU: cfg.nfe_ult_nsu || '000000000000000',
    ultimaConsulta: cfg.nfe_ultima_consulta || '',
    ultimoErro: cfg.nfe_ultimo_erro || '',
    temCert: fs.existsSync(certPath(slug)),
  };
}

function toArr(x) { return !x ? [] : (Array.isArray(x) ? x : [x]); }
function num(x) { return parseFloat(x) || 0; }

// Extrai chave de acesso do XML (fallback)
function chaveFromXml(xml) {
  const m = (xml || '').match(/Id="NFe(\d{44})"/);
  return m ? m[1] : '';
}

function processarResNFe(slug, doc) {
  const r = doc.json && doc.json.resNFe;
  if (!r || !r.chNFe) return null;
  if (r.cSitNFe === '3') return null; // cancelada
  const existente = db.getNotaRecebidaByChave(slug, r.chNFe);
  if (existente) return null;
  const nota = {
    id: uid(), chave: r.chNFe, nsu: doc.nsu || '', tipo: 'resumo',
    numero: '', emitente: r.xNome || '', emitente_cnpj: r.CNPJ || '',
    valor: num(r.vNF), data_emissao: (r.dhEmi || '').substring(0, 10),
    status: 'nova', manifestada: 0, duplicatas: [], itens: [], xml: '',
  };
  db.addNotaRecebida(slug, nota);
  return { nova: true, chave: r.chNFe };
}

const TPAG = { '01': 'Dinheiro', '02': 'Cheque', '03': 'Cartão Crédito', '04': 'Cartão Débito', '05': 'Crédito Loja', '10': 'Vale Alimentação', '11': 'Vale Refeição', '12': 'Vale Presente', '13': 'Vale Combustível', '14': 'Duplicata Mercantil', '15': 'Boleto', '16': 'Depósito Bancário', '17': 'PIX', '18': 'Transferência', '19': 'Cashback', '90': 'Sem pagamento', '99': 'Outros' };

function processarProcNFe(slug, doc) {
  const proc = doc.json && doc.json.nfeProc;
  if (!proc) return null;
  const nfe = proc.NFe || {};
  const inf = nfe.infNFe || {};
  const chave = (proc.protNFe && proc.protNFe.infProt && proc.protNFe.infProt.chNFe) || chaveFromXml(doc.xml);
  if (!chave) return null;
  const emit = inf.emit || {};
  const ide = inf.ide || {};
  const total = (inf.total && inf.total.ICMSTot) || {};
  const cobr = inf.cobr || {};
  const dups = toArr(cobr.dup).map(d => ({ nDup: d.nDup || '', vencimento: d.dVenc || '', valor: num(d.vDup) }));
  const itens = toArr(inf.det).map(d => {
    const p = d.prod || {};
    return { produto: p.xProd || '', qtd: num(p.qCom), valor: num(p.vProd) };
  });
  // Forma de pagamento (tag <pag><detPag>): tPag = meio, indPag = 0 à vista / 1 a prazo
  const detPags = toArr((inf.pag || {}).detPag).map(d => ({ tPag: String(d.tPag || ''), vPag: num(d.vPag), indPag: d.indPag !== undefined ? String(d.indPag) : '' }));
  const meios = [...new Set(detPags.map(d => TPAG[d.tPag] || (d.tPag ? 'Cód ' + d.tPag : '')).filter(Boolean))];
  let prazo = '';
  const inds = detPags.map(d => d.indPag).filter(x => x !== '');
  if (inds.includes('1')) prazo = 'a prazo'; else if (inds.includes('0')) prazo = 'à vista';
  if (!prazo) prazo = dups.length > 1 ? 'a prazo' : (dups.length === 1 ? 'a prazo' : 'à vista');
  const formaPagamento = (meios.join(', ') || 'Não informado') + ' • ' + prazo + (dups.length > 1 ? ' ' + dups.length + 'x' : '');
  const dados = {
    tipo: 'completa', nsu: doc.nsu || '',
    numero: String(ide.nNF || ''), emitente: emit.xNome || '',
    emitente_cnpj: emit.CNPJ || '', valor: num(total.vNF),
    data_emissao: (ide.dhEmi || '').substring(0, 10),
    duplicatas_json: JSON.stringify(dups), itens_json: JSON.stringify(itens),
    forma_pagamento: formaPagamento, pagamentos_json: JSON.stringify(detPags),
    xml: doc.xml || '',
  };
  // Cadastro automático do fornecedor com os dados da nota
  try {
    const end = emit.enderEmit || {};
    if (emit.CNPJ) db.upsertFornecedorNfe(slug, {
      id: uid(), cnpj: String(emit.CNPJ), razao: emit.xNome || '', fantasia: emit.xFant || '',
      ie: String(emit.IE || ''), telefone: String(end.fone || ''),
      endereco: [end.xLgr, end.nro].filter(Boolean).join(', ') + (end.xCpl ? ' ' + end.xCpl : '') + (end.xBairro ? ' - ' + end.xBairro : ''),
      municipio: end.xMun || '', uf: end.UF || '', cep: String(end.CEP || ''),
    });
  } catch (e) { console.error('NFe: erro cadastrando fornecedor:', e.message); }
  const existente = db.getNotaRecebidaByChave(slug, chave);
  if (existente) {
    if (existente.tipo === 'completa') return null;
    db.updateNotaRecebida(slug, existente.id, dados);
    return { atualizada: true };
  }
  db.addNotaRecebida(slug, {
    id: uid(), chave, status: 'nova', manifestada: 1,
    tipo: 'completa', nsu: doc.nsu || '', numero: dados.numero,
    emitente: dados.emitente, emitente_cnpj: dados.emitente_cnpj,
    valor: dados.valor, data_emissao: dados.data_emissao,
    duplicatas: dups, itens, xml: doc.xml || '',
    forma_pagamento: formaPagamento, pagamentos: detPags,
  });
  return { nova: true };
}

async function consultarNotas(slug) {
  const cfg = getNfeConfig(slug);
  if (!cfg.temCert) return { error: 'Certificado não configurado. Envie o arquivo .pfx nas configurações.' };
  if (!cfg.cnpj) return { error: 'CNPJ não configurado.' };
  let pfx;
  try { pfx = fs.readFileSync(certPath(slug)); } catch (e) { return { error: 'Erro ao ler certificado: ' + e.message }; }

  const dist = new DistribuicaoDFe({ pfx, passphrase: cfg.senha, cnpj: cfg.cnpj, cUFAutor: cfg.uf, tpAmb: '1' });
  let ultNSU = cfg.ultNSU;
  let novas = 0, atualizadas = 0;
  const chavesParaCiencia = [];
  let erro = null;

  try {
    for (let iter = 0; iter < 60; iter++) {
      const consulta = await dist.consultaUltNSU(ultNSU);
      if (consulta.error) { erro = String(consulta.error); break; }
      const d = consulta.data || {};
      if (d.cStat === '656') { erro = 'Limite de consultas da SEFAZ atingido. Aguarde 1 hora.'; break; }
      if (d.cStat === '137') { ultNSU = d.ultNSU || ultNSU; break; } // nenhum documento novo
      if (d.cStat !== '138') { erro = 'SEFAZ: ' + (d.cStat || '?') + ' - ' + (d.xMotivo || 'resposta inesperada'); break; }
      for (const doc of toArr(d.docZip)) {
        try {
          const schema = doc.schema || '';
          let r = null;
          if (schema.startsWith('resNFe')) {
            r = processarResNFe(slug, doc);
            if (r && r.nova) { novas++; chavesParaCiencia.push(r.chave); }
          } else if (schema.startsWith('procNFe')) {
            r = processarProcNFe(slug, doc);
            if (r && r.nova) novas++;
            if (r && r.atualizada) atualizadas++;
          }
        } catch (e) { console.error('NFe: erro processando doc NSU', doc.nsu, e.message); }
      }
      ultNSU = d.ultNSU;
      db.updateConfig(slug, 'nfe_ult_nsu', ultNSU);
      if (!d.maxNSU || BigInt(d.ultNSU || '0') >= BigInt(d.maxNSU || '0')) break;
    }
  } catch (e) {
    erro = e.message;
  }

  db.updateConfig(slug, 'nfe_ult_nsu', ultNSU);
  db.updateConfig(slug, 'nfe_ultima_consulta', new Date().toISOString());
  db.updateConfig(slug, 'nfe_ultimo_erro', erro || '');

  // Manifestar ciência da operação para liberar o XML completo (vem na próxima consulta)
  if (chavesParaCiencia.length) {
    try {
      const recepcao = new RecepcaoEvento({ pfx, passphrase: cfg.senha, cnpj: cfg.cnpj, tpAmb: '1' });
      for (let i = 0; i < chavesParaCiencia.length; i += 20) {
        const lote = chavesParaCiencia.slice(i, i + 20).map(ch => ({ chNFe: ch, tipoEvento: 210210 }));
        const resp = await recepcao.enviarEvento({ idLote: String(Date.now()).substring(0, 15), lote });
        if (!resp.error && resp.data && resp.data.infEvento) {
          for (const ev of toArr(resp.data.infEvento)) {
            // 135 = registrado | 573 = duplicidade (já manifestado antes)
            if (ev.cStat === '135' || ev.cStat === '573') {
              const nota = db.getNotaRecebidaByChave(slug, ev.chNFe);
              if (nota) db.updateNotaRecebida(slug, nota.id, { manifestada: 1 });
            }
          }
        }
      }
    } catch (e) { console.error('NFe: erro na manifestação:', e.message); }
  }

  console.log(`NFe [${slug}]: ${novas} nova(s), ${atualizadas} completada(s)${erro ? ' | ERRO: ' + erro : ''}`);
  if (novas > 0) telegram.notificarNotasNovas(slug, novas).catch(() => {});
  return { ok: !erro, novas, atualizadas, error: erro };
}

// Consulta automática (cron) para todas as empresas com nfe_auto=1
async function consultarTodasEmpresas() {
  const empresas = db.getEmpresas();
  for (const emp of empresas) {
    try {
      const cfg = getNfeConfig(emp.slug);
      if (cfg.auto && cfg.temCert && cfg.cnpj) {
        await consultarNotas(emp.slug);
      }
    } catch (e) { console.error('NFe cron erro [' + emp.slug + ']:', e.message); }
  }
}

module.exports = { getNfeConfig, certPath, consultarNotas, consultarTodasEmpresas };
