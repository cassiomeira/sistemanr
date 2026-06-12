const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

let SQL;
const dbs = {}; // cache: slug -> { db, path }
let usersDB;
const usersDbPath = path.join(dataDir, 'usuarios.db');
function hashSenha(s) { return crypto.createHash('sha256').update(s).digest('hex'); }
function persistUsers() { fs.writeFileSync(usersDbPath, Buffer.from(usersDB.export())); }
function queryUsers(sql, params) { const s = usersDB.prepare(sql); if (params) s.bind(params); const r = []; while (s.step()) r.push(s.getAsObject()); s.free(); return r; }
function runUsers(sql, params) { usersDB.run(sql, params); persistUsers(); }
function initUsersDB() {
  if (fs.existsSync(usersDbPath)) usersDB = new SQL.Database(fs.readFileSync(usersDbPath));
  else usersDB = new SQL.Database();
  usersDB.run(`CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE,
    senha_hash TEXT NOT NULL, nome TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user', permissoes TEXT NOT NULL DEFAULT '[]',
    ativo INTEGER NOT NULL DEFAULT 1
  )`);
  const cnt = usersDB.exec("SELECT COUNT(*) FROM usuarios WHERE role='admin'")[0]?.values[0][0] || 0;
  if (cnt === 0) usersDB.run("INSERT INTO usuarios (username,senha_hash,nome,role,permissoes,ativo) VALUES (?,?,?,?,?,1)",
    ['admin', hashSenha('admin'), 'Administrador', 'admin', JSON.stringify(['dashboard','acerto','fat','contas-pagar','drogaria','cheques','conta-dono','distribuicao','colaboradores','relatorios','configuracoes','usuarios']), ]);
  persistUsers();
  // Migration: adicionar novas permissões aos usuários existentes
  const allUsers = usersDB.exec("SELECT id, permissoes FROM usuarios");
  if (allUsers.length) {
    const newPerms = ['movimentacao', 'caixas'];
    allUsers[0].values.forEach(([id, permsJson]) => {
      try {
        const perms = JSON.parse(permsJson || '[]');
        let changed = false;
        newPerms.forEach(p => { if (!perms.includes(p)) { perms.push(p); changed = true; } });
        if (changed) usersDB.run('UPDATE usuarios SET permissoes=? WHERE id=?', [JSON.stringify(perms), id]);
      } catch(e) {}
    });
    persistUsers();
  }
}

const empresasPath = path.join(dataDir, 'empresas.json');
function loadEmpresas() {
  if (fs.existsSync(empresasPath)) return JSON.parse(fs.readFileSync(empresasPath, 'utf8'));
  const defaultList = [{ slug: 'nunesrocha', nome: 'Nunes Rocha' }];
  fs.writeFileSync(empresasPath, JSON.stringify(defaultList, null, 2));
  return defaultList;
}
function saveEmpresas(list) { fs.writeFileSync(empresasPath, JSON.stringify(list, null, 2)); }

