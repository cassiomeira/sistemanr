// Módulo Transparência: cruza dados públicos de contratos (PNCP) e do portal
// de transparência municipal (plataforma Memory/ILAI) para análise e alertas.
// Todas as fontes são públicas (Lei de Acesso à Informação).
const db = require('./database');

const ILAI = 'https://ilai.memory.com.br/api/cronapi/odata/v2/app/';

// ---- Portal Memory (ILAI) ----
function cookieIlai(cfg, extra) {
  const base = [
    'codigo_auxiliar=' + (cfg.codigo || ''),
    'codigo_entidade=' + (cfg.entidade || '1'),
    'exercicio=' + (cfg.exercicio || new Date().getFullYear()),
    'codigo_ibge=' + (cfg.ibge || ''),
    'codigo_entidade_p=' + (cfg.entidade || '1'),
  ];
  if (extra) for (const [k, v] of Object.entries(extra)) base.push(k + '=' + v);
  return base.join('; ');
}

// Cache da última resposta boa do portal (o Memory cai/oscila com frequência)
const cacheIlai = new Map();
async function ilaiQuery(cfg, entidade, params, extraCookies) {
  const url = ILAI + entidade + '?$format=json' + (params || '');
  const chave = url + '|' + cookieIlai(cfg, extraCookies);
  let ultimoErro = null;
  for (let tent = 1; tent <= 2; tent++) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 45000);
      const r = await fetch(url, {
        headers: { Accept: 'application/json', Cookie: cookieIlai(cfg, extraCookies) },
        signal: ctl.signal,
      });
      clearTimeout(timer);
      if (!r.ok) throw new Error('Portal respondeu HTTP ' + r.status);
      const j = await r.json();
      if (j.error) throw new Error(j.error.message?.value || 'Erro no portal');
      const out = { total: parseInt(j.d?.__count) || (j.d?.results || []).length, results: j.d?.results || [] };
      cacheIlai.set(chave, { t: Date.now(), v: out });
      return out;
    } catch (e) {
      ultimoErro = e;
      if (tent < 2) await new Promise(res => setTimeout(res, 2500));
    }
  }
  // Portal fora do ar: serve a última resposta boa (até 24h) em vez de falhar
  const c = cacheIlai.get(chave);
  if (c && Date.now() - c.t < 24 * 3600000) return { ...c.v, cache: true };
  const msg = /abort/i.test(ultimoErro?.message || '') ? 'não respondeu (timeout)' : (ultimoErro?.message || 'erro');
  throw new Error('Portal de transparência da cidade fora do ar no momento (' + msg + '). Tente novamente em alguns minutos.');
}

function getCfgTransp(slug) {
  const cfg = db.getConfig(slug);
  try { return JSON.parse(cfg.transp_portal || 'null') || {}; } catch (e) { return {}; }
}

// Lista de servidores do município
async function listarServidores(slug, filtro) {
  const cfg = getCfgTransp(slug);
  if (!cfg.codigo) return { error: 'Portal de transparência não configurado' };
  const top = Math.min(parseInt(filtro?.top) || 500, 1000);
  const skip = parseInt(filtro?.skip) || 0;
  const r = await ilaiQuery(cfg, 'query617490', '&$inlinecount=allpages&$skip=' + skip + '&$top=' + top);
  return {
    total: r.total,
    servidores: r.results.map(s => ({
      nome: s.nome_servidor, matricula: s.numero_matricula, funcao: s.funcao,
      lotacao: s.lotacao, regime: s.regime_trabalhista, situacao: (s.situacao_atual || '').trim(),
      admissao: s.data_admissao, desligamento: s.data_desligamento,
      carga_horaria: s.carga_horaria, sexo: s.sexo,
    })),
  };
}

// Ficha financeira (folha) de um servidor
async function fichaServidor(slug, matricula, exercicio) {
  const cfg = getCfgTransp(slug);
  if (!cfg.codigo) return { error: 'Portal de transparência não configurado' };
  const c = { ...cfg };
  if (exercicio) c.exercicio = exercicio;
  const r = await ilaiQuery(c, 'wsfolhaservidor', '&$top=50', { codigo_matricula: matricula, grupo_verba: 'SICOM' });
  const parseJ = x => { if (!x) return []; if (typeof x === 'string') { try { return JSON.parse(x); } catch (e) { return []; } } return x; };
  return {
    matricula,
    exercicio: c.exercicio,
    competencias: r.results.map(f => ({
      competencia: f.competencia, tipo_folha: (f.tipo_folha || '').trim(),
      salario_base: parseFloat(f.salario_base) || 0,
      proventos: parseFloat(f.valor_total_proventos) || 0,
      descontos: parseFloat(f.valor_total_descontos) || 0,
      liquido: parseFloat(f.valor_total_liquido) || 0,
      verbas_proventos: parseJ(f.proventos), verbas_descontos: parseJ(f.descontos),
    })),
  };
}

// Cargos e vagas (padrão remuneratório)
async function padraoRemuneratorio(slug) {
  const cfg = getCfgTransp(slug);
  if (!cfg.codigo) return { error: 'Portal de transparência não configurado' };
  const r = await ilaiQuery(cfg, 'wspadraoremuneratorio', '&$inlinecount=allpages&$top=500');
  return {
    total: r.total,
    cargos: r.results.map(c => ({
      funcao: c.des_funcao, nivel: c.des_siglanivel, grupo: c.grupo_ocupacional,
      vagas_criadas: c.vagas_criadas, vagas_ocupadas: c.vagas_ocupadas,
    })),
  };
}

