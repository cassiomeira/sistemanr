// Módulo Análise Fiscal de Compras
// Parseia os XMLs das NF-e recebidas (parser nativo, sem libs), monta o perfil
// tributário por fornecedor e calcula custo líquido real de compra após créditos.
const db = require('./database');

// ===== Regime tributário da empresa (por CNPJ configurado no módulo NF-e) =====
// - presumido_icms: Lucro Presumido, ICMS normal → credita ICMS destacado; IPI é custo
// - sem_credito: farmácia (ICMS-ST + PIS/COFINS monofásico) → nenhum crédito
function regimeEmpresa(slug) {
  const cfg = db.getConfig(slug);
  if (cfg.fiscal_regime === 'sem_credito' || cfg.fiscal_regime === 'presumido_icms') return cfg.fiscal_regime;
  const cnpj = String(cfg.nfe_cnpj || '').replace(/\D/g, '');
  if (cnpj === '05916046000179') return 'sem_credito';   // Drugstore Nunes Rocha
  if (cnpj === '20606315000194') return 'presumido_icms'; // Geraldo Celso Rocha-EPP
  if (/drog|farma/i.test(slug)) return 'sem_credito';
  return 'presumido_icms';
}

function paramFiscal(slug, chave, padrao) {
  const v = parseFloat(db.getConfig(slug)[chave]);
  return isNaN(v) ? padrao : v;
}

// ===== Parser XML nativo (regex) =====
function tag(bloco, nome) {
  const m = String(bloco || '').match(new RegExp('<' + nome + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + nome + '>'));
  return m ? m[1].trim() : '';
}
function num(bloco, nome) { const v = parseFloat(tag(bloco, nome)); return isNaN(v) ? 0 : v; }

const CST_ST = new Set(['10', '30', '60', '70']);
const CSOSN_ST = new Set(['500', '201', '202', '203']);

// Extrai cabeçalho + itens fiscais de um XML de NF-e (nfeProc ou NFe)
function parseXmlNota(xml) {
  xml = String(xml || '');
  const out = { chave: '', cnpj: '', emitente: '', uf: '', data_emissao: '', numero: '', itens: [] };
  const mChave = xml.match(/Id="NFe(\d{44})"/);
  if (mChave) out.chave = mChave[1];
  const emit = tag(xml, 'emit');
  out.cnpj = (tag(emit, 'CNPJ') || '').replace(/\D/g, '');
  out.emitente = tag(emit, 'xNome');
  out.uf = tag(tag(emit, 'enderEmit'), 'UF');
  const ide = tag(xml, 'ide');
  out.numero = tag(ide, 'nNF');
  out.data_emissao = (tag(ide, 'dhEmi') || tag(ide, 'dEmi') || '').substring(0, 10);

  const reDet = /<det(?:\s[^>]*)?>([\s\S]*?)<\/det>/g;
  let m;
  while ((m = reDet.exec(xml)) !== null) {
    const det = m[1];
    const prod = tag(det, 'prod');
    const imposto = tag(det, 'imposto');
    const icms = tag(imposto, 'ICMS');
    const ipi = tag(imposto, 'IPI');
    const ibscbs = tag(imposto, 'IBSCBS');

    const cst = tag(icms, 'CST');
    const csosn = tag(icms, 'CSOSN');
    const st = CST_ST.has(cst) || CSOSN_ST.has(csosn) || num(icms, 'vICMSST') > 0;

    const item = {
      cprod: tag(prod, 'cProd'),
      ncm: tag(prod, 'NCM'),
      descricao: tag(prod, 'xProd'),
      cfop: tag(prod, 'CFOP'),
      qtd: num(prod, 'qCom'),
      vunit: num(prod, 'vUnCom'),
      vprod: num(prod, 'vProd'),
      cst: cst || (csosn ? 'CSOSN ' + csosn : ''),
      picms: num(icms, 'pICMS'),
      vicms: st ? 0 : num(icms, 'vICMS'), // ICMS de item ST não gera crédito ao revendedor
      vicmsst: num(icms, 'vICMSST'),
      pipi: num(ipi, 'pIPI'),
      vipi: num(ipi, 'vIPI'),
      // Reforma tributária (grupo IBSCBS, notas 2026+)
      pibs: num(ibscbs, 'pIBSUF') + num(ibscbs, 'pIBSMun'),
      vibs: num(ibscbs, 'vIBSUF') + num(ibscbs, 'vIBSMun'),
      pcbs: num(ibscbs, 'pCBS'),
      vcbs: num(ibscbs, 'vCBS'),
      st: st ? 1 : 0,
    };
    if (item.vprod > 0 || item.descricao) out.itens.push(item);
  }
  return out;
}

