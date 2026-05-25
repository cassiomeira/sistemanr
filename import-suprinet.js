const XLSX = require('xlsx');
const db = require('./database');

const SLUG = 'suprinet';
const START_YEAR = 2026;
const START_MONTH = 6; // Junho

function uid() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 5); }

async function main() {
  await db.init();
  
  const wb = XLSX.readFile('Modelo_Importacao_Suprinet.xlsx', { cellStyles: true });
  const ws = wb.Sheets['Contas a Pagar'];
  if (!ws) { console.log('Aba "Contas a Pagar" não encontrada!'); return; }
  
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
  console.log(`🟡 Linhas amarelas detectadas: ${yellowRows.size}`);
  
  // Passo 1: detectar onde cada mês começa
  // Usa "combustivel Agelandia" no dia 1 como marcador de novo mês
  const monthBreaks = [0]; // primeiro mês começa na linha 0
  rows.forEach((r, i) => {
    if (i > 0 && r.descricao && r.descricao.toLowerCase().includes('combustivel agelandia') && parseInt(r.vencimento) === 1) {
      monthBreaks.push(i);
    }
  });
  
  console.log(`📅 ${monthBreaks.length} meses detectados:`);
  monthBreaks.forEach((start, idx) => {
    const y = START_YEAR + Math.floor((START_MONTH + idx - 1) / 12);
    const m = ((START_MONTH + idx - 1) % 12) + 1;
    const end = idx < monthBreaks.length - 1 ? monthBreaks[idx + 1] - 1 : rows.length - 1;
    console.log(`  ${y}-${String(m).padStart(2, '0')}: linhas ${start + 2} a ${end + 2} (${end - start + 1} linhas)`);
  });
  
  // Passo 2: importar cada linha com o mês correto
  let total = 0, pulados = 0;
  const resumo = {};
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const day = parseInt(row.vencimento) || 0;
    if (day === 0 || day > 31) { pulados++; continue; }
    
    // Determinar qual mês esta linha pertence
    let monthIdx = 0;
    for (let b = monthBreaks.length - 1; b >= 0; b--) {
      if (i >= monthBreaks[b]) { monthIdx = b; break; }
    }
    
    const y = START_YEAR + Math.floor((START_MONTH + monthIdx - 1) / 12);
    const m = ((START_MONTH + monthIdx - 1) % 12) + 1;
    const vencimento = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    const valor = parseFloat(row.valor) || 0;
    if (valor === 0) { pulados++; continue; }
    
    const descricao = (row.descricao || '').toString().trim() || 'Sem descrição';
    const categoria = (row.categoria || '').toString().trim() || 'Outros';
    const fornecedor = (row.fornecedor || '').toString().trim() || '';
    const recorrente = (row.recorrente || '').toString().toLowerCase() === 'sim' ? 1 : 0;
    const boleto_chegou = yellowRows.has(i) ? 0 : 1;
    
    db.run_raw(SLUG,
      'INSERT INTO contas_pagar (id,vencimento,descricao,valor,recorrente,boleto_chegou,pago_por,categoria,tipo_nota,fornecedor,a_chegar,grupo_parcela) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      [uid(), vencimento, descricao, valor, recorrente, boleto_chegou, '', categoria, '', fornecedor, 0, '']
    );
    
    const mesKey = `${y}-${String(m).padStart(2, '0')}`;
    if (!resumo[mesKey]) resumo[mesKey] = { total: 0, valor: 0, amarelos: 0 };
    resumo[mesKey].total++;
    resumo[mesKey].valor += valor;
    if (!boleto_chegou) resumo[mesKey].amarelos++;
    
    total++;
  }
  
  console.log('\n📊 Resumo por mês:');
  Object.keys(resumo).sort().forEach(mes => {
    const r = resumo[mes];
    console.log(`  ${mes}: ${r.total} contas | R$ ${r.valor.toFixed(2)} | 🟡 ${r.amarelos} sem boleto`);
  });
  
  console.log(`\n✅ Importação concluída! ${total} contas importadas, ${pulados} linhas puladas`);
}

main().catch(err => console.error('Erro:', err));