// Fornecedores que receberam pagamento no portal do município (empenhado/liquidado/pago)
async function fornecedoresPagos(slug, exercicio) {
  const cfg = getCfgTransp(slug);
  if (!cfg.codigo) return { error: 'Portal de transparência não configurado' };
  const c = { ...cfg };
  if (exercicio) c.exercicio = exercicio;
  const r = await ilaiQuery(c, 'wsfornecedor', '&$inlinecount=allpages&$top=1000');
  // Valores podem vir como número (1234.56) ou string BR ("1.234,56")
  const num = v => {
    if (typeof v === 'number') return v;
    const s = String(v || '0').trim();
    if (/,\d{1,2}$/.test(s)) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
    return parseFloat(s.replace(/,/g, '')) || 0;
  };
  const agrup = {};
  for (const f of r.results) {
    const doc = (f.fornecedor_cpf_cnpj || '').replace(/\D/g, '');
    const key = doc || (f.fornecedor_nome || '');
    if (!agrup[key]) agrup[key] = { nome: f.fornecedor_nome || '', documento: doc, empenhado: 0, liquidado: 0, pago: 0, a_pagar: 0, empenhos: 0 };
    const a = agrup[key];
    a.empenhado += num(f.valor_empenhado); a.liquidado += num(f.valor_liquidado);
    a.pago += num(f.valor_pago); a.a_pagar += num(f.valor_apagar); a.empenhos++;
  }
  return { exercicio: c.exercicio, total: r.total, fornecedores: Object.values(agrup).sort((a, b) => b.pago - a.pago) };
}

// Pagamentos detalhados (nota fiscal, empenho, datas)
async function pagamentosDetalhados(slug, exercicio, filtroDoc) {
  const cfg = getCfgTransp(slug);
  if (!cfg.codigo) return { error: 'Portal de transparência não configurado' };
  const c = { ...cfg };
  if (exercicio) c.exercicio = exercicio;
  const r = await ilaiQuery(c, 'wsdespesapagamento', '&$inlinecount=allpages&$top=2000');
  // Valores podem vir como número (1234.56) ou string BR ("1.234,56")
  const num = v => {
    if (typeof v === 'number') return v;
    const s = String(v || '0').trim();
    if (/,\d{1,2}$/.test(s)) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
    return parseFloat(s.replace(/,/g, '')) || 0;
  };
  let lista = r.results.map(p => ({
    fornecedor: p.fornecedor_nome || '', documento: (p.cpf_cnpj || '').replace(/\D/g, ''),
    despesa: p.des_despesa || '', tipo: p.tipo_despesa || '', fonte: p.fonte_recurso || '',
    empenho: p.numero_empenho || '', ano_empenho: p.empenho_ano || '',
    nota_fiscal: p.nota_fiscal || '', data_pagamento: p.data_pagamento || '',
    vencimento: p.vencimento || '', valor: num(p.valor_pago) || num(p.valor),
  }));
  if (filtroDoc) { const d = filtroDoc.replace(/\D/g, ''); lista = lista.filter(p => p.documento.includes(d)); }
  return { exercicio: c.exercicio, total: r.total, pagamentos: lista };
}

// --- Controle de ritmo e cache para o PNCP (evita HTTP 429) ---
const cachePncp = new Map();
let ultimaChamadaPncp = 0;
async function fetchPncp(url, ttlMin) {
  const agora = Date.now();
  const c = cachePncp.get(url);
  if (c && agora - c.t < (ttlMin || 30) * 60000) return c.v;
  // espaça as chamadas em ~350ms
  const espera = 350 - (agora - ultimaChamadaPncp);
  if (espera > 0) await new Promise(r => setTimeout(r, espera));
  ultimaChamadaPncp = Date.now();
  let resp = await fetch(url, { headers: { Accept: 'application/json' } });
  if (resp.status === 429) { // aguarda e tenta mais uma vez
    await new Promise(r => setTimeout(r, 3000));
    ultimaChamadaPncp = Date.now();
    resp = await fetch(url, { headers: { Accept: 'application/json' } });
  }
  const out = { status: resp.status, json: null };
  if (resp.status === 200) out.json = await resp.json().catch(() => null);
  if (out.status === 200 || out.status === 204 || out.status === 404) cachePncp.set(url, { t: Date.now(), v: out });
  return out;
}

