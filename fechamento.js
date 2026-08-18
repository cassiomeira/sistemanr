// Módulo Fechamento de Frete: importa PDF de fechamento mensal da transportadora
// Extrai viagens, faturamento bruto, despesas descontadas e valor líquido a receber
const { PDFParse } = require('pdf-parse');

function parseMoney(s) {
  if (typeof s === 'number') return s;
  const m = String(s || '').replace(/[^\d.,-]/g, '');
  if (!m) return 0;
  return parseFloat(m.replace(/\./g, '').replace(',', '.')) || 0;
}

function parseDataBr(s) {
  const m = String(s || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return '';
  if (m[3] === '1900') return ''; // linha vazia do modelo
  return m[3] + '-' + m[2] + '-' + m[1];
}

async function parseFechamentoPdf(buffer) {
  const parser = new PDFParse({ data: buffer });
  let result;
  try {
    result = await parser.getTable();
  } finally {
    try { await parser.destroy(); } catch (e) {}
  }
  const out = { mes: '', conjunto: '', viagens: [], despesas: [], bruto: 0, liquido: 0, confere: false };
  const pages = result.pages || [];
  for (const page of pages) {
    for (const table of (page.tables || [])) {
      for (const row of table) {
        const cells = row.map(c => String(c || '').trim());
        const joined = cells.join(' ');
        // Cabeçalhos
        let m = joined.match(/M[ÊE]S:\s*(\d{1,2})\/(\d{4})/i);
        if (m) out.mes = m[2] + '-' + m[1].padStart(2, '0');
        m = joined.match(/CONJUNTO:\s*([A-Z0-9][A-Z0-9\s-]+)/i);
        if (m) out.conjunto = m[1].replace(/\s+/g, ' ').replace(/\s*-\s*/, '-').trim();
        // Total bruto / líquido
        if (/^TOTAL\s*BRUTO/i.test(cells[0])) { out.bruto = parseMoney(cells[cells.length - 1]); continue; }
        if (/^TOTAL\s*:?$/i.test(cells[0])) { out.liquido = parseMoney(cells[cells.length - 1]); continue; }
        // Viagem: 5 colunas com data válida e valor
        if (cells.length >= 5) {
          const data = parseDataBr(cells[2]);
          const valor = parseMoney(cells[4]);
          if (data && valor > 0) {
            out.viagens.push({ unidade: cells[0], motorista: cells[1], data, peso: cells[3], valor });
          }
          continue;
        }
        // Despesa: 2 colunas [descrição, R$ valor]
        if (cells.length === 2 && cells[0] && /R\$/.test(cells[1])) {
          if (/^TOTAL/i.test(cells[0])) continue;
          const valor = parseMoney(cells[1]);
          if (valor > 0) out.despesas.push({ descricao: cells[0], valor });
        }
      }
    }
  }
  const somaViagens = out.viagens.reduce((s, v) => s + v.valor, 0);
  const somaDespesas = out.despesas.reduce((s, d) => s + d.valor, 0);
  if (!out.bruto) out.bruto = Math.round(somaViagens * 100) / 100;
  if (!out.liquido) out.liquido = Math.round((out.bruto - somaDespesas) * 100) / 100;
  out.totalDespesas = Math.round(somaDespesas * 100) / 100;
  // Validação: bruto - despesas deve bater com o líquido informado no PDF
  out.confere = Math.abs((out.bruto - somaDespesas) - out.liquido) < 0.05;
  if (!out.viagens.length && !out.bruto) return { error: 'Não foi possível identificar o fechamento neste PDF. Verifique se é o arquivo correto.' };
  return out;
}

module.exports = { parseFechamentoPdf };
