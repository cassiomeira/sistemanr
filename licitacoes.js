// Módulo Licitações: monitora o PNCP (Portal Nacional de Contratações Públicas)
// API pública, sem autenticação: https://pncp.gov.br/api/consulta
const crypto = require('crypto');
const db = require('./database');

const uid = () => 'li_' + crypto.randomBytes(6).toString('hex');

// Modalidades consultadas (códigos PNCP)
const MODALIDADES = [
  [6, 'Pregão Eletrônico'],
  [7, 'Pregão Presencial'],
  [4, 'Concorrência Eletrônica'],
  [5, 'Concorrência Presencial'],
  [8, 'Dispensa'],
  [9, 'Inexigibilidade'],
  [12, 'Credenciamento'],
];

function fmtData(d) {
  return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
}

function getCidades(slug) {
  const cfg = db.getConfig(slug);
  try { const c = JSON.parse(cfg.licit_cidades || '[]'); return Array.isArray(c) ? c : []; } catch (e) { return []; }
}

// Resolve o código IBGE de um município pelo nome (API pública do IBGE)
// Cache por UF + retentativas (a API do IBGE oscila às vezes)
const munCache = {};
async function resolverIbge(nome, uf) {
  uf = (uf || '').toUpperCase();
  if (!munCache[uf]) {
    let dados = null;
    for (let tent = 0; tent < 3 && !dados; tent++) {
      try {
        const resp = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/estados/' + encodeURIComponent(uf) + '/municipios');
        if (resp.ok) dados = await resp.json();
      } catch (e) { }
      if (!dados) await new Promise(r => setTimeout(r, 800));
    }
    if (!dados || !Array.isArray(dados)) throw new Error('API do IBGE indisponível no momento — tente novamente em instantes');
    munCache[uf] = dados;
  }
  const lista = munCache[uf];
  // Ignora acentos, hífens, apóstrofos e espaços (ex: "olhos dagua" acha "Olhos-d'Água")
  const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const alvo = norm(nome);
  const achado = lista.find(m => norm(m.nome) === alvo) || lista.find(m => norm(m.nome).includes(alvo));
  if (!achado) throw new Error('Município "' + nome + '" não encontrado em ' + uf);
  return { nome: achado.nome, uf: uf.toUpperCase(), ibge: String(achado.id) };
}

// Monta o link do edital no PNCP a partir do numeroControlePNCP (CNPJ-1-SEQ/ANO)
function linkPncp(numeroControle) {
  const m = (numeroControle || '').match(/^(\d{14})-\d+-(\d+)\/(\d{4})$/);
  if (!m) return 'https://pncp.gov.br/app/editais?q=' + encodeURIComponent(numeroControle || '');
  return 'https://pncp.gov.br/app/editais/' + m[1] + '/' + m[3] + '/' + parseInt(m[2]);
}

async function consultarLicitacoes(slug) {
  const cidades = getCidades(slug);
  if (!cidades.length) return { error: 'Nenhuma cidade configurada' };
  const hoje = new Date();
  const inicio = new Date(hoje.getTime() - 15 * 86400000); // últimos 15 dias
  let novas = 0, erros = 0;
  const novasDetalhe = [];

  for (const cidade of cidades) {
    for (const [codMod] of MODALIDADES) {
      try {
        let pagina = 1, restantes = 1;
        while (restantes > 0 && pagina <= 5) {
          const url = 'https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao'
            + '?dataInicial=' + fmtData(inicio) + '&dataFinal=' + fmtData(hoje)
            + '&codigoModalidadeContratacao=' + codMod
            + '&uf=' + encodeURIComponent(cidade.uf)
            + '&codigoMunicipioIbge=' + encodeURIComponent(cidade.ibge)
            + '&pagina=' + pagina + '&tamanhoPagina=50';
          const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
          if (resp.status === 204) break; // sem resultados
          if (!resp.ok) { erros++; break; }
          const data = await resp.json().catch(() => null);
          if (!data || !Array.isArray(data.data)) break;
          for (const item of data.data) {
            const nc = item.numeroControlePNCP || '';
            if (!nc || db.getLicitacaoByControle(slug, nc)) continue;
            const lic = {
              id: uid(), numero_controle: nc,
              municipio: (item.unidadeOrgao && item.unidadeOrgao.municipioNome) || cidade.nome,
              uf: (item.unidadeOrgao && item.unidadeOrgao.ufSigla) || cidade.uf,
              orgao: (item.orgaoEntidade && item.orgaoEntidade.razaoSocial) || '',
              objeto: item.objetoCompra || '',
              modalidade: item.modalidadeNome || '',
              valor_estimado: parseFloat(item.valorTotalEstimado) || 0,
              data_publicacao: (item.dataPublicacaoPncp || '').substring(0, 10),
              data_abertura: (item.dataAberturaProposta || '').substring(0, 10),
              data_encerramento: (item.dataEncerramentoProposta || '').substring(0, 10),
              link: item.linkSistemaOrigem || linkPncp(nc),
            };
            db.addLicitacao(slug, lic);
            novas++;
            if (novasDetalhe.length < 10) novasDetalhe.push(lic);
          }
          restantes = data.paginasRestantes || 0;
          pagina++;
        }
      } catch (e) { erros++; console.error('Licitações [' + cidade.nome + ' mod ' + codMod + ']:', e.message); }
    }
  }

  db.updateConfig(slug, 'licit_ultima_consulta', new Date().toISOString());
  console.log(`Licitações [${slug}]: ${novas} nova(s)${erros ? ' | ' + erros + ' erro(s) de consulta' : ''}`);

  // Aviso no Telegram
  if (novas > 0) {
    try {
      const cfg = db.getConfig(slug);
      if (cfg.tg_notif_licit === '1') {
        const telegram = require('./telegram');
        let msg = '📢 <b>' + novas + ' licitação(ões) nova(s)</b> nas cidades monitoradas:\n';
        for (const l of novasDetalhe) {
          msg += '\n• <b>' + l.municipio + '</b> — ' + l.modalidade + '\n' + (l.objeto || '').substring(0, 120) + (l.objeto && l.objeto.length > 120 ? '…' : '') + '\n';
        }
        if (novas > novasDetalhe.length) msg += '\n… e mais ' + (novas - novasDetalhe.length) + '. Veja na aba Licitações.';
        await telegram.sendTelegram(slug, msg);
      }
    } catch (e) { console.error('Telegram licitações:', e.message); }
  }

  return { ok: true, novas, erros };
}

