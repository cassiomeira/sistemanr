const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const db = require('./database');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const cron = require('node-cron');
const backup = require('./backup');

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

// === LEMBRETES ===
app.get('/api/lembretes', (req, res) => res.json(db.getLembretes(req.emp, req.user.username)));
app.post('/api/lembretes', (req, res) => {
  if (!req.body.texto) return res.status(400).json({ error: 'Texto obrigatório' });
  const item = { id: uid(), username: req.user.username, texto: req.body.texto };
  db.addLembrete(req.emp, item);
  res.json({ ok: true, id: item.id });
});
app.put('/api/lembretes/:id/toggle', (req, res) => {
  db.toggleLembrete(req.emp, req.params.id, req.body.concluido);
  res.json({ ok: true });
});
app.delete('/api/lembretes/:id', (req, res) => {
  db.delLembrete(req.emp, req.params.id);
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
  const b = req.body;
  const item = { id: uid(), ...b };
  db.addAcerto(req.emp, item);
  db.addAuditLog(req.emp, req.user.nome, 'criou', 'Acerto', 'ID: ' + item.id + ' - ' + b.descricao + ' - Entrada: ' + (b.entrada||0) + ' Saída: ' + (b.saida||0));
  res.json({ ok: true, id: item.id });
});
app.put('/api/acerto/:id', (req, res) => { db.updateAcerto(req.emp, req.params.id, req.body); res.json({ ok: true }); });
app.delete('/api/acerto/:id', (req, res) => {
  db.delAcerto(req.emp, req.params.id);
  db.addAuditLog(req.emp, req.user.nome, 'excluiu', 'Acerto', 'ID: ' + req.params.id);
  res.json({ ok: true });
});

// === FAT (RECORRENTES) ===
app.get('/api/fat', (req, res) => res.json(db.getRecorrentes(req.emp, req.query.mes)));

// === ABASTECIMENTOS ===
app.get('/api/abastecimentos', (req, res) => res.json(db.getAbastecimentos(req.emp, req.query.mes)));

// === VEICULOS ===
app.get('/api/veiculos', (req, res) => res.json(db.getVeiculos(req.emp)));
app.post('/api/veiculos', (req, res) => {
  const item = { id: uid(), ...req.body };
  db.addVeiculo(req.emp, item);
  res.json({ ok: true, id: item.id });
});
app.put('/api/veiculos/:id', (req, res) => { db.updateVeiculo(req.emp, req.params.id, req.body); res.json({ ok: true }); });
app.delete('/api/veiculos/:id', (req, res) => { db.delVeiculo(req.emp, req.params.id); res.json({ ok: true }); });

// === CATEGORIAS GRÁFICO ===
app.get('/api/categorias-grafico', (req, res) => res.json(db.getCategoriasSummary(req.emp, req.query.mes)));
app.get('/api/fornecedores-grafico', (req, res) => res.json(db.getFornecedoresSummary(req.emp, req.query.mes)));