// Itens/produtos comprados numa contratação do PNCP (com preço unitário)
async function itensContratacao(numeroControle) {
  const m = (numeroControle || '').match(/^(\d{14})-\d+-(\d+)\/(\d{4})$/);
  if (!m) return { error: 'Número de controle PNCP inválido' };
  const [, cnpj, seq, ano] = m;
  const url = 'https://pncp.gov.br/api/pncp/v1/orgaos/' + cnpj + '/compras/' + ano + '/' + parseInt(seq) + '/itens?pagina=1&tamanhoPagina=500';
  const r0 = await fetchPncp(url, 120);
  if (r0.status === 404) return { error: 'Itens não publicados para esta contratação' };
  if (r0.status === 429) return { error: 'Limite de consultas do PNCP atingido — aguarde alguns minutos' };
  if (r0.status !== 200) return { error: 'PNCP respondeu HTTP ' + r0.status };
  const itens = r0.json;
  if (!Array.isArray(itens)) return { error: 'Resposta inesperada do PNCP' };
  return {
    total: itens.length,
    sigiloso: itens.some(i => i.orcamentoSigiloso),
    itens: itens.map(i => ({
      numero: i.numeroItem, descricao: i.descricao || '',
      tipo: i.materialOuServicoNome || '', categoria: i.itemCategoriaNome || '',
      quantidade: parseFloat(i.quantidade) || 0, unidade: i.unidadeMedida || '',
      valor_unitario: parseFloat(i.valorUnitarioEstimado) || 0,
      valor_total: parseFloat(i.valorTotal) || 0,
      criterio: i.criterioJulgamentoNome || '', situacao: i.situacaoCompraItemNome || i.situacaoCompraItem || '',
    })),
  };
}

// Busca as contratações (editais) do município no PNCP — é onde os itens ficam publicados
const MODALIDADES_ITENS = [6, 7, 4, 5, 8, 9, 12];
async function contratacoesMunicipio(cfg, meses) {
  const vistos = new Set();
  const todas = [];
  // A API do PNCP limita o intervalo (máx. ~1 ano por consulta) — quebra em janelas
  const janelas = [];
  const fim = new Date();
  let restantes = meses || 24;
  while (restantes > 0) {
    const passo = Math.min(restantes, 11);
    const ini = new Date(fim.getTime() - passo * 30 * 86400000);
    janelas.push([new Date(ini), new Date(fim.getTime())]);
    fim.setTime(ini.getTime() - 86400000);
    restantes -= passo;
  }
  for (const mod of MODALIDADES_ITENS) {
    for (const [de, ate] of janelas) {
      for (let pag = 1; pag <= 5; pag++) {
        const url = 'https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao?dataInicial=' + fmtD(de)
          + '&dataFinal=' + fmtD(ate) + '&codigoModalidadeContratacao=' + mod
          + '&uf=' + (cfg.uf || 'MG') + '&codigoMunicipioIbge=' + cfg.ibge
          + '&pagina=' + pag + '&tamanhoPagina=50';
        const r0 = await fetchPncp(url, 60);
        if (r0.status !== 200) break;
        const d = r0.json;
        if (!d || !Array.isArray(d.data) || !d.data.length) break;
        for (const c of d.data) {
          const nc = c.numeroControlePNCP || '';
          const cnpjOrg = ((c.orgaoEntidade && c.orgaoEntidade.cnpj) || '').replace(/\D/g, '');
          if (!nc || vistos.has(nc)) continue;
          if (cfg.cnpj_orgao && cnpjOrg && cnpjOrg !== cfg.cnpj_orgao) continue;
          vistos.add(nc);
          todas.push(c);
        }
        if (!d.paginasRestantes) break;
      }
    }
  }
  return todas;
}

// Itens comprados de um fornecedor: procura o nome dele nas contratações e traz os itens
async function itensPorFornecedor(slug, documento, meses) {
  const cfg = getCfgTransp(slug);
  if (!cfg.cnpj_orgao) return { error: 'CNPJ do órgão não configurado' };
  const doc = (documento || '').replace(/\D/g, '');
  const contratos = await contratosOrgao(cfg.cnpj_orgao, meses || 24);
  const doForn = contratos.filter(c => (c.niFornecedor || '').replace(/\D/g, '') === doc);
  const nomeForn = doForn.length ? (doForn[0].nomeRazaoSocialFornecedor || '') : '';
  // Sem contrato no PNCP: busca os empenhos no portal da cidade (traz a descrição do que foi comprado)
  if (!doForn.length) {
    const emp = await empenhosFornecedor(slug, doc, cfg.exercicio).catch(() => null);
    return {
      fornecedor: (emp && emp.fornecedor) || '', documento: doc, qtd_contratos: 0, total_itens: 0, contratacoes: [],
      empenhos: (emp && emp.empenhos) || [], qtd_empenhos: (emp && emp.total) || 0, exercicio: emp && emp.exercicio,
      aviso: 'Sem contrato publicado no PNCP (compra direta/dispensa). Abaixo, os empenhos do portal da cidade com a descrição do que foi contratado.',
    };
  }
  // Casa os contratos do fornecedor com as contratações (editais) pelo objeto
  const contratacoes = await contratacoesMunicipio(cfg, meses || 24);
  const nb = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().substring(0, 60);
  const out = [];
  for (const c of doForn.slice(0, 12)) {
    const alvo = nb(c.objetoContrato);
    const match = contratacoes.find(x => alvo && nb(x.objetoCompra) === alvo)
      || contratacoes.find(x => alvo && nb(x.objetoCompra).includes(alvo.substring(0, 40)));
    let itens = [], sigiloso = false, nc = '';
    if (match) {
      nc = match.numeroControlePNCP;
      const r = await itensContratacao(nc);
      if (!r.error && r.itens) { itens = r.itens; sigiloso = r.sigiloso; }
    }
    out.push({
      contrato: c.numeroContratoEmpenho || '', objeto: c.objetoContrato || '',
      assinatura: (c.dataAssinatura || '').substring(0, 10),
      valor_contrato: parseFloat(c.valorGlobal) || parseFloat(c.valorInicial) || 0,
      numero_controle: nc, sigiloso, itens,
      sem_itens: !itens.length,
    });
  }
  return {
    fornecedor: nomeForn, documento: doc,
    qtd_contratos: doForn.length,
    total_itens: out.reduce((s, c) => s + c.itens.length, 0),
    contratacoes: out,
  };
}