// ===== Processamento e armazenamento =====
function processarNota(slug, notaId, persistir = true) {
  const nota = db.getNotaRecebidaById(slug, notaId);
  if (!nota || !nota.xml || nota.tipo !== 'completa') return 0;
  const p = parseXmlNota(nota.xml);
  if (!p.itens.length) return 0;
  const rows = p.itens.map(i => ({
    ...i,
    nota_id: nota.id,
    chave: p.chave || nota.chave || '',
    cnpj: p.cnpj || String(nota.emitente_cnpj || '').replace(/\D/g, ''),
    emitente: p.emitente || nota.emitente || '',
    uf: p.uf,
    data_emissao: p.data_emissao || nota.data_emissao || '',
  }));
  db.replaceFiscalItens(slug, nota.id, rows, persistir);
  return rows.length;
}

// Trava simples contra reprocessamento concorrente (requisições paralelas)
const emProcessamento = new Set();

function reprocessarTudo(slug) {
  if (emProcessamento.has(slug)) return { notas: 0, itens: 0, ocupado: true };
  emProcessamento.add(slug);
  try {
    let notas = 0, itens = 0;
    for (const n of db.getNotasComXmlIds(slug)) {
      const q = processarNota(slug, n.id, false); // grava em memória
      if (q > 0) { notas++; itens += q; }
    }
    db.persistFiscal(slug); // uma única escrita em disco no final
    return { notas, itens };
  } finally { emProcessamento.delete(slug); }
}

// Backfill preguiçoso incremental: processa só as notas com XML que ainda não têm itens fiscais
function garantirDados(slug) {
  if (emProcessamento.has(slug)) return null;
  const pendentes = db.getNotasFiscalPendentes(slug);
  if (!pendentes.length) return null;
  emProcessamento.add(slug);
  try {
    for (const n of pendentes) processarNota(slug, n.id, false);
    db.persistFiscal(slug);
    return { notas: pendentes.length };
  } finally { emProcessamento.delete(slug); }
}

// ===== Agregações =====
function mediana(valores) {
  const v = valores.filter(x => x > 0).sort((a, b) => a - b);
  if (!v.length) return 0;
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}
function r2(v) { return Math.round(v * 100) / 100; }
function r4(v) { return Math.round(v * 10000) / 10000; }

// Perfil tributário agregado de um fornecedor (a partir dos itens fiscais)
function montarPerfil(rows) {
  if (!rows.length) return null;
  let tot = 0, totSt = 0, totIcms = 0, totIpi = 0, somaPicmsPond = 0, basePicms = 0, totCbs = 0, totIbs = 0;
  const notas = new Set();
  for (const i of rows) {
    tot += i.vprod; totIcms += i.vicms; totIpi += i.vipi; totCbs += i.vcbs; totIbs += i.vibs;
    if (i.st) totSt += i.vprod;
    else if (i.picms > 0) { somaPicmsPond += i.picms * i.vprod; basePicms += i.vprod; }
    notas.add(i.nota_id);
  }
  rows.sort((a, b) => String(a.data_emissao).localeCompare(String(b.data_emissao)));
  const ult = rows[rows.length - 1];
  return {
    cnpj: ult.cnpj,
    emitente: ult.emitente,
    uf: ult.uf,
    notas: notas.size,
    itens: rows.length,
    total_comprado: r2(tot),
    ultima_compra: ult.data_emissao,
    st_pct: tot > 0 ? r4(totSt / tot) : 0,                       // fração do valor comprado que é ST
    aliq_icms_destacada: basePicms > 0 ? r2(somaPicmsPond / basePicms) : 0, // % média destacada (não-ST)
    icms_efetivo: tot > 0 ? r4(totIcms / tot) : 0,               // fração creditável sobre o valor total
    ipi_efetivo: tot > 0 ? r4(totIpi / tot) : 0,                 // fração de IPI sobre o valor total
    tem_ibscbs: (totCbs + totIbs) > 0,
  };
}

