// Módulo Boleto: decodifica linha digitável / código de barras e lê PDF de boleto
const db = require('./database');

// Converte "fator de vencimento" (4 dígitos) para data ISO.
// Base histórica 07/10/1997. Ciclo de 9000 dias (reset da Febraban em 22/02/2025).
function fatorToVencimento(fator) {
  if (!fator || fator <= 0) return '';
  const base = Date.UTC(1997, 9, 7); // 07/10/1997
  let ms = base + fator * 86400000;
  // O fator repete a cada 9000 dias (reset Febraban). Escolhe o ciclo cujo vencimento
  // caia a partir de ~2 anos atrás (cobre boletos recentes e o reset de 22/02/2025).
  const limitePassado = Date.now() - 730 * 86400000;
  let guard = 0;
  while (ms < limitePassado && guard++ < 5) ms += 9000 * 86400000;
  const d = new Date(ms);
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
}

// Decodifica linha digitável (47) ou código de barras (44) ou arrecadação (48/44 iniciando em 8)
function decodeLinhaDigitavel(raw) {
  const s = (raw || '').replace(/\D/g, '');
  const res = { tipo: '', banco: '', valor: 0, vencimento: '', linha: s, valido: false };
  if (!s || s.length < 44) return res;

  if (s[0] === '8') { // Arrecadação (água, luz, tributos, convênios)
    res.tipo = 'arrecadacao';
    let barcode;
    if (s.length === 48) barcode = s.slice(0, 11) + s.slice(12, 23) + s.slice(24, 35) + s.slice(36, 47);
    else barcode = s.slice(0, 44);
    res.valor = (parseInt(barcode.slice(4, 15), 10) || 0) / 100;
    res.valido = res.valor > 0;
    // vencimento em arrecadação não é padronizado → fica em branco (usuário informa)
    return res;
  }

  // Título bancário
  res.tipo = 'titulo';
  if (s.length === 47) {
    res.banco = s.slice(0, 3);
    res.vencimento = fatorToVencimento(parseInt(s.slice(33, 37), 10));
    res.valor = (parseInt(s.slice(37, 47), 10) || 0) / 100;
  } else if (s.length === 44) {
    res.banco = s.slice(0, 3);
    res.vencimento = fatorToVencimento(parseInt(s.slice(5, 9), 10));
    res.valor = (parseInt(s.slice(9, 19), 10) || 0) / 100;
  } else {
    if (s.length >= 10) res.valor = (parseInt(s.slice(-10), 10) || 0) / 100;
  }
  res.valido = res.valor > 0;
  return res;
}

// Extrai TODOS os boletos de um PDF (um arquivo pode trazer o carnê inteiro).
// Acha cada linha digitável, fatia o texto ao redor de cada uma e extrai os
// demais dados (vencimento, CNPJ, beneficiário) do trecho correspondente.
function parseBoletosPdf(text) {
  const achados = []; // {linha, index}
  const re = /[\d][\d.\s-]{44,72}[\d]/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const d = m[0].replace(/\D/g, '');
    if (d.length === 47 || d.length === 48 || d.length === 44) {
      achados.push({ linha: d, index: m.index, end: m.index + m[0].length });
    }
  }
  if (!achados.length) {
    // Sem linha digitável legível: tenta o parser antigo (campos em texto)
    const unico = parseBoletoPdf(text);
    return (unico.valor || unico.linha) ? [unico] : [];
  }
  // A mesma linha aparece 2x no boleto (recibo do pagador + ficha de compensação):
  // agrupa por linha, guardando o primeiro e o último índice para delimitar o trecho.
  const porLinha = new Map();
  for (const a of achados) {
    if (!porLinha.has(a.linha)) porLinha.set(a.linha, { linha: a.linha, ini: a.index, fim: a.end });
    else porLinha.get(a.linha).fim = a.end;
  }
  const unicos = [...porLinha.values()].sort((a, b) => a.ini - b.ini);
  const out = [];
  // Um boleto termina logo após a última ocorrência da sua linha digitável
  // (ficha de compensação); o que vem depois já é o cabeçalho do próximo.
  for (let i = 0; i < unicos.length; i++) {
    const ini = i === 0 ? 0 : unicos[i - 1].fim;
    const fim = i === unicos.length - 1 ? text.length : unicos[i].fim;
    const trecho = text.substring(ini, fim);
    const res = parseBoletoPdf(trecho);
    res.linha = unicos[i].linha; // garante a linha certa do trecho
    const dec = decodeLinhaDigitavel(res.linha);
    if (dec.valor) res.valor = dec.valor;
    if (dec.vencimento) res.vencimento = dec.vencimento;
    if (res.valor || res.linha) out.push(res);
  }
  return out;
}