// Empenhos de um fornecedor no portal da cidade, com a descrição do que foi comprado.
// Usado para quem NÃO tem contrato no PNCP (empenho direto/dispensa).
async function empenhosFornecedor(slug, documento, exercicio) {
  const cfg = getCfgTransp(slug);
  if (!cfg.codigo) return { error: 'Portal de transparência não configurado' };
  const c = { ...cfg };
  if (exercicio) c.exercicio = exercicio;
  const doc = (documento || '').replace(/\D/g, '');
  const r = await ilaiQuery(c, 'wsempenho', '&$inlinecount=allpages&$top=3000');
  const num = v => (typeof v === 'number' ? v : parseFloat(String(v || '0').replace(/,/g, '')) || 0);
  const meus = r.results.filter(e => (e.fornecedor_cpf_cnpj || '').replace(/\D/g, '') === doc);
  const out = [];
  for (const e of meus.slice(0, 40)) {
    let det = null;
    try {
      const d = await ilaiQuery(c, 'wsdetalhesempenho', '&$top=1', { id_empenho: e.id_empenho });
      det = (d.results || [])[0] || null;
    } catch (err) {}
    // Tenta extrair quantidade/unidade do texto do empenho para calcular o preço unitário
    const texto = det ? (det.descricao_empenho || '') : '';
    const valorEmp = num(e.valor_empenho);
    let quantidade = 0, unidade = '', unitario = 0;
    const mq = texto.match(/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?)\s*(UNID(?:ADES?)?|UND|UN|PC|PCT|PACOTES?|CX|CAIXAS?|KG|QUILOS?|G|GRAMAS?|L|LITROS?|ML|M2|M²|M3|M³|METROS?|MT|TON|SC|SACOS?|FR|FRASCOS?|AMP|COMP(?:RIMIDOS?)?|RESMAS?|HORAS?|MESES?|DIÁRIAS?|DIARIAS?)\b/i);
    if (mq) {
      quantidade = parseFloat(mq[1].replace(/\./g, '').replace(',', '.')) || 0;
      unidade = mq[2].toUpperCase();
      if (quantidade > 0 && valorEmp > 0) unitario = Math.round((valorEmp / quantidade) * 100) / 100;
    }
    out.push({
      numero: e.numero_empenho, id: e.id_empenho,
      data: e.data_empenho_format || e.data_empenho || '',
      valor: valorEmp,
      quantidade, unidade, valor_unitario: unitario,
      descricao: texto,
      despesa: det ? (det.descricao_despesa || '') : '',
      secretaria: det ? (det.descricao_orgao || '') : '',
      modalidade: det ? (det.descricao_modalidade_licitacao || '') : '',
      contrato: det ? (det.numero_contrato || '') : '',
      licitacao: det ? (det.numero_licitacao || '') : '',
      pago: det ? num(det.valor_pago) : 0,
      liquidado: det ? num(det.valor_total_liquidado) : 0,
    });
  }
  return {
    documento: doc, exercicio: c.exercicio,
    fornecedor: meus.length ? meus[0].fornecedor_nome : '',
    total: meus.length, empenhos: out,
  };
}

// Índice de preços do município: todos os itens com preço, por produto.
// Serve de base de comparação ("preço médio praticado") para achar sobrepreço.
const cacheIndice = new Map();
async function indicePrecos(cfg, meses) {
  const chave = cfg.ibge + '|' + (meses || 24);
  const c = cacheIndice.get(chave);
  if (c && Date.now() - c.t < 60 * 60000) return c.v;
  const contratacoes = await contratacoesMunicipio(cfg, meses || 24);
  const idx = [];
  for (const ct of contratacoes.slice(0, 200)) {
    const r = await itensContratacao(ct.numeroControlePNCP);
    if (r.error || !r.itens) continue;
    for (const i of r.itens) {
      if (!i.valor_unitario) continue;
      idx.push({
        descricao: i.descricao, unidade: i.unidade, valor_unitario: i.valor_unitario,
        quantidade: i.quantidade, valor_total: i.valor_total,
        data: (ct.dataPublicacaoPncp || '').substring(0, 10),
        numero_controle: ct.numeroControlePNCP, objeto: (ct.objetoCompra || '').substring(0, 80),
      });
    }
  }
  cacheIndice.set(chave, { t: Date.now(), v: idx });
  return idx;
}