function perfilFornecedor(slug, cnpj) {
  garantirDados(slug);
  const rows = db.getFiscalItensByCnpj(slug, String(cnpj).replace(/\D/g, ''));
  const perfil = montarPerfil(rows);
  if (!perfil) return null;
  // Histórico de preço por produto (cProd)
  const porProd = new Map();
  for (const i of rows) {
    const k = i.cprod || i.descricao;
    if (!porProd.has(k)) porProd.set(k, []);
    porProd.get(k).push(i);
  }
  perfil.produtos = [...porProd.values()].map(list => {
    list.sort((a, b) => String(a.data_emissao).localeCompare(String(b.data_emissao)));
    const ult = list[list.length - 1];
    return {
      cprod: ult.cprod, ncm: ult.ncm, descricao: ult.descricao,
      compras: list.length, st: ult.st, cst: ult.cst,
      mediana_vunit: r2(mediana(list.map(x => x.vunit))),
      ultimo_vunit: r2(ult.vunit), ultima_data: ult.data_emissao,
    };
  }).sort((a, b) => b.compras - a.compras);
  return perfil;
}

function listarPerfis(slug) {
  garantirDados(slug);
  const rows = db.getFiscalItens(slug);
  const porCnpj = new Map();
  for (const i of rows) {
    if (!i.cnpj) continue;
    if (!porCnpj.has(i.cnpj)) porCnpj.set(i.cnpj, []);
    porCnpj.get(i.cnpj).push(i);
  }
  return [...porCnpj.values()].map(montarPerfil).filter(Boolean)
    .sort((a, b) => b.total_comprado - a.total_comprado);
}