// Extrai dados do texto de um PDF de boleto
function parseBoletoPdf(text) {
  const res = { linha: '', valor: 0, vencimento: '', beneficiario: '', cnpj: '' };
  const full = text.replace(/\s+/g, ' ').trim();

  // 1) Linha digitável — formato dotado padrão do título bancário
  let m = text.match(/\d{5}[.\s]\d{5}\s*\d{5}[.\s]\d{6}\s*\d{5}[.\s]\d{6}\s*\d\s*\d{14}/);
  if (m) res.linha = m[0].replace(/\D/g, '');
  // Fallback: procura sequência que, sem separadores, tenha 44/47/48 dígitos
  if (!res.linha) {
    const cands = full.match(/[\d][\d.\s-]{44,72}[\d]/g) || [];
    for (const c of cands) {
      const d = c.replace(/\D/g, '');
      if (d.length === 47 || d.length === 48 || d.length === 44) { res.linha = d; break; }
    }
  }

  if (res.linha) {
    const dec = decodeLinhaDigitavel(res.linha);
    res.valor = dec.valor;
    res.vencimento = dec.vencimento;
  }

  // 2) Vencimento em texto (usa se a linha não trouxe)
  if (!res.vencimento) {
    const vm = full.match(/Vencimento[:\s]*?(\d{2}\/\d{2}\/\d{4})/i);
    if (vm) res.vencimento = vm[1].split('/').reverse().join('-');
  }

  // 3) Valor em texto (usa se a linha não trouxe)
  if (!res.valor) {
    const vlm = full.match(/Valor\s+(?:do\s+)?Documento[:\s]*R?\$?\s*([\d.]+,\d{2})/i);
    if (vlm) res.valor = parseFloat(vlm[1].replace(/\./g, '').replace(',', '.')) || 0;
  }

  // 4) CNPJ (do beneficiário)
  const cm = full.match(/(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/);
  if (cm) res.cnpj = cm[1].replace(/\D/g, '');

  // 5) Beneficiário / Cedente (melhor esforço — layout varia por banco)
  let bm = full.match(/(?:Benefici[aá]rio|Cedente)[:\s]+([A-ZÀ-Ú][A-Za-zÀ-ú&.\- ]{4,60}?)(?:\s+CNPJ|\s+CPF|\s+\d{2}\.\d{3}\.\d{3}|\s+Ag[eê]ncia|\s{2,}|$)/);
  if (bm) res.beneficiario = bm[1].trim().replace(/\s+/g, ' ');

  return res;
}

// Casa os dados do boleto com fornecedores cadastrados e notas recebidas
function enriquecer(slug, dados) {
  const out = { ...dados, fornecedor: '', nota_numero: '', nota_chave: '', match: '' };
  // Por CNPJ
  if (dados.cnpj) {
    const f = db.getFornecedorByCnpj(slug, dados.cnpj);
    if (f) { out.fornecedor = f.razao || f.fantasia; out.match = 'cnpj'; }
  }
  if (!out.fornecedor && dados.beneficiario) out.fornecedor = dados.beneficiario;
  // Por valor + vencimento nas notas (duplicatas)
  if (dados.valor > 0) {
    const notas = db.getNotasRecebidas(slug);
    for (const n of notas) {
      let dups = [];
      try { dups = JSON.parse(n.duplicatas_json || '[]'); } catch (e) {}
      const bate = dups.some(d => Math.abs((d.valor || 0) - dados.valor) < 0.01 && (!dados.vencimento || d.vencimento === dados.vencimento))
        || (Math.abs((n.valor || 0) - dados.valor) < 0.01);
      if (bate) {
        out.fornecedor = out.fornecedor || n.emitente;
        if (!out.fornecedor || n.emitente) out.fornecedor = n.emitente;
        out.nota_numero = n.numero || '';
        out.nota_chave = n.chave || '';
        out.match = out.match ? out.match + '+nota' : 'nota';
        break;
      }
    }
  }
  return out;
}

module.exports = { decodeLinhaDigitavel, parseBoletoPdf, parseBoletosPdf, enriquecer, fatorToVencimento };