// Chave de comparação de um produto: normaliza e usa as palavras mais significativas
function chaveProduto(desc) {
  const stop = new Set(['de', 'da', 'do', 'com', 'para', 'em', 'e', 'a', 'o', 'no', 'na', 'por', 'tipo', 'un', 'und', 'unid']);
  return (desc || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter(p => p.length > 2 && !stop.has(p) && !/^\d+$/.test(p))
    .slice(0, 3).join(' ');
}

// Produtos vendidos por UM fornecedor, com comparação de preço contra o praticado no município.
// Estratégia: procura o fornecedor nos RESULTADOS das contratações (quem venceu cada item)
// e, como reforço, casa pelo objeto do contrato.
async function produtosFornecedor(slug, documento, meses) {
  const cfg = getCfgTransp(slug);
  if (!cfg.cnpj_orgao) return { error: 'CNPJ do órgão não configurado' };
  const doc = (documento || '').replace(/\D/g, '');
  const contratos = await contratosOrgao(cfg.cnpj_orgao, meses || 24);
  const doForn = contratos.filter(c => (c.niFornecedor || '').replace(/\D/g, '') === doc);
  const nomeForn = doForn.length ? (doForn[0].nomeRazaoSocialFornecedor || '') : '';

  const [contratacoes, indice] = await Promise.all([
    contratacoesMunicipio(cfg, meses || 24),
    indicePrecos(cfg, meses || 24),
  ]);

  // Índice agrupado por produto (mediana de mercado)
  const porProduto = {};
  for (const i of indice) {
    const k = chaveProduto(i.descricao);
    if (!k) continue;
    (porProduto[k] = porProduto[k] || []).push(i);
  }
  const refDe = (descricao, ncExcluir, precoPago) => {
    const k = chaveProduto(descricao);
    const similares = (porProduto[k] || []).filter(x => x.numero_controle !== ncExcluir && x.valor_unitario > 0);
    if (!similares.length) return null;
    const precos = similares.map(x => x.valor_unitario).sort((a, b) => a - b);
    const mediana = precos[Math.floor(precos.length / 2)];
    return {
      mediana, min: precos[0], max: precos[precos.length - 1], amostras: precos.length,
      variacao: mediana && precoPago ? ((precoPago - mediana) / mediana * 100) : 0,
    };
  };

  const produtos = [];
  const vistos = new Set();

  // 1) Busca nos resultados das contratações: qual fornecedor venceu cada item
  //    (endpoint por item: /itens/{n}/resultados). Limita o esforço para não estourar a cota.
  for (const ct of contratacoes.slice(0, 60)) {
    const nc = ct.numeroControlePNCP;
    const m = (nc || '').match(/^(\d{14})-\d+-(\d+)\/(\d{4})$/);
    if (!m) continue;
    const it = await itensContratacao(nc);
    if (it.error || !it.itens || !it.itens.length) continue;
    const baseUrl = 'https://pncp.gov.br/api/pncp/v1/orgaos/' + m[1] + '/compras/' + m[3] + '/' + parseInt(m[2]);
    for (const item of it.itens.slice(0, 60)) {
      const r0 = await fetchPncp(baseUrl + '/itens/' + item.numero + '/resultados', 240);
      if (r0.status !== 200) continue;
      const res = Array.isArray(r0.json) ? r0.json : [r0.json];
      for (const x of res) {
        if (!x || (x.niFornecedor || '').replace(/\D/g, '') !== doc) continue;
        const preco = parseFloat(x.valorUnitarioHomologado) || item.valor_unitario || 0;
        const qtd = parseFloat(x.quantidadeHomologada) || item.quantidade || 0;
        const chave = nc + '#' + item.numero;
        if (vistos.has(chave)) continue;
        vistos.add(chave);
        produtos.push({
          descricao: item.descricao || '(item ' + item.numero + ')',
          unidade: item.unidade || '', quantidade: qtd,
          valor_unitario: preco, valor_total: parseFloat(x.valorTotalHomologado) || (preco * qtd) || 0,
          contrato: '', data: (ct.dataPublicacaoPncp || '').substring(0, 10),
          objeto: (ct.objetoCompra || '').substring(0, 80),
          referencia: refDe(item.descricao || '', nc, preco),
          homologado: true,
        });
      }
    }
  }

  // 2) Reforço: casa contratos do fornecedor com editais pelo objeto (quando não veio pelo resultado)
  const nb = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().substring(0, 60);
  for (const c of doForn.slice(0, 12)) {
    const alvo = nb(c.objetoContrato);
    const match = contratacoes.find(x => alvo && nb(x.objetoCompra) === alvo)
      || contratacoes.find(x => alvo && nb(x.objetoCompra).includes(alvo.substring(0, 40)));
    if (!match) continue;
    const r = await itensContratacao(match.numeroControlePNCP);
    if (r.error || !r.itens) continue;
    for (const i of r.itens) {
      const chave = match.numeroControlePNCP + '#' + i.numero;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      produtos.push({
        descricao: i.descricao, unidade: i.unidade, quantidade: i.quantidade,
        valor_unitario: i.valor_unitario, valor_total: i.valor_total,
        contrato: c.numeroContratoEmpenho || '', data: (c.dataAssinatura || '').substring(0, 10),
        objeto: (c.objetoContrato || '').substring(0, 80),
        referencia: refDe(i.descricao, match.numeroControlePNCP, i.valor_unitario),
        homologado: false,
      });
    }
  }

  produtos.forEach(p => { p.sobrepreco = !!(p.referencia && p.referencia.variacao > 30); });
  const totalItens = produtos.reduce((s, p) => s + (p.valor_total || 0), 0);
  return {
    fornecedor: nomeForn, documento: doc,
    qtd_contratos: doForn.length, total_produtos: produtos.length, valor_total_itens: totalItens,
    qtd_sobrepreco: produtos.filter(p => p.sobrepreco).length,
    sem_contrato: !doForn.length && !produtos.length,
    produtos: produtos.sort((a, b) => ((b.referencia && b.referencia.variacao) || -999) - ((a.referencia && a.referencia.variacao) || -999)),
  };
}

// Comparador de preços: busca o mesmo produto em várias contratações do órgão
async function compararPrecos(slug, termo, meses) {
  const cfg = getCfgTransp(slug);
  if (!cfg.cnpj_orgao) return { error: 'CNPJ do órgão não configurado' };
  if (!termo || termo.trim().length < 3) return { error: 'Digite ao menos 3 letras do produto' };
  const nb = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const palavras = nb(termo).split(/\s+/).filter(Boolean);
  const contratacoes = await contratacoesMunicipio(cfg, meses || 24);
  const achados = [];
  for (const c of contratacoes.slice(0, 150)) {
    const r = await itensContratacao(c.numeroControlePNCP);
    if (r.error || !r.itens) continue;
    for (const i of r.itens) {
      if (!i.valor_unitario) continue;
      const alvo = nb(i.descricao);
      if (!palavras.every(p => alvo.includes(p))) continue;
      achados.push({
        descricao: i.descricao, unidade: i.unidade, quantidade: i.quantidade,
        valor_unitario: i.valor_unitario, valor_total: i.valor_total,
        fornecedor: (c.orgaoEntidade && c.orgaoEntidade.razaoSocial) || '', documento: '',
        modalidade: c.modalidadeNome || '', objeto: (c.objetoCompra || '').substring(0, 80),
        data: (c.dataPublicacaoPncp || '').substring(0, 10), numero_controle: c.numeroControlePNCP,
      });
    }
    if (achados.length > 300) break;
  }
  if (!achados.length) return { termo, total: 0, itens: [] };
  const precos = achados.map(a => a.valor_unitario).sort((a, b) => a - b);
  const media = precos.reduce((s, p) => s + p, 0) / precos.length;
  const mediana = precos[Math.floor(precos.length / 2)];
  return {
    termo, total: achados.length,
    preco_min: precos[0], preco_max: precos[precos.length - 1], preco_medio: media, preco_mediana: mediana,
    itens: achados.map(a => ({
      ...a,
      variacao: mediana ? ((a.valor_unitario - mediana) / mediana * 100) : 0,
      acima_media: a.valor_unitario > media * 1.3,
    })).sort((a, b) => b.valor_unitario - a.valor_unitario),
  };
}

// Limites legais de dispensa de licitação (Lei 14.133/2021, art. 75)
// Atualizados anualmente por decreto federal (IPCA-E) — art. 182.
const LIMITES_DISPENSA = {
  2026: { engenharia: 130984.20, compras: 65492.11, decreto: 'Decreto 12.807/2025' },
  2025: { engenharia: 125387.99, compras: 62700.00, decreto: 'Decreto 12.343/2024' },
  2024: { engenharia: 119812.02, compras: 59906.02, decreto: 'Decreto 11.871/2023' },
  2023: { engenharia: 114416.65, compras: 57208.33, decreto: 'Decreto 11.317/2022' },
};
function limiteDispensa(exercicio) {
  return LIMITES_DISPENSA[exercicio] || LIMITES_DISPENSA[2026];
}
// Ramo de atividade a partir da rubrica da despesa (aproximação para o teste antifracionamento)
function ramoAtividade(despesa) {
  const d = (despesa || '').toLowerCase();
  if (/obra|engenharia|constru|pavimenta|reforma/.test(d)) return { ramo: 'Obras e Engenharia', engenharia: true };
  if (/combust|lubrific/.test(d)) return { ramo: 'Combustíveis', engenharia: false };
  if (/ve[ií]culo|pe[çc]a|manuten[çc][ãa]o de ve/.test(d)) return { ramo: 'Veículos e Manutenção', engenharia: true };
  if (/medicament|farmac|hospital|sa[úu]de|m[ée]dic|odonto|laborat/.test(d)) return { ramo: 'Saúde', engenharia: false };
  if (/aliment|g[êe]nero|merenda/.test(d)) return { ramo: 'Alimentação', engenharia: false };
  if (/inform[áa]tica|software|ti e comunica|tecnologia|internet|telefon/.test(d)) return { ramo: 'TI e Comunicação', engenharia: false };
  if (/consultoria|assessoria|advocat|jur[íi]dic|cont[áa]bil/.test(d)) return { ramo: 'Consultoria e Assessoria', engenharia: false };
  if (/locac|aluguel|loca[çc][ãa]o/.test(d)) return { ramo: 'Locações', engenharia: false };
  if (/transporte|frete/.test(d)) return { ramo: 'Transporte', engenharia: false };
  if (/material|expediente|limpeza|higiene/.test(d)) return { ramo: 'Materiais', engenharia: false };
  return { ramo: (despesa || 'Outros').substring(0, 40), engenharia: false };
}

// Análise de dispensas: soma anual por fornecedor+ramo e compara com o limite legal.
// Sinaliza quem ultrapassou o teto sem contrato publicado (possível fracionamento).
async function analiseDispensas(slug, exercicio, meses) {
  const cfg = getCfgTransp(slug);
  if (!cfg.codigo || !cfg.cnpj_orgao) return { error: 'Configure o portal e o CNPJ do órgão' };
  const ex = parseInt(exercicio) || parseInt(cfg.exercicio) || new Date().getFullYear();
  const [pags, contratos] = await Promise.all([
    pagamentosDetalhados(slug, String(ex)),
    contratosOrgao(cfg.cnpj_orgao, meses || 36),
  ]);
  if (pags.error) return pags;
  const comContrato = new Set();
  contratos.forEach(c => { const d = (c.niFornecedor || '').replace(/\D/g, ''); if (d) comContrato.add(d); });
  const lim = limiteDispensa(ex);
  const ignorar = /prefeitura municipal|instituto nacional do seguro|inprev|receita federal|fundo (municipal|de)|camara municipal|tesouro nacional/i;

  // Agrupa por fornecedor + ramo de atividade (regra do art. 75, §1º)
  const grupos = {};
  for (const p of pags.pagamentos) {
    if (!p.valor || !p.documento) continue;
    if (ignorar.test(p.fornecedor)) continue;
    const r = ramoAtividade(p.despesa);
    const key = p.documento + '|' + r.ramo;
    if (!grupos[key]) grupos[key] = {
      fornecedor: p.fornecedor, documento: p.documento, ramo: r.ramo, engenharia: r.engenharia,
      total: 0, qtd: 0, empenhos: new Set(), primeiro: p.data_pagamento, ultimo: p.data_pagamento,
    };
    const g = grupos[key];
    g.total += p.valor; g.qtd++;
    if (p.empenho) g.empenhos.add(p.empenho);
    if (p.data_pagamento) g.ultimo = p.data_pagamento;
  }

  const lista = Object.values(grupos).map(g => {
    const limite = g.engenharia ? lim.engenharia : lim.compras;
    const temContrato = comContrato.has(g.documento);
    const excedeu = g.total >= limite;
    const dif = Math.round((g.total - limite) * 100) / 100;
    return {
      fornecedor: g.fornecedor, documento: g.documento, ramo: g.ramo,
      total: Math.round(g.total * 100) / 100, qtd_pagamentos: g.qtd, qtd_empenhos: g.empenhos.size,
      limite, tipo_limite: g.engenharia ? 'Obras/Engenharia' : 'Compras/Serviços',
      percentual: limite ? (g.total / limite * 100) : 0,
      excedente: dif > 0 ? dif : 0,          // quanto passou do teto
      margem: dif < 0 ? Math.abs(dif) : 0,   // quanto ainda pode gastar no ano
      tem_contrato: temContrato, excedeu,
      alerta: excedeu && !temContrato ? 'alto' : (excedeu ? 'medio' : (g.total >= limite * 0.8 ? 'baixo' : null)),
    };
  }).sort((a, b) => b.total - a.total);

  const criticos = lista.filter(x => x.alerta === 'alto');
  return {
    exercicio: ex, limite_compras: lim.compras, limite_engenharia: lim.engenharia, decreto: lim.decreto,
    qtd_grupos: lista.length,
    qtd_criticos: criticos.length,
    valor_critico: criticos.reduce((s, x) => s + x.total, 0),
    excedente_total: criticos.reduce((s, x) => s + x.excedente, 0),
    grupos: lista.slice(0, 300),
  };
}

// Cruzamento: quem recebe pagamento do município SEM contrato publicado no PNCP
async function semContrato(slug, exercicio, meses) {
  const cfg = getCfgTransp(slug);
  if (!cfg.codigo || !cfg.cnpj_orgao) return { error: 'Configure o portal e o CNPJ do órgão' };
  const [pagos, contratos] = await Promise.all([
    fornecedoresPagos(slug, exercicio),
    contratosOrgao(cfg.cnpj_orgao, meses || 24),
  ]);
  if (pagos.error) return pagos;
  const comContrato = new Set();
  contratos.forEach(c => { const d = (c.niFornecedor || '').replace(/\D/g, ''); if (d) comContrato.add(d); });
  // Órgãos públicos e o próprio município não são "fornecedores" para essa análise
  const ignorar = /prefeitura municipal|instituto nacional do seguro|inprev|receita federal|fundo (municipal|de)|camara municipal|secretaria|tesouro|banco do brasil|caixa economica/i;
  const lim = limiteDispensa(parseInt(pagos.exercicio) || new Date().getFullYear());
  const semCtr = pagos.fornecedores.filter(f => f.pago > 0 && !comContrato.has(f.documento) && !ignorar.test(f.nome))
    .map(f => {
      // Comparação com o limite de compras/serviços (art. 75, II) — referência mais comum
      const dif = Math.round((f.pago - lim.compras) * 100) / 100;
      return {
        ...f,
        limite: lim.compras,
        percentual: lim.compras ? (f.pago / lim.compras * 100) : 0,
        excedente: dif > 0 ? dif : 0,
        margem: dif < 0 ? Math.abs(dif) : 0,
      };
    });
  const totalSem = semCtr.reduce((s, f) => s + f.pago, 0);
  return {
    exercicio: pagos.exercicio, periodo_contratos_meses: meses || 24,
    limite_compras: lim.compras, decreto: lim.decreto,
    qtd_fornecedores_pagos: pagos.fornecedores.filter(f => f.pago > 0).length,
    qtd_sem_contrato: semCtr.length, valor_sem_contrato: totalSem,
    qtd_acima_limite: semCtr.filter(f => f.excedente > 0).length,
    excedente_total: semCtr.reduce((s, f) => s + f.excedente, 0),
    fornecedores: semCtr.slice(0, 300),
  };
}

// ---- PNCP: contratos do órgão ----
function fmtD(d) { return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0'); }

async function contratosOrgao(cnpjOrgao, meses) {
  // A API do PNCP limita o intervalo por consulta — quebra em janelas de ~11 meses
  const janelas = [];
  const fim = new Date();
  let restantes = meses || 12;
  while (restantes > 0) {
    const passo = Math.min(restantes, 11);
    const ini = new Date(fim.getTime() - passo * 30 * 86400000);
    janelas.push([new Date(ini), new Date(fim.getTime())]);
    fim.setTime(ini.getTime() - 86400000);
    restantes -= passo;
  }
  let todos = [];
  for (const [de, ate] of janelas) {
    for (let pag = 1; pag <= 20; pag++) {
      const url = 'https://pncp.gov.br/api/consulta/v1/contratos?dataInicial=' + fmtD(de) + '&dataFinal=' + fmtD(ate)
        + '&cnpjOrgao=' + cnpjOrgao + '&pagina=' + pag;
      const r0 = await fetchPncp(url, 60);
      if (r0.status !== 200) break;
      const d = r0.json;
      if (!d || !d.data || !d.data.length) break;
      todos = todos.concat(d.data);
      if (!d.paginasRestantes) break;
    }
  }
  return todos;
}

// Análise: ranking de fornecedores, concentração e alertas
async function analisarMunicipio(slug, meses) {
  const cfg = getCfgTransp(slug);
  if (!cfg.cnpj_orgao) return { error: 'CNPJ do órgão não configurado' };
  const contratos = await contratosOrgao(cfg.cnpj_orgao, meses || 12);
  let total = 0, semValor = 0;
  const porForn = {};
  for (const c of contratos) {
    // Alguns contratos (credenciamento/registro de preços) são publicados sem valor global
    const v = parseFloat(c.valorGlobal) || parseFloat(c.valorInicial) || parseFloat(c.valorAcumulado) || parseFloat(c.valorParcela) || 0;
    if (!v) semValor++;
    const nome = c.nomeRazaoSocialFornecedor || '(sem nome)';
    const doc = c.niFornecedor || '';
    total += v;
    if (!porForn[doc + '|' + nome]) porForn[doc + '|' + nome] = { nome, documento: doc, valor: 0, qtd: 0, qtd_sem_valor: 0, objetos: [] };
    const f = porForn[doc + '|' + nome];
    f.valor += v; f.qtd++;
    if (!v) f.qtd_sem_valor++;
    if (f.objetos.length < 3 && c.objetoContrato) f.objetos.push(c.objetoContrato.substring(0, 90));
  }
  const fornecedores = Object.values(porForn).sort((a, b) => b.valor - a.valor || b.qtd - a.qtd)
    .map(f => ({ ...f, participacao: total ? (f.valor / total * 100) : 0 }));

  // Alertas (sinalizações para verificação humana — não são acusações)
  const alertas = [];
  fornecedores.slice(0, 15).forEach(f => {
    if (f.participacao >= 20) alertas.push({ nivel: 'alto', tipo: 'Concentração', texto: f.nome + ' concentra ' + f.participacao.toFixed(1) + '% do valor contratado (' + f.qtd + ' contrato(s))', documento: f.documento });
    else if (f.participacao >= 10) alertas.push({ nivel: 'medio', tipo: 'Concentração', texto: f.nome + ' concentra ' + f.participacao.toFixed(1) + '% do valor contratado', documento: f.documento });
    if (f.qtd >= 8) alertas.push({ nivel: 'medio', tipo: 'Contratos repetidos', texto: f.nome + ' tem ' + f.qtd + ' contratos no período', documento: f.documento });
  });
  const top3 = fornecedores.slice(0, 3).reduce((s, f) => s + f.participacao, 0);
  if (top3 >= 50) alertas.push({ nivel: 'alto', tipo: 'Concentração geral', texto: 'Os 3 maiores fornecedores concentram ' + top3.toFixed(1) + '% de tudo que foi contratado' });

  return {
    municipio: cfg.municipio || '', periodo_meses: meses || 12,
    qtd_contratos: contratos.length, valor_total: total, qtd_sem_valor: semValor,
    fornecedores: fornecedores.slice(0, 200), alertas,
    contratos: contratos.map(c => ({
      fornecedor: c.nomeRazaoSocialFornecedor, documento: c.niFornecedor,
      valor: parseFloat(c.valorGlobal) || parseFloat(c.valorInicial) || parseFloat(c.valorAcumulado) || 0,
      objeto: c.objetoContrato || '', assinatura: (c.dataAssinatura || '').substring(0, 10),
      vigencia_fim: (c.dataVigenciaFim || '').substring(0, 10),
      numero: c.numeroContratoEmpenho || '',
    })),
  };
}

module.exports = { listarServidores, fichaServidor, padraoRemuneratorio, analisarMunicipio, getCfgTransp, fornecedoresPagos, pagamentosDetalhados, semContrato, analiseDispensas, limiteDispensa, itensContratacao, itensPorFornecedor, compararPrecos, empenhosFornecedor, produtosFornecedor };