// ===== Casamento de nomes/descrições =====
function normalizar(s) {
  return String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9 ]/g, ' ').replace(/\b(LTDA|EPP|ME|SA|S A|EIRELI|COMERCIO|COM|IND|INDUSTRIA|DE|DA|DO|E)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
function tokens(s) { return normalizar(s).split(' ').filter(t => t.length >= 2); }
function scoreTexto(a, b) {
  const ta = tokens(a), tb = tokens(b);
  if (!ta.length || !tb.length) return 0;
  const setB = new Set(tb);
  const comuns = ta.filter(t => setB.has(t)).length;
  return comuns / Math.min(ta.length, tb.length);
}

// Resolve o nome livre do fornecedor do pedido para um CNPJ do histórico
function resolverCnpj(slug, nomeFornecedor) {
  const n = normalizar(nomeFornecedor);
  if (!n) return null;
  const candidatos = [];
  for (const p of listarPerfis(slug)) candidatos.push({ cnpj: p.cnpj, nome: p.emitente });
  for (const f of (db.getFornecedoresCad ? db.getFornecedoresCad(slug) : [])) {
    if (f.cnpj) { candidatos.push({ cnpj: String(f.cnpj).replace(/\D/g, ''), nome: f.razao || '' }); if (f.fantasia) candidatos.push({ cnpj: String(f.cnpj).replace(/\D/g, ''), nome: f.fantasia }); }
  }
  let melhor = null, melhorScore = 0;
  for (const c of candidatos) {
    const nc = normalizar(c.nome);
    if (!nc) continue;
    let s = scoreTexto(n, nc);
    if (nc.includes(n) || n.includes(nc)) s = Math.max(s, 0.95);
    if (s > melhorScore) { melhorScore = s; melhor = c; }
  }
  return melhorScore >= 0.5 ? melhor.cnpj : null;
}

// ===== Análise de um pedido (Partes 2, 3 e 4) =====
function analisarPedido(slug, pedido) {
  garantirDados(slug);
  const regime = regimeEmpresa(slug);
  const cbsAliq = paramFiscal(slug, 'fiscal_cbs_aliq', 8.8) / 100;
  const M = pedido.valor || 0;
  const out = { regime, pedido_id: pedido.id, fornecedor: pedido.fornecedor, valor: r2(M), cbs_aliq: r2(cbsAliq * 100) };

  const cnpj = resolverCnpj(slug, pedido.fornecedor);
  out.cnpj = cnpj || '';
  const perfil = cnpj ? perfilFornecedor(slug, cnpj) : null;
  out.perfil = perfil ? { ...perfil, produtos: undefined } : null;

  if (regime === 'sem_credito') {
    out.mensagem = 'Sem créditos — compras com ICMS-ST e PIS/COFINS monofásico. Decisão apenas por preço e prazo.';
    out.credito_icms = 0; out.ipi_estimado = 0; out.custo_liquido = r2(M);
    out.custo_liquido_2027 = r2(M * (1 - cbsAliq));
    out.credito_cbs_2027 = r2(M * cbsAliq);
  } else if (!perfil) {
    out.mensagem = 'Fornecedor sem histórico de notas no sistema — sem base para estimar créditos.';
  } else {
    const pIcms = perfil.icms_efetivo;  // fração creditável (já pondera itens ST)
    const pIpi = perfil.ipi_efetivo;
    out.credito_icms = r2(M * pIcms);
    out.ipi_estimado = r2(M * pIpi);
    out.custo_liquido = r2(M + out.ipi_estimado - out.credito_icms);
    // Sensibilidade: até onde vale aceitar preço maior COM NOTA CHEIA
    out.sensibilidade = [];
    for (let a = 0; a <= 10; a++) {
      out.sensibilidade.push({
        acrescimo: a,
        preco: r2(M * (1 + a / 100)),
        custo_liquido: r2(M * (1 + a / 100) * (1 + pIpi - pIcms)),
      });
    }
    // Reforma (2027): IPI = 0 e crédito adicional de CBS
    out.credito_cbs_2027 = r2(M * cbsAliq);
    out.custo_liquido_2027 = r2(M * (1 - pIcms - cbsAliq));
  }

  // Itens: badge ST + comparador entre fornecedores (custo líquido unitário)
  out.itens = [];
  const perfis = listarPerfis(slug);
  const todos = db.getFiscalItens(slug);
  for (const item of (pedido.itens || [])) {
    const info = { produto: item.produto, badge: '', comparador: [] };
    // melhor casamento no histórico (prioriza o próprio fornecedor)
    let melhor = null, melhorScore = 0;
    for (const h of todos) {
      let s = scoreTexto(item.produto, h.descricao);
      if (cnpj && h.cnpj === cnpj) s += 0.15;
      if (s > melhorScore) { melhorScore = s; melhor = h; }
    }
    if (melhor && melhorScore >= 0.5) {
      info.match = { cprod: melhor.cprod, ncm: melhor.ncm, descricao: melhor.descricao, cnpj: melhor.cnpj };
      if (melhor.st) info.badge = 'ST — sem crédito';
      // comparador: mesmo NCM ou mesmo cProd em outros fornecedores
      const porForn = new Map();
      for (const h of todos) {
        const mesmo = (melhor.ncm && h.ncm === melhor.ncm) || (melhor.cprod && h.cprod === melhor.cprod && h.cnpj === melhor.cnpj);
        if (!mesmo || !h.vunit) continue;
        if (scoreTexto(melhor.descricao, h.descricao) < 0.5 && h.cnpj !== melhor.cnpj) continue;
        if (!porForn.has(h.cnpj)) porForn.set(h.cnpj, []);
        porForn.get(h.cnpj).push(h);
      }
      for (const [fc, lista] of porForn) {
        const p = perfis.find(x => x.cnpj === fc);
        if (!p) continue;
        const med = mediana(lista.map(x => x.vunit));
        if (!med) continue;
        lista.sort((a, b) => String(a.data_emissao).localeCompare(String(b.data_emissao)));
        const fator = regime === 'sem_credito' ? 1 : (1 + p.ipi_efetivo - p.icms_efetivo);
        info.comparador.push({
          cnpj: fc, emitente: p.emitente, uf: p.uf,
          aliq_icms: p.aliq_icms_destacada, st_pct: r2(p.st_pct * 100),
          preco_mediano: r2(med),
          ultimo_preco: r2(lista[lista.length - 1].vunit),
          ultima_data: lista[lista.length - 1].data_emissao,
          custo_liquido_unit: r2(med * fator),
        });
      }
      info.comparador.sort((a, b) => a.custo_liquido_unit - b.custo_liquido_unit);
    }
    out.itens.push(info);
  }

  // Parte 5b: divergência pedido faturado × notas do fornecedor
  if (pedido.status === 'faturado' && cnpj) {
    const notas = db.getNotasRecebidas(slug).filter(n =>
      String(n.emitente_cnpj || '').replace(/\D/g, '') === cnpj &&
      (!pedido.data || (n.data_emissao || '') >= pedido.data));
    const proximas = notas.filter(n => Math.abs(n.valor - M) <= M * 0.05);
    if (!notas.length) out.divergencia = 'Nenhuma nota deste fornecedor localizada após a data do pedido — confira o faturamento.';
    else if (!proximas.length && M > 0) {
      const soma = r2(notas.reduce((s, n) => s + n.valor, 0));
      if (M > soma * 1.01) out.divergencia = 'Valor do pedido (' + r2(M) + ') excede o total das notas do fornecedor no período (' + soma + ') — verificar divergência.';
    }
  }
  return out;
}

// ===== Parte 5: alertas do mês =====
function alertasMes(slug, mes) {
  garantirDados(slug);
  const regime = regimeEmpresa(slug);
  const limiar = paramFiscal(slug, 'fiscal_alerta_preco_pct', 60) / 100;
  const todos = db.getFiscalItens(slug);
  const doMes = todos.filter(i => (i.data_emissao || '').startsWith(mes));

  // 5c: crédito de ICMS gerado nas entradas do mês (empresa que credita)
  const credito_icms_mes = regime === 'presumido_icms' ? r2(doMes.reduce((s, i) => s + i.vicms, 0)) : 0;
  const ipi_mes = r2(doMes.reduce((s, i) => s + i.vipi, 0));
  const compras_mes = r2(doMes.reduce((s, i) => s + i.vprod, 0));

  // 5a: preço unitário muito abaixo da mediana histórica (mesmo cProd + fornecedor)
  const alertas = [];
  const historicoPor = new Map();
  for (const i of todos) {
    const k = i.cnpj + '|' + (i.cprod || i.descricao);
    if (!historicoPor.has(k)) historicoPor.set(k, []);
    historicoPor.get(k).push(i);
  }
  const vistos = new Set();
  for (const i of doMes) {
    if (!i.vunit) continue;
    const k = i.cnpj + '|' + (i.cprod || i.descricao);
    const hist = (historicoPor.get(k) || []).filter(h => h.nota_id !== i.nota_id);
    if (hist.length < 2) continue;
    const med = mediana(hist.map(h => h.vunit));
    if (med > 0 && i.vunit < med * limiar) {
      const chaveAl = i.nota_id + '|' + i.cprod;
      if (vistos.has(chaveAl)) continue;
      vistos.add(chaveAl);
      const nota = db.getNotaRecebidaById(slug, i.nota_id);
      alertas.push({
        nota_id: i.nota_id, numero: nota ? nota.numero : '', emitente: i.emitente,
        produto: i.descricao, vunit: r2(i.vunit), mediana: r2(med),
        pct: Math.round((i.vunit / med) * 100),
        msg: 'Preço muito abaixo do histórico — verificar nota',
      });
    }
  }
  return { regime, mes, credito_icms_mes, ipi_mes, compras_mes, notas_processadas: new Set(todos.map(i => i.nota_id)).size, alertas };
}

module.exports = { parseXmlNota, processarNota, reprocessarTudo, garantirDados, perfilFornecedor, listarPerfis, analisarPedido, alertasMes, regimeEmpresa, resolverCnpj };