// ===== ANÁLISE DE EDITAL =====
// Onde obter os documentos mais comuns de habilitação
const DOC_LINKS = [
  [/receita federal|tributos federais|d[ií]vida ativa da uni[aã]o|federais e/i, 'https://solucoes.receita.fazenda.gov.br/servicos/certidaointernet/pj/emitir', 'Receita Federal / PGFN'],
  [/fgts|fundo de garantia/i, 'https://consulta-crf.caixa.gov.br/', 'CRF do FGTS (Caixa)'],
  [/trabalhista|cndt|d[eé]bitos trabalhistas/i, 'https://cndt-certidao.tst.jus.br/', 'CNDT (Justiça do Trabalho)'],
  [/fazenda estadual|d[eé]bitos estaduais|estadual/i, 'https://www2.fazenda.mg.gov.br/sol/', 'SEF-MG (Certidão Estadual)'],
  [/fazenda municipal|d[eé]bitos municipais|municipal/i, '', 'Prefeitura do município da empresa'],
  [/fal[eê]ncia|concordata|recupera[çc][aã]o judicial/i, 'https://rupe.tjmg.jus.br/rupe/justica/publico/certidoes/criarSolicitacaoCertidao.rupe', 'TJMG (Certidão de Falência)'],
  [/cnpj|cadastro nacional d[ea] pessoa/i, 'https://solucoes.receita.fazenda.gov.br/servicos/cnpjreva/cnpjreva_solicitacao.asp', 'Cartão CNPJ (Receita)'],
  [/simples nacional/i, 'https://www8.receita.fazenda.gov.br/SimplesNacional/aplicacoes.aspx?id=21', 'Portal do Simples Nacional'],
  [/sicaf/i, 'https://www3.comprasnet.gov.br/sicaf-web/', 'SICAF'],
  [/junta comercial|registro comercial/i, 'https://www.jucemg.mg.gov.br/', 'JUCEMG'],
];

function melhorTrecho(texto, re, keywords, tam) {
  let best = '', bestScore = -1, m;
  const rx = new RegExp(re.source, 'gi');
  while ((m = rx.exec(texto)) !== null) {
    const trecho = texto.substring(m.index, m.index + tam);
    const score = keywords.reduce((s, k) => s + (trecho.match(k) || []).length, 0);
    if (score > bestScore) { bestScore = score; best = trecho; }
    if (rx.lastIndex <= m.index) rx.lastIndex = m.index + 1;
  }
  return best.trim();
}

function extrairDocumentos(texto) {
  const rx = /(certid[aã]o\s[^\n;.]{5,140}|prova\s+de\s[^\n;.]{5,140}|declara[çc][aã]o\s+(?:de|que|unificada)\s?[^\n;.]{0,140}|atestado\s+de\s?[^\n;.]{5,140}|balan[çc]o\s+patrimonial[^\n;.]{0,100}|contrato\s+social[^\n;.]{0,100}|ato\s+constitutivo[^\n;.]{0,100}|comprovante\s+de\s+inscri[çc][aã]o[^\n;.]{0,120}|certificado\s+de\s+regularidade[^\n;.]{0,120}|alvar[aá]\s+de\s[^\n;.]{0,100}|registro\s+comercial[^\n;.]{0,100}|c[eé]dula\s+de\s+identidade[^\n;.]{0,80})/gi;
  const vistos = new Set(), out = [];
  let m;
  while ((m = rx.exec(texto)) !== null && out.length < 25) {
    let d = m[1].replace(/\s+/g, ' ').trim();
    d = d.charAt(0).toUpperCase() + d.slice(1);
    const key = d.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 50);
    if (vistos.has(key)) continue;
    vistos.add(key);
    const li = DOC_LINKS.find(([re2]) => re2.test(d));
    out.push({ documento: d, link: li ? li[1] : '', fonte_nome: li ? li[2] : '' });
  }
  return out;
}

