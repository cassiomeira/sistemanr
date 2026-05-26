const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function uid() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 5); }
const crypto = require('crypto');
const sessions = new Map();
function genToken() { return crypto.randomBytes(32).toString('hex'); }

// === LOGIN (sem auth) ===
app.post('/api/login', (req, res) => {
  const { username, senha } = req.body;
  if (!username || !senha) return res.status(400).json({ error: 'Usuário e senha obrigatórios' });
  const user = db.authenticateUser(username, senha);
  if (!user) return res.status(401).json({ error: 'Usuário ou senha inválidos' });
  const token = genToken();
  sessions.set(token, user);
  res.json({ token, user: { id: user.id, username: user.username, nome: user.nome, role: user.role, permissoes: user.permissoes } });
});

// === AUTH MIDDLEWARE ===
app.use('/api', (req, res, next) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token || !sessions.has(token)) return res.status(401).json({ error: 'Não autenticado' });
  req.user = sessions.get(token);
  req.emp = req.headers['x-empresa'] || 'nunesrocha';
  next();
});

function adminOnly(req, res, next) { if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' }); next(); }

// === USUÁRIOS (admin only) ===
app.get('/api/me', (req, res) => res.json(req.user));
app.get('/api/usuarios', adminOnly, (req, res) => res.json(db.getUsuarios()));
app.post('/api/usuarios', adminOnly, (req, res) => {
  const { username, senha, nome, role, permissoes } = req.body;
  if (!username || !senha || !nome) return res.status(400).json({ error: 'Campos obrigatórios: username, senha, nome' });
  const ok = db.addUsuario(username, senha, nome, role, permissoes);
  if (!ok) return res.status(400).json({ error: 'Usuário já existe' });
  res.json({ ok: true });
});
app.put('/api/usuarios/:id', adminOnly, (req, res) => {
  db.updateUsuario(parseInt(req.params.id), req.body);
  for (const [t, u] of sessions) { if (u.id === parseInt(req.params.id)) { if (req.body.permissoes) u.permissoes = req.body.permissoes; if (req.body.nome) u.nome = req.body.nome; } }
  res.json({ ok: true });
});
app.delete('/api/usuarios/:id', adminOnly, (req, res) => {
  const ok = db.delUsuario(parseInt(req.params.id));
  if (!ok) return res.status(400).json({ error: 'Não pode excluir o administrador' });
  for (const [t, u] of sessions) { if (u.id === parseInt(req.params.id)) sessions.delete(t); }
  res.json({ ok: true });
});
app.put('/api/me/senha', (req, res) => {
  const { senhaAtual, senhaNova, novoUsername, novoNome } = req.body;
  if (!senhaAtual) return res.status(400).json({ error: 'Informe a senha atual para confirmar' });
  const user = db.authenticateUser(req.user.username, senhaAtual);
  if (!user) return res.status(401).json({ error: 'Senha atual incorreta' });
  const updates = {};
  if (novoUsername && novoUsername.trim().length >= 3) updates.username = novoUsername.trim();
  if (novoNome && novoNome.trim()) updates.nome = novoNome.trim();
  if (senhaNova && senhaNova.length >= 3) updates.senha = senhaNova;
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Nenhuma alteração informada' });
  db.updateUsuario(req.user.id, updates);
  // Update session data
  if (updates.username) req.user.username = updates.username;
  if (updates.nome) req.user.nome = updates.nome;
  res.json({ ok: true, user: { username: req.user.username, nome: req.user.nome } });
});
app.post('/api/logout', (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  sessions.delete(token);
  res.json({ ok: true });
});

// === EMPRESAS ===
app.get('/api/empresas', (req, res) => res.json(db.getEmpresas()));
app.post('/api/empresas', (req, res) => {
  const { slug, nome } = req.body;
  if (!slug || !nome) return res.status(400).json({ error: 'slug e nome obrigatórios' });
  const ok = db.addEmpresa(slug.toLowerCase().replace(/[^a-z0-9]/g, ''), nome);
  res.json({ ok });
});
app.delete('/api/empresas/:slug', (req, res) => {
  const ok = db.delEmpresa(req.params.slug);
  res.json({ ok });
});
app.put('/api/empresas/:slug/cor', (req, res) => {
  const { cor, fundo } = req.body;
  const list = db.getEmpresas();
  const emp = list.find(e => e.slug === req.params.slug);
  if (!emp) return res.json({ ok: false });
  if (cor) emp.cor = cor;
  if (fundo) emp.fundo = fundo;
  db.saveEmpresasList(list);
  res.json({ ok: true });
});

// === CONTROLE FISCAL ===
app.get('/api/fiscal', (req, res) => res.json(db.getFiscal(req.emp, req.query.mes)));
app.post('/api/fiscal', (req, res) => {
  const item = { id: uid(), ...req.body };
  db.addFiscal(req.emp, item);
  res.json({ ok: true, id: item.id });
});
app.put('/api/fiscal/:id', (req, res) => { db.updateFiscal(req.emp, req.params.id, req.body); res.json({ ok: true }); });
app.delete('/api/fiscal/:id', (req, res) => { db.delFiscal(req.emp, req.params.id); res.json({ ok: true }); });

// === ACERTO FINANCEIRO ===
app.get('/api/acerto', (req, res) => res.json(db.getAcerto(req.emp, req.query.mes)));
app.post('/api/acerto', (req, res) => {
  const item = { id: uid(), ...req.body };
  db.addAcerto(req.emp, item);
  res.json({ ok: true, id: item.id });
});
app.put('/api/acerto/:id', (req, res) => { db.updateAcerto(req.emp, req.params.id, req.body); res.json({ ok: true }); });
app.delete('/api/acerto/:id', (req, res) => { db.delAcerto(req.emp, req.params.id); res.json({ ok: true }); });

// === FAT (RECORRENTES) ===
app.get('/api/fat', (req, res) => res.json(db.getRecorrentes(req.emp, req.query.mes)));

// === CATEGORIAS GRÁFICO ===
app.get('/api/categorias-grafico', (req, res) => res.json(db.getCategoriasSummary(req.emp, req.query.mes)));
app.get('/api/fornecedores-grafico', (req, res) => res.json(db.getFornecedoresSummary(req.emp, req.query.mes)));

// === CONTAS A PAGAR ===
app.get('/api/contas-pagar', (req, res) => res.json(db.getContasPagar(req.emp, req.query.mes)));
app.post('/api/contas-pagar', (req, res) => {
  const item = { id: uid(), ...req.body };
  db.addContaPagar(req.emp, item);
  res.json({ ok: true, id: item.id });
});
app.put('/api/contas-pagar/:id', (req, res) => {
  const b = req.body;
  console.log(`PUT /contas-pagar/${req.params.id}`, b);
  // Ler estado ANTERIOR antes de atualizar (importante para lógica de caixa)
  let contaAnterior = null;
  if (b.caixa_id !== undefined || b.pago_por !== undefined) {
    contaAnterior = db.getContaPagarById(req.emp, req.params.id);
  }
  // Atualizar o registro
  db.updateContaPagar(req.emp, req.params.id, b);
  // Se marcou boleto_chegou e pertence a um grupo, propagar para todas do grupo
  if (b.boleto_chegou !== undefined) {
    const conta = db.getContaPagarById(req.emp, req.params.id);
    if (conta && conta.grupo_parcela) {
      db.run_raw(req.emp, 'UPDATE contas_pagar SET boleto_chegou=? WHERE grupo_parcela=?', [b.boleto_chegou ? 1 : 0, conta.grupo_parcela]);
    }
  }
  // Se marcou "pago_por" com um colaborador → gera saída no acerto (se ainda não existe)
  if (b.pago_por && b.pago_por !== '' && b.pago_por !== 'A Pagar') {
    try {
      const conta = contaAnterior || db.getContaPagarById(req.emp, req.params.id);
      console.log('Conta para acerto:', conta ? conta.id : 'NÃO ENCONTRADA');
      if (conta) {
        const jaExiste = db.acertoJaExiste(req.emp, conta.id);
        console.log('Acerto já existe?', jaExiste);
        if (!jaExiste) {
          db.addAcerto(req.emp, {
            id: uid(), data: new Date().toISOString().split('T')[0],
            descricao: 'Boleto: ' + conta.descricao + ' (pago por ' + b.pago_por + ')',
            entrada: 0, saida: conta.valor, categoria: conta.categoria || 'Outros',
            fornecedor: conta.fornecedor || '',
            recorrente: conta.recorrente ? 1 : 0,
            tipo_nota: conta.tipo_nota || '',
            origem_conta_pagar: conta.id
          });
          console.log('✅ Acerto criado para conta', conta.id);
        }
      }
    } catch(err) { console.error('❌ Erro ao criar acerto:', err.message); }
  }
  // Lógica de débito/crédito do caixa
  if (b.caixa_id !== undefined && contaAnterior) {
    const novoCaixa = parseInt(b.caixa_id) || 0;
    const antigoCaixa = contaAnterior.caixa_id || 0;
    console.log(`Caixa: antigo=${antigoCaixa}, novo=${novoCaixa}, valor=${contaAnterior.valor}`);
    // Se tinha um caixa anterior diferente do novo, creditar de volta
    if (antigoCaixa > 0 && antigoCaixa !== novoCaixa) {
      db.run_raw(req.emp, 'UPDATE caixas SET saldo=saldo+? WHERE id=?', [contaAnterior.valor, antigoCaixa]);
      console.log(`✅ Creditado ${contaAnterior.valor} de volta ao caixa antigo ${antigoCaixa}`);
    }
    // Se o novo caixa é válido e diferente do antigo, debitar
    if (novoCaixa > 0 && novoCaixa !== antigoCaixa) {
      db.debitCaixa(req.emp, novoCaixa, contaAnterior.valor);
      console.log(`✅ Debitado ${contaAnterior.valor} do caixa ${novoCaixa}`);
    }
  }
  res.json({ ok: true });
});
app.delete('/api/contas-pagar/:id', (req, res) => { db.delContaPagar(req.emp, req.params.id); res.json({ ok: true }); });
// Enviar conta existente para o acerto (forçar criação)
app.post('/api/contas-pagar/:id/enviar-acerto', (req, res) => {
  const conta = db.getContaPagarById(req.emp, req.params.id);
  if (!conta) return res.json({ ok: false, error: 'Conta não encontrada' });
  if (!conta.pago_por || conta.pago_por === '' || conta.pago_por === 'A Pagar') {
    return res.json({ ok: false, error: 'Conta não está marcada como paga' });
  }
  const jaExiste = db.acertoJaExiste(req.emp, conta.id);
  if (jaExiste) return res.json({ ok: false, error: 'Já existe no acerto' });
  db.addAcerto(req.emp, {
    id: uid(), data: new Date().toISOString().split('T')[0],
    descricao: 'Boleto: ' + conta.descricao + ' (pago por ' + conta.pago_por + ')',
    entrada: 0, saida: conta.valor, categoria: conta.categoria || 'Outros',
    fornecedor: conta.fornecedor || '',
    recorrente: conta.recorrente ? 1 : 0,
    tipo_nota: conta.tipo_nota || '',
    origem_conta_pagar: conta.id
  });
  res.json({ ok: true });
});
app.get('/api/a-chegar', (req, res) => res.json(db.getAChegar(req.emp)));
app.put('/api/contas-pagar/:id/chegou', (req, res) => {
  const conta = db.getContaPagarById(req.emp, req.params.id);
  if (conta && conta.grupo_parcela) {
    db.marcarChegou(req.emp, conta.grupo_parcela);
  } else {
    db.updateContaPagar(req.emp, req.params.id, { a_chegar: false });
  }
  res.json({ ok: true });
});
app.put('/api/contas-pagar/:id/a-chegar', (req, res) => {
  const conta = db.getContaPagarById(req.emp, req.params.id);
  if (conta && conta.grupo_parcela) {
    db.marcarAChegar(req.emp, conta.grupo_parcela);
  } else {
    db.updateContaPagar(req.emp, req.params.id, { a_chegar: true });
  }
  res.json({ ok: true });
});
// === DROGARIA ===
app.get('/api/drogaria', (req, res) => res.json(db.getLancamentos(req.emp, 'drogaria', req.query.mes)));
app.post('/api/drogaria', (req, res) => { const item = { id: uid(), origem: 'drogaria', ...req.body }; db.addLancamento(req.emp, item); res.json({ ok: true, id: item.id }); });
app.delete('/api/drogaria/:id', (req, res) => { db.delLancamento(req.emp, req.params.id); res.json({ ok: true }); });
app.put('/api/drogaria/:id', (req, res) => { db.updateLancamento(req.emp, req.params.id, req.body); res.json({ ok: true }); });

// === CHEQUES ===
app.get('/api/cheques', (req, res) => res.json(db.getCheques(req.emp, req.query.mes)));
app.get('/api/cheques/busca', (req, res) => res.json(db.searchCheques(req.emp, req.query.q || '')));
app.post('/api/cheques', (req, res) => {
  const b = req.body;
  const dias = b.dias || Math.max(Math.round((new Date(b.vencimento) - new Date(b.data)) / 86400000), 1);
  const item = { id: uid(), numero: b.numero || '', data: b.data, cliente: b.cliente, valor: b.valor, taxa: b.taxa, dias: dias, lucro: b.valor * b.taxa / 100 * dias / 30, bom_para: b.bom_para || '', origem_dinheiro: b.origem_dinheiro, vencimento: b.vencimento, status: b.status || 'pendente', dono_cheque: b.dono_cheque || '', juros_antecipado: b.juros_antecipado ? 1 : 0 };
  db.addCheque(req.emp, item);
  // Se saiu do caixa da empresa, Celso deve à empresa
  if (item.origem_dinheiro === 'caixa-empresa') {
    const valorDebito = item.juros_antecipado ? (item.valor - item.lucro) : item.valor;
    db.addContaDono(req.emp, { id: uid(), data: item.data, tipo: 'debito', descricao: 'Troca de cheque (caixa empresa) - ' + item.cliente, valor: valorDebito, origem_cheque: item.id });
  }
  res.json({ ok: true, id: item.id });
});
app.delete('/api/cheques/:id', (req, res) => {
  db.delContaDonoByCheque(req.emp, req.params.id);
  db.delCheque(req.emp, req.params.id);
  res.json({ ok: true });
});
app.put('/api/cheques/:id/compensar', (req, res) => {
  const cheque = db.compensarCheque(req.emp, req.params.id);
  // Ao compensar, Celso devolve o dinheiro à empresa
  if (cheque && cheque.origem_dinheiro === 'caixa-empresa') {
    db.addContaDono(req.emp, { id: uid(), data: new Date().toISOString().split('T')[0], tipo: 'credito', descricao: 'Cheque compensado - ' + cheque.cliente, valor: cheque.valor, origem_cheque: cheque.id });
  }
  res.json({ ok: true });
});
app.put('/api/cheques/:id/destino', (req, res) => { db.updateChequeDestino(req.emp, req.params.id, req.body.destino || ''); res.json({ ok: true }); });
app.put('/api/cheques/:id', (req, res) => { db.updateCheque(req.emp, req.params.id, req.body); res.json({ ok: true }); });

// === CONTA DONO ===
app.get('/api/conta-dono', (req, res) => res.json(db.getContaDono(req.emp, req.query.mes)));
app.post('/api/conta-dono', (req, res) => { console.log('📥 POST /api/conta-dono:', JSON.stringify(req.body)); const item = { id: uid(), ...req.body }; db.addContaDono(req.emp, item); res.json({ ok: true, id: item.id }); });
app.delete('/api/conta-dono/:id', (req, res) => { db.delContaDono(req.emp, req.params.id); res.json({ ok: true }); });
app.put('/api/conta-dono/:id', (req, res) => { db.updateContaDono(req.emp, req.params.id, req.body); res.json({ ok: true }); });

// === COLABORADORES ===
app.get('/api/colaboradores', (req, res) => res.json(db.getColaboradores(req.emp)));
app.post('/api/colaboradores', (req, res) => { db.addColaborador(req.emp, req.body.nome, req.body.percentual); res.json({ ok: true }); });
app.delete('/api/colaboradores/:id', (req, res) => { db.delColaborador(req.emp, parseInt(req.params.id)); res.json({ ok: true }); });

// === CLEAR ALL (admin only) ===
app.delete('/api/clear/acerto', adminOnly, (req, res) => { db.clearAcerto(req.emp); res.json({ ok: true }); });
app.delete('/api/clear/fat', adminOnly, (req, res) => { db.clearFat(req.emp); res.json({ ok: true }); });
app.delete('/api/clear/contas-pagar', adminOnly, (req, res) => { db.clearContasPagar(req.emp); res.json({ ok: true }); });
app.delete('/api/clear/drogaria', adminOnly, (req, res) => { db.clearDrogaria(req.emp); res.json({ ok: true }); });
app.delete('/api/clear/cheques', adminOnly, (req, res) => { db.clearCheques(req.emp); res.json({ ok: true }); });
app.delete('/api/clear/conta-dono', adminOnly, (req, res) => { db.clearContaDono(req.emp); res.json({ ok: true }); });

// === CONFIG ===
app.get('/api/config', (req, res) => res.json(db.getConfig(req.emp)));
app.put('/api/config', (req, res) => {
  const b = req.body;
  if (b.pctAdmin !== undefined) db.updateConfig(req.emp, 'pctAdmin', String(b.pctAdmin));
  if (b.pctDono !== undefined) db.updateConfig(req.emp, 'pctDono', String(b.pctDono));
  if (b.pctReserva !== undefined) db.updateConfig(req.emp, 'pctReserva', String(b.pctReserva));
  if (b.categoriasLoja !== undefined) db.updateConfig(req.emp, 'categoriasLoja', b.categoriasLoja);
  if (b.categoriasDrog !== undefined) db.updateConfig(req.emp, 'categoriasDrog', b.categoriasDrog);
  if (b.fornecedores !== undefined) db.updateConfig(req.emp, 'fornecedores', b.fornecedores);
  res.json({ ok: true });
});

// === DASHBOARD ===
// === CAIXAS ===
app.get('/api/caixas', (req, res) => res.json(db.getCaixas(req.emp)));
app.post('/api/caixas', (req, res) => { db.addCaixa(req.emp, req.body.nome, req.body.saldo || 0); res.json({ ok: true }); });
app.put('/api/caixas/:id', (req, res) => { db.updateCaixaSaldo(req.emp, parseInt(req.params.id), req.body.saldo); res.json({ ok: true }); });
app.delete('/api/caixas/:id', (req, res) => { db.delCaixa(req.emp, parseInt(req.params.id)); res.json({ ok: true }); });
app.delete('/api/clear/caixas', adminOnly, (req, res) => { db.clearCaixas(req.emp); res.json({ ok: true }); });

// === MOVIMENTAÇÃO ===
app.get('/api/movimentacao', (req, res) => res.json(db.getMovimentacao(req.emp, req.query.mes)));
app.post('/api/movimentacao', (req, res) => {
  const b = req.body;
  db.addMovimentacao(req.emp, { id: uid(), data: b.data, descricao: b.descricao, entrada: b.entrada || 0, saida: b.saida || 0, diferenca: b.diferenca || 0 });
  res.json({ ok: true });
});
app.put('/api/movimentacao/:id/diferenca', (req, res) => {
  db.updateMovimentacaoDiferenca(req.emp, req.params.id, parseFloat(req.body.diferenca) || 0);
  res.json({ ok: true });
});
app.put('/api/movimentacao/:id', (req, res) => { db.updateMovimentacao(req.emp, req.params.id, req.body); res.json({ ok: true }); });
app.delete('/api/movimentacao/:id', (req, res) => { db.delMovimentacao(req.emp, req.params.id); res.json({ ok: true }); });
app.delete('/api/clear/movimentacao', adminOnly, (req, res) => { db.clearMovimentacao(req.emp); res.json({ ok: true }); });
app.get('/api/movimentacao/config', (req, res) => res.json(db.getMovConfig(req.emp, req.query.mes)));
app.put('/api/movimentacao/config', (req, res) => {
  const b = req.body;
  db.setMovConfig(req.emp, b.mes, parseFloat(b.saldo_anterior) || 0, parseFloat(b.diferenca) || 0);
  res.json({ ok: true });
});

app.get('/api/dashboard', (req, res) => {
  const summary = db.getSummary(req.emp, req.query.mes);
  const config = db.getConfig(req.emp);
  const colaboradores = db.getColaboradores(req.emp);
  const caixas = db.getCaixas(req.emp);
  res.json({ summary, config, colaboradores, caixas });
});

// === BACKUP / RESTORE ===
app.get('/api/backup', (req, res) => {
  const dbPath = db.getDbPath(req.emp);
  res.download(dbPath, `${req.emp}_backup.db`);
});
app.post('/api/restore', upload.single('dbfile'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  db.replaceDB(req.emp, req.file.buffer);
  res.json({ ok: true });
});

// === DASHBOARD GERAL (ALERTAS CROSS-EMPRESA) ===
app.get('/api/alertas-geral', (req, res) => {
  const empresas = db.getEmpresas();
  const dias = parseInt(req.query.dias) || 0;
  const hoje = new Date();
  const limite = new Date(hoje);
  limite.setDate(limite.getDate() + dias);
  const limiteStr = limite.toISOString().split('T')[0];
  const hojeStr = hoje.toISOString().split('T')[0];
  const contas = [];
  const mercadorias = [];
  for (const emp of empresas) {
    try {
      const pendentes = db.getContasPendentesAte(emp.slug, limiteStr);
      if (pendentes.length) {
        contas.push({ empresa: emp.nome, slug: emp.slug, contas: pendentes, hoje: hojeStr });
      }
    } catch(e) {}
    try {
      const achegar = db.getAChegar(emp.slug);
      if (achegar.length) {
        mercadorias.push({ empresa: emp.nome, slug: emp.slug, items: achegar });
      }
    } catch(e) {}
  }
  res.json({ contas, mercadorias });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

db.init().then(() => {
  app.listen(PORT, '0.0.0.0', () => console.log(`✅ Sistema rodando em http://0.0.0.0:${PORT}`));
}).catch(err => { console.error('Erro ao iniciar banco:', err); process.exit(1); });