// === CONTAS A PAGAR ===
app.get('/api/contas-pagar', (req, res) => res.json(db.getContasPagar(req.emp, req.query.mes)));
app.post('/api/contas-pagar', (req, res) => {
  const b = req.body;
  console.log('POST /contas-pagar body:', JSON.stringify({recorrente: b.recorrente, boleto_chegou: b.boleto_chegou, a_chegar: b.a_chegar}));
  const item = { id: uid(), ...b };
  db.addContaPagar(req.emp, item);
  db.addAuditLog(req.emp, req.user.nome, 'criou', 'Contas a Pagar', 'ID: ' + item.id + ' - ' + b.descricao + ' - R$ ' + b.valor);
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
  db.addAuditLog(req.emp, req.user.nome, 'alterou', 'Contas a Pagar', 'ID: ' + req.params.id + ' - ' + JSON.stringify(req.body));
  res.json({ ok: true });
});
app.delete('/api/contas-pagar/:id', (req, res) => {
  db.delContaPagar(req.emp, req.params.id);
  db.addAuditLog(req.emp, req.user.nome, 'excluiu', 'Contas a Pagar', 'ID: ' + req.params.id);
  res.json({ ok: true });
});
app.get('/api/contas-pagar/grupo/:grupo', (req, res) => {
  res.json(db.getContasPagarByGrupo(req.emp, req.params.grupo));
});
app.post('/api/contas-pagar/excluir-multi', (req, res) => {
  const ids = req.body.ids || [];
  if (!ids.length) return res.status(400).json({ error: 'Nenhum ID informado' });
  const count = db.delContasPagarMulti(req.emp, ids);
  db.addAuditLog(req.emp, req.user.nome, 'excluiu', 'Contas a Pagar', 'Excluiu ' + count + ' parcelas: ' + ids.join(', '));
  res.json({ ok: true, count });
});
app.delete('/api/contas-pagar/grupo/:grupo', (req, res) => {
  const count = db.delContasPagarGrupo(req.emp, req.params.grupo);
  db.addAuditLog(req.emp, req.user.nome, 'excluiu grupo', 'Contas a Pagar', 'Grupo: ' + req.params.grupo + ' (' + count + ' parcelas)');
  res.json({ ok: true, count });
});
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
app.put('/api/acerto/:id/chegou', (req, res) => {
  db.updateAcerto(req.emp, req.params.id, { a_chegar: false });
  db.addAuditLog(req.emp, req.user.nome, 'alterou', 'Acerto', 'Produto marcado como chegou - ID: ' + req.params.id);
  res.json({ ok: true });
});
app.put('/api/acerto/:id/a-chegar', (req, res) => {
  const conta = db.getAcertoById(req.emp, req.params.id);
  if (conta) {
    const novoStatus = !conta.a_chegar;
    db.updateAcerto(req.emp, req.params.id, { a_chegar: novoStatus });
    db.addAuditLog(req.emp, req.user.nome, 'alterou', 'Acerto', 'Produto ' + (novoStatus ? 'marcado como a chegar' : 'desmarcado como a chegar') + ' - ID: ' + req.params.id);
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
  db.addAuditLog(req.emp, req.user.nome, 'criou', 'Cheques', 'ID: ' + item.id + ' - ' + b.cliente + ' - R$ ' + b.valor);
  res.json({ ok: true, id: item.id });
});
app.delete('/api/cheques/:id', (req, res) => {
  db.delContaDonoByCheque(req.emp, req.params.id);
  db.delCheque(req.emp, req.params.id);
  db.addAuditLog(req.emp, req.user.nome, 'excluiu', 'Cheques', 'ID: ' + req.params.id);
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
app.put('/api/cheques/:id', (req, res) => {
  db.updateCheque(req.emp, req.params.id, req.body);
  db.addAuditLog(req.emp, req.user.nome, 'alterou', 'Cheques', 'ID: ' + req.params.id + ' - ' + JSON.stringify(req.body));
  res.json({ ok: true });
});

// === CONTA DONO ===
app.get('/api/conta-dono', (req, res) => res.json(db.getContaDono(req.emp, req.query.mes)));
app.post('/api/conta-dono', (req, res) => {
  console.log('📥 POST /api/conta-dono:', JSON.stringify(req.body));
  const b = req.body;
  const item = { id: uid(), ...b };
  db.addContaDono(req.emp, item);
  db.addAuditLog(req.emp, req.user.nome, 'criou', 'Conta Dono', 'ID: ' + item.id + ' - ' + b.descricao + ' - R$ ' + b.valor);
  res.json({ ok: true, id: item.id });
});
app.delete('/api/conta-dono/:id', (req, res) => {
  db.delContaDono(req.emp, req.params.id);
  db.addAuditLog(req.emp, req.user.nome, 'excluiu', 'Conta Dono', 'ID: ' + req.params.id);
  res.json({ ok: true });
});
app.put('/api/conta-dono/:id', (req, res) => { db.updateContaDono(req.emp, req.params.id, req.body); res.json({ ok: true }); });

// === COLABORADORES ===
app.get('/api/colaboradores', (req, res) => res.json(db.getColaboradores(req.emp)));
app.post('/api/colaboradores', (req, res) => {
  const b = req.body;
  const id = db.addColaborador(req.emp, b);
  db.addAuditLog(req.emp, req.user.nome, 'criou', 'Colaboradores', 'ID: '+id+' - '+b.nome);
  res.json({ ok: true, id });
});
app.put('/api/colaboradores/:id', (req, res) => {
  db.updateColaborador(req.emp, parseInt(req.params.id), req.body);
  res.json({ ok: true });
});
app.delete('/api/colaboradores/:id', (req, res) => { db.delColaborador(req.emp, parseInt(req.params.id)); res.json({ ok: true }); });

// === FOLHA DE PAGAMENTO ===
app.get('/api/folha', (req, res) => res.json(db.getFolha(req.emp, req.query.mes)));
app.post('/api/folha', (req, res) => {
  const b = req.body; b.id = uid();
  db.addFolha(req.emp, b);
  res.json({ ok: true, id: b.id });
});
app.put('/api/folha/:id', (req, res) => {
  db.updateFolha(req.emp, req.params.id, req.body);
  res.json({ ok: true });
});
app.delete('/api/folha/:id', (req, res) => {
  db.delFolha(req.emp, req.params.id);
  res.json({ ok: true });
});

// === HOLERITES ===
const { PDFParse } = require('pdf-parse');
async function pdfParse(buffer) {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return { text: result.text };
  } finally {
    await parser.destroy().catch(() => {});
  }
}
app.get('/api/holerites', (req, res) => res.json(db.getHolerites(req.emp, req.query.mes)));
app.post('/api/holerites/upload', upload.array('pdfs', 50), async (req, res) => {
  try {
  const mes = req.body.mes;
  if (!mes) return res.status(400).json({ error: 'Mês obrigatório' });
  const results = [];
  for (const file of (req.files || [])) {
    try {
      console.log('Parsing PDF:', file.originalname, 'size:', file.size);
      const pdf = await pdfParse(file.buffer);
      const blocks = splitHolerites(pdf.text);
      console.log('Holerites encontrados no PDF:', blocks.length);
      const seen = new Set();
      for (const block of blocks) {
        const parsed = parseHolerite(block);
        console.log('Parsed:', JSON.stringify({nome: parsed.nome, cadastro: parsed.cadastro, liquido: parsed.liquido, salario_base: parsed.salario_base}));
        if (!parsed.nome) { results.push({ ok: false, file: file.originalname, error: 'Nome não identificado em um bloco' }); continue; }
        // Holerite geralmente vem em 2 vias iguais - deduplicar
        const key = parsed.cadastro + '|' + parsed.cpf + '|' + parsed.nome;
        if (seen.has(key)) continue;
        seen.add(key);
        parsed.id = uid();
        parsed.mes = mes;
        parsed.nome_pdf = file.originalname;
        // Se já importou este colaborador neste mês, substituir
        db.run_raw(req.emp, 'DELETE FROM holerites WHERE mes=? AND UPPER(TRIM(nome))=UPPER(TRIM(?))', [mes, parsed.nome]);
        // Vincular a colaborador existente pelo nome
        const colab = db.findColaboradorByNome(req.emp, parsed.nome);
        if (colab) {
          parsed.colaborador_id = colab.id;
          // Atualizar dados cadastrais que estiverem vazios
          const upd = {};
          if (!colab.cpf && parsed.cpf) upd.cpf = parsed.cpf;
          if (!colab.cargo && parsed.cargo) upd.cargo = parsed.cargo;
          if (!colab.cbo && parsed.cbo) upd.cbo = parsed.cbo;
          if (!colab.data_admissao && parsed.data_admissao) upd.data_admissao = parsed.data_admissao;
          if (!colab.salario_base && parsed.salario_base) upd.salario_base = parsed.salario_base;
          if (!colab.cadastro && parsed.cadastro) upd.cadastro = parsed.cadastro;
          if (!colab.departamento && parsed.departamento) upd.departamento = parsed.departamento;
          if (Object.keys(upd).length) db.updateColaborador(req.emp, colab.id, upd);
        } else {
          let colabId = db.addColaborador(req.emp, {
            nome: parsed.nome, cpf: parsed.cpf, cargo: parsed.cargo,
            cbo: parsed.cbo, data_admissao: parsed.data_admissao,
            salario_base: parsed.salario_base, departamento: parsed.departamento || '',
            cadastro: parsed.cadastro, dependentes: parsed.dependentes,
            faixa: parsed.faixa, registrado: 1
          });
          if (!colabId) {
            const novo = db.findColaboradorByNome(req.emp, parsed.nome);
            colabId = novo ? novo.id : null;
          }
          parsed.colaborador_id = colabId;
        }
        db.addHolerite(req.emp, parsed);
        results.push({ ok: true, nome: parsed.nome, file: file.originalname });
      }
      if (!blocks.length) results.push({ ok: false, file: file.originalname, error: 'Nenhum holerite reconhecido no PDF' });
    } catch (e) {
      console.error('Erro parsing holerite:', file.originalname, e.message);
      results.push({ ok: false, file: file.originalname, error: e.message });
    }
  }
  db.addAuditLog(req.emp, req.user.nome, 'importou', 'Folha Pagamento', 'Importou ' + results.filter(r => r.ok).length + ' holerite(s)');
  res.json(results);
  } catch(globalErr) {
    console.error('Erro global upload holerites:', globalErr);
    res.status(500).json({ error: globalErr.message });
  }
});

// Divide o texto do PDF em blocos, um por holerite
function splitHolerites(text) {
  const lines = text.split('\n');
  const blocks = [];
  let cur = [];
  for (const line of lines) {
    if (/Demonstrativo de Pagamento de Sal[aá]rio/i.test(line) && cur.length) {
      blocks.push(cur.join('\n'));
      cur = [];
    }
    cur.push(line);
  }
  if (cur.length) blocks.push(cur.join('\n'));
  return blocks.filter(b => /Demonstrativo de Pagamento de Sal[aá]rio/i.test(b));
}
app.delete('/api/holerites/:id', (req, res) => {
  db.delHolerite(req.emp, req.params.id);
  res.json({ ok: true });
});

function parseVal(s) { return parseFloat((s || '0').replace(/\./g, '').replace(',', '.')) || 0; }

function parseHolerite(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const result = { nome: '', cpf: '', cargo: '', cbo: '', data_admissao: '', salario_base: 0,
    total_proventos: 0, total_descontos: 0, liquido: 0, fgts_mes: 0, inss: 0, irrf: 0,
    sal_cont_inss: 0, bas_calc_fgts: 0, faixa: 0, dependentes: 0, cadastro: '', departamento: '',
    proventos: [], descontos: [] };

  // CPF
  const cpfM = text.match(/CPF[:\s]*(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/i);
  if (cpfM) result.cpf = cpfM[1];

  // Linha de identificação após o cabeçalho "Cadastro Nome do Funcionário CBO Empresa Local Departamento FL"
  // Ex: "53 ALESSANDRA DE MORAIS OLIVEIRA 521110 47 1 000.000.999 01"
  for (let i = 0; i < lines.length; i++) {
    if (/Cadastro\s+Nome\s+do\s+Funcion/i.test(lines[i])) {
      const identLine = lines[i + 1] || '';
      const m = identLine.match(/^(\d+)\s+(.+?)\s+(\d{6})\s+(\d+)\s+(\d+)\s+([\d.]+)\s+(\d+)\s*$/);
      if (m) {
        result.cadastro = m[1];
        result.nome = m[2].trim();
        result.cbo = m[3];
        result.departamento = m[6];
      } else {
        // Fallback: cadastro + nome até o primeiro bloco numérico
        const m2 = identLine.match(/^(\d+)\s+([A-ZÀ-Ú][A-ZÀ-Úa-zà-ú\s]+?)(?=\s+\d)/);
        if (m2) { result.cadastro = m2[1]; result.nome = m2[2].trim(); }
      }
      // Linha seguinte: "BALCONISTA Data Admissão: 01/03/2017"
      const cargoLine = lines[i + 2] || '';
      const cm = cargoLine.match(/^(.*?)\s*Data\s+Admiss[ãa]o[:\s]*(\d{2}\/\d{2}\/\d{4})/i);
      if (cm) { result.cargo = cm[1].trim(); result.data_admissao = cm[2]; }
      break;
    }
  }
  // Data admissão fallback (pode estar em outra linha)
  if (!result.data_admissao) {
    const admM = text.match(/Data\s+Admiss[ãa]o[:\s]*(\d{2}\/\d{2}\/\d{4})/i);
    if (admM) result.data_admissao = admM[1];
  }

  // Tabela de eventos (proventos/descontos)
  let inEv = false;
  for (const line of lines) {
    if (/^Ev\s+Descri/i.test(line)) { inEv = true; continue; }
    if (inEv) {
      if (/^Total\b/i.test(line)) {
        const tm = line.match(/^Total\s+([\d.,]+)(?:\s+([\d.,]+))?\s*$/i);
        if (tm) {
          result.total_proventos = parseVal(tm[1]);
          result.total_descontos = tm[2] !== undefined ? parseVal(tm[2]) : 0;
        }
        inEv = false; continue;
      }
      // Ex: "1 Horas Normais Diurnas 30 Dias 1.621,00" | "1950 INSS 7,50 % 121,57" | "890 Desconto Adiantamento Férias 1.991,14"
      const em = line.match(/^(\d+)\s+(.+?)\s+([\d.]+,\d{2})\s*$/);
      if (em) {
        let desc = em[2].trim();
        // Remove a referência do final da descrição ("30 Dias", "7,50 %", "2,00")
        desc = desc.replace(/\s+[\d.,]+\s*(Dias|%|Hrs|Hs|Horas)?\s*$/i, '').trim();
        const valor = parseVal(em[3]);
        const isDesconto = /INSS|IRRF|Desconto|Adiant|Falta|Vale|Atraso|Contribui|Pens[aã]o|Empr[eé]st|Conv[eê]nio|Farm[aá]cia/i.test(desc);
        if (isDesconto) result.descontos.push({ ev: em[1], descricao: desc, valor });
        else result.proventos.push({ ev: em[1], descricao: desc, valor });
      }
    }
  }

  // INSS destacado
  const inssItem = result.descontos.find(d => /INSS/i.test(d.descricao));
  if (inssItem) result.inss = inssItem.valor;

  // Total Líquido — valor vem ANTES do rótulo: "1.499,43	Total Líquido"
  let liqM = text.match(/([\d.]+,\d{2})\s*Total\s+L[ií]quido/i);
  if (!liqM) liqM = text.match(/Total\s+L[ií]quido\s*([\d.]+,\d{2})/i);
  if (liqM) result.liquido = parseVal(liqM[1]);

  // Rodapé: "Salário Base Sal Cont INSS Bas Cálc FGTS FGTS Mês Bas Cálc IRRF Faixa Dep"
  // Valores podem estar na mesma linha, na linha seguinte ou na anterior
  for (let i = 0; i < lines.length; i++) {
    if (/Sal[aá]rio\s+Base/i.test(lines[i]) && /FGTS/i.test(text.substring(text.indexOf(lines[i])))) {
      const candidates = [lines[i], lines[i + 1] || '', lines[i - 1] || '', (lines[i] + ' ' + (lines[i + 1] || ''))];
      for (const cand of candidates) {
        const nums = cand.match(/[\d.]+,\d{2}/g) || [];
        if (nums.length >= 4) {
          result.salario_base = parseVal(nums[0]);
          result.sal_cont_inss = parseVal(nums[1]);
          result.bas_calc_fgts = parseVal(nums[2]);
          result.fgts_mes = parseVal(nums[3]);
          if (nums[4] !== undefined) result.irrf = parseVal(nums[4]);
          if (nums[5] !== undefined) result.faixa = parseVal(nums[5]);
          const depM = cand.match(/(\d{1,2})\s*$/);
          if (depM && !cand.trim().endsWith(nums[nums.length-1])) result.dependentes = parseInt(depM[1]);
          break;
        }
      }
      if (result.salario_base) break;
    }
  }

  return result;
}

// === NF-e (NOTAS EMITIDAS CONTRA O CNPJ) ===
const nfe = require('./nfe');
app.get('/api/nfe/config', adminOnly, (req, res) => {
  const cfg = nfe.getNfeConfig(req.emp);
  res.json({ cnpj: cfg.cnpj, uf: cfg.uf, auto: cfg.auto, temCert: cfg.temCert, temSenha: !!cfg.senha, ultNSU: cfg.ultNSU, ultimaConsulta: cfg.ultimaConsulta, ultimoErro: cfg.ultimoErro, proxConsulta: cfg.proxConsulta });
});
app.post('/api/nfe/config', adminOnly, upload.single('pfx'), (req, res) => {
  try {
    if (req.file) fs.writeFileSync(nfe.certPath(req.emp), req.file.buffer);
    if (req.body.senha) db.updateConfig(req.emp, 'nfe_senha', req.body.senha);
    if (req.body.cnpj !== undefined) db.updateConfig(req.emp, 'nfe_cnpj', (req.body.cnpj || '').replace(/\D/g, ''));
    if (req.body.uf) db.updateConfig(req.emp, 'nfe_uf', req.body.uf);
    if (req.body.auto !== undefined) db.updateConfig(req.emp, 'nfe_auto', req.body.auto === '1' || req.body.auto === true || req.body.auto === 'true' ? '1' : '0');
    db.addAuditLog(req.emp, req.user.nome, 'alterou', 'Notas CNPJ', 'Atualizou configuração NF-e' + (req.file ? ' (novo certificado)' : ''));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/nfe/consultar', async (req, res) => {
  try {
    const r = await nfe.consultarNotas(req.emp);
    res.json(r);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/notas-recebidas', (req, res) => res.json(db.getNotasRecebidas(req.emp)));
app.put('/api/notas-recebidas/:id', (req, res) => {
  const allowed = {};
  if (req.body.status) allowed.status = req.body.status;
  db.updateNotaRecebida(req.emp, req.params.id, allowed);
  res.json({ ok: true });
});
app.get('/api/notas-recebidas/:id/xml', (req, res) => {
  const nota = db.getNotaRecebidaById(req.emp, req.params.id);
  if (!nota || !nota.xml) return res.status(404).json({ error: 'XML não disponível' });
  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Content-Disposition', 'attachment; filename="NFe' + nota.chave + '.xml"');
  res.send(nota.xml);
});
// Contas parecidas com a nota (aviso de duplicidade)
app.get('/api/notas-recebidas/:id/similares', (req, res) => {
  const nota = db.getNotaRecebidaById(req.emp, req.params.id);
  if (!nota) return res.status(404).json({ error: 'Nota não encontrada' });
  let dups = [];
  try { dups = JSON.parse(nota.duplicatas_json || '[]'); } catch (e) {}
  if (!dups.length) dups = [{ vencimento: nota.data_emissao, valor: nota.valor }];
  const similares = [];
  const vistos = new Set();
  for (const d of dups) {
    for (const c of db.findContasSimilares(req.emp, d.vencimento, d.valor, nota.emitente)) {
      if (!vistos.has(c.id)) { vistos.add(c.id); similares.push(c); }
    }
  }
  res.json(similares);
});
// Aprovar várias notas de uma vez (usa as parcelas do XML)
app.post('/api/notas-recebidas/aprovar-multi', (req, res) => {
  const ids = req.body.ids || [];
  let aprovadas = 0, semXml = 0, duplicadas = 0;
  for (const id of ids) {
    const nota = db.getNotaRecebidaById(req.emp, id);
    if (!nota || nota.status !== 'nova') continue;
    if (nota.tipo !== 'completa') { semXml++; continue; }
    let dups = [];
    try { dups = JSON.parse(nota.duplicatas_json || '[]'); } catch (e) {}
    if (!dups.length) dups = [{ vencimento: nota.data_emissao, valor: nota.valor }];
    // Pular se já existe conta parecida (possível duplicidade)
    let temSimilar = false;
    for (const d of dups) { if (db.findContasSimilares(req.emp, d.vencimento, d.valor, nota.emitente).length) { temSimilar = true; break; } }
    if (temSimilar) { duplicadas++; continue; }
    const grupo = dups.length > 1 ? 'grp_nfe_' + nota.id : '';
    const descBase = (nota.emitente || 'Nota') + (nota.numero ? ' NF ' + nota.numero : '');
    const temBoleto = /Boleto|Duplicata/i.test(nota.forma_pagamento || '');
    dups.forEach((d, i) => {
      db.addContaPagar(req.emp, {
        id: uid(), vencimento: d.vencimento || nota.data_emissao, valor: d.valor,
        descricao: descBase + (dups.length > 1 ? ' ' + (i + 1) + '/' + dups.length : ''),
        categoria: 'Outros', fornecedor: nota.emitente, recorrente: true,
        boleto_chegou: temBoleto, a_chegar: false, grupo_parcela: grupo,
      });
    });
    db.updateNotaRecebida(req.emp, id, { status: 'lancada' });
    aprovadas++;
  }
  if (aprovadas) db.addAuditLog(req.emp, req.user.nome, 'criou', 'Contas a Pagar', 'Aprovou ' + aprovadas + ' nota(s) NF-e em lote');
  res.json({ ok: true, aprovadas, semXml, duplicadas });
});
// Ignorar/restaurar várias
app.put('/api/notas-recebidas-multi', (req, res) => {
  const ids = req.body.ids || [];
  const status = req.body.status === 'nova' ? 'nova' : 'ignorada';
  for (const id of ids) db.updateNotaRecebida(req.emp, id, { status });
  res.json({ ok: true, count: ids.length });
});

// === FORNECEDORES (CADASTRO COMPLETO) ===
app.get('/api/fornecedores-cad', (req, res) => res.json(db.getFornecedoresCad(req.emp)));
app.post('/api/fornecedores-cad', (req, res) => {
  const f = { id: uid(), ...req.body, origem: 'manual' };
  db.addFornecedorCad(req.emp, f);
  db.addAuditLog(req.emp, req.user.nome, 'criou', 'Fornecedores', 'ID: ' + f.id + ' - ' + (f.razao || f.fantasia));
  res.json({ ok: true, id: f.id });
});
app.put('/api/fornecedores-cad/:id', (req, res) => {
  db.updateFornecedorCad(req.emp, req.params.id, req.body);
  res.json({ ok: true });
});
app.delete('/api/fornecedores-cad/:id', (req, res) => {
  db.delFornecedorCad(req.emp, req.params.id);
  res.json({ ok: true });
});

// === BOLETO (bipe + importar PDF) ===
const boleto = require('./boleto');
app.post('/api/boleto/analisar', (req, res) => {
  const dec = boleto.decodeLinhaDigitavel(req.body.linha || '');
  if (!dec.valido && !dec.valor) return res.status(400).json({ error: 'Código não reconhecido. Confira se bipou/colou a linha completa do boleto.' });
  const enr = boleto.enriquecer(req.emp, { valor: dec.valor, vencimento: dec.vencimento, cnpj: '', beneficiario: '', linha: dec.linha, banco: dec.banco, tipo: dec.tipo });
  res.json(enr);
});
app.post('/api/boleto/importar-pdf', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum PDF enviado' });
    const pdf = await pdfParse(req.file.buffer);
    const dados = boleto.parseBoletoPdf(pdf.text);
    if (!dados.valor && !dados.linha) return res.status(422).json({ error: 'Não consegui ler os dados do boleto neste PDF. Pode ser um PDF só de imagem (escaneado).' });
    const enr = boleto.enriquecer(req.emp, dados);
    res.json(enr);
  } catch (e) {
    console.error('Erro importar boleto PDF:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// === ALERTAS (dashboard) ===
app.get('/api/alertas', (req, res) => {
  const hoje = new Date();
  const amanha = new Date(hoje.getTime() + 86400000);
  const f = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const notasNovas = db.getNotasRecebidas(req.emp).filter(n => n.status === 'nova').length;
  const vencendo = db.getContasVencendo(req.emp, f(hoje), f(amanha));
  const hojeStr = f(hoje);
  res.json({
    notasNovas,
    boletosHoje: vencendo.filter(c => c.vencimento === hojeStr),
    boletosAmanha: vencendo.filter(c => c.vencimento !== hojeStr),
  });
});

// === TELEGRAM ===
const telegram = require('./telegram');
app.post('/api/telegram/testar', adminOnly, async (req, res) => {
  const r = await telegram.sendTelegram(req.emp, '✅ Teste de notificação do Sistema Nunes Rocha funcionando!');
  res.json(r);
});

app.post('/api/notas-recebidas/:id/lancar', (req, res) => {
  const nota = db.getNotaRecebidaById(req.emp, req.params.id);
  if (!nota) return res.status(404).json({ error: 'Nota não encontrada' });
  const b = req.body;
  const parcelas = b.parcelas || [];
  if (!parcelas.length) return res.status(400).json({ error: 'Nenhuma parcela informada' });
  const grupo = parcelas.length > 1 ? 'grp_nfe_' + nota.id : '';
  let criadas = 0;
  for (const p of parcelas) {
    const item = {
      id: uid(), vencimento: p.vencimento, descricao: p.descricao, valor: p.valor,
      categoria: b.categoria || 'Outros', fornecedor: b.fornecedor || nota.emitente,
      recorrente: !!b.recorrente, boleto_chegou: !!b.boleto_chegou, a_chegar: !!b.a_chegar,
      grupo_parcela: grupo,
    };
    db.addContaPagar(req.emp, item);
    criadas++;
  }
  db.updateNotaRecebida(req.emp, req.params.id, { status: 'lancada' });
  db.addAuditLog(req.emp, req.user.nome, 'criou', 'Contas a Pagar', 'Lançou NF-e ' + (nota.numero || nota.chave) + ' de ' + nota.emitente + ' em ' + criadas + ' parcela(s)');
  res.json({ ok: true, criadas });
});

// === CLEAR ALL (admin only) ===
app.delete('/api/clear/acerto', adminOnly, (req, res) => { db.clearAcerto(req.emp); db.addAuditLog(req.emp, req.user.nome, 'limpou tudo', 'Acerto', ''); res.json({ ok: true }); });
app.delete('/api/clear/fat', adminOnly, (req, res) => { db.clearFat(req.emp); db.addAuditLog(req.emp, req.user.nome, 'limpou tudo', 'FAT', ''); res.json({ ok: true }); });
app.delete('/api/clear/contas-pagar', adminOnly, (req, res) => { db.clearContasPagar(req.emp); db.addAuditLog(req.emp, req.user.nome, 'limpou tudo', 'Contas a Pagar', ''); res.json({ ok: true }); });
app.delete('/api/clear/drogaria', adminOnly, (req, res) => { db.clearDrogaria(req.emp); db.addAuditLog(req.emp, req.user.nome, 'limpou tudo', 'Drogaria', ''); res.json({ ok: true }); });
app.delete('/api/clear/cheques', adminOnly, (req, res) => { db.clearCheques(req.emp); db.addAuditLog(req.emp, req.user.nome, 'limpou tudo', 'Cheques', ''); res.json({ ok: true }); });
app.delete('/api/clear/conta-dono', adminOnly, (req, res) => { db.clearContaDono(req.emp); db.addAuditLog(req.emp, req.user.nome, 'limpou tudo', 'Conta Dono', ''); res.json({ ok: true }); });

// === CONFIG ===
app.get('/api/config', (req, res) => res.json(db.getConfig(req.emp)));
app.put('/api/config', (req, res) => {
  for(let k in req.body){
    if(req.body[k] !== undefined) {
      db.updateConfig(req.emp, k, req.body[k]);
    }
  }
  res.json({ ok: true });
});

// === DASHBOARD ===
// === CAIXAS ===
app.get('/api/caixas', (req, res) => res.json(db.getCaixas(req.emp)));
app.post('/api/caixas', (req, res) => {
  db.addCaixa(req.emp, req.body.nome, req.body.saldo || 0);
  db.addAuditLog(req.emp, req.user.nome, 'criou', 'Caixas', req.body.nome);
  res.json({ ok: true });
});
app.put('/api/caixas/:id', (req, res) => { db.updateCaixaSaldo(req.emp, parseInt(req.params.id), req.body.saldo); res.json({ ok: true }); });
app.delete('/api/caixas/:id', (req, res) => { db.delCaixa(req.emp, parseInt(req.params.id)); res.json({ ok: true }); });
app.delete('/api/clear/caixas', adminOnly, (req, res) => { db.clearCaixas(req.emp); db.addAuditLog(req.emp, req.user.nome, 'limpou tudo', 'Caixas', ''); res.json({ ok: true }); });

// === MOVIMENTAÇÃO ===
app.get('/api/movimentacao', (req, res) => res.json(db.getMovimentacao(req.emp, req.query.mes)));
app.post('/api/movimentacao', (req, res) => {
  const b = req.body;
  db.addMovimentacao(req.emp, { id: uid(), data: b.data, descricao: b.descricao, entrada: b.entrada || 0, saida: b.saida || 0, diferenca: b.diferenca || 0 });
  db.addAuditLog(req.emp, req.user.nome, 'criou', 'Movimentação', b.descricao);
  res.json({ ok: true });
});
app.put('/api/movimentacao/:id/diferenca', (req, res) => {
  db.updateMovimentacaoDiferenca(req.emp, req.params.id, parseFloat(req.body.diferenca) || 0);
  res.json({ ok: true });
});
app.put('/api/movimentacao/:id', (req, res) => { db.updateMovimentacao(req.emp, req.params.id, req.body); res.json({ ok: true }); });
app.delete('/api/movimentacao/:id', (req, res) => { db.delMovimentacao(req.emp, req.params.id); res.json({ ok: true }); });
app.delete('/api/clear/movimentacao', adminOnly, (req, res) => { db.clearMovimentacao(req.emp); db.addAuditLog(req.emp, req.user.nome, 'limpou tudo', 'Movimentação', ''); res.json({ ok: true }); });
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

// === BACKUP ===
function getBackupConfig() {
  try {
    const cfg = db.getConfig('nunesrocha');
    return {
      ftp_host: cfg.ftp_host || '',
      ftp_user: cfg.ftp_user || '',
      ftp_pass: cfg.ftp_pass || '',
      ftp_path: cfg.ftp_path || '/backups',
      google_credentials: cfg.google_credentials || '',
      google_folder_id: cfg.google_folder_id || ''
    };
  } catch(e) { return {}; }
}
app.get('/api/backup/status', adminOnly, (req, res) => res.json(backup.getBackupStatus()));
app.post('/api/backup/manual', adminOnly, async (req, res) => {
  try {
    const status = await backup.runBackup(getBackupConfig);
    res.json({ ok: true, status });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// === SOMAS (RASCUNHOS COMPARTILHADOS) ===
app.get('/api/somas', (req, res) => res.json(db.getSomas(req.emp)));
app.post('/api/somas', (req, res) => {
  const item = { id: uid(), titulo: req.body.titulo || 'Sem título', criado_por: req.user.nome };
  db.addSoma(req.emp, item);
  res.json({ ok: true, id: item.id });
});
app.put('/api/somas/:id', (req, res) => {
  db.updateSomaTitulo(req.emp, req.params.id, req.body.titulo);
  res.json({ ok: true });
});
app.delete('/api/somas/:id', (req, res) => {
  db.delSoma(req.emp, req.params.id);
  res.json({ ok: true });
});
app.post('/api/somas/:id/itens', (req, res) => {
  const item = { id: uid(), soma_id: req.params.id, descricao: req.body.descricao || '', valor: parseFloat(req.body.valor) || 0 };
  db.addSomaItem(req.emp, item);
  res.json({ ok: true, id: item.id });
});
app.put('/api/soma-itens/:id', (req, res) => {
  const fields = {};
  if (req.body.descricao !== undefined) fields.descricao = req.body.descricao;
  if (req.body.valor !== undefined) fields.valor = parseFloat(req.body.valor);
  db.updateSomaItem(req.emp, req.params.id, fields);
  res.json({ ok: true });
});
app.delete('/api/soma-itens/:id', (req, res) => {
  db.delSomaItem(req.emp, req.params.id);
  res.json({ ok: true });
});

// === AUDITORIA ===
app.get('/api/auditoria', adminOnly, (req, res) => {
  const filtros = { usuario: req.query.usuario, secao: req.query.secao, dataInicio: req.query.dataInicio, dataFim: req.query.dataFim };
  res.json(db.getAuditLogs(req.emp, filtros));
});
app.get('/api/auditoria/item', (req, res) => {
  const { secao, id } = req.query;
  if (!secao || !id) return res.status(400).json({ error: 'secao e id obrigatórios' });
  res.json(db.getAuditByItem(req.emp, secao, id));
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

db.init().then(() => {
  app.listen(PORT, '0.0.0.0', () => console.log(`✅ Sistema rodando em http://0.0.0.0:${PORT}`));
  // Backup automático: 7h, 12h, 16h e 20h (horário do servidor)
  cron.schedule('0 7,12,16,20 * * *', () => {
    console.log('⏰ Backup agendado iniciando...');
    backup.runBackup(getBackupConfig);
  });
  console.log('⏰ Backup agendado: 07:00, 12:00, 16:00, 20:00');
  cron.schedule('15 * * * *', () => {
    console.log('⏰ Consulta NF-e agendada iniciando...');
    nfe.consultarTodasEmpresas().catch(e => console.error('Erro consulta NF-e:', e.message));
  });
  console.log('⏰ Consulta NF-e agendada: a cada hora (minuto 15)');
  cron.schedule('0 8 * * *', () => {
    console.log('⏰ Aviso de boletos vencendo (Telegram)...');
    telegram.notificarTodasEmpresas().catch(e => console.error('Erro Telegram:', e.message));
  });
  console.log('⏰ Aviso Telegram de boletos: 08:00');
}).catch(err => { console.error('Erro ao iniciar banco:', err); process.exit(1); });