function initDB(dbInstance) {
  dbInstance.run(`
    CREATE TABLE IF NOT EXISTS acerto (
      id TEXT PRIMARY KEY, data TEXT NOT NULL, descricao TEXT NOT NULL,
      entrada REAL DEFAULT 0, saida REAL DEFAULT 0,
      categoria TEXT DEFAULT 'Outros', recorrente INTEGER DEFAULT 0,
      tipo_nota TEXT DEFAULT '', origem_conta_pagar TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS lancamentos (
      id TEXT PRIMARY KEY, origem TEXT NOT NULL, data TEXT NOT NULL,
      tipo TEXT NOT NULL, descricao TEXT NOT NULL, valor REAL NOT NULL,
      categoria TEXT DEFAULT 'Outros'
    );
    CREATE TABLE IF NOT EXISTS cheques (
      id TEXT PRIMARY KEY, numero TEXT DEFAULT '', data TEXT NOT NULL, cliente TEXT NOT NULL,
      valor REAL NOT NULL, taxa REAL NOT NULL DEFAULT 5, dias INTEGER DEFAULT 30,
      lucro REAL NOT NULL, bom_para TEXT DEFAULT '', destino TEXT DEFAULT '',
      origem_dinheiro TEXT NOT NULL DEFAULT 'caixa-empresa',
      vencimento TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pendente'
    );
    CREATE TABLE IF NOT EXISTS conta_dono (
      id TEXT PRIMARY KEY, data TEXT NOT NULL, tipo TEXT NOT NULL,
      descricao TEXT NOT NULL, valor REAL NOT NULL,
      origem_cheque TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS colaboradores (
      id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, percentual REAL NOT NULL DEFAULT 2.2
    );
    CREATE TABLE IF NOT EXISTS configuracoes (
      chave TEXT PRIMARY KEY, valor TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS contas_pagar (
      id TEXT PRIMARY KEY, vencimento TEXT NOT NULL, descricao TEXT NOT NULL,
      valor REAL NOT NULL, recorrente INTEGER DEFAULT 0,
      boleto_chegou INTEGER DEFAULT 0, pago_por TEXT DEFAULT '',
      categoria TEXT DEFAULT 'Outros', tipo_nota TEXT DEFAULT '',
      fornecedor TEXT DEFAULT '', a_chegar INTEGER DEFAULT 0,
      grupo_parcela TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS caixas (
      id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL,
      saldo REAL NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS movimentacao (
      id TEXT PRIMARY KEY, data TEXT NOT NULL, descricao TEXT NOT NULL,
      entrada REAL DEFAULT 0, saida REAL DEFAULT 0, diferenca REAL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS mov_config (
      mes TEXT PRIMARY KEY, saldo_anterior REAL DEFAULT 0, diferenca REAL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS lembretes (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      texto TEXT NOT NULL,
      concluido INTEGER DEFAULT 0,
      data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  // Seed config
  const cfgCount = dbInstance.exec("SELECT COUNT(*) FROM configuracoes")[0]?.values[0][0] || 0;
  if (cfgCount === 0) {
    dbInstance.run("INSERT INTO configuracoes VALUES ('pctAdmin','23')");
    dbInstance.run("INSERT INTO configuracoes VALUES ('pctDono','36')");
    dbInstance.run("INSERT INTO configuracoes VALUES ('pctReserva','30')");
    dbInstance.run("INSERT INTO configuracoes VALUES ('categoriasLoja',?)", [JSON.stringify(['Venda','Despesa','Fornecedor','Salário','Aluguel','Energia','Água','Internet','Outros'])]);
    dbInstance.run("INSERT INTO configuracoes VALUES ('categoriasDrog',?)", [JSON.stringify(['Venda','Despesa','Fornecedor','Outros'])]);
  }
  const colabCount = dbInstance.exec("SELECT COUNT(*) FROM colaboradores")[0]?.values[0][0] || 0;
  if (colabCount === 0) { for (let i = 1; i <= 5; i++) dbInstance.run("INSERT INTO colaboradores (nome,percentual) VALUES (?,2.2)", ['Colaborador ' + i]); }
  // Migrations
  try { dbInstance.run('ALTER TABLE acerto ADD COLUMN fornecedor TEXT DEFAULT ""'); } catch(e) {}
  try { dbInstance.run('ALTER TABLE acerto ADD COLUMN a_chegar INTEGER DEFAULT 0'); } catch(e) {}
  try { dbInstance.run('ALTER TABLE contas_pagar ADD COLUMN tipo_nota TEXT DEFAULT ""'); } catch(e) {}
  try { dbInstance.exec("ALTER TABLE contas_pagar ADD COLUMN fornecedor TEXT DEFAULT ''"); } catch (e) {}
  try { dbInstance.exec("ALTER TABLE movimentacao ADD COLUMN diferenca REAL DEFAULT 0"); } catch (e) {}
  try { dbInstance.run('ALTER TABLE cheques ADD COLUMN dias INTEGER DEFAULT 30'); } catch(e) {}
  try { dbInstance.run('ALTER TABLE cheques ADD COLUMN numero TEXT DEFAULT ""'); } catch(e) {}
  try { dbInstance.run('ALTER TABLE cheques ADD COLUMN bom_para TEXT DEFAULT ""'); } catch(e) {}
  try { dbInstance.run('ALTER TABLE cheques ADD COLUMN destino TEXT DEFAULT ""'); } catch(e) {}
  try { dbInstance.run('ALTER TABLE conta_dono ADD COLUMN origem_cheque TEXT DEFAULT ""'); } catch(e) {}
  try { dbInstance.run('ALTER TABLE cheques ADD COLUMN dono_cheque TEXT DEFAULT ""'); } catch(e) {}
  try { dbInstance.run('ALTER TABLE cheques ADD COLUMN juros_antecipado INTEGER DEFAULT 0'); } catch(e) {}
  try { dbInstance.run('ALTER TABLE cheques ADD COLUMN taxa_extra REAL DEFAULT 0'); } catch(e) {}
  const hasForn = dbInstance.exec("SELECT COUNT(*) FROM configuracoes WHERE chave='fornecedores'")[0]?.values[0][0] || 0;
  if (!hasForn) dbInstance.run("INSERT INTO configuracoes VALUES ('fornecedores',?)", [JSON.stringify([])]);
  try { dbInstance.run('ALTER TABLE contas_pagar ADD COLUMN caixa_id INTEGER DEFAULT 0'); } catch(e) {}
  try { dbInstance.run('ALTER TABLE contas_pagar ADD COLUMN a_chegar INTEGER DEFAULT 0'); } catch(e) {}
  try { dbInstance.run('ALTER TABLE contas_pagar ADD COLUMN grupo_parcela TEXT DEFAULT ""'); } catch(e) {}
  // Controle Fiscal
  dbInstance.run(`CREATE TABLE IF NOT EXISTS controle_fiscal (
    id TEXT PRIMARY KEY, data TEXT NOT NULL,
    nota_entrada REAL DEFAULT 0, nota_saida REAL DEFAULT 0,
    banco_boleto REAL DEFAULT 0, banco_deposito REAL DEFAULT 0, banco_cartao REAL DEFAULT 0,
    observacao TEXT DEFAULT ''
  )`);
  // Migração: separar banco_entrada em 3 colunas
  try { dbInstance.run('ALTER TABLE controle_fiscal ADD COLUMN banco_boleto REAL DEFAULT 0'); } catch(e) {}
  try { dbInstance.run('ALTER TABLE controle_fiscal ADD COLUMN banco_deposito REAL DEFAULT 0'); } catch(e) {}
  try { dbInstance.run('ALTER TABLE controle_fiscal ADD COLUMN banco_cartao REAL DEFAULT 0'); } catch(e) {}
  // Migrar dados antigos: banco_entrada → banco_deposito
  try { dbInstance.run('UPDATE controle_fiscal SET banco_deposito = banco_entrada WHERE banco_entrada > 0 AND banco_deposito = 0 AND banco_boleto = 0 AND banco_cartao = 0'); } catch(e) {}
  // Abastecimento
  try { dbInstance.run('ALTER TABLE acerto ADD COLUMN veiculo TEXT DEFAULT ""'); } catch(e) {}
  try { dbInstance.run('ALTER TABLE acerto ADD COLUMN placa TEXT DEFAULT ""'); } catch(e) {}
  try { dbInstance.run('ALTER TABLE acerto ADD COLUMN km TEXT DEFAULT ""'); } catch(e) {}
  try { dbInstance.run('ALTER TABLE acerto ADD COLUMN localidade TEXT DEFAULT ""'); } catch(e) {}
  try { dbInstance.run('ALTER TABLE acerto ADD COLUMN condutor TEXT DEFAULT ""'); } catch(e) {}
  // Garantir categoria Abastecimento
  try {
    const catRaw = dbInstance.exec("SELECT valor FROM configuracoes WHERE chave='categoriasLoja'")[0]?.values[0][0];
    if (catRaw) {
      const cats = JSON.parse(catRaw);
      if (!cats.includes('Abastecimento')) {
        cats.push('Abastecimento');
        dbInstance.run("UPDATE configuracoes SET valor=? WHERE chave='categoriasLoja'", [JSON.stringify(cats)]);
      }
    }
  } catch(e) {}
  // Tabela Veiculos
  dbInstance.run(`CREATE TABLE IF NOT EXISTS veiculos (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    placa TEXT NOT NULL,
    km_atual REAL DEFAULT 0,
    km_proxima_troca REAL DEFAULT 0
  )`);
  // Tabela Auditoria
  dbInstance.run(`CREATE TABLE IF NOT EXISTS auditoria (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    data TEXT NOT NULL,
    usuario TEXT NOT NULL,
    acao TEXT NOT NULL,
    secao TEXT NOT NULL,
    detalhes TEXT,
    empresa TEXT
  )`);
}

function getDB(slug) {
  if (!slug) slug = 'nunesrocha';
  if (dbs[slug]) return dbs[slug];
  const dbFile = path.join(dataDir, slug + '.db');
  let dbInstance;
  if (fs.existsSync(dbFile)) { dbInstance = new SQL.Database(fs.readFileSync(dbFile)); }
  else { dbInstance = new SQL.Database(); }
  initDB(dbInstance);
  fs.writeFileSync(dbFile, Buffer.from(dbInstance.export()));
  dbs[slug] = { db: dbInstance, path: dbFile };
  return dbs[slug];
}

function persist(slug) { const e = getDB(slug); fs.writeFileSync(e.path, Buffer.from(e.db.export())); }
function query(slug, sql, params) { const s = getDB(slug).db.prepare(sql); if (params) s.bind(params); const r = []; while (s.step()) r.push(s.getAsObject()); s.free(); return r; }
function run(slug, sql, params) { getDB(slug).db.run(sql, params); persist(slug); }
function scalar(slug, sql, params) { const r = getDB(slug).db.exec(sql, params); return r[0]?.values[0][0] || 0; }

function getDbPath(slug) { return getDB(slug).path; }
function replaceDB(slug, buffer) {
  const e = getDB(slug);
  fs.writeFileSync(e.path, buffer);
  e.db = new SQL.Database(buffer);
}

module.exports = {
  getDbPath,
  replaceDB,
  run_raw: run,
  async init() {
    SQL = await initSqlJs();
    initUsersDB();
    const empresas = loadEmpresas();
    empresas.forEach(e => getDB(e.slug));
    return true;
  },

  // -- Empresas --
  getEmpresas() { return loadEmpresas(); },
  saveEmpresasList(list) { saveEmpresas(list); },
  addEmpresa(slug, nome) {
    const list = loadEmpresas();
    if (list.find(e => e.slug === slug)) return false;
    list.push({ slug, nome });
    saveEmpresas(list);
    getDB(slug); // create DB
    return true;
  },
  delEmpresa(slug) {
    if (slug === 'nunesrocha') return false; // protect default
    const list = loadEmpresas().filter(e => e.slug !== slug);
    saveEmpresas(list);
    const dbFile = path.join(dataDir, slug + '.db');
    if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
    delete dbs[slug];
    return true;
  },
  updateEmpresaCor(slug, cor) {
    const list = loadEmpresas();
    const emp = list.find(e => e.slug === slug);
    if (!emp) return false;
    emp.cor = cor;
    saveEmpresas(list);
    return true;
  },

  // -- Controle Fiscal --
  getFiscal(slug, mes) {
    if (mes) return query(slug, 'SELECT * FROM controle_fiscal WHERE data LIKE ? ORDER BY data DESC', [mes + '%']);
    return query(slug, 'SELECT * FROM controle_fiscal ORDER BY data DESC');
  },
  
  // -- VEÍCULOS --
  getVeiculos(slug) {
    return query(slug, 'SELECT * FROM veiculos ORDER BY nome');
  },
  addVeiculo(slug, item) {
    run(slug, 'INSERT INTO veiculos (id,nome,placa,km_atual,km_proxima_troca) VALUES (?,?,?,?,?)',
      [item.id, item.nome, item.placa, item.km_atual || 0, item.km_proxima_troca || 0]);
  },
  updateVeiculo(slug, id, fields) {
    const sets = [], vals = [];
    ['nome','placa','km_atual','km_proxima_troca'].forEach(k => {
      if (fields[k] !== undefined) { sets.push(k+'=?'); vals.push(fields[k]); }
    });
    if (sets.length) { vals.push(id); run(slug, 'UPDATE veiculos SET ' + sets.join(',') + ' WHERE id=?', vals); }
  },
  delVeiculo(slug, id) {
    run(slug, 'DELETE FROM veiculos WHERE id=?', [id]);
  },

  addFiscal(slug, item) {
    run(slug, 'INSERT INTO controle_fiscal (id,data,nota_entrada,nota_saida,banco_boleto,banco_deposito,banco_cartao,observacao) VALUES (?,?,?,?,?,?,?,?)',
      [item.id, item.data, item.nota_entrada || 0, item.nota_saida || 0, item.banco_boleto || 0, item.banco_deposito || 0, item.banco_cartao || 0, item.observacao || '']);
  },
  updateFiscal(slug, id, data) {
    const fields = Object.keys(data).map(k => k + '=?').join(',');
    run(slug, 'UPDATE controle_fiscal SET ' + fields + ' WHERE id=?', [...Object.values(data), id]);
  },
  delFiscal(slug, id) { run(slug, 'DELETE FROM controle_fiscal WHERE id=?', [id]); },

  // -- LEMBRETES --
  getLembretes(slug, username) {
    return query(slug, 'SELECT * FROM lembretes WHERE username=? ORDER BY concluido ASC, data_criacao DESC', [username]);
  },
  addLembrete(slug, lembrete) {
    run(slug, 'INSERT INTO lembretes (id,username,texto,concluido) VALUES (?,?,?,?)', 
      [lembrete.id, lembrete.username, lembrete.texto, 0]);
  },
  toggleLembrete(slug, id, concluido) {
    run(slug, 'UPDATE lembretes SET concluido=? WHERE id=?', [concluido ? 1 : 0, id]);
  },
  delLembrete(slug, id) {
    run(slug, 'DELETE FROM lembretes WHERE id=?', [id]);
  },

  // -- Acerto Financeiro --
  getAcerto(slug, mes) {
    if (mes) return query(slug, 'SELECT * FROM acerto WHERE data LIKE ? ORDER BY data', [mes + '%']);
    return query(slug, 'SELECT * FROM acerto ORDER BY data');
  },
  addAcerto(slug, item) {
    run(slug, 'INSERT INTO acerto (id,data,descricao,entrada,saida,categoria,recorrente,tipo_nota,origem_conta_pagar,fornecedor,veiculo,placa,km,localidade,condutor,a_chegar) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [item.id, item.data, item.descricao, item.entrada || 0, item.saida || 0, item.categoria, item.recorrente ? 1 : 0, item.tipo_nota || '', item.origem_conta_pagar || '', item.fornecedor || '', item.veiculo || '', item.placa || '', item.km || '', item.localidade || '', item.condutor || '', item.a_chegar ? 1 : 0]);
    
    // Atualizar KM do veiculo se for abastecimento e se veio o ID (enviado pelo frontend)
    if (item.categoria === 'Abastecimento' && item.veiculo_id && item.km) {
      const v = scalar(slug, 'SELECT km_atual FROM veiculos WHERE id=?', [item.veiculo_id]);
      const novoKm = parseFloat(item.km);
      if (v !== undefined && !isNaN(novoKm) && novoKm > v) {
        run(slug, 'UPDATE veiculos SET km_atual=? WHERE id=?', [novoKm, item.veiculo_id]);
      }
    }
  },
  delAcerto(slug, id) { run(slug, 'DELETE FROM acerto WHERE id=?', [id]); },
  acertoJaExiste(slug, contaId) {
    return scalar(slug, "SELECT COUNT(*) FROM acerto WHERE origem_conta_pagar=?", [contaId]) > 0;
  },
  updateAcerto(slug, id, fields) {
    const allowed = ['categoria','fornecedor','recorrente','tipo_nota','entrada','saida','origem_conta_pagar','data','descricao','veiculo','placa','km','localidade','condutor','a_chegar'];
    const sets = [], vals = [];
    allowed.forEach(k => {
      if (fields[k] !== undefined) {
        sets.push(k+'=?');
        vals.push((k === 'recorrente' || k === 'a_chegar') ? (fields[k] ? 1 : 0) : fields[k]);
      }
    });
    if (sets.length) { vals.push(id); run(slug, 'UPDATE acerto SET ' + sets.join(',') + ' WHERE id=?', vals); }
  },
  getAbastecimentos(slug, mes) {
    if (mes) return query(slug, "SELECT * FROM acerto WHERE categoria='Abastecimento' AND data LIKE ? ORDER BY data", [mes + '%']);
    return query(slug, "SELECT * FROM acerto WHERE categoria='Abastecimento' ORDER BY data");
  },
  getRecorrentes(slug, mes) {
    if (mes) return query(slug, 'SELECT * FROM acerto WHERE recorrente=1 AND data LIKE ? ORDER BY data', [mes + '%']);
    return query(slug, 'SELECT * FROM acerto WHERE recorrente=1 ORDER BY data');
  },
  getAcertoSummary(slug, mes) {
    const mp = mes ? mes + '%' : '%';
    const ent = scalar(slug, "SELECT COALESCE(SUM(entrada),0) FROM acerto WHERE data LIKE ?", [mp]);
    const sai = scalar(slug, "SELECT COALESCE(SUM(saida),0) FROM acerto WHERE data LIKE ?", [mp]);
    return { entrada: ent, saida: sai, lucro: ent - sai };
  },
  getCategoriasSummary(slug, mes) {
    const mp = mes ? mes + '%' : '%';
    return query(slug, "SELECT categoria, SUM(saida) as total FROM acerto WHERE data LIKE ? AND saida > 0 GROUP BY categoria ORDER BY total DESC", [mp]);
  },
  getFornecedoresSummary(slug, mes) {
    const mp = mes ? mes + '%' : '%';
    return query(slug, "SELECT COALESCE(NULLIF(fornecedor,''),'Sem Fornecedor') as fornecedor, SUM(saida) as total FROM acerto WHERE data LIKE ? AND saida > 0 GROUP BY fornecedor ORDER BY total DESC", [mp]);
  },

  // -- Contas a Pagar --
  getContasPagar(slug, mes) {
    if (mes) return query(slug, 'SELECT * FROM contas_pagar WHERE vencimento LIKE ? ORDER BY vencimento', [mes + '%']);
    return query(slug, 'SELECT * FROM contas_pagar ORDER BY vencimento');
  },
  addContaPagar(slug, item) {
    run(slug, 'INSERT INTO contas_pagar (id,vencimento,descricao,valor,recorrente,boleto_chegou,pago_por,categoria,tipo_nota,fornecedor,a_chegar,grupo_parcela) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      [item.id, item.vencimento, item.descricao, item.valor, item.recorrente ? 1 : 0, item.boleto_chegou ? 1 : 0, item.pago_por || '', item.categoria || 'Outros', item.tipo_nota || '', item.fornecedor || '', item.a_chegar ? 1 : 0, item.grupo_parcela || '']);
  },
  updateContaPagar(slug, id, fields) {
    const sets = [], vals = [];
    if (fields.boleto_chegou !== undefined) { sets.push('boleto_chegou=?'); vals.push(fields.boleto_chegou ? 1 : 0); }
    if (fields.pago_por !== undefined) { sets.push('pago_por=?'); vals.push(fields.pago_por); }
    if (fields.caixa_id !== undefined) { sets.push('caixa_id=?'); vals.push(parseInt(fields.caixa_id)); }
    if (fields.a_chegar !== undefined) { sets.push('a_chegar=?'); vals.push(fields.a_chegar ? 1 : 0); }
    if (fields.vencimento !== undefined) { sets.push('vencimento=?'); vals.push(fields.vencimento); }
    if (fields.descricao !== undefined) { sets.push('descricao=?'); vals.push(fields.descricao); }
    if (fields.valor !== undefined) { sets.push('valor=?'); vals.push(parseFloat(fields.valor)); }
    if (fields.categoria !== undefined) { sets.push('categoria=?'); vals.push(fields.categoria); }
    if (fields.fornecedor !== undefined) { sets.push('fornecedor=?'); vals.push(fields.fornecedor); }
    if (fields.recorrente !== undefined) { sets.push('recorrente=?'); vals.push(parseInt(fields.recorrente) ? 1 : 0); }
    if (fields.tipo_nota !== undefined) { sets.push('tipo_nota=?'); vals.push(fields.tipo_nota); }
    if (sets.length) { vals.push(id); run(slug, 'UPDATE contas_pagar SET ' + sets.join(',') + ' WHERE id=?', vals); }
  },
  marcarChegou(slug, grupoParcela) {
    run(slug, 'UPDATE contas_pagar SET a_chegar=0 WHERE grupo_parcela=?', [grupoParcela]);
  },
  marcarAChegar(slug, grupoParcela) {
    run(slug, 'UPDATE contas_pagar SET a_chegar=1 WHERE grupo_parcela=?', [grupoParcela]);
  },
  getAChegar(slug) {
    return query(slug, `
      SELECT id, vencimento, descricao, valor, fornecedor, 'contas_pagar' as origem FROM contas_pagar WHERE a_chegar=1
      UNION ALL
      SELECT id, data as vencimento, descricao, saida as valor, fornecedor, 'acerto' as origem FROM acerto WHERE a_chegar=1
      ORDER BY vencimento
    `);
  },
  delContaPagar(slug, id) { run(slug, 'DELETE FROM contas_pagar WHERE id=?', [id]); },
  getContaPagarById(slug, id) { const r = query(slug, 'SELECT * FROM contas_pagar WHERE id=?', [id]); return r[0]; },
  getAcertoById(slug, id) { const r = query(slug, 'SELECT * FROM acerto WHERE id=?', [id]); return r[0]; },
  getContasPendentes(slug, hoje) {
    return query(slug, "SELECT * FROM contas_pagar WHERE vencimento <= ? AND (pago_por = '' OR pago_por = 'A Pagar' OR pago_por IS NULL) ORDER BY vencimento", [hoje]);
  },
  getContasPendentesAte(slug, limite) {
    return query(slug, "SELECT * FROM contas_pagar WHERE vencimento <= ? AND (pago_por = '' OR pago_por = 'A Pagar' OR pago_por IS NULL) ORDER BY vencimento", [limite]);
  },

  // -- Lancamentos (drogaria) --
  getLancamentos(slug, origem, mes) {
    if (mes) return query(slug, 'SELECT * FROM lancamentos WHERE origem=? AND data LIKE ? ORDER BY data', [origem, mes + '%']);
    return query(slug, 'SELECT * FROM lancamentos WHERE origem=? ORDER BY data', [origem]);
  },
  addLancamento(slug, item) { run(slug, 'INSERT INTO lancamentos (id,origem,data,tipo,descricao,valor,categoria) VALUES (?,?,?,?,?,?,?)', [item.id, item.origem, item.data, item.tipo, item.descricao, item.valor, item.categoria]); },
  delLancamento(slug, id) { run(slug, 'DELETE FROM lancamentos WHERE id=?', [id]); },
  updateLancamento(slug, id, fields) {
    const allowed = ['data','tipo','descricao','valor','categoria'];
    const sets = [], vals = [];
    allowed.forEach(k => {
      if (fields[k] !== undefined) { sets.push(k+'=?'); vals.push(fields[k]); }
    });
    if (sets.length) { vals.push(id); run(slug, 'UPDATE lancamentos SET ' + sets.join(',') + ' WHERE id=?', vals); }
  },

  // -- Cheques --
  getCheques(slug, mes) { if (mes) return query(slug, 'SELECT * FROM cheques WHERE data LIKE ? ORDER BY data', [mes + '%']); return query(slug, 'SELECT * FROM cheques ORDER BY data'); },
  addCheque(slug, item) { run(slug, 'INSERT INTO cheques (id,numero,data,cliente,valor,taxa,dias,lucro,bom_para,destino,origem_dinheiro,vencimento,status,dono_cheque,juros_antecipado,taxa_extra) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [item.id, item.numero || '', item.data, item.cliente, item.valor, item.taxa, item.dias || 30, item.lucro, item.bom_para || '', item.destino || '', item.origem_dinheiro, item.vencimento, item.status, item.dono_cheque || '', item.juros_antecipado ? 1 : 0, item.taxa_extra || 0]); },
  delCheque(slug, id) { run(slug, 'DELETE FROM cheques WHERE id=?', [id]); },
  compensarCheque(slug, id) { run(slug, "UPDATE cheques SET status='compensado' WHERE id=?", [id]); return query(slug, 'SELECT * FROM cheques WHERE id=?', [id])[0]; },
  updateChequeDestino(slug, id, destino) { if(destino) run(slug, "UPDATE cheques SET destino=?, status='retirado' WHERE id=?", [destino, id]); else run(slug, 'UPDATE cheques SET destino=? WHERE id=?', [destino, id]); },
  searchCheques(slug, termo) { const t='%'+termo+'%'; return query(slug, 'SELECT * FROM cheques WHERE numero LIKE ? OR cliente LIKE ? OR dono_cheque LIKE ? OR destino LIKE ? OR CAST(valor AS TEXT) LIKE ? ORDER BY data DESC', [t,t,t,t,t]); },
  updateCheque(slug, id, fields) {
    const allowed = ['numero','data','cliente','dono_cheque','valor','taxa','dias','bom_para','vencimento','origem_dinheiro','status','juros_antecipado','taxa_extra'];
    const sets = [], vals = [];
    allowed.forEach(k => {
      if (fields[k] !== undefined) {
        sets.push(k+'=?');
        if (k === 'juros_antecipado') vals.push(fields[k] ? 1 : 0);
        else if (['valor','taxa','taxa_extra'].includes(k)) vals.push(parseFloat(fields[k]));
        else if (k === 'dias') vals.push(parseInt(fields[k]));
        else vals.push(fields[k]);
      }
    });
    // Recalculate lucro if valor, taxa, dias or taxa_extra changed
    const v = fields.valor !== undefined ? parseFloat(fields.valor) : null;
    const t = fields.taxa !== undefined ? parseFloat(fields.taxa) : null;
    const d = fields.dias !== undefined ? parseInt(fields.dias) : null;
    const te = fields.taxa_extra !== undefined ? parseFloat(fields.taxa_extra) : null;
    if (v !== null || t !== null || d !== null || te !== null) {
      // Get current values for fields not being updated
      const current = query(slug, 'SELECT valor,taxa,dias,taxa_extra FROM cheques WHERE id=?', [id])[0];
      if (current) {
        const finalV = v !== null ? v : current.valor;
        const finalT = t !== null ? t : current.taxa;
        const finalD = d !== null ? d : current.dias;
        const finalTE = te !== null ? te : (current.taxa_extra || 0);
        const lucro = finalV * finalT / 100 * finalD / 30 + finalTE;
        sets.push('lucro=?'); vals.push(lucro);
      }
    }
    if (sets.length) { vals.push(id); run(slug, 'UPDATE cheques SET ' + sets.join(',') + ' WHERE id=?', vals); }
  },

  // -- Conta Dono --
  getContaDono(slug, mes) { if (mes) return query(slug, 'SELECT * FROM conta_dono WHERE data LIKE ? ORDER BY data', [mes + '%']); return query(slug, 'SELECT * FROM conta_dono ORDER BY data'); },
  addContaDono(slug, item) { run(slug, 'INSERT INTO conta_dono (id,data,tipo,descricao,valor,origem_cheque) VALUES (?,?,?,?,?,?)', [item.id, item.data, item.tipo, item.descricao, item.valor, item.origem_cheque || '']); },
  delContaDono(slug, id) { run(slug, 'DELETE FROM conta_dono WHERE id=?', [id]); },
  delContaDonoByCheque(slug, chequeId) { run(slug, 'DELETE FROM conta_dono WHERE origem_cheque=?', [chequeId]); },
  updateContaDono(slug, id, fields) {
    const allowed = ['data','tipo','descricao','valor'];
    const sets = [], vals = [];
    allowed.forEach(k => {
      if (fields[k] !== undefined) { sets.push(k+'=?'); vals.push(fields[k]); }
    });
    if (sets.length) { vals.push(id); run(slug, 'UPDATE conta_dono SET ' + sets.join(',') + ' WHERE id=?', vals); }
  },

  // -- Colaboradores --
  getColaboradores(slug) { return query(slug, 'SELECT * FROM colaboradores ORDER BY id'); },
  addColaborador(slug, nome, percentual) { run(slug, 'INSERT INTO colaboradores (nome,percentual) VALUES (?,?)', [nome, percentual]); },
  delColaborador(slug, id) { run(slug, 'DELETE FROM colaboradores WHERE id=?', [id]); },

  // -- Clear All --
  clearAcerto(slug) { run(slug, 'DELETE FROM acerto'); },
  clearFat(slug) { run(slug, "DELETE FROM acerto WHERE recorrente=1"); },
  clearContasPagar(slug) { run(slug, 'DELETE FROM contas_pagar'); },
  clearDrogaria(slug) { run(slug, "DELETE FROM lancamentos WHERE origem='drogaria'"); },
  clearCheques(slug) { run(slug, 'DELETE FROM cheques'); },
  clearContaDono(slug) { run(slug, 'DELETE FROM conta_dono'); },

  // -- Caixas --
  getCaixas(slug) { return query(slug, 'SELECT * FROM caixas ORDER BY nome'); },
  addCaixa(slug, nome, saldo) { run(slug, 'INSERT INTO caixas (nome,saldo) VALUES (?,?)', [nome, saldo || 0]); },
  updateCaixaSaldo(slug, id, saldo) { run(slug, 'UPDATE caixas SET saldo=? WHERE id=?', [saldo, id]); },
  debitCaixa(slug, id, valor) { run(slug, 'UPDATE caixas SET saldo=saldo-? WHERE id=?', [valor, id]); },
  delCaixa(slug, id) { run(slug, 'DELETE FROM caixas WHERE id=?', [id]); },
  clearCaixas(slug) { run(slug, 'DELETE FROM caixas'); },

  // -- Movimentação --
  getMovimentacao(slug, mes) {
    if (mes) return query(slug, 'SELECT * FROM movimentacao WHERE data LIKE ? ORDER BY data', [mes + '%']);
    return query(slug, 'SELECT * FROM movimentacao ORDER BY data');
  },
  addMovimentacao(slug, item) {
    run(slug, 'INSERT INTO movimentacao (id,data,descricao,entrada,saida,diferenca) VALUES (?,?,?,?,?,?)',
      [item.id, item.data, item.descricao, item.entrada || 0, item.saida || 0, item.diferenca || 0]);
  },
  updateMovimentacaoDiferenca(slug, id, diferenca) {
    run(slug, 'UPDATE movimentacao SET diferenca=? WHERE id=?', [diferenca, id]);
  },
  updateMovimentacao(slug, id, fields) {
    const allowed = ['data','descricao','entrada','saida','diferenca'];
    const sets = [], vals = [];
    allowed.forEach(k => {
      if (fields[k] !== undefined) {
        sets.push(k+'=?');
        if (['entrada','saida','diferenca'].includes(k)) vals.push(parseFloat(fields[k]));
        else vals.push(fields[k]);
      }
    });
    if (sets.length) { vals.push(id); run(slug, 'UPDATE movimentacao SET ' + sets.join(',') + ' WHERE id=?', vals); }
  },
  delMovimentacao(slug, id) { run(slug, 'DELETE FROM movimentacao WHERE id=?', [id]); },
  clearMovimentacao(slug) { run(slug, 'DELETE FROM movimentacao'); run(slug, 'DELETE FROM mov_config'); },
  getMovConfig(slug, mes) {
    const r = query(slug, 'SELECT * FROM mov_config WHERE mes=?', [mes]);
    return r[0] || { mes, saldo_anterior: 0, diferenca: 0 };
  },
  setMovConfig(slug, mes, saldo_anterior, diferenca) {
    const exists = query(slug, 'SELECT COUNT(*) as c FROM mov_config WHERE mes=?', [mes])[0]?.c;
    if (exists) run(slug, 'UPDATE mov_config SET saldo_anterior=?, diferenca=? WHERE mes=?', [saldo_anterior, diferenca, mes]);
    else run(slug, 'INSERT INTO mov_config (mes, saldo_anterior, diferenca) VALUES (?,?,?)', [mes, saldo_anterior, diferenca]);
  },

  // -- Config --
  getConfig(slug) {
    const rows = query(slug, 'SELECT * FROM configuracoes'); const cfg = {};
    rows.forEach(r => { cfg[r.chave] = r.valor; });
    return { ...cfg, pctAdmin: parseFloat(cfg.pctAdmin || 23), pctDono: parseFloat(cfg.pctDono || 36), pctReserva: parseFloat(cfg.pctReserva || 30), categoriasLoja: JSON.parse(cfg.categoriasLoja || '[]'), categoriasDrog: JSON.parse(cfg.categoriasDrog || '[]'), fornecedores: JSON.parse(cfg.fornecedores || '[]') };
  },
  updateConfig(slug, key, value) { run(slug, 'INSERT OR REPLACE INTO configuracoes (chave,valor) VALUES (?,?)', [key, typeof value === 'string' ? value : JSON.stringify(value)]); },

  // -- Dashboard --
  getSummary(slug, mes) {
    const mp = mes ? mes + '%' : '%';
    const acerto = this.getAcertoSummary(slug, mes);
    const drogEnt = scalar(slug, "SELECT COALESCE(SUM(valor),0) FROM lancamentos WHERE origem='drogaria' AND data LIKE ? AND tipo='entrada'", [mp]);
    const drogSai = scalar(slug, "SELECT COALESCE(SUM(valor),0) FROM lancamentos WHERE origem='drogaria' AND data LIKE ? AND tipo='saida'", [mp]);
    const chqLucro = scalar(slug, "SELECT COALESCE(SUM(lucro),0) FROM cheques WHERE data LIKE ?", [mp]);
    const donoDeb = scalar(slug, "SELECT COALESCE(SUM(valor),0) FROM conta_dono WHERE data LIKE ? AND tipo='debito'", [mp]);
    const donoCred = scalar(slug, "SELECT COALESCE(SUM(valor),0) FROM conta_dono WHERE data LIKE ? AND tipo='credito'", [mp]);
    const cpPago = scalar(slug, "SELECT COALESCE(SUM(valor),0) FROM contas_pagar WHERE vencimento LIKE ? AND pago_por != '' AND pago_por != 'A Pagar'", [mp]);
    const cpPend = scalar(slug, "SELECT COALESCE(SUM(valor),0) FROM contas_pagar WHERE vencimento LIKE ? AND (pago_por = '' OR pago_por = 'A Pagar' OR pago_por IS NULL)", [mp]);
    const movEnt = scalar(slug, "SELECT COALESCE(SUM(entrada),0) FROM movimentacao WHERE data LIKE ?", [mp]);
    const movSai = scalar(slug, "SELECT COALESCE(SUM(saida),0) FROM movimentacao WHERE data LIKE ?", [mp]);
    return { lojaEnt: acerto.entrada, lojaSai: acerto.saida, drogEnt, drogSai, chqLucro, donoDeb, donoCred, cpPago, cpPend, movEnt, movSai };
  },

  // -- Usuários --
  getUsuarios() { return queryUsers('SELECT id,username,nome,role,permissoes,ativo FROM usuarios ORDER BY id'); },
  addUsuario(username, senha, nome, role, permissoes) {
    try { runUsers('INSERT INTO usuarios (username,senha_hash,nome,role,permissoes,ativo) VALUES (?,?,?,?,?,1)', [username, hashSenha(senha), nome, role || 'user', JSON.stringify(permissoes || [])]); return true; }
    catch(e) { return false; }
  },
  updateUsuario(id, fields) {
    const sets = [], vals = [];
    if (fields.username !== undefined) { sets.push('username=?'); vals.push(fields.username); }
    if (fields.nome !== undefined) { sets.push('nome=?'); vals.push(fields.nome); }
    if (fields.senha) { sets.push('senha_hash=?'); vals.push(hashSenha(fields.senha)); }
    if (fields.permissoes !== undefined) { sets.push('permissoes=?'); vals.push(JSON.stringify(fields.permissoes)); }
    if (fields.ativo !== undefined) { sets.push('ativo=?'); vals.push(fields.ativo ? 1 : 0); }
    if (sets.length) { vals.push(id); runUsers('UPDATE usuarios SET ' + sets.join(',') + ' WHERE id=?', vals); }
  },
  delUsuario(id) {
    const user = queryUsers('SELECT role FROM usuarios WHERE id=?', [id])[0];
    if (user && user.role === 'admin') return false;
    runUsers('DELETE FROM usuarios WHERE id=?', [id]); return true;
  },
  authenticateUser(username, senha) {
    const users = queryUsers('SELECT * FROM usuarios WHERE username=? AND ativo=1', [username]);
    if (!users.length) return null;
    const u = users[0];
    if (u.senha_hash !== hashSenha(senha)) return null;
    return { id: u.id, username: u.username, nome: u.nome, role: u.role, permissoes: JSON.parse(u.permissoes || '[]') };
  },

  // -- Auditoria --
  addAuditLog(slug, usuario, acao, secao, detalhes) {
    const data = new Date().toISOString();
    run(slug, 'INSERT INTO auditoria (data, usuario, acao, secao, detalhes, empresa) VALUES (?,?,?,?,?,?)', [data, usuario, acao, secao, detalhes || '', slug]);
  },
  getAuditLogs(slug, filtros) {
    let sql = 'SELECT * FROM auditoria WHERE 1=1';
    const params = [];
    if (filtros && filtros.usuario) { sql += ' AND usuario=?'; params.push(filtros.usuario); }
    if (filtros && filtros.secao) { sql += ' AND secao=?'; params.push(filtros.secao); }
    if (filtros && filtros.dataInicio) { sql += ' AND data>=?'; params.push(filtros.dataInicio); }
    if (filtros && filtros.dataFim) { sql += ' AND data<=?'; params.push(filtros.dataFim + 'T23:59:59'); }
    sql += ' ORDER BY data DESC LIMIT 500';
    return query(slug, sql, params);
  }
};
