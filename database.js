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
  try { dbInstance.run('ALTER TABLE contas_pagar ADD COLUMN linha_digitavel TEXT DEFAULT ""'); } catch(e) {}
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
  // Tabela Somas (rascunhos compartilhados)
  dbInstance.run(`CREATE TABLE IF NOT EXISTS somas (
    id TEXT PRIMARY KEY,
    titulo TEXT NOT NULL,
    criado_por TEXT NOT NULL,
    data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  dbInstance.run(`CREATE TABLE IF NOT EXISTS soma_itens (
    id TEXT PRIMARY KEY,
    soma_id TEXT NOT NULL,
    descricao TEXT DEFAULT '',
    valor REAL DEFAULT 0,
    ordem INTEGER DEFAULT 0,
    FOREIGN KEY (soma_id) REFERENCES somas(id)
  )`);
  // Folha de Pagamento
  dbInstance.run(`CREATE TABLE IF NOT EXISTS folha_pagamento (
    id TEXT PRIMARY KEY,
    colaborador_id INTEGER NOT NULL,
    mes TEXT NOT NULL,
    salario REAL DEFAULT 0,
    premio REAL DEFAULT 0,
    valloo REAL DEFAULT 0,
    adicional REAL DEFAULT 0,
    ajuda_custos REAL DEFAULT 0,
    com_caixa REAL DEFAULT 0,
    extra REAL DEFAULT 0,
    mont_cart REAL DEFAULT 0,
    metas REAL DEFAULT 0,
    outros REAL DEFAULT 0,
    fgts REAL DEFAULT 0,
    desconto REAL DEFAULT 0,
    observacao TEXT DEFAULT ''
  )`);
  // Holerites importados
  dbInstance.run(`CREATE TABLE IF NOT EXISTS holerites (
    id TEXT PRIMARY KEY,
    colaborador_id INTEGER,
    mes TEXT NOT NULL,
    nome_pdf TEXT NOT NULL,
    cadastro TEXT DEFAULT '',
    nome TEXT NOT NULL,
    cpf TEXT DEFAULT '',
    cargo TEXT DEFAULT '',
    cbo TEXT DEFAULT '',
    data_admissao TEXT DEFAULT '',
    salario_base REAL DEFAULT 0,
    total_proventos REAL DEFAULT 0,
    total_descontos REAL DEFAULT 0,
    liquido REAL DEFAULT 0,
    fgts_mes REAL DEFAULT 0,
    inss REAL DEFAULT 0,
    irrf REAL DEFAULT 0,
    sal_cont_inss REAL DEFAULT 0,
    bas_calc_fgts REAL DEFAULT 0,
    faixa REAL DEFAULT 0,
    dependentes INTEGER DEFAULT 0,
    proventos_json TEXT DEFAULT '[]',
    descontos_json TEXT DEFAULT '[]',
    data_importacao DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  // Migrations colaboradores
  try { dbInstance.run('ALTER TABLE colaboradores ADD COLUMN cpf TEXT DEFAULT ""'); } catch(e) {}
  try { dbInstance.run('ALTER TABLE colaboradores ADD COLUMN cargo TEXT DEFAULT ""'); } catch(e) {}
  try { dbInstance.run('ALTER TABLE colaboradores ADD COLUMN cbo TEXT DEFAULT ""'); } catch(e) {}
  try { dbInstance.run('ALTER TABLE colaboradores ADD COLUMN data_admissao TEXT DEFAULT ""'); } catch(e) {}
  try { dbInstance.run('ALTER TABLE colaboradores ADD COLUMN salario_base REAL DEFAULT 0'); } catch(e) {}
  try { dbInstance.run('ALTER TABLE colaboradores ADD COLUMN departamento TEXT DEFAULT ""'); } catch(e) {}
  try { dbInstance.run('ALTER TABLE colaboradores ADD COLUMN registrado INTEGER DEFAULT 1'); } catch(e) {}
  try { dbInstance.run('ALTER TABLE colaboradores ADD COLUMN ativo INTEGER DEFAULT 1'); } catch(e) {}
  try { dbInstance.run('ALTER TABLE colaboradores ADD COLUMN cadastro TEXT DEFAULT ""'); } catch(e) {}
  try { dbInstance.run('ALTER TABLE colaboradores ADD COLUMN dependentes INTEGER DEFAULT 0'); } catch(e) {}
  try { dbInstance.run('ALTER TABLE colaboradores ADD COLUMN faixa REAL DEFAULT 0'); } catch(e) {}
  try { dbInstance.run('ALTER TABLE colaboradores ADD COLUMN na_folha INTEGER DEFAULT 1'); } catch(e) {}
  try { dbInstance.run('ALTER TABLE colaboradores ADD COLUMN rg TEXT DEFAULT ""'); } catch(e) {}
  try { dbInstance.run('ALTER TABLE colaboradores ADD COLUMN recibo_labels TEXT DEFAULT "{}"'); } catch(e) {}
  try { dbInstance.run('ALTER TABLE colaboradores ADD COLUMN grupo TEXT DEFAULT ""'); } catch(e) {}
  try { dbInstance.run('ALTER TABLE colaboradores ADD COLUMN verbas_json TEXT DEFAULT "[]"'); } catch(e) {}
  // Colaboradores de exemplo (comissões do painel) não entram na folha de pagamento
  try { dbInstance.run("UPDATE colaboradores SET na_folha=0 WHERE nome LIKE 'Colaborador %' AND (cadastro='' OR cadastro IS NULL)"); } catch(e) {}
  // Catálogo de verbas da folha (salários/comissões/descontos)
  dbInstance.run(`CREATE TABLE IF NOT EXISTS verbas (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    tipo TEXT DEFAULT 'provento',
    ordem INTEGER DEFAULT 0
  )`);
  // Valores da folha por colaborador/mês/verba
  dbInstance.run(`CREATE TABLE IF NOT EXISTS folha_valores (
    id TEXT PRIMARY KEY,
    colaborador_id INTEGER NOT NULL,
    mes TEXT NOT NULL,
    verba_id TEXT NOT NULL,
    valor REAL DEFAULT 0
  )`);
  const verbaCount = dbInstance.exec("SELECT COUNT(*) FROM verbas")[0]?.values[0][0] || 0;
  if (verbaCount === 0) {
    const seed = [
      ['vb_salario', 'Salário', 'provento', 1],
      ['vb_acerto', 'Acerto do mês', 'provento', 2],
      ['vb_premio', 'Prêmio', 'provento', 3],
      ['vb_valloo', 'Valloo', 'provento', 4],
      ['vb_adicional', 'Adicional', 'provento', 5],
      ['vb_ajuda', 'Ajuda de custo', 'provento', 6],
      ['vb_caixa', 'Caixa', 'provento', 7],
      ['vb_metas', 'Metas', 'provento', 8],
      ['vb_acima', 'Acima da meta', 'provento', 9],
      ['vb_cartoes', 'Vendas cartões/à vista', 'provento', 10],
      ['vb_montmoveis', 'Comissão montagem de móveis', 'provento', 11],
      ['vb_montantenas', 'Comissão montagem de antenas', 'provento', 12],
      ['vb_extradrog', 'Extra Drogaria', 'provento', 13],
      ['vb_comgeral', 'Comissão geral', 'provento', 14],
      ['vb_supervisao', 'Supervisão', 'provento', 15],
      ['vb_horaextra', 'Hora extra', 'provento', 16],
      ['vb_bonus', 'Bônus', 'provento', 17],
      ['vb_outros', 'Outros', 'provento', 18],
      ['vb_estorno', 'Estorno', 'desconto', 90],
      ['vb_fgts', 'INSS', 'desconto', 91],
    ];
    for (const v of seed) dbInstance.run('INSERT INTO verbas (id,nome,tipo,ordem) VALUES (?,?,?,?)', v);
  }
  // Correção: a verba criada como "FGTS" na verdade é o desconto de INSS
  try { dbInstance.run("UPDATE verbas SET nome='INSS' WHERE id='vb_fgts' AND nome='FGTS'"); } catch(e) {}
  // Empréstimos consignados dos colaboradores (controle/lembrete)
  dbInstance.run(`CREATE TABLE IF NOT EXISTS emprestimos (
    id TEXT PRIMARY KEY,
    colaborador_id INTEGER NOT NULL,
    descricao TEXT DEFAULT 'Empréstimo Crédito do Trabalhador',
    contrato TEXT DEFAULT '',
    banco TEXT DEFAULT '',
    valor_parcela REAL DEFAULT 0,
    total_parcelas INTEGER DEFAULT 0,
    parcela_atual INTEGER DEFAULT 0,
    mes_referencia TEXT DEFAULT '',
    status TEXT DEFAULT 'ativo',
    observacao TEXT DEFAULT '',
    data_cadastro DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  // Migração única: folha_pagamento (colunas fixas) -> folha_valores (flexível)
  const jaMigrou = dbInstance.exec("SELECT COUNT(*) FROM configuracoes WHERE chave='folha_migrada_v2'")[0]?.values[0][0] || 0;
  if (!jaMigrou) {
    try {
      const mapa = { salario: 'vb_salario', premio: 'vb_premio', valloo: 'vb_valloo', adicional: 'vb_adicional', ajuda_custos: 'vb_ajuda', com_caixa: 'vb_caixa', extra: 'vb_acima', mont_cart: 'vb_cartoes', metas: 'vb_metas', outros: 'vb_outros', fgts: 'vb_fgts', desconto: 'vb_estorno' };
      const rows = dbInstance.exec('SELECT id, colaborador_id, mes, salario, premio, valloo, adicional, ajuda_custos, com_caixa, extra, mont_cart, metas, outros, fgts, desconto FROM folha_pagamento');
      const verbasPorColab = {};
      if (rows[0]) {
        const cols = rows[0].columns;
        for (const vals of rows[0].values) {
          const r = {}; cols.forEach((c, i) => r[c] = vals[i]);
          for (const [campo, verbaId] of Object.entries(mapa)) {
            const v = parseFloat(r[campo]) || 0;
            if (v !== 0) {
              const fvId = 'fv_' + r.id + '_' + campo;
              dbInstance.run('INSERT OR IGNORE INTO folha_valores (id,colaborador_id,mes,verba_id,valor) VALUES (?,?,?,?,?)', [fvId, r.colaborador_id, r.mes, verbaId, v]);
              (verbasPorColab[r.colaborador_id] = verbasPorColab[r.colaborador_id] || new Set()).add(verbaId);
            }
          }
        }
      }
      // Preencher verbas_json dos colaboradores que ainda não têm
      for (const [colabId, setV] of Object.entries(verbasPorColab)) {
        const cur = dbInstance.exec('SELECT verbas_json FROM colaboradores WHERE id=' + parseInt(colabId))[0]?.values[0][0] || '[]';
        if (!cur || cur === '[]') dbInstance.run('UPDATE colaboradores SET verbas_json=? WHERE id=?', [JSON.stringify([...setV]), parseInt(colabId)]);
      }
      dbInstance.run("INSERT OR REPLACE INTO configuracoes (chave,valor) VALUES ('folha_migrada_v2','1')");
    } catch (e) { console.error('Erro migração folha v2:', e.message); }
  }
  // Notas recebidas via SEFAZ (emitidas contra o CNPJ)
  dbInstance.run(`CREATE TABLE IF NOT EXISTS notas_recebidas (
    id TEXT PRIMARY KEY,
    chave TEXT UNIQUE,
    nsu TEXT DEFAULT '',
    tipo TEXT DEFAULT 'resumo',
    numero TEXT DEFAULT '',
    emitente TEXT DEFAULT '',
    emitente_cnpj TEXT DEFAULT '',
    valor REAL DEFAULT 0,
    data_emissao TEXT DEFAULT '',
    status TEXT DEFAULT 'nova',
    manifestada INTEGER DEFAULT 0,
    duplicatas_json TEXT DEFAULT '[]',
    itens_json TEXT DEFAULT '[]',
    xml TEXT DEFAULT '',
    data_recebimento DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  try { dbInstance.run('ALTER TABLE notas_recebidas ADD COLUMN forma_pagamento TEXT DEFAULT ""'); } catch(e) {}
  try { dbInstance.run('ALTER TABLE notas_recebidas ADD COLUMN pagamentos_json TEXT DEFAULT "[]"'); } catch(e) {}
  // Cadastro de fornecedores (alimentado pelas NF-e + manual)
  dbInstance.run(`CREATE TABLE IF NOT EXISTS fornecedores_cad (
    id TEXT PRIMARY KEY,
    cnpj TEXT UNIQUE,
    razao TEXT DEFAULT '',
    fantasia TEXT DEFAULT '',
    ie TEXT DEFAULT '',
    telefone TEXT DEFAULT '',
    email TEXT DEFAULT '',
    responsavel TEXT DEFAULT '',
    endereco TEXT DEFAULT '',
    municipio TEXT DEFAULT '',
    uf TEXT DEFAULT '',
    cep TEXT DEFAULT '',
    observacao TEXT DEFAULT '',
    origem TEXT DEFAULT 'manual',
    data_cadastro DATETIME DEFAULT CURRENT_TIMESTAMP
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
  const inst = new SQL.Database(buffer);
  initDB(inst); // aplica migrações no banco restaurado (pode vir de versão antiga)
  e.db = inst;
  fs.writeFileSync(e.path, Buffer.from(inst.export()));
}

module.exports = {
  getDbPath,
  replaceDB,
  reloadUsersDB() { initUsersDB(); },
  getDataDir() { return dataDir; },
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
    if (mes) return query(slug, 'SELECT * FROM acerto WHERE data LIKE ? ORDER BY data DESC', [mes + '%']);
    return query(slug, 'SELECT * FROM acerto ORDER BY data DESC');
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
    if (mes) return query(slug, "SELECT * FROM acerto WHERE categoria='Abastecimento' AND data LIKE ? ORDER BY data DESC", [mes + '%']);
    return query(slug, "SELECT * FROM acerto WHERE categoria='Abastecimento' ORDER BY data DESC");
  },
  getRecorrentes(slug, mes) {
    if (mes) return query(slug, 'SELECT * FROM acerto WHERE recorrente=1 AND data LIKE ? ORDER BY data DESC', [mes + '%']);
    return query(slug, 'SELECT * FROM acerto WHERE recorrente=1 ORDER BY data DESC');
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
    if (mes) return query(slug, 'SELECT * FROM contas_pagar WHERE vencimento LIKE ? ORDER BY vencimento DESC', [mes + '%']);
    return query(slug, 'SELECT * FROM contas_pagar ORDER BY vencimento DESC');
  },
  addContaPagar(slug, item) {
    run(slug, 'INSERT INTO contas_pagar (id,vencimento,descricao,valor,recorrente,boleto_chegou,pago_por,categoria,tipo_nota,fornecedor,a_chegar,grupo_parcela,linha_digitavel) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [item.id, item.vencimento, item.descricao, item.valor, item.recorrente ? 1 : 0, item.boleto_chegou ? 1 : 0, item.pago_por || '', item.categoria || 'Outros', item.tipo_nota || '', item.fornecedor || '', item.a_chegar ? 1 : 0, item.grupo_parcela || '', item.linha_digitavel || '']);
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
  getContasPagarByGrupo(slug, grupo) {
    return query(slug, 'SELECT * FROM contas_pagar WHERE grupo_parcela=? ORDER BY vencimento', [grupo]);
  },
  delContasPagarMulti(slug, ids) {
    ids.forEach(id => run(slug, 'DELETE FROM contas_pagar WHERE id=?', [id]));
    return ids.length;
  },
  delContasPagarGrupo(slug, grupo) {
    const count = query(slug, 'SELECT COUNT(*) as c FROM contas_pagar WHERE grupo_parcela=?', [grupo])[0]?.c || 0;
    run(slug, 'DELETE FROM contas_pagar WHERE grupo_parcela=?', [grupo]);
    return count;
  },
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
    if (mes) return query(slug, 'SELECT * FROM lancamentos WHERE origem=? AND data LIKE ? ORDER BY data DESC', [origem, mes + '%']);
    return query(slug, 'SELECT * FROM lancamentos WHERE origem=? ORDER BY data DESC', [origem]);
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
  getCheques(slug, mes) { if (mes) return query(slug, 'SELECT * FROM cheques WHERE data LIKE ? ORDER BY data DESC', [mes + '%']); return query(slug, 'SELECT * FROM cheques ORDER BY data DESC'); },
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
  getContaDono(slug, mes) { if (mes) return query(slug, 'SELECT * FROM conta_dono WHERE data LIKE ? ORDER BY data DESC', [mes + '%']); return query(slug, 'SELECT * FROM conta_dono ORDER BY data DESC'); },
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
  getColaboradores(slug) { return query(slug, 'SELECT * FROM colaboradores ORDER BY nome'); },
  addColaborador(slug, data) {
    run(slug, 'INSERT INTO colaboradores (nome,percentual,cpf,cargo,cbo,data_admissao,salario_base,departamento,registrado,ativo,cadastro,dependentes,faixa,rg) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [data.nome, data.percentual||0, data.cpf||'', data.cargo||'', data.cbo||'', data.data_admissao||'', data.salario_base||0, data.departamento||'', data.registrado!==undefined?data.registrado?1:0:1, data.ativo!==undefined?data.ativo?1:0:1, data.cadastro||'', data.dependentes||0, data.faixa||0, data.rg||'']);
    const r = query(slug, 'SELECT MAX(id) as id FROM colaboradores');
    return r[0] ? r[0].id : null;
  },
  updateColaborador(slug, id, fields) {
    const allowed = ['nome','percentual','cpf','cargo','cbo','data_admissao','salario_base','departamento','registrado','ativo','cadastro','dependentes','faixa','na_folha','rg','recibo_labels','grupo','verbas_json'];
    const sets = [], vals = [];
    for (const [k,v] of Object.entries(fields)) { if (allowed.includes(k)) { sets.push(k+'=?'); vals.push(v); } }
    if (sets.length) { vals.push(id); run(slug, 'UPDATE colaboradores SET '+sets.join(',')+' WHERE id=?', vals); }
  },
  delColaborador(slug, id) { run(slug, 'DELETE FROM colaboradores WHERE id=?', [id]); },
  getColaboradorById(slug, id) { const r = query(slug, 'SELECT * FROM colaboradores WHERE id=?', [id]); return r[0] || null; },
  findColaboradorByNome(slug, nome) {
    const rows = query(slug, 'SELECT * FROM colaboradores WHERE UPPER(TRIM(nome))=UPPER(TRIM(?))', [nome]);
    return rows[0] || null;
  },

  // -- Folha de Pagamento --
  getFolha(slug, mes) { return query(slug, 'SELECT f.*, c.nome as colab_nome FROM folha_pagamento f JOIN colaboradores c ON f.colaborador_id=c.id WHERE f.mes=? ORDER BY c.nome', [mes]); },
  getFolhaById(slug, id) { const r = query(slug, 'SELECT * FROM folha_pagamento WHERE id=?', [id]); return r[0]||null; },
  addFolha(slug, data) {
    run(slug, 'INSERT INTO folha_pagamento (id,colaborador_id,mes,salario,premio,valloo,adicional,ajuda_custos,com_caixa,extra,mont_cart,metas,outros,fgts,desconto,observacao) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [data.id, data.colaborador_id, data.mes, data.salario||0, data.premio||0, data.valloo||0, data.adicional||0, data.ajuda_custos||0, data.com_caixa||0, data.extra||0, data.mont_cart||0, data.metas||0, data.outros||0, data.fgts||0, data.desconto||0, data.observacao||'']);
  },
  updateFolha(slug, id, fields) {
    const allowed = ['salario','premio','valloo','adicional','ajuda_custos','com_caixa','extra','mont_cart','metas','outros','fgts','desconto','observacao'];
    const sets = [], vals = [];
    for (const [k,v] of Object.entries(fields)) { if (allowed.includes(k)) { sets.push(k+'=?'); vals.push(v); } }
    if (sets.length) { vals.push(id); run(slug, 'UPDATE folha_pagamento SET '+sets.join(',')+' WHERE id=?', vals); }
  },
  delFolha(slug, id) { run(slug, 'DELETE FROM folha_pagamento WHERE id=?', [id]); },

  // -- Verbas (catálogo da folha) --
  getVerbas(slug) { return query(slug, 'SELECT * FROM verbas ORDER BY ordem, nome'); },
  addVerba(slug, v) {
    const max = scalar(slug, "SELECT COALESCE(MAX(ordem),0) FROM verbas WHERE tipo='provento'");
    run(slug, 'INSERT INTO verbas (id,nome,tipo,ordem) VALUES (?,?,?,?)', [v.id, v.nome, v.tipo || 'provento', v.tipo === 'desconto' ? 95 : max + 1]);
  },
  delVerba(slug, id) { run(slug, 'DELETE FROM verbas WHERE id=?', [id]); },

  // -- Folha (valores flexíveis por verba) --
  getFolhaValores(slug, mes) { return query(slug, 'SELECT * FROM folha_valores WHERE mes=?', [mes]); },
  getFolhaValor(slug, colaboradorId, mes, verbaId) {
    const r = query(slug, 'SELECT valor FROM folha_valores WHERE colaborador_id=? AND mes=? AND verba_id=?', [colaboradorId, mes, verbaId]);
    return r.length ? r[0].valor : null;
  },
  setFolhaValor(slug, colaboradorId, mes, verbaId, valor) {
    run(slug, 'DELETE FROM folha_valores WHERE colaborador_id=? AND mes=? AND verba_id=?', [colaboradorId, mes, verbaId]);
    if (valor) run(slug, 'INSERT INTO folha_valores (id,colaborador_id,mes,verba_id,valor) VALUES (?,?,?,?,?)', ['fv_' + colaboradorId + '_' + mes + '_' + verbaId, colaboradorId, mes, verbaId, valor]);
  },
  delFolhaColabMes(slug, colaboradorId, mes) { run(slug, 'DELETE FROM folha_valores WHERE colaborador_id=? AND mes=?', [colaboradorId, mes]); },
  // Copia os valores de um mês para outro (sem sobrescrever o que já foi lançado no destino)
  copiarFolhaMes(slug, mesOrigem, mesDestino) {
    const origem = this.getFolhaValores(slug, mesOrigem);
    const destino = this.getFolhaValores(slug, mesDestino);
    const jaTem = new Set(destino.map(v => v.colaborador_id + '|' + v.verba_id));
    let n = 0;
    for (const v of origem) {
      if (jaTem.has(v.colaborador_id + '|' + v.verba_id)) continue;
      this.setFolhaValor(slug, v.colaborador_id, mesDestino, v.verba_id, v.valor);
      n++;
    }
    return n;
  },

  // -- Empréstimos --
  getEmprestimos(slug) { return query(slug, 'SELECT e.*, c.nome as colab_nome FROM emprestimos e JOIN colaboradores c ON e.colaborador_id=c.id ORDER BY e.status, c.nome'); },
  addEmprestimo(slug, e) {
    run(slug, 'INSERT INTO emprestimos (id,colaborador_id,descricao,contrato,banco,valor_parcela,total_parcelas,parcela_atual,mes_referencia,status,observacao) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [e.id, e.colaborador_id, e.descricao || 'Empréstimo', e.contrato || '', e.banco || '', e.valor_parcela || 0, e.total_parcelas || 0, e.parcela_atual || 0, e.mes_referencia || '', e.status || 'ativo', e.observacao || '']);
  },
  updateEmprestimo(slug, id, fields) {
    const allowed = ['descricao', 'contrato', 'banco', 'valor_parcela', 'total_parcelas', 'parcela_atual', 'mes_referencia', 'status', 'observacao', 'colaborador_id'];
    const sets = [], vals = [];
    for (const [k, v] of Object.entries(fields)) { if (allowed.includes(k)) { sets.push(k + '=?'); vals.push(v); } }
    if (sets.length) { vals.push(id); run(slug, 'UPDATE emprestimos SET ' + sets.join(',') + ' WHERE id=?', vals); }
  },
  delEmprestimo(slug, id) { run(slug, 'DELETE FROM emprestimos WHERE id=?', [id]); },
  // Cadastra/atualiza automaticamente a partir do holerite importado
  upsertEmprestimoHolerite(slug, colaboradorId, e, mes) {
    const exist = query(slug, 'SELECT * FROM emprestimos WHERE contrato=? AND colaborador_id=?', [e.contrato, colaboradorId])[0];
    if (exist) {
      const upd = { mes_referencia: mes };
      if (e.parcela_atual > (exist.parcela_atual || 0)) upd.parcela_atual = e.parcela_atual;
      if (e.valor_parcela) upd.valor_parcela = e.valor_parcela;
      if (e.total_parcelas) upd.total_parcelas = e.total_parcelas;
      const atual = upd.parcela_atual || exist.parcela_atual || 0;
      const total = upd.total_parcelas || exist.total_parcelas || 0;
      if (total && atual >= total) upd.status = 'quitado';
      this.updateEmprestimo(slug, exist.id, upd);
      return exist.id;
    }
    const id = 'em_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
    this.addEmprestimo(slug, {
      id, colaborador_id: colaboradorId, descricao: e.descricao || 'Empréstimo Crédito do Trabalhador',
      contrato: e.contrato, banco: e.banco || '', valor_parcela: e.valor_parcela || 0,
      total_parcelas: e.total_parcelas || 0, parcela_atual: e.parcela_atual || 0,
      mes_referencia: mes, status: 'ativo',
    });
    return id;
  },

  // -- Holerites --
  getHolerites(slug, mes) { return query(slug, 'SELECT * FROM holerites WHERE mes=? ORDER BY nome', [mes]); },
  addHolerite(slug, data) {
    run(slug, `INSERT INTO holerites (id,colaborador_id,mes,nome_pdf,cadastro,nome,cpf,cargo,cbo,data_admissao,salario_base,total_proventos,total_descontos,liquido,fgts_mes,inss,irrf,sal_cont_inss,bas_calc_fgts,faixa,dependentes,proventos_json,descontos_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [data.id, data.colaborador_id||null, data.mes, data.nome_pdf, data.cadastro||'', data.nome, data.cpf||'', data.cargo||'', data.cbo||'', data.data_admissao||'', data.salario_base||0, data.total_proventos||0, data.total_descontos||0, data.liquido||0, data.fgts_mes||0, data.inss||0, data.irrf||0, data.sal_cont_inss||0, data.bas_calc_fgts||0, data.faixa||0, data.dependentes||0, JSON.stringify(data.proventos||[]), JSON.stringify(data.descontos||[])]);
  },
  delHolerite(slug, id) { run(slug, 'DELETE FROM holerites WHERE id=?', [id]); },

  // -- Notas Recebidas (NF-e SEFAZ) --
  getNotasRecebidas(slug) { return query(slug, 'SELECT id,chave,nsu,tipo,numero,emitente,emitente_cnpj,valor,data_emissao,status,manifestada,duplicatas_json,itens_json,forma_pagamento,pagamentos_json,data_recebimento FROM notas_recebidas ORDER BY data_emissao DESC, data_recebimento DESC'); },
  getNotaRecebidaByChave(slug, chave) { const r = query(slug, 'SELECT * FROM notas_recebidas WHERE chave=?', [chave]); return r[0] || null; },
  getNotaRecebidaById(slug, id) { const r = query(slug, 'SELECT * FROM notas_recebidas WHERE id=?', [id]); return r[0] || null; },
  addNotaRecebida(slug, n) {
    run(slug, 'INSERT INTO notas_recebidas (id,chave,nsu,tipo,numero,emitente,emitente_cnpj,valor,data_emissao,status,manifestada,duplicatas_json,itens_json,forma_pagamento,pagamentos_json,xml) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [n.id, n.chave, n.nsu || '', n.tipo || 'resumo', n.numero || '', n.emitente || '', n.emitente_cnpj || '', n.valor || 0, n.data_emissao || '', n.status || 'nova', n.manifestada ? 1 : 0, JSON.stringify(n.duplicatas || []), JSON.stringify(n.itens || []), n.forma_pagamento || '', JSON.stringify(n.pagamentos || []), n.xml || '']);
  },
  updateNotaRecebida(slug, id, fields) {
    const allowed = ['nsu', 'tipo', 'numero', 'emitente', 'emitente_cnpj', 'valor', 'data_emissao', 'status', 'manifestada', 'duplicatas_json', 'itens_json', 'forma_pagamento', 'pagamentos_json', 'xml'];
    const sets = [], vals = [];
    for (const [k, v] of Object.entries(fields)) { if (allowed.includes(k)) { sets.push(k + '=?'); vals.push(v); } }
    if (sets.length) { vals.push(id); run(slug, 'UPDATE notas_recebidas SET ' + sets.join(',') + ' WHERE id=?', vals); }
  },
  delNotaRecebida(slug, id) { run(slug, 'DELETE FROM notas_recebidas WHERE id=?', [id]); },

  // -- Fornecedores (cadastro completo) --
  getFornecedoresCad(slug) { return query(slug, 'SELECT * FROM fornecedores_cad ORDER BY razao'); },
  getFornecedorByCnpj(slug, cnpj) { const r = query(slug, 'SELECT * FROM fornecedores_cad WHERE cnpj=?', [cnpj]); return r[0] || null; },
  addFornecedorCad(slug, f) {
    run(slug, 'INSERT INTO fornecedores_cad (id,cnpj,razao,fantasia,ie,telefone,email,responsavel,endereco,municipio,uf,cep,observacao,origem) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [f.id, f.cnpj || '', f.razao || '', f.fantasia || '', f.ie || '', f.telefone || '', f.email || '', f.responsavel || '', f.endereco || '', f.municipio || '', f.uf || '', f.cep || '', f.observacao || '', f.origem || 'manual']);
  },
  updateFornecedorCad(slug, id, fields) {
    const allowed = ['cnpj', 'razao', 'fantasia', 'ie', 'telefone', 'email', 'responsavel', 'endereco', 'municipio', 'uf', 'cep', 'observacao'];
    const sets = [], vals = [];
    for (const [k, v] of Object.entries(fields)) { if (allowed.includes(k)) { sets.push(k + '=?'); vals.push(v); } }
    if (sets.length) { vals.push(id); run(slug, 'UPDATE fornecedores_cad SET ' + sets.join(',') + ' WHERE id=?', vals); }
  },
  delFornecedorCad(slug, id) { run(slug, 'DELETE FROM fornecedores_cad WHERE id=?', [id]); },
  // Upsert vindo da NF-e: cria ou atualiza dados fiscais, preservando campos manuais (email/responsavel/observacao)
  upsertFornecedorNfe(slug, f) {
    const exist = this.getFornecedorByCnpj(slug, f.cnpj);
    if (exist) {
      const upd = {};
      if (f.razao) upd.razao = f.razao;
      if (f.fantasia) upd.fantasia = f.fantasia;
      if (f.ie) upd.ie = f.ie;
      if (f.telefone) upd.telefone = f.telefone;
      if (f.endereco) upd.endereco = f.endereco;
      if (f.municipio) upd.municipio = f.municipio;
      if (f.uf) upd.uf = f.uf;
      if (f.cep) upd.cep = f.cep;
      if (Object.keys(upd).length) this.updateFornecedorCad(slug, exist.id, upd);
      return exist.id;
    }
    f.origem = 'nfe';
    this.addFornecedorCad(slug, f);
    return f.id;
  },

  // Contas a pagar não pagas vencendo entre duas datas (alertas/Telegram)
  getContasVencendo(slug, de, ate) {
    return query(slug, "SELECT id,vencimento,descricao,valor,fornecedor FROM contas_pagar WHERE vencimento>=? AND vencimento<=? AND (pago_por='' OR pago_por='A Pagar' OR pago_por IS NULL) ORDER BY vencimento", [de, ate]);
  },
  // Contas similares (possível duplicidade ao aprovar nota)
  findContasSimilares(slug, vencimento, valor, emitente) {
    const porValorVenc = query(slug, 'SELECT id,vencimento,descricao,valor,fornecedor,pago_por FROM contas_pagar WHERE vencimento=? AND ABS(valor-?)<0.01', [vencimento, valor]);
    if (porValorVenc.length) return porValorVenc;
    const nome = (emitente || '').split(' ')[0];
    if (nome.length < 3) return [];
    return query(slug, "SELECT id,vencimento,descricao,valor,fornecedor,pago_por FROM contas_pagar WHERE ABS(valor-?)<0.01 AND (UPPER(fornecedor) LIKE UPPER(?) OR UPPER(descricao) LIKE UPPER(?))", [valor, '%' + nome + '%', '%' + nome + '%']);
  },

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
    if (mes) return query(slug, 'SELECT * FROM movimentacao WHERE data LIKE ? ORDER BY data DESC', [mes + '%']);
    return query(slug, 'SELECT * FROM movimentacao ORDER BY data DESC');
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

  // -- Somas (rascunhos compartilhados) --
  getSomas(slug) {
    const somas = query(slug, 'SELECT * FROM somas ORDER BY data_criacao DESC');
    return somas.map(s => {
      s.itens = query(slug, 'SELECT * FROM soma_itens WHERE soma_id=? ORDER BY ordem', [s.id]);
      s.total = s.itens.reduce((acc, i) => acc + (i.valor || 0), 0);
      return s;
    });
  },
  addSoma(slug, soma) {
    run(slug, 'INSERT INTO somas (id, titulo, criado_por) VALUES (?,?,?)', [soma.id, soma.titulo, soma.criado_por]);
  },
  updateSomaTitulo(slug, id, titulo) {
    run(slug, 'UPDATE somas SET titulo=? WHERE id=?', [titulo, id]);
  },
  delSoma(slug, id) {
    run(slug, 'DELETE FROM soma_itens WHERE soma_id=?', [id]);
    run(slug, 'DELETE FROM somas WHERE id=?', [id]);
  },
  addSomaItem(slug, item) {
    const maxOrdem = query(slug, 'SELECT COALESCE(MAX(ordem),0) as m FROM soma_itens WHERE soma_id=?', [item.soma_id])[0]?.m || 0;
    run(slug, 'INSERT INTO soma_itens (id, soma_id, descricao, valor, ordem) VALUES (?,?,?,?,?)', [item.id, item.soma_id, item.descricao || '', item.valor || 0, maxOrdem + 1]);
  },
  updateSomaItem(slug, id, fields) {
    const sets = [], vals = [];
    if (fields.descricao !== undefined) { sets.push('descricao=?'); vals.push(fields.descricao); }
    if (fields.valor !== undefined) { sets.push('valor=?'); vals.push(fields.valor); }
    if (sets.length) { vals.push(id); run(slug, 'UPDATE soma_itens SET ' + sets.join(',') + ' WHERE id=?', vals); }
  },
  delSomaItem(slug, id) {
    run(slug, 'DELETE FROM soma_itens WHERE id=?', [id]);
  },

  // -- Auditoria --
  addAuditLog(slug, usuario, acao, secao, detalhes) {
    const data = new Date().toISOString();
    run(slug, 'INSERT INTO auditoria (data, usuario, acao, secao, detalhes, empresa) VALUES (?,?,?,?,?,?)', [data, usuario, acao, secao, detalhes || '', slug]);
  },
  getAuditByItem(slug, secao, id) {
    return query(slug, "SELECT * FROM auditoria WHERE secao=? AND (detalhes LIKE ? OR detalhes LIKE ?) ORDER BY data DESC LIMIT 50", [secao, '%ID: ' + id + '%', '%ID: ' + id]);
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