async function analisarEdital(slug, lic, force) {
  const m = (lic.numero_controle || '').match(/^(\d{14})-\d+-(\d+)\/(\d{4})$/);
  if (!m) return { error: 'Número de controle PNCP inválido' };
  const cnpj = m[1], seq = parseInt(m[2]), ano = m[3];
  // Listar arquivos da contratação no PNCP
  let arquivos = [];
  try {
    const r = await fetch(`https://pncp.gov.br/api/pncp/v1/orgaos/${cnpj}/compras/${ano}/${seq}/arquivos?pagina=1&tamanhoPagina=20`, { headers: { Accept: 'application/json' } });
    if (r.ok) arquivos = await r.json();
  } catch (e) {}
  if (!Array.isArray(arquivos) || !arquivos.length) return { error: 'Nenhum arquivo encontrado no PNCP para esta licitação' };
  const arq = arquivos.find(a => /edital/i.test(a.titulo || '')) || arquivos[0];
  const urlArq = arq.url || `https://pncp.gov.br/pncp-api/v1/orgaos/${cnpj}/compras/${ano}/${seq}/arquivos/${arq.sequencialDocumento || 1}`;
  // Baixar o edital
  let buf;
  try {
    const r = await fetch(urlArq);
    if (!r.ok) return { error: 'Falha ao baixar o edital (HTTP ' + r.status + ')', edital_url: urlArq };
    buf = Buffer.from(await r.arrayBuffer());
  } catch (e) { return { error: 'Falha ao baixar o edital: ' + e.message, edital_url: urlArq }; }
  if (buf.slice(0, 4).toString() !== '%PDF') {
    return { error: 'O arquivo do edital não é um PDF (pode ser ZIP/DOC) — baixe manualmente pelo botão do edital.', edital_url: urlArq };
  }
  // Ler o PDF
  const { PDFParse } = require('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  let texto = '';
  try { const r = await parser.getText(); texto = r.text || ''; }
  catch (e) { return { error: 'Não consegui ler o PDF do edital: ' + e.message, edital_url: urlArq }; }
  finally { await parser.destroy().catch(() => {}); }
  if (texto.length < 200) return { error: 'O edital parece ser um PDF escaneado (sem texto). Baixe manualmente.', edital_url: urlArq };

  // Extrair seções e documentos
  const habilitacao = melhorTrecho(texto, /HABILITA[ÇC][ÃA]O/, [/certid[aã]o/gi, /prova de/gi, /declara/gi, /regularidade/gi], 8000);
  const proposta = melhorTrecho(texto, /PROPOSTA/, [/validade/gi, /prazo/gi, /pre[çc]o/gi, /apresentar/gi, /plataforma/gi], 6000);
  const docs = extrairDocumentos(habilitacao || texto);

  const analise = {
    edital_titulo: arq.titulo || 'Edital',
    edital_url: urlArq,
    proposta_trecho: (proposta || '').substring(0, 6000),
    habilitacao_trecho: (habilitacao || '').substring(0, 8000),
    total_paginas_texto: texto.length,
    analisado_em: new Date().toISOString(),
  };
  db.updateLicitacao(slug, lic.id, { analise_json: JSON.stringify(analise) });

  // Checklist: cria os itens automáticos (mantém os manuais e o que já foi marcado)
  if (force) db.delLicitDocsAuto(slug, lic.id);
  const existentes = db.getLicitDocs(slug, lic.id);
  if (!existentes.length || force) {
    const jaTem = new Set(existentes.map(d => d.documento.toLowerCase().substring(0, 50)));
    docs.forEach((d, i) => {
      if (jaTem.has(d.documento.toLowerCase().substring(0, 50))) return;
      db.addLicitDoc(slug, { id: uid() + i, licitacao_id: lic.id, documento: d.documento, link: d.link, fonte_nome: d.fonte_nome, origem: 'auto', ordem: i });
    });
  }
  return { ok: true, analise, docs: db.getLicitDocs(slug, lic.id) };
}

async function consultarTodasEmpresas() {
  for (const emp of db.getEmpresas()) {
    try {
      if (getCidades(emp.slug).length) await consultarLicitacoes(emp.slug);
    } catch (e) { console.error('Licitações cron [' + emp.slug + ']:', e.message); }
  }
}

module.exports = { consultarLicitacoes, consultarTodasEmpresas, resolverIbge, getCidades, analisarEdital };
