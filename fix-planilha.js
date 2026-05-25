const XLSX = require('xlsx');

const START_YEAR = 2026;
const START_MONTH = 6;

const wb = XLSX.readFile('Modelo_Importacao_Suprinet.xlsx', { cellStyles: true });
const ws = wb.Sheets['Contas a Pagar'];
const rows = XLSX.utils.sheet_to_json(ws);
const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');

// Detectar células amarelas
const yellowRows = new Set();
for (let r = range.s.r + 1; r <= range.e.r; r++) {
  const cellAddr = XLSX.utils.encode_cell({ r, c: 0 });
  const cell = ws[cellAddr];
  if (cell && cell.s) {
    const s = cell.s;
    const isYellow = (s.patternType === 'solid' && s.fgColor && (
      (s.fgColor.rgb && (s.fgColor.rgb.toUpperCase().includes('FFFF00') || s.fgColor.rgb.toUpperCase().includes('FFC000') || s.fgColor.rgb.toUpperCase() === 'FFFFFF00')) ||
      (s.fgColor.theme !== undefined && s.fgColor.tint !== undefined)
    )) || (s.bgColor && s.bgColor.rgb && (s.bgColor.rgb.toUpperCase().includes('FFFF00') || s.bgColor.rgb.toUpperCase().includes('FFC000')));
    if (isYellow) yellowRows.add(r - range.s.r - 1);
  }
}
console.log(`🟡 ${yellowRows.size} linhas amarelas detectadas`);

// Detectar meses
const monthBreaks = [0];
rows.forEach((r, i) => {
  if (i > 0 && r.descricao && r.descricao.toLowerCase().includes('combustivel agelandia') && parseInt(r.vencimento) === 1) {
    monthBreaks.push(i);
  }
});

// Montar dados corrigidos
const corrected = [];
rows.forEach((r, i) => {
  let monthIdx = 0;
  for (let b = monthBreaks.length - 1; b >= 0; b--) {
    if (i >= monthBreaks[b]) { monthIdx = b; break; }
  }
  const y = START_YEAR + Math.floor((START_MONTH + monthIdx - 1) / 12);
  const m = ((START_MONTH + monthIdx - 1) % 12) + 1;
  const day = parseInt(r.vencimento) || 1;
  const valor = parseFloat(r.valor) || 0;
  if (valor === 0) return;

  corrected.push({
    vencimento: `${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`,
    descricao: r.descricao || '',
    valor: valor,
    categoria: r.categoria || '',
    fornecedor: r.fornecedor || '',
    recorrente: r.recorrente || '',
    boleto_chegou: yellowRows.has(i) ? 'Não' : 'Sim'
  });
});

// Criar planilha manualmente para forçar datas como TEXTO
const newWb = XLSX.utils.book_new();

// Copiar outras abas
['Acerto', 'Cheques', 'Movimentacao', 'Conta Celso'].forEach(name => {
  const origWs = wb.Sheets[name];
  if (origWs) XLSX.utils.book_append_sheet(newWb, origWs, name);
});

// Criar aba manualmente com tipo string forçado
const headers = ['vencimento', 'descricao', 'valor', 'categoria', 'fornecedor', 'recorrente', 'boleto_chegou'];
const newWs = {};
// Header
headers.forEach((h, c) => {
  newWs[XLSX.utils.encode_cell({r:0, c})] = { v: h, t: 's' };
});
// Data - forçar vencimento como tipo 's' (string)
corrected.forEach((row, i) => {
  const r = i + 1;
  newWs[XLSX.utils.encode_cell({r, c:0})] = { v: row.vencimento, t: 's' }; // TEXTO!
  newWs[XLSX.utils.encode_cell({r, c:1})] = { v: row.descricao, t: 's' };
  newWs[XLSX.utils.encode_cell({r, c:2})] = { v: row.valor, t: 'n' };
  newWs[XLSX.utils.encode_cell({r, c:3})] = { v: row.categoria || '', t: 's' };
  newWs[XLSX.utils.encode_cell({r, c:4})] = { v: row.fornecedor || '', t: 's' };
  newWs[XLSX.utils.encode_cell({r, c:5})] = { v: row.recorrente || '', t: 's' };
  newWs[XLSX.utils.encode_cell({r, c:6})] = { v: row.boleto_chegou, t: 's' };
});
newWs['!ref'] = XLSX.utils.encode_range({s:{r:0,c:0}, e:{r:corrected.length, c:headers.length-1}});

XLSX.utils.book_append_sheet(newWb, newWs, 'Contas a Pagar');
XLSX.writeFile(newWb, 'Modelo_Importacao_Suprinet_CORRIGIDO.xlsx');

const semBoleto = corrected.filter(r => r.boleto_chegou === 'Não').length;
console.log(`✅ Planilha corrigida: Modelo_Importacao_Suprinet_CORRIGIDO.xlsx`);
console.log(`   ${corrected.length} linhas | datas como TEXTO | boleto_chegou incluído`);
console.log(`   ${semBoleto} sem boleto (amarelo) | ${corrected.length - semBoleto} com boleto`);

// Verificar que as datas estão corretas
const sample = corrected.slice(0, 3);
console.log('\nExemplos:');
sample.forEach(r => console.log(`  ${r.vencimento} | ${r.descricao} | R$ ${r.valor} | boleto: ${r.boleto_chegou}`));
