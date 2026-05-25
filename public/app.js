(function(){
'use strict';
let CFG={pctAdmin:23,pctDono:36,pctReserva:30,categoriasLoja:[],categoriasDrog:[]},COLABS=[];
let currentEmpresa='nunesrocha';
let empresasList=[],chequePagContaId='',chequePagContas=[],chequePagContext='contas-pagar',acertoFinanceiroGeral=[];
let currentUser=null,authToken=localStorage.getItem('authToken')||'';
const MENU_MAP={'dashboard':'Painel Geral','acerto':'Acerto Financeiro','fat':'Fat (Recorrentes)','contas-pagar':'Contas a Pagar','a-chegar':'Produtos a Chegar','movimentacao':'Movimentação','drogaria':'Drogaria','cheques':'Troca de Cheques','conta-dono':'Conta do Celso','distribuicao':'Distribuição','colaboradores':'Comissionados','relatorios':'Relatórios','configuracoes':'Configurações','caixas':'Caixas','usuarios':'Usuários'};
const MENU_ICONS={'dashboard':'fa-chart-pie','acerto':'fa-cash-register','fat':'fa-redo','contas-pagar':'fa-file-invoice-dollar','a-chegar':'fa-truck-loading','movimentacao':'fa-exchange-alt','drogaria':'fa-pills','cheques':'fa-money-check-alt','conta-dono':'fa-user-tie','distribuicao':'fa-percentage','colaboradores':'fa-users','relatorios':'fa-file-alt','configuracoes':'fa-cog','caixas':'fa-cash-register','usuarios':'fa-users-cog'};
const COLORS=['#00d4aa','#3b82f6','#f59e0b','#ec4899','#8b5cf6','#06b6d4','#f43f5e','#14b8a6','#6366f1'];
function fmt(v){return'R$ '+Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});}
function fD(d){if(!d)return'-';let p=d.split('-');return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:d;}
function gM(){return document.getElementById('monthSelector').value;}
function toast(m,t){t=t||'success';let c=document.getElementById('toastContainer'),e=document.createElement('div');e.className='toast toast-'+t;e.textContent=m;c.appendChild(e);setTimeout(()=>e.remove(),3000);}
async function api(method,path,body){
  const o={method,headers:{'Content-Type':'application/json','X-Empresa':currentEmpresa}, cache:'no-store'};
  if(authToken)o.headers['Authorization']='Bearer '+authToken;
  if(body)o.body=JSON.stringify(body);
  const resp=await fetch(path,o);
  if(resp.status===401){showLogin();throw new Error('unauthorized');}
  return resp.json();
}
// === AUTH ===
document.getElementById('formLogin').addEventListener('submit',async function(e){
  e.preventDefault();
  let errEl=document.getElementById('login-erro');
  errEl.style.display='none';
  try{
    const resp=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:document.getElementById('login-user').value,senha:document.getElementById('login-senha').value})});
    const data=await resp.json();
    if(!resp.ok){errEl.textContent=data.error||'Erro ao fazer login';errEl.style.display='block';return;}
    authToken=data.token;currentUser=data.user;
    localStorage.setItem('authToken',authToken);
    showApp();
  }catch(err){errEl.textContent='Erro de conexão';errEl.style.display='block';}
});
function showLogin(){
  authToken='';currentUser=null;localStorage.removeItem('authToken');
  document.getElementById('loginOverlay').style.display='flex';
  document.getElementById('sidebar').style.display='none';
  document.getElementById('mainContent').style.display='none';
  document.getElementById('login-user').value='';document.getElementById('login-senha').value='';
  document.getElementById('login-erro').style.display='none';
}
function showApp(){
  document.getElementById('loginOverlay').style.display='none';
  document.getElementById('sidebar').style.display='';
  document.getElementById('mainContent').style.display='';
  document.getElementById('topbarUserName').textContent=currentUser.nome;
  applyPermissions();
  loadEmpresas().then(()=>refreshAll());
}
function applyPermissions(){
  let perms=currentUser.permissoes||[],isAdmin=currentUser.role==='admin';
  document.querySelectorAll('.nav-link').forEach(link=>{
    let s=link.dataset.section;
    link.parentElement.style.display=(isAdmin||perms.includes(s))?'':'none';
  });
}
async function logout(){try{await api('POST','/api/logout');}catch(e){}showLogin();toast('Sessão encerrada','info');}
async function checkAuth(){
  if(!authToken){showLogin();return;}
  try{currentUser=await api('GET','/api/me');showApp();}
  catch(e){showLogin();}
}
// === EMPRESA SELECTOR ===
const THEME_COLORS=[
  {nome:'Verde',cor:'#00d4aa'},{nome:'Azul',cor:'#3b82f6'},{nome:'Roxo',cor:'#8b5cf6'},
  {nome:'Laranja',cor:'#f59e0b'},{nome:'Rosa',cor:'#ec4899'},{nome:'Vermelho',cor:'#ef4444'},
  {nome:'Ciano',cor:'#06b6d4'},{nome:'Teal',cor:'#14b8a6'},{nome:'Índigo',cor:'#6366f1'},
  {nome:'Lime',cor:'#84cc16'},{nome:'Âmbar',cor:'#d97706'},{nome:'Fúcsia',cor:'#d946ef'},
  {nome:'Esmeralda',cor:'#10b981'},{nome:'Céu',cor:'#0ea5e9'},{nome:'Coral',cor:'#f97316'}
];
const THEME_BGS=[
  {nome:'Padrão',bg:'#0f1117',bg2:'#1a1d27',bg3:'#242833',surface:'#1e2130',border:'#2e3348'},
  {nome:'Marinho',bg:'#0a1628',bg2:'#111d35',bg3:'#1a2a45',surface:'#142236',border:'#243656'},
  {nome:'Grafite',bg:'#171717',bg2:'#1f1f1f',bg3:'#2a2a2a',surface:'#222222',border:'#383838'},
  {nome:'Petróleo',bg:'#0f1a1a',bg2:'#142424',bg3:'#1d3030',surface:'#182828',border:'#2a4040'},
  {nome:'Roxo Noite',bg:'#12101f',bg2:'#1b1730',bg3:'#25203f',surface:'#1e1a2f',border:'#342d50'},
  {nome:'Vinho',bg:'#1a0f14',bg2:'#261520',bg3:'#33202c',surface:'#201520',border:'#442838'},
  {nome:'Floresta',bg:'#0f1712',bg2:'#152018',bg3:'#1e2c22',surface:'#172418',border:'#2a3e2e'},
  {nome:'Chocolate',bg:'#18140f',bg2:'#221c14',bg3:'#2e261c',surface:'#1e1a14',border:'#403624'},
  {nome:'Preto Puro',bg:'#000000',bg2:'#0a0a0a',bg3:'#141414',surface:'#0e0e0e',border:'#222222'},
  {nome:'Azul Escuro',bg:'#0b1222',bg2:'#10192e',bg3:'#18243e',surface:'#121d30',border:'#203050'}
];
function applyThemeColor(cor){
  if(!cor)cor='#00d4aa';
  document.documentElement.style.setProperty('--green',cor);
  document.documentElement.style.setProperty('--green-bg',cor+'1f');
}
function applyThemeBg(bgKey){
  let t=THEME_BGS.find(b=>b.nome===bgKey)||THEME_BGS[0];
  document.documentElement.style.setProperty('--bg',t.bg);
  document.documentElement.style.setProperty('--bg2',t.bg2);
  document.documentElement.style.setProperty('--bg3',t.bg3);
  document.documentElement.style.setProperty('--surface',t.surface);
  document.documentElement.style.setProperty('--border',t.border);
}
async function loadEmpresas(){
  empresasList=await api('GET','/api/empresas');
  let sel=document.getElementById('empresaSelector');
  sel.innerHTML=empresasList.map(e=>'<option value="'+e.slug+'"'+(e.slug===currentEmpresa?' selected':'')+'>'+e.nome+'</option>').join('');
  let emp=empresasList.find(e=>e.slug===currentEmpresa);
  document.getElementById('empresaNome').textContent=emp?emp.nome:'Sistema';
  document.title=(emp?emp.nome:'Sistema')+' — Controle Financeiro';
  applyThemeColor(emp?emp.cor:null);
  applyThemeBg(emp?emp.fundo:null);
  renderCorPicker();
}
function renderCorPicker(){
  let box=document.getElementById('corPickerBox');
  if(!box||!currentUser||currentUser.role!=='admin')return;
  let emp=empresasList.find(e=>e.slug===currentEmpresa);
  let corAtual=emp?emp.cor:'#00d4aa';
  let fundoAtual=emp?emp.fundo:'Padrão';
  let h='<label style="font-size:.75rem;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;font-weight:600;display:block;margin-bottom:8px">Cor do Tema</label><div style="display:flex;flex-wrap:wrap;gap:6px">';
  h+=THEME_COLORS.map(c=>'<button onclick="NR.setCor(\''+c.cor+'\')" title="'+c.nome+'" style="width:28px;height:28px;border-radius:50%;border:2px solid '+(c.cor===corAtual?'#fff':'transparent')+';background:'+c.cor+';cursor:pointer;transition:all .2s;box-shadow:'+(c.cor===corAtual?'0 0 8px '+c.cor:'none')+'"></button>').join('');
  h+='</div>';
  h+='<label style="font-size:.75rem;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;font-weight:600;display:block;margin:16px 0 8px">Fundo</label><div style="display:flex;flex-wrap:wrap;gap:6px">';
  h+=THEME_BGS.map(b=>'<button onclick="NR.setFundo(\''+b.nome+'\')" title="'+b.nome+'" style="width:40px;height:28px;border-radius:6px;border:2px solid '+(b.nome===fundoAtual?'#fff':'transparent')+';background:linear-gradient(135deg,'+b.bg+','+b.bg3+');cursor:pointer;transition:all .2s;font-size:0;box-shadow:'+(b.nome===fundoAtual?'0 0 8px rgba(255,255,255,.3)':'none')+'"></button>').join('');
  h+='</div>';
  box.innerHTML=h;
}
async function setCor(cor){
  await api('PUT','/api/empresas/'+currentEmpresa+'/cor',{cor});
  applyThemeColor(cor);
  let emp=empresasList.find(e=>e.slug===currentEmpresa);
  if(emp)emp.cor=cor;
  renderCorPicker();
  toast('Cor do tema alterada!');
}
async function setFundo(nome){
  await api('PUT','/api/empresas/'+currentEmpresa+'/cor',{fundo:nome});
  applyThemeBg(nome);
  let emp=empresasList.find(e=>e.slug===currentEmpresa);
  if(emp)emp.fundo=nome;
  renderCorPicker();
  toast('Fundo alterado!');
}
document.getElementById('empresaSelector').addEventListener('change',function(){
  currentEmpresa=this.value;
  let emp=empresasList.find(e=>e.slug===currentEmpresa);
  document.getElementById('empresaNome').textContent=emp?emp.nome:'Sistema';
  document.title=(emp?emp.nome:'Sistema')+' — Controle Financeiro';
  applyThemeColor(emp?emp.cor:null);
  applyThemeBg(emp?emp.fundo:null);
  toast('Empresa: '+(emp?emp.nome:currentEmpresa),'info');
  refreshAll();
});
async function novaEmpresa(){
  let nome=prompt('Nome da nova empresa:');
  if(!nome||!nome.trim())return;
  nome=nome.trim();
  let slug=nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'');
  if(!slug){toast('Nome inválido','error');return;}
  let res=await api('POST','/api/empresas',{slug,nome});
  if(res.ok){toast('Empresa "'+nome+'" criada!');currentEmpresa=slug;await loadEmpresas();refreshAll();}
  else{toast('Empresa já existe','error');}
}
async function delEmpresa(){
  if(currentEmpresa==='nunesrocha'){toast('Não pode excluir a empresa padrão','error');return;}
  let emp=empresasList.find(e=>e.slug===currentEmpresa);
  confirmClear('Empresa "'+(emp?emp.nome:currentEmpresa)+'" e TODOS os dados','__empresa__');
}
// NAV
document.querySelectorAll('.nav-link').forEach(l=>{l.addEventListener('click',e=>{e.preventDefault();let s=l.dataset.section;document.querySelectorAll('.nav-link').forEach(x=>x.classList.remove('active'));l.classList.add('active');document.querySelectorAll('.content-section').forEach(x=>x.classList.remove('active'));document.getElementById('section-'+s).classList.add('active');document.getElementById('pageTitle').textContent=MENU_MAP[s]||s;document.getElementById('sidebar').classList.remove('open');});});
document.getElementById('menuToggle').addEventListener('click',()=>document.getElementById('sidebar').classList.toggle('open'));
let now=new Date(),ms=document.getElementById('monthSelector');
ms.value=now.getFullYear()+'-'+(now.getMonth()+1).toString().padStart(2,'0');
ms.addEventListener('change',()=>refreshAll());
function setToday(id){let e=document.getElementById(id);if(e)e.value=now.toISOString().split('T')[0];}
['ac-data','drog-data','chq-data','chq-venc','dono-data','cp-venc','mov-data'].forEach(setToday);
function populateCats(){
  document.getElementById('ac-cat').innerHTML=CFG.categoriasLoja.map(c=>'<option>'+c+'</option>').join('');
  let drogCat=document.getElementById('drog-cat');if(drogCat)drogCat.innerHTML=CFG.categoriasDrog.map(c=>'<option>'+c+'</option>').join('');
  document.getElementById('cp-cat').innerHTML=CFG.categoriasLoja.map(c=>'<option>'+c+'</option>').join('');
  document.getElementById('rel-cat').innerHTML='<option value="">Todas</option>'+CFG.categoriasLoja.map(c=>'<option>'+c+'</option>').join('');
  let fornOpts='<option value="">—</option>'+(CFG.fornecedores||[]).map(f=>'<option>'+f+'</option>').join('');
  document.getElementById('ac-forn').innerHTML=fornOpts;
  document.getElementById('cp-forn').innerHTML=fornOpts;
}
async function addCatInline(selId,tipo){
  let v=prompt('Nome da nova categoria:');if(!v||!v.trim())return;v=v.trim();
  if(tipo==='loja'){CFG.categoriasLoja.push(v);await api('PUT','/api/config',{categoriasLoja:CFG.categoriasLoja});}else{CFG.categoriasDrog.push(v);await api('PUT','/api/config',{categoriasDrog:CFG.categoriasDrog});}
  populateCats();document.getElementById(selId).value=v;toast('Categoria "'+v+'" adicionada!');
}
async function addFornInline(selId){
  selId=selId||'ac-forn';
  let v=prompt('Nome do novo fornecedor:');if(!v||!v.trim())return;v=v.trim();
  if(!CFG.fornecedores)CFG.fornecedores=[];CFG.fornecedores.push(v);
  await api('PUT','/api/config',{fornecedores:CFG.fornecedores});
  populateCats();document.getElementById(selId).value=v;toast('Fornecedor "'+v+'" adicionado!');
}
// ACERTO FINANCEIRO
document.getElementById('formAcerto').addEventListener('submit',async function(e){e.preventDefault();await api('POST','/api/acerto',{data:document.getElementById('ac-data').value,descricao:document.getElementById('ac-desc').value,entrada:parseFloat(document.getElementById('ac-entrada').value)||0,saida:parseFloat(document.getElementById('ac-saida').value)||0,categoria:document.getElementById('ac-cat').value,fornecedor:document.getElementById('ac-forn').value,recorrente:document.getElementById('ac-rec').value==='1',tipo_nota:document.getElementById('ac-nota').value});this.reset();setToday('ac-data');populateCats();toast('Lançamento salvo!');refreshAll();});
let acFiltro=document.getElementById('ac-filtro');
acFiltro.addEventListener('change',()=>renderAcerto());
async function renderAcerto(){
  let items=await api('GET','/api/acerto?mes='+gM()),f=acFiltro.value,te=0,ts=0;
  if(f==='D')items=items.filter(i=>i.tipo_nota==='D');
  else if(f==='F')items=items.filter(i=>i.tipo_nota==='F');
  else if(f==='rec')items=items.filter(i=>i.recorrente);
  let tb=document.querySelector('#tabelaAcerto tbody');
  acertoFinanceiroGeral=items;
  tb.innerHTML=items.map(i=>{
    te+=i.entrada||0;ts+=i.saida||0;
    let pago = i.origem_conta_pagar && i.origem_conta_pagar.includes('Cheques:');
    let chqBtn = (i.saida > 0 && !pago) ? '<button class="btn-cheque-pay" style="padding:4px 8px;font-size:11px;margin-right:4px" onclick="NR.openChequePag(\''+i.id+'\',\'acerto\')" title="Pagar com cheque"><i class="fas fa-money-check-alt"></i></button>' : (pago ? '<span style="font-size:11px;color:var(--green);margin-right:4px" title="'+i.origem_conta_pagar+'"><i class="fas fa-check"></i> Chq</span>' : '');
    let catSel='<select class="inline-select" onchange="NR.setAcField(\''+i.id+'\',\'categoria\',this.value)">'+CFG.categoriasLoja.map(c=>'<option'+(c===i.categoria?' selected':'')+'>'+c+'</option>').join('')+'</select>';
    let fornSel='<select class="inline-select" onchange="NR.setAcField(\''+i.id+'\',\'fornecedor\',this.value)"><option value=""'+((!i.fornecedor||i.fornecedor==='')?' selected':'')+'>—</option>'+(CFG.fornecedores||[]).map(f=>'<option'+(f===i.fornecedor?' selected':'')+'>'+f+'</option>').join('')+'</select>';
    let recSel='<select class="inline-select" onchange="NR.setAcField(\''+i.id+'\',\'recorrente\',this.value)"><option value="0"'+(i.recorrente?'':' selected')+'>Não</option><option value="1"'+(i.recorrente?' selected':'')+'>Sim</option></select>';
    let dfSel='<select class="inline-select" onchange="NR.setAcField(\''+i.id+'\',\'tipo_nota\',this.value)"><option value=""'+(!i.tipo_nota?' selected':'')+'>—</option><option value="D"'+(i.tipo_nota==='D'?' selected':'')+'>D</option><option value="F"'+(i.tipo_nota==='F'?' selected':'')+'>F</option></select>';
    return'<tr><td>'+fD(i.data)+'</td><td>'+i.descricao+'</td><td class="tipo-entrada">'+(i.entrada?fmt(i.entrada):'')+'</td><td class="tipo-saida">'+(i.saida?fmt(i.saida):'')+'</td><td>'+catSel+'</td><td>'+fornSel+'</td><td>'+recSel+'</td><td>'+dfSel+'</td><td><div style="display:flex;align-items:center">'+chqBtn+'<button class="btn btn-sm btn-danger" onclick="NR.delAc(\''+i.id+'\')"><i class="fas fa-trash"></i></button></div></td></tr>';}).join('');
  document.getElementById('ac-total-ent').textContent=fmt(te);
  document.getElementById('ac-total-sai').textContent=fmt(ts);
  document.getElementById('ac-saldo').textContent=fmt(te-ts);
  // Chart
  let cats=await api('GET','/api/categorias-grafico?mes='+gM()),ch=document.getElementById('chartCategorias');
  if(!cats.length){ch.innerHTML='<p style="color:var(--text3)">Sem dados</p>';}
  else{let max=Math.max(...cats.map(c=>c.total));
  ch.innerHTML=cats.map((c,i)=>'<div class="chart-bar-row"><span class="chart-bar-label">'+c.categoria+'</span><div class="chart-bar-track"><div class="chart-bar-fill" style="width:'+Math.max(c.total/max*100,5)+'%;background:'+COLORS[i%COLORS.length]+'">'+Math.round(c.total/max*100)+'%</div></div><span class="chart-bar-value">'+fmt(c.total)+'</span></div>').join('');}
  // Chart fornecedores
  let forns=await api('GET','/api/fornecedores-grafico?mes='+gM()),chf=document.getElementById('chartFornecedores');
  if(!forns.length){chf.innerHTML='<p style="color:var(--text3)">Sem dados</p>';}
  else{let maxf=Math.max(...forns.map(f=>f.total));
  chf.innerHTML=forns.map((f,i)=>'<div class="chart-bar-row"><span class="chart-bar-label">'+f.fornecedor+'</span><div class="chart-bar-track"><div class="chart-bar-fill" style="width:'+Math.max(f.total/maxf*100,5)+'%;background:'+COLORS[(i+3)%COLORS.length]+'">'+Math.round(f.total/maxf*100)+'%</div></div><span class="chart-bar-value">'+fmt(f.total)+'</span></div>').join('');}
}
async function renderFat(){
  let items=await api('GET','/api/fat?mes='+gM()),total=0;
  let agrupados = {};
  items.forEach(i => {
    let cat = i.categoria || 'Outros';
    if(!agrupados[cat]) agrupados[cat] = { data: i.data, descricao: i.descricao, saida: 0, categoria: cat };
    agrupados[cat].saida += (i.saida || 0);
  });
  let itemsAgrupados = Object.values(agrupados);
  document.querySelector('#tabelaFat tbody').innerHTML=itemsAgrupados.map(i=>{total+=i.saida||0;return'<tr><td>'+fD(i.data)+'</td><td>'+i.descricao+'</td><td class="tipo-saida">'+fmt(i.saida)+'</td><td>'+i.categoria+'</td></tr>';}).join('');
  document.getElementById('fat-total').textContent=fmt(total);
  // Chart por categoria
  let cats=itemsAgrupados.map(i=>({categoria:i.categoria,total:i.saida})).sort((a,b)=>b.total-a.total);
  let ch=document.getElementById('chartFat');
  if(!cats.length){ch.innerHTML='<p style="color:var(--text3)">Sem dados recorrentes</p>';return;}
  let max=Math.max(...cats.map(c=>c.total));
  ch.innerHTML=cats.map((c,i)=>'<div class="chart-bar-row"><span class="chart-bar-label">'+c.categoria+'</span><div class="chart-bar-track"><div class="chart-bar-fill" style="width:'+Math.max(c.total/max*100,5)+'%;background:'+COLORS[i%COLORS.length]+'">'+Math.round(c.total/max*100)+'%</div></div><span class="chart-bar-value">'+fmt(c.total)+'</span></div>').join('');
}
// CONTAS A PAGAR
document.getElementById('formContaPagar').addEventListener('submit',async function(e){e.preventDefault();await api('POST','/api/contas-pagar',{vencimento:document.getElementById('cp-venc').value,descricao:document.getElementById('cp-desc').value,valor:parseFloat(document.getElementById('cp-valor').value),categoria:document.getElementById('cp-cat').value,fornecedor:document.getElementById('cp-forn').value,recorrente:document.getElementById('cp-rec').value==='1',tipo_nota:document.getElementById('cp-nota').value});this.reset();setToday('cp-venc');populateCats();toast('Conta salva!');refreshAll();});
async function renderContasPagar(){
  let items=await api('GET','/api/contas-pagar?mes='+gM()),tp=0,tpg=0;
  let caixas=await api('GET','/api/caixas');
  chequePagContas=items;
  let colabOpts='<option value="">—</option><option value="A Pagar">A Pagar</option>'+COLABS.map(c=>'<option value="'+c.nome+'">'+c.nome+'</option>').join('');
  let caixaOpts='<option value="0">—</option>'+caixas.map(cx=>'<option value="'+cx.id+'">'+cx.nome+' ('+fmt(cx.saldo)+')</option>').join('');
  let tb=document.querySelector('#tabelaContasPagar tbody');
  tb.innerHTML=items.map(i=>{
    let pago=i.pago_por&&i.pago_por!==''&&i.pago_por!=='A Pagar';
    let boletoN=!i.boleto_chegou;
    let cls=pago?'row-pago':(boletoN?'row-boleto-pendente':'');
    if(pago)tpg+=i.valor;else tp+=i.valor;
    let chqBtn=pago?'':'<button class="btn-cheque-pay" onclick="NR.openChequePag(\''+i.id+'\')" title="Pagar com cheque"><i class="fas fa-money-check-alt"></i> Cheque</button> ';
    let cxSel='<select class="inline-select" onchange="NR.setCaixaPago(\''+i.id+'\',this.value)">'+caixaOpts.replace('value="'+(i.caixa_id||0)+'"','value="'+(i.caixa_id||0)+'" selected')+'</select>';
    let achegar=i.a_chegar?'<span style="background:var(--amber);color:#000;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:700;margin-left:4px"><i class="fas fa-truck-loading"></i> A CHEGAR</span>':'';
    let chegarBtn=i.a_chegar?'<button class="btn btn-sm" style="background:var(--green);color:#fff;font-size:10px" onclick="NR.marcarChegou(\''+i.id+'\')" title="Marcar como chegou"><i class="fas fa-check"></i> Chegou</button> ':'<button class="btn btn-sm" style="background:var(--bg3);color:var(--amber);font-size:10px;border:1px solid var(--amber)" onclick="NR.toggleAChegar(\''+i.id+'\')" title="Marcar como produto a chegar"><i class="fas fa-truck-loading"></i></button> ';
    return'<tr class="'+cls+'"><td>'+fD(i.vencimento)+'</td><td>'+i.descricao+achegar+'</td><td>'+fmt(i.valor)+'</td><td>'+i.categoria+'</td><td>'+(i.fornecedor||'—')+'</td><td>'+(i.recorrente?'Sim':'Não')+'</td><td>'+(i.tipo_nota||'—')+'</td><td><button class="inline-toggle '+(i.boleto_chegou?'is-yes':'is-no')+'" onclick="NR.toggleBoleto(\''+i.id+'\','+(!i.boleto_chegou?1:0)+')">'+(i.boleto_chegou?'Sim':'Não')+'</button></td><td><select class="inline-select" onchange="NR.setPago(\''+i.id+'\',this.value)">'+colabOpts.replace('value="'+(i.pago_por||'')+'"','value="'+(i.pago_por||'')+'" selected')+'</select></td><td>'+cxSel+'</td><td>'+chegarBtn+chqBtn+'<button class="btn btn-sm btn-danger" onclick="NR.delCP(\''+i.id+'\')"><i class="fas fa-trash"></i></button></td></tr>';
  }).join('');
  document.getElementById('cp-total-pend').textContent=fmt(tp);
  document.getElementById('cp-total-pago').textContent=fmt(tpg);
}
// PRODUTOS A CHEGAR
async function renderAChegar(){
  let items=await api('GET','/api/a-chegar');
  let badge=document.getElementById('badge-achegar');
  if(items.length){badge.textContent=items.length;badge.style.display='inline';}else{badge.style.display='none';}
  document.getElementById('achegar-total').textContent=items.length;
  let tb=document.querySelector('#tabelaAChegar tbody');
  if(!items.length){tb.innerHTML='<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text3)"><i class="fas fa-check-circle" style="font-size:2rem;margin-bottom:8px;display:block;color:var(--green)"></i>Todos os produtos chegaram!</td></tr>';return;}
  tb.innerHTML=items.map(i=>'<tr><td>'+fD(i.vencimento)+'</td><td>'+i.descricao+'</td><td>'+fmt(i.valor)+'</td><td>'+(i.fornecedor||'—')+'</td><td><button class="btn btn-sm" style="background:var(--green);color:#fff" onclick="NR.marcarChegou(\''+i.id+'\')"><i class="fas fa-check"></i> Chegou</button></td></tr>').join('');
}
async function marcarChegou(id){
  if(!confirm('Marcar produto como chegou? (Todas as parcelas do mesmo produto serão desmarcadas)'))return;
  await api('PUT','/api/contas-pagar/'+id+'/chegou');
  toast('Produto marcado como chegou!');
  refreshAll();
}
async function toggleAChegar(id){
  await api('PUT','/api/contas-pagar/'+id+'/a-chegar');
  toast('Marcado como produto a chegar!');
  refreshAll();
}
// PAGAR COM CHEQUE (MODAL)
async function openChequePag(contaId, context='contas-pagar'){
  chequePagContext=context;
  let conta=null;
  if(context==='contas-pagar') conta=chequePagContas.find(c=>c.id===contaId);
  else conta=acertoFinanceiroGeral.find(c=>c.id===contaId);
  if(!conta)return;
  chequePagContaId=contaId;
  let valor = context==='contas-pagar' ? conta.valor : conta.saida;
  document.getElementById('chequePagInfo').innerHTML=
    '<div class="cpag-info-line"><span>Descrição:</span><b>'+conta.descricao+'</b></div>'+
    '<div class="cpag-info-line"><span>Fornecedor:</span><b>'+(conta.fornecedor||'—')+'</b></div>'+
    '<div class="cpag-info-line"><span>Valor:</span><b style="color:var(--red);font-size:1.1rem">'+fmt(valor)+'</b></div>';
  let cheques=await api('GET','/api/cheques?mes='+gM());
  let pendentes=cheques.filter(c=>c.status==='pendente');
  let list=document.getElementById('chequePagList');
  list.innerHTML=pendentes.length ? pendentes.map(c=>
    '<label style="display:flex;align-items:center;gap:8px;padding:6px;border-bottom:1px solid var(--border);cursor:pointer;font-size:13px">' +
    '<input type="checkbox" class="chq-pag-cb" value="'+c.id+'" data-valor="'+c.valor+'" data-label="'+(c.numero?'Nº '+c.numero:c.cliente)+'" onchange="NR.calcChequePag()"> ' +
    (c.numero?'Nº '+c.numero+' — ':'')+c.cliente+(c.dono_cheque?' ('+c.dono_cheque+')':'')+' — '+fmt(c.valor)+(c.bom_para?' (Bom p/ '+fD(c.bom_para)+')':'')+' ['+c.dias+'d]' +
    '</label>'
  ).join('') : '<div style="color:var(--text3);font-size:13px;text-align:center;padding:10px">Nenhum cheque disponível</div>';
  list.dataset.contaValor=valor;
  list.dataset.contaForn=conta.fornecedor||conta.descricao;
  document.getElementById('chequePagCalc').style.display='none';
  document.getElementById('btnConfirmChequePag').disabled=true;
  document.getElementById('modalCheque').style.display='flex';
}
function calcChequePag(){
  let list=document.getElementById('chequePagList'),calc=document.getElementById('chequePagCalc'),btn=document.getElementById('btnConfirmChequePag');
  let cbs=Array.from(document.querySelectorAll('.chq-pag-cb:checked'));
  if(cbs.length===0){calc.style.display='none';btn.disabled=true;return;}
  let chequeV=cbs.reduce((sum,cb)=>sum+parseFloat(cb.dataset.valor),0);
  let contaV=parseFloat(list.dataset.contaValor)||0;
  let resto=contaV-chequeV;
  calc.style.display='';
  btn.disabled=false;
  calc.innerHTML='<div class="cpag-calc-box">'+
    '<div class="cpag-calc-line"><span>Valor da Conta:</span><b style="color:var(--text)">'+fmt(contaV)+'</b></div>'+
    '<div class="cpag-calc-line"><span>Valor do(s) Cheque(s) ('+cbs.length+'):</span><b style="color:var(--green)">- '+fmt(chequeV)+'</b></div>'+
    '<div class="cpag-calc-line result"><span>'+(resto>0?'💵 Pagar em Dinheiro:':'✅ Cheques cobrem tudo')+'</span><b style="color:'+(resto>0?'var(--amber)':'var(--green)')+'">'+
    (resto>0?fmt(resto):(resto<0?'Troco: '+fmt(Math.abs(resto)):'R$ 0,00'))+'</b></div></div>';
}
async function confirmChequePag(){
  let list=document.getElementById('chequePagList');
  let cbs=Array.from(document.querySelectorAll('.chq-pag-cb:checked'));
  if(cbs.length===0||!chequePagContaId)return;
  let forn=list.dataset.contaForn;
  let chequeV=cbs.reduce((sum,cb)=>sum+parseFloat(cb.dataset.valor),0);
  let contaV=parseFloat(list.dataset.contaValor)||0;
  let resto=contaV-chequeV;
  for(let cb of cbs){
    await api('PUT','/api/cheques/'+cb.value+'/destino',{destino:forn});
  }
  let labels=cbs.map(cb=>cb.dataset.label).join(', ');
  let pagLabel='Cheques: '+labels;
  if(chequePagContext==='contas-pagar'){
    await api('PUT','/api/contas-pagar/'+chequePagContaId,{pago_por:pagLabel});
  }else{
    await api('PUT','/api/acerto/'+chequePagContaId,{origem_conta_pagar:pagLabel});
  }
  closeChequePag();
  let msg='Conta paga com cheque(s)!';
  if(resto>0)msg+=' Falta '+fmt(resto)+' em dinheiro.';
  toast(msg);refreshAll();
}
function closeChequePag(){document.getElementById('modalCheque').style.display='none';chequePagContaId='';}
document.getElementById('btnConfirmChequePag').addEventListener('click',confirmChequePag);
// DROGARIA
document.getElementById('formDrogaria').addEventListener('submit',async function(e){e.preventDefault();await api('POST','/api/drogaria',{data:document.getElementById('drog-data').value,tipo:document.getElementById('drog-tipo').value,descricao:document.getElementById('drog-desc').value,valor:parseFloat(document.getElementById('drog-valor').value),categoria:'Geral'});this.reset();setToday('drog-data');toast('Salvo!');refreshAll();});
async function renderDrogaria(){
  let items=await api('GET','/api/drogaria?mes='+gM()),te=0,ts=0,saldo=0;
  document.querySelector('#tabelaDrogaria tbody').innerHTML=items.map(i=>{
    if(i.tipo==='entrada'){te+=i.valor;saldo+=i.valor;}else{ts+=i.valor;saldo-=i.valor;}
    let tipoLabel=i.tipo==='entrada'?'Crédito':'Débito';
    let tipoClass=i.tipo==='entrada'?'tipo-entrada':'tipo-saida';
    return'<tr><td>'+fD(i.data)+'</td><td class="'+tipoClass+'">'+(i.tipo==='entrada'?'↑ ':'↓ ')+tipoLabel+'</td><td>'+i.descricao+'</td><td class="'+tipoClass+'">'+fmt(i.valor)+'</td><td style="color:'+(saldo>=0?'var(--green)':'var(--red)')+'">'+fmt(saldo)+'</td><td><button class="btn btn-sm btn-danger" onclick="NR.del(\'drogaria\',\''+i.id+'\')"><i class="fas fa-trash"></i></button></td></tr>';
  }).join('');
  document.getElementById('drog-total-ent').textContent=fmt(te);
  document.getElementById('drog-total-sai').textContent=fmt(ts);
  document.getElementById('drog-saldo').textContent=fmt(te-ts);
  let s=te-ts,card=document.getElementById('drogSaldoCard');
  if(s>0)card.innerHTML='<h2 style="color:var(--green);font-size:2rem">'+fmt(s)+'</h2><p style="color:var(--text3)">Loja deve para Drogaria</p>';
  else if(s<0)card.innerHTML='<h2 style="color:var(--red);font-size:2rem">'+fmt(Math.abs(s))+'</h2><p style="color:var(--text3)">Drogaria deve para Loja</p>';
  else card.innerHTML='<h2 style="color:var(--text2);font-size:2rem">R$ 0,00</h2><p style="color:var(--text3)">Sem saldo pendente</p>';
}
// CHEQUES
let cv=document.getElementById('chq-valor'),ct=document.getElementById('chq-taxa'),cl=document.getElementById('chq-lucro'),cd=document.getElementById('chq-dias'),cdata=document.getElementById('chq-data'),cvenc=document.getElementById('chq-venc'),cbom=document.getElementById('chq-bompara'),cte=document.getElementById('chq-taxa-extra');
function calcChqDias(){let d1=cdata.value,d2=cvenc.value;if(d1&&d2){let dias=Math.max(Math.round((new Date(d2)-new Date(d1))/(86400000)),1);cd.value=dias;return dias;}cd.value='';return 0;}
function calcChqLucro(){let dias=calcChqDias(),v=parseFloat(cv.value)||0,t=parseFloat(ct.value)||0,extra=parseFloat(cte.value)||0;if(dias>0&&v>0){let lucro=v*t/100*dias/30+extra;cl.value=fmt(lucro);updateValorPassar();}else{cl.value='';document.getElementById('chq-valor-passar').value='';}}
function updateValorPassar(){let v=parseFloat(cv.value)||0,lucroStr=cl.value.replace(/[^\d,.-]/g,'').replace('.','').replace(',','.'),lucro=parseFloat(lucroStr)||0;let vp=document.getElementById('chq-valor-passar');if(document.getElementById('chq-juros-ant').checked){vp.value=fmt(v-lucro);vp.style.color='var(--green)';vp.style.fontWeight='bold';}else{vp.value='';vp.style.color='';}}
cv.addEventListener('input',calcChqLucro);
ct.addEventListener('input',calcChqLucro);
cdata.addEventListener('change',calcChqLucro);
cvenc.addEventListener('change',calcChqLucro);
cte.addEventListener('input',calcChqLucro);
document.getElementById('chq-juros-ant').addEventListener('change',updateValorPassar);
document.getElementById('formCheque').addEventListener('submit',async function(e){e.preventDefault();let dias=calcChqDias();let extra=parseFloat(cte.value)||0;await api('POST','/api/cheques',{numero:document.getElementById('chq-numero').value,data:cdata.value,cliente:document.getElementById('chq-cliente').value,dono_cheque:document.getElementById('chq-dono').value,valor:parseFloat(cv.value),taxa:parseFloat(ct.value),dias:dias,bom_para:cbom.value,origem_dinheiro:document.getElementById('chq-origem').value,vencimento:cvenc.value,status:document.getElementById('chq-status').value,juros_antecipado:document.getElementById('chq-juros-ant').checked,taxa_extra:extra});this.reset();setToday('chq-data');setToday('chq-venc');setToday('chq-bompara');ct.value='5';cte.value='0';cl.value='';cd.value='';document.getElementById('chq-valor-passar').value='';toast('Cheque salvo!');refreshAll();});
function renderChequesRow(i){
  let hoje=new Date().toISOString().split('T')[0];
  let dias=i.dias||Math.max(Math.round((new Date(i.vencimento)-new Date(i.data))/86400000),1);
  let bp=i.bom_para?fD(i.bom_para):fD(i.data);
  let bpClass='';
  if(i.status==='pendente'){bpClass=i.bom_para&&i.bom_para>hoje?' style="color:var(--amber)"':' style="color:var(--green)"';}
  let destCell='<input type="text" class="inline-input" value="'+(i.destino||'').replace(/"/g,'&quot;')+'" placeholder="p/ quem?" onchange="NR.setDest(\''+i.id+'\',this.value)" style="width:100px;padding:4px 6px;background:var(--card);border:1px solid var(--border);border-radius:4px;color:var(--text1);font-size:12px">';
  let statusLabel={'pendente':'A Retirar','retirado':'Retirado','compensado':'Compensado','devolvido':'Devolvido'};
  let sl=i.status||'pendente';
  let jaLabel=i.juros_antecipado?'<span style="font-size:.6rem;background:var(--amber);color:#000;padding:1px 5px;border-radius:4px;margin-left:4px">JA</span>':'';
  let extraLabel=(i.taxa_extra&&i.taxa_extra>0)?'<span style="font-size:.6rem;background:var(--purple);color:#fff;padding:1px 5px;border-radius:4px;margin-left:4px">+'+fmt(i.taxa_extra)+'</span>':'';
  return'<tr><td><input type="checkbox" class="chq-sel" data-id="'+i.id+'" onchange="NR.updateChqSelCount()" style="accent-color:var(--green);width:16px;height:16px;cursor:pointer"></td><td><b>'+(i.numero||'\u2014')+'</b></td><td>'+fD(i.data)+'</td><td>'+i.cliente+'</td><td>'+(i.dono_cheque||'—')+'</td><td>'+fmt(i.valor)+jaLabel+'</td><td>'+destCell+'</td><td'+bpClass+'>'+bp+'</td><td>'+dias+'d</td><td>'+i.taxa+'%/m'+extraLabel+'</td><td class="tipo-entrada">'+fmt(i.lucro)+'</td><td>'+(i.origem_dinheiro==='caixa-empresa'?'Caixa':'Celso')+'</td><td>'+fD(i.vencimento)+'</td><td class="status-'+sl+'">'+(statusLabel[sl]||sl)+'</td><td>'+'<button class="btn btn-sm" style="background:var(--blue);color:#fff" onclick="NR.printRecibo(\''+i.id+'\')" title="Imprimir recibo"><i class="fas fa-print"></i></button>'+(sl==='pendente'?'<button class="btn btn-sm btn-primary" onclick="NR.comp(\''+i.id+'\')">'+'<i class="fas fa-check"></i></button>':'')+'<button class="btn btn-sm btn-danger" onclick="NR.del(\'cheques\',\''+i.id+'\')">'+'<i class="fas fa-trash"></i></button></td></tr>';
}
async function renderCheques(){
  let items=await api('GET','/api/cheques?mes='+gM());chequesCache=items;let tt=0,tl=0,pn=0;
  let filtro=document.getElementById('chq-filtro-status').value;
  let hoje=new Date().toISOString().split('T')[0],dispQ=0,dispV=0,preQ=0,preV=0,pendQ=0,pendV=0,lucroT=0;
  // Calcular totais com TODOS os itens antes de filtrar
  items.forEach(i=>{
    tt+=i.valor;tl+=i.lucro;
    if(i.status==='pendente'){
      pn++;pendQ++;pendV+=i.valor;lucroT+=i.lucro;
      let bp=i.bom_para||i.data;
      if(bp<=hoje){dispQ++;dispV+=i.valor;}else{preQ++;preV+=i.valor;}
    }
  });
  // Aplicar filtro
  let filtered=items;
  if(filtro!=='todos') filtered=items.filter(i=>i.status===filtro);
  document.querySelector('#tabelaCheques tbody').innerHTML=filtered.map(i=>renderChequesRow(i)).join('')||
    '<tr><td colspan="14" style="text-align:center;padding:20px;color:var(--text3)">Nenhum cheque neste filtro</td></tr>';
  document.getElementById('chq-total-trocado').textContent=fmt(tt);
  document.getElementById('chq-total-lucro').textContent=fmt(tl);
  document.getElementById('chq-pendentes').textContent=pn;
  document.getElementById('chq-disp-qtd').textContent=dispQ;
  document.getElementById('chq-disp-val').textContent=fmt(dispV);
  document.getElementById('chq-pre-qtd').textContent=preQ;
  document.getElementById('chq-pre-val').textContent=fmt(preV);
  document.getElementById('chq-pend-qtd').textContent=pendQ;
  document.getElementById('chq-pend-val').textContent=fmt(pendV);
  document.getElementById('chq-lucro-total').textContent=fmt(lucroT);
}
document.getElementById('chq-filtro-status').addEventListener('change',()=>renderCheques());
let chqBuscaTimer;
document.getElementById('chq-busca').addEventListener('input',function(){
  clearTimeout(chqBuscaTimer);
  let q=this.value.trim();
  document.getElementById('chq-busca-limpar').style.display=q?'inline-flex':'none';
  chqBuscaTimer=setTimeout(()=>chqBusca(),300);
});
async function chqBusca(){
  let q=document.getElementById('chq-busca').value.trim();
  if(!q){renderCheques();return;}
  let items=await api('GET','/api/cheques/busca?q='+encodeURIComponent(q));
  document.querySelector('#tabelaCheques tbody').innerHTML=items.length?items.map(i=>renderChequesRow(i)).join(''):'<tr><td colspan="14" style="text-align:center;padding:20px;color:var(--text3)">Nenhum cheque encontrado para "'+q+'"</td></tr>';
}
async function setDest(id,v){await api('PUT','/api/cheques/'+id+'/destino',{destino:v});toast('Destino salvo!');}
// SELEÇÃO MÚLTIPLA DE CHEQUES
function toggleAllChq(checked){document.querySelectorAll('.chq-sel').forEach(cb=>cb.checked=checked);updateChqSelCount();}
function updateChqSelCount(){
  let sels=document.querySelectorAll('.chq-sel:checked');
  let btn=document.getElementById('btnPrintSelecionados');
  document.getElementById('chqSelCount').textContent=sels.length;
  btn.style.display=sels.length>0?'inline-flex':'none';
}
function printSelecionados(){
  let ids=[];document.querySelectorAll('.chq-sel:checked').forEach(cb=>ids.push(cb.dataset.id));
  if(!ids.length){toast('Selecione ao menos um cheque','error');return;}
  let selecionados=chequesCache.filter(c=>ids.includes(c.id));
  let totalValor=0,totalLucro=0;
  selecionados.forEach(c=>{totalValor+=c.valor;totalLucro+=c.lucro;});
  let rows=selecionados.map((c,idx)=>{
    let valorPassar=c.juros_antecipado?(c.valor-c.lucro):c.valor;
    return'<tr>'
      +'<td style="padding:6px 10px;border-bottom:1px solid #ddd;text-align:center">'+(idx+1)+'</td>'
      +'<td style="padding:6px 10px;border-bottom:1px solid #ddd">'+(c.numero||'—')+'</td>'
      +'<td style="padding:6px 10px;border-bottom:1px solid #ddd">'+c.cliente+'</td>'
      +'<td style="padding:6px 10px;border-bottom:1px solid #ddd">'+(c.dono_cheque||'—')+'</td>'
      +'<td style="padding:6px 10px;border-bottom:1px solid #ddd;text-align:right">'+fmt(c.valor)+'</td>'
      +'<td style="padding:6px 10px;border-bottom:1px solid #ddd;text-align:center">'+c.taxa+'%'+(c.taxa_extra>0?' + '+fmt(c.taxa_extra):'')+'</td>'
      +'<td style="padding:6px 10px;border-bottom:1px solid #ddd;text-align:right;color:#16a34a;font-weight:bold">'+fmt(c.lucro)+'</td>'
      +'<td style="padding:6px 10px;border-bottom:1px solid #ddd;text-align:right">'+fmt(valorPassar)+(c.juros_antecipado?' (JA)':'')+'</td>'
      +'<td style="padding:6px 10px;border-bottom:1px solid #ddd">'+(c.bom_para?fD(c.bom_para):'—')+'</td>'
      +'<td style="padding:6px 10px;border-bottom:1px solid #ddd">'+fD(c.vencimento)+'</td>'
      +'</tr>';
  }).join('');
  let w=window.open('','_blank','width=900,height=700');
  w.document.write('<html><head><title>Resumo de Cheques Selecionados</title></head><body style="font-family:Arial,sans-serif;padding:20px;color:#222">'
    +'<div style="text-align:center;margin-bottom:20px"><h2 style="margin:0">Resumo de Cheques</h2><p style="color:#666;margin:4px 0">Data: '+new Date().toLocaleDateString('pt-BR')+' — '+selecionados.length+' cheque(s)</p></div>'
    +'<table style="width:100%;border-collapse:collapse;font-size:13px">'
    +'<thead><tr style="background:#1e293b;color:#fff"><th style="padding:8px 10px;text-align:center">#</th><th style="padding:8px 10px">Nº Cheque</th><th style="padding:8px 10px">Responsável</th><th style="padding:8px 10px">Dono</th><th style="padding:8px 10px;text-align:right">Valor</th><th style="padding:8px 10px;text-align:center">Taxa</th><th style="padding:8px 10px;text-align:right">Lucro</th><th style="padding:8px 10px;text-align:right">Valor Passado</th><th style="padding:8px 10px">Bom Para</th><th style="padding:8px 10px">Vencimento</th></tr></thead>'
    +'<tbody>'+rows+'</tbody>'
    +'<tfoot><tr style="background:#f1f5f9;font-weight:bold;font-size:14px">'
    +'<td colspan="4" style="padding:10px;text-align:right">TOTAIS:</td>'
    +'<td style="padding:10px;text-align:right">'+fmt(totalValor)+'</td>'
    +'<td style="padding:10px"></td>'
    +'<td style="padding:10px;text-align:right;color:#16a34a">'+fmt(totalLucro)+'</td>'
    +'<td style="padding:10px;text-align:right">'+fmt(totalValor-totalLucro)+'</td>'
    +'<td colspan="2" style="padding:10px"></td>'
    +'</tr></tfoot></table>'
    +'<div style="margin-top:30px;display:flex;justify-content:space-between;font-size:12px;color:#666">'
    +'<span>Total de cheques: '+selecionados.length+'</span>'
    +'<span>Valor total: '+fmt(totalValor)+'</span>'
    +'<span>Lucro total: '+fmt(totalLucro)+'</span>'
    +'</div>'
    +'</body></html>');
  w.document.close();
  w.focus();
  setTimeout(()=>w.print(),500);
}
// CONTA DONO
document.getElementById('formDono').addEventListener('submit',async function(e){e.preventDefault();await api('POST','/api/conta-dono',{data:document.getElementById('dono-data').value,tipo:document.getElementById('dono-tipo').value,descricao:document.getElementById('dono-desc').value,valor:parseFloat(document.getElementById('dono-valor').value)});this.reset();setToday('dono-data');toast('Salvo!');refreshAll();});
async function renderContaDono(){let items=await api('GET','/api/conta-dono?mes='+gM()),td=0,tc=0,sa=0;document.querySelector('#tabelaDono tbody').innerHTML=items.map(i=>{if(i.tipo==='debito'){td+=i.valor;sa+=i.valor;}else{tc+=i.valor;sa-=i.valor;}return'<tr><td>'+fD(i.data)+'</td><td class="tipo-'+i.tipo+'">'+(i.tipo==='debito'?'↑ Débito':'↓ Crédito')+'</td><td>'+i.descricao+'</td><td class="tipo-'+i.tipo+'">'+fmt(i.valor)+'</td><td>'+fmt(Math.abs(sa))+'</td><td><button class="btn btn-sm btn-danger" onclick="NR.del(\'conta-dono\',\''+i.id+'\')"><i class="fas fa-trash"></i></button></td></tr>';}).join('');document.getElementById('dono-total-deb').textContent=fmt(td);document.getElementById('dono-total-cred').textContent=fmt(tc);let s=td-tc;document.getElementById('dono-saldo').textContent=fmt(Math.abs(s))+(s>0?' (Deve)':s<0?' (A receber)':' (Zerado)');}
// COLABORADORES
document.getElementById('formColab').addEventListener('submit',async function(e){e.preventDefault();await api('POST','/api/colaboradores',{nome:document.getElementById('colab-nome').value.trim(),percentual:parseFloat(document.getElementById('colab-pct').value)});this.reset();toast('Adicionado!');refreshAll();});
async function renderColaboradores(){COLABS=await api('GET','/api/colaboradores');let d=await api('GET','/api/dashboard?mes='+gM()),l=d.summary.lojaEnt-d.summary.lojaSai,tp=0;COLABS.forEach(c=>tp+=c.percentual);document.getElementById('colabList').innerHTML=COLABS.map(c=>{let v=l*c.percentual/100,ini=c.nome.split(' ').map(w=>w[0]).join('').substring(0,2).toUpperCase();return'<div class="colab-card"><div class="avatar">'+ini+'</div><div class="colab-info"><div class="name">'+c.nome+'</div><div class="pct">'+c.percentual+'%</div><div class="commission">'+fmt(v)+'</div></div><button class="btn-remove" onclick="NR.delC('+c.id+')"><i class="fas fa-times"></i></button></div>';}).join('');document.getElementById('colab-total-pct').textContent=tp.toFixed(1)+'%';document.getElementById('colab-base-valor').textContent=fmt(l);}
// DISTRIBUIÇÃO
async function renderDistribuicao(){let d=await api('GET','/api/dashboard?mes='+gM()),s=d.summary,c=d.config,co=d.colaboradores;let ll=s.lojaEnt-s.lojaSai,ld=s.drogEnt-s.drogSai,lm=s.movEnt-s.movSai,lt=ll+ld+s.chqLucro-s.cpPago+lm;let vA=ll*c.pctAdmin/100,vD=ll*c.pctDono/100,vR=ll*c.pctReserva/100,tc=0;co.forEach(x=>tc+=ll*x.percentual/100);document.getElementById('distribGrid').innerHTML='<div class="distrib-item"><div class="distrib-bar" style="--pct:'+c.pctAdmin+'%;--clr:#00d4aa"><span>'+c.pctAdmin+'%</span></div><p>Cássio</p><h2>'+fmt(vA)+'</h2></div><div class="distrib-item"><div class="distrib-bar" style="--pct:'+c.pctDono+'%;--clr:#f59e0b"><span>'+c.pctDono+'%</span></div><p>Celso</p><h2>'+fmt(vD)+'</h2></div><div class="distrib-item"><div class="distrib-bar" style="--pct:'+c.pctReserva+'%;--clr:#6366f1"><span>'+c.pctReserva+'%</span></div><p>Reserva</p><h2>'+fmt(vR)+'</h2></div><div class="distrib-item" style="border-color:var(--pink)"><p>Comissões</p><h2 style="color:var(--pink)">'+fmt(tc)+'</h2><small style="color:var(--text3)">Base: Lucro Loja</small></div>';let h='<div class="line"><span>Receita Loja</span><b>'+fmt(s.lojaEnt)+'</b></div><div class="line"><span>(-) Despesas Loja</span><b>'+fmt(s.lojaSai)+'</b></div><div class="line"><span>= Lucro Loja</span><b>'+fmt(ll)+'</b></div><div class="line"><span>Lucro Drogaria</span><b>'+fmt(ld)+'</b></div><div class="line"><span>Lucro Cheques</span><b>'+fmt(s.chqLucro)+'</b></div><div class="line"><span>(-) Contas Pagas</span><b style="color:var(--red)">-'+fmt(s.cpPago)+'</b></div><div class="line"><span>Movimentação</span><b>'+fmt(lm)+'</b></div><div class="line total"><span>LUCRO TOTAL</span><b>'+fmt(lt)+'</b></div>';co.forEach(x=>h+='<div class="line comissao"><span>→ '+x.nome+' ('+x.percentual+'%)</span><b>'+fmt(ll*x.percentual/100)+'</b></div>');document.getElementById('calcSummary').innerHTML=h;}
// DASHBOARD
async function renderDashboard(){let d=await api('GET','/api/dashboard?mes='+gM()),s=d.summary,c=d.config,co=d.colaboradores,caixas=d.caixas||[];let ll=s.lojaEnt-s.lojaSai,ld=s.drogEnt-s.drogSai,lm=s.movEnt-s.movSai,lt=ll+ld+s.chqLucro-s.cpPago+lm,tc=0;co.forEach(x=>tc+=ll*x.percentual/100);document.getElementById('dash-receita-loja').textContent=fmt(ll);document.getElementById('dash-receita-drogaria').textContent=fmt(ld);document.getElementById('dash-lucro-cheques').textContent=fmt(s.chqLucro);document.getElementById('dash-lucro-total').textContent=fmt(lt);document.getElementById('dash-parte-admin').textContent=fmt(ll*c.pctAdmin/100);document.getElementById('dash-parte-dono').textContent=fmt(ll*c.pctDono/100);document.getElementById('dash-parte-colab').textContent=fmt(tc);document.getElementById('dash-reserva').textContent=fmt(ll*c.pctReserva/100);document.getElementById('dash-label-admin').textContent='Parte Cássio ('+c.pctAdmin+'%)';document.getElementById('dash-label-dono').textContent='Parte Celso ('+c.pctDono+'%)';let sd=s.donoDeb-s.donoCred,el=document.getElementById('dash-saldo-dono');el.textContent=fmt(Math.abs(sd))+(sd>0?' (Celso deve)':sd<0?' (Empresa deve)':' (Zerado)');el.style.color=sd>0?'var(--red)':'var(--green)';
  // Caixas no dashboard
  let dc=document.getElementById('dashCaixasCards');
  if(!caixas.length){dc.innerHTML='<p style="color:var(--text3)">Nenhum caixa cadastrado</p>';return;}
  dc.innerHTML=caixas.map(cx=>{let cor=cx.saldo>=0?'card-green':'card-red';return'<div class="card '+cor+'"><div class="card-icon"><i class="fas fa-cash-register"></i></div><div class="card-info"><span class="card-label">'+cx.nome+'</span><span class="card-value">'+fmt(cx.saldo)+'</span></div></div>';}).join('');
}
// CONFIG
async function renderConfig(){CFG=await api('GET','/api/config');document.getElementById('cfg-pct-admin').value=CFG.pctAdmin;document.getElementById('cfg-pct-dono').value=CFG.pctDono;document.getElementById('cfg-pct-reserva').value=CFG.pctReserva;let t=CFG.pctAdmin+CFG.pctDono+CFG.pctReserva;document.getElementById('cfg-pct-total').value=t.toFixed(1)+'%'+(t===100?' ✓':t<100?' (falta '+(100-t).toFixed(1)+'%)':' (excede)');document.getElementById('catLojaList').innerHTML=CFG.categoriasLoja.map((c,i)=>'<div class="tag-item"><span>'+c+'</span><button class="tag-remove" onclick="NR.delCL('+i+')"><i class="fas fa-times"></i></button></div>').join('');document.getElementById('catDrogList').innerHTML=CFG.categoriasDrog.map((c,i)=>'<div class="tag-item"><span>'+c+'</span><button class="tag-remove" onclick="NR.delCD('+i+')"><i class="fas fa-times"></i></button></div>').join('');document.getElementById('fornList').innerHTML=(CFG.fornecedores||[]).map((f,i)=>'<div class="tag-item"><span>'+f+'</span><button class="tag-remove" onclick="NR.delForn('+i+')"><i class="fas fa-times"></i></button></div>').join('');populateCats();}
document.getElementById('formPercentuais').addEventListener('submit',async function(e){e.preventDefault();await api('PUT','/api/config',{pctAdmin:parseFloat(document.getElementById('cfg-pct-admin').value),pctDono:parseFloat(document.getElementById('cfg-pct-dono').value),pctReserva:parseFloat(document.getElementById('cfg-pct-reserva').value)});toast('Salvo!');refreshAll();});
document.getElementById('formCatLoja').addEventListener('submit',async function(e){e.preventDefault();let v=document.getElementById('cfg-cat-loja').value.trim();if(!v)return;CFG.categoriasLoja.push(v);await api('PUT','/api/config',{categoriasLoja:CFG.categoriasLoja});document.getElementById('cfg-cat-loja').value='';toast('Adicionada!');refreshAll();});
document.getElementById('formCatDrog').addEventListener('submit',async function(e){e.preventDefault();let v=document.getElementById('cfg-cat-drog').value.trim();if(!v)return;CFG.categoriasDrog.push(v);await api('PUT','/api/config',{categoriasDrog:CFG.categoriasDrog});document.getElementById('cfg-cat-drog').value='';toast('Adicionada!');refreshAll();});
document.getElementById('formFornecedor').addEventListener('submit',async function(e){e.preventDefault();let v=document.getElementById('cfg-forn').value.trim();if(!v)return;if(!CFG.fornecedores)CFG.fornecedores=[];CFG.fornecedores.push(v);await api('PUT','/api/config',{fornecedores:CFG.fornecedores});document.getElementById('cfg-forn').value='';toast('Fornecedor adicionado!');refreshAll();});
// ACTIONS
async function del(c,id){if(!confirm('Excluir?'))return;await api('DELETE','/api/'+c+'/'+id);toast('Excluído!','info');refreshAll();}
async function delAc(id){if(!confirm('Excluir?'))return;await api('DELETE','/api/acerto/'+id);toast('Excluído!','info');refreshAll();}
async function delC(id){if(!confirm('Remover?'))return;await api('DELETE','/api/colaboradores/'+id);toast('Removido!','info');refreshAll();}
async function delCP(id){if(!confirm('Excluir?'))return;await api('DELETE','/api/contas-pagar/'+id);toast('Excluído!','info');refreshAll();}
async function comp(id){await api('PUT','/api/cheques/'+id+'/compensar');toast('Compensado!');refreshAll();}
async function toggleBoleto(id,v){await api('PUT','/api/contas-pagar/'+id,{boleto_chegou:v});refreshAll();}
async function setPago(id,v){await api('PUT','/api/contas-pagar/'+id,{pago_por:v});toast(v&&v!=='A Pagar'?'Pago por '+v:'Status atualizado');refreshAll();}
async function setAcField(id,campo,valor){let body={};if(campo==='recorrente')body.recorrente=valor==='1';else body[campo]=valor;await api('PUT','/api/acerto/'+id,body);refreshAll();}
async function delCL(i){CFG.categoriasLoja.splice(i,1);await api('PUT','/api/config',{categoriasLoja:CFG.categoriasLoja});refreshAll();}
async function delCD(i){CFG.categoriasDrog.splice(i,1);await api('PUT','/api/config',{categoriasDrog:CFG.categoriasDrog});refreshAll();}
async function delForn(i){if(!confirm('Excluir fornecedor "'+CFG.fornecedores[i]+'"?'))return;CFG.fornecedores.splice(i,1);await api('PUT','/api/config',{fornecedores:CFG.fornecedores});refreshAll();}
// EXPORT
document.getElementById('btnExport').addEventListener('click',async()=>{let m=gM(),ac=await api('GET','/api/acerto?mes='+m),dr=await api('GET','/api/drogaria?mes='+m),ch=await api('GET','/api/cheques?mes='+m),dn=await api('GET','/api/conta-dono?mes='+m),cp=await api('GET','/api/contas-pagar?mes='+m);let csv='NUNES ROCHA - '+m+'\n\nACERTO\nData;Desc;Entrada;Saída;Cat;Rec;D/F\n';ac.forEach(i=>csv+=i.data+';'+i.descricao+';'+i.entrada+';'+i.saida+';'+i.categoria+';'+(i.recorrente?'S':'N')+';'+i.tipo_nota+'\n');csv+='\nDROGARIA\nData;Tipo;Desc;Cat;Valor\n';dr.forEach(i=>csv+=i.data+';'+i.tipo+';'+i.descricao+';'+i.categoria+';'+i.valor+'\n');csv+='\nCHEQUES\nData;Cliente;Valor;Taxa;Lucro;Status\n';ch.forEach(i=>csv+=i.data+';'+i.cliente+';'+i.valor+';'+i.taxa+';'+i.lucro+';'+i.status+'\n');csv+='\nCONTA DONO\nData;Tipo;Desc;Valor\n';dn.forEach(i=>csv+=i.data+';'+i.tipo+';'+i.descricao+';'+i.valor+'\n');csv+='\nCONTAS A PAGAR\nVenc;Desc;Valor;Boleto;Pago por\n';cp.forEach(i=>csv+=i.vencimento+';'+i.descricao+';'+i.valor+';'+(i.boleto_chegou?'S':'N')+';'+i.pago_por+'\n');let b=new Blob([csv],{type:'text/csv'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='nunes_rocha_'+m+'.csv';a.click();toast('Exportado!');});
// RELATÓRIOS
let relData=[];
document.getElementById('btnGerarRel').addEventListener('click',async()=>{
  let items=await api('GET','/api/acerto?mes='+gM()),fn=document.getElementById('rel-nota').value,fc=document.getElementById('rel-cat').value,fr=document.getElementById('rel-rec').value;
  if(fn)items=items.filter(i=>i.tipo_nota===fn);
  if(fc)items=items.filter(i=>i.categoria===fc);
  if(fr!=='')items=items.filter(i=>fr==='1'?i.recorrente:!i.recorrente);
  relData=items;let te=0,ts=0;
  document.querySelector('#tabelaRel tbody').innerHTML=items.map(i=>{te+=i.entrada||0;ts+=i.saida||0;return'<tr><td>'+fD(i.data)+'</td><td>'+i.descricao+'</td><td class="tipo-entrada">'+(i.entrada?fmt(i.entrada):'')+'</td><td class="tipo-saida">'+(i.saida?fmt(i.saida):'')+'</td><td>'+i.categoria+'</td><td>'+(i.recorrente?'✓':'')+'</td><td>'+(i.tipo_nota||'—')+'</td></tr>';}).join('');
  document.getElementById('rel-tot-ent').textContent=fmt(te);
  document.getElementById('rel-tot-sai').textContent=fmt(ts);
  document.getElementById('rel-saldo').textContent=fmt(te-ts);
  document.getElementById('rel-count').textContent=items.length;
  document.getElementById('relResultPanel').style.display='block';
  toast('Relatório gerado: '+items.length+' registros');
});
document.getElementById('btnPrintRel').addEventListener('click',()=>{
  let w=window.open('','','width=900,height=700');
  w.document.write('<html><head><title>Relatório Nunes Rocha</title><style>body{font-family:Arial;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:6px 10px;text-align:left;font-size:12px}th{background:#333;color:#fff}.green{color:green}.red{color:red}h2{margin-bottom:4px}</style></head><body>');
  w.document.write('<h2>Relatório Nunes Rocha — '+gM()+'</h2>');
  let fn=document.getElementById('rel-nota').value,fc=document.getElementById('rel-cat').value,fr=document.getElementById('rel-rec').value;
  let filtros=[];if(fn)filtros.push('D/F: '+fn);if(fc)filtros.push('Cat: '+fc);if(fr!=='')filtros.push('Rec: '+(fr==='1'?'Sim':'Não'));
  if(filtros.length)w.document.write('<p>Filtros: '+filtros.join(' | ')+'</p>');
  w.document.write('<table><tr><th>Data</th><th>Descrição</th><th>Entrada</th><th>Saída</th><th>Cat.</th><th>Rec.</th><th>D/F</th></tr>');
  let te=0,ts=0;relData.forEach(i=>{te+=i.entrada||0;ts+=i.saida||0;w.document.write('<tr><td>'+fD(i.data)+'</td><td>'+i.descricao+'</td><td class="green">'+(i.entrada?fmt(i.entrada):'')+'</td><td class="red">'+(i.saida?fmt(i.saida):'')+'</td><td>'+i.categoria+'</td><td>'+(i.recorrente?'S':'')+'</td><td>'+(i.tipo_nota||'')+'</td></tr>');});
  w.document.write('</table><p><b>Entradas: '+fmt(te)+' | Saídas: '+fmt(ts)+' | Saldo: '+fmt(te-ts)+'</b></p></body></html>');
  w.document.close();w.print();
});
document.getElementById('btnCsvRel').addEventListener('click',()=>{
  let csv='Data;Descrição;Entrada;Saída;Categoria;Recorrente;D/F\n';
  relData.forEach(i=>csv+=i.data+';'+i.descricao+';'+i.entrada+';'+i.saida+';'+i.categoria+';'+(i.recorrente?'S':'N')+';'+i.tipo_nota+'\n');
  let b=new Blob([csv],{type:'text/csv'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='relatorio_'+gM()+'.csv';a.click();toast('CSV exportado!');
});
// DASHBOARD GERAL
async function renderDashboardGeral(){
  let dias=parseInt(document.getElementById('alertaDias').value)||0;
  let resp=await api('GET','/api/alertas-geral?dias='+dias);
  let data=resp.contas||[];let mercs=resp.mercadorias||[];
  let container=document.getElementById('alertasContainer');
  let badge=document.getElementById('badge-alertas');
  let semAlertas=document.getElementById('panelSemAlertas');
  let totalContas=0;data.forEach(e=>totalContas+=e.contas.length);
  let totalMercs=0;mercs.forEach(e=>totalMercs+=e.items.length);
  let totalAlertas=totalContas+totalMercs;
  if(!totalAlertas){container.innerHTML='';semAlertas.style.display='block';badge.style.display='none';return;}
  semAlertas.style.display='none';badge.textContent=totalAlertas;badge.style.display='inline';
  let html='';
  data.forEach(emp=>{let hoje=emp.hoje;let atrasadas=emp.contas.filter(c=>c.vencimento<hoje);let dodia=emp.contas.filter(c=>c.vencimento===hoje);let proximas=emp.contas.filter(c=>c.vencimento>hoje);
    if(atrasadas.length){html+='<div class="alerta-empresa atrasado"><div class="alerta-header"><i class="fas fa-exclamation-triangle" style="color:#ef4444"></i><span class="empresa-nome">'+emp.empresa+'</span><span class="alerta-count">'+atrasadas.length+' atrasada'+(atrasadas.length>1?'s':'')+'</span></div><div class="alerta-lista">';atrasadas.forEach(c=>{let d=Math.floor((new Date(hoje)-new Date(c.vencimento))/(86400000));html+='<div class="alerta-item"><span style="background:var(--bg1);color:var(--cyan);font-size:11px;font-weight:700;padding:2px 6px;border-radius:4px;margin-right:8px;white-space:nowrap">'+emp.empresa+'</span><span class="desc">'+c.descricao+'</span><span class="valor">'+fmt(c.valor)+'</span><span class="forn">'+(c.fornecedor||'')+'</span><span class="dias atrasado">'+d+' dia'+(d>1?'s':'')+' atrás</span></div>';});html+='</div></div>';}
    if(dodia.length){html+='<div class="alerta-empresa hoje"><div class="alerta-header"><i class="fas fa-bell" style="color:#f59e0b"></i><span class="empresa-nome">'+emp.empresa+'</span><span class="alerta-count hoje">'+dodia.length+' para hoje</span></div><div class="alerta-lista">';dodia.forEach(c=>{html+='<div class="alerta-item"><span style="background:var(--bg1);color:var(--cyan);font-size:11px;font-weight:700;padding:2px 6px;border-radius:4px;margin-right:8px;white-space:nowrap">'+emp.empresa+'</span><span class="desc">'+c.descricao+'</span><span class="valor">'+fmt(c.valor)+'</span><span class="forn">'+(c.fornecedor||'')+'</span><span class="dias hoje">Vence hoje</span></div>';});html+='</div></div>';}
    if(proximas.length){html+='<div class="alerta-empresa" style="border-left-color:#3b82f6;background:rgba(59,130,246,.06)"><div class="alerta-header"><i class="fas fa-calendar-day" style="color:#3b82f6"></i><span class="empresa-nome">'+emp.empresa+'</span><span class="alerta-count" style="background:#3b82f6;animation:none">'+proximas.length+' próxima'+(proximas.length>1?'s':'')+'</span></div><div class="alerta-lista">';proximas.forEach(c=>{let d=Math.floor((new Date(c.vencimento)-new Date(hoje))/(86400000));html+='<div class="alerta-item"><span style="background:var(--bg1);color:var(--cyan);font-size:11px;font-weight:700;padding:2px 6px;border-radius:4px;margin-right:8px;white-space:nowrap">'+emp.empresa+'</span><span class="desc">'+c.descricao+'</span><span class="valor">'+fmt(c.valor)+'</span><span class="forn">'+(c.fornecedor||'')+'</span><span class="dias" style="background:rgba(59,130,246,.15);color:#3b82f6">em '+d+' dia'+(d>1?'s':'')+'</span></div>';});html+='</div></div>';}
  });
  if(mercs.length){html+='<h3 style="margin:20px 0 10px;color:var(--text1)"><i class="fas fa-truck-loading" style="color:var(--amber)"></i> Mercadorias a Chegar</h3>';
    mercs.forEach(emp=>{html+='<div class="alerta-empresa" style="border-left-color:var(--amber);background:rgba(245,158,11,.06)"><div class="alerta-header"><i class="fas fa-truck-loading" style="color:var(--amber)"></i><span class="empresa-nome">'+emp.empresa+'</span><span class="alerta-count" style="background:var(--amber);color:#000;animation:none">'+emp.items.length+' produto'+(emp.items.length>1?'s':'')+'</span></div><div class="alerta-lista">';
      emp.items.forEach(m=>{html+='<div class="alerta-item"><span style="background:var(--bg1);color:var(--amber);font-size:11px;font-weight:700;padding:2px 6px;border-radius:4px;margin-right:8px;white-space:nowrap">'+emp.empresa+'</span><span class="desc">'+m.descricao+'</span><span class="valor">'+fmt(m.valor)+'</span><span class="forn">'+(m.fornecedor||'')+'</span><span class="dias" style="background:rgba(245,158,11,.15);color:#d97706">Aguardando</span></div>';});
      html+='</div></div>';});
  }
  container.innerHTML=html;
}
function renderDashGeral(){renderDashboardGeral();}
// === CONTROLE FISCAL ===
document.getElementById('formFiscal').addEventListener('submit',async function(e){
  e.preventDefault();
  await api('POST','/api/fiscal',{
    data:document.getElementById('fisc-data').value,
    nota_entrada:parseFloat(document.getElementById('fisc-entrada').value)||0,
    nota_saida:parseFloat(document.getElementById('fisc-saida').value)||0,
    banco_boleto:parseFloat(document.getElementById('fisc-boleto').value)||0,
    banco_deposito:parseFloat(document.getElementById('fisc-deposito').value)||0,
    banco_cartao:parseFloat(document.getElementById('fisc-cartao').value)||0,
    observacao:document.getElementById('fisc-obs').value
  });
  this.reset();setToday('fisc-data');['fisc-entrada','fisc-saida','fisc-boleto','fisc-deposito','fisc-cartao'].forEach(id=>document.getElementById(id).value='0');
  toast('Lançamento fiscal salvo!');renderFiscal();
});
async function renderFiscal(){
  let items=await api('GET','/api/fiscal?mes='+gM());
  let tEnt=0,tSai=0,tBol=0,tDep=0,tCar=0;
  document.querySelector('#tabelaFiscal tbody').innerHTML=items.map(i=>{
    let bol=i.banco_boleto||0,dep=i.banco_deposito||0,car=i.banco_cartao||0;
    let bancoTotal=bol+dep+car;
    let saldo=(i.nota_saida||0)-(i.nota_entrada||0);
    let aEmitir=bancoTotal-(i.nota_saida||0);
    tEnt+=i.nota_entrada||0;tSai+=i.nota_saida||0;tBol+=bol;tDep+=dep;tCar+=car;
    let saldoCls=saldo>=0?'tipo-entrada':'tipo-saida';
    let emitCls=aEmitir>0?'tipo-saida':'tipo-entrada';
    return '<tr><td>'+fD(i.data)+'</td><td class="tipo-saida">'+fmt(i.nota_entrada)+'</td><td class="tipo-entrada">'+fmt(i.nota_saida)+'</td><td>'+fmt(bol)+'</td><td>'+fmt(dep)+'</td><td>'+fmt(car)+'</td><td style="font-weight:600">'+fmt(bancoTotal)+'</td><td class="'+saldoCls+'">'+fmt(saldo)+'</td><td class="'+emitCls+'">'+(aEmitir>0?fmt(aEmitir):'✅ OK')+'</td><td style="font-size:.8rem;color:var(--text3)">'+((i.observacao||''))+'</td><td><button class="btn btn-danger btn-sm" onclick="NR.delFisc(\''+i.id+'\')"><i class="fas fa-trash"></i></button></td></tr>';
  }).join('');
  let tBanco=tBol+tDep+tCar;
  let saldoTotal=tSai-tEnt;
  let aEmitirTotal=tBanco-tSai;
  let meta30=tEnt*1.30;
  let faltaMeta=meta30-tSai;
  let metaOk=faltaMeta<=0;
  let pctAtual=tEnt>0?((tSai/tEnt-1)*100):0;
  document.getElementById('fiscalCards').innerHTML=
    '<div class="card card-blue"><div class="card-icon"><i class="fas fa-file-import"></i></div><div><span class="card-label">Notas Entrada</span><span class="card-value">'+fmt(tEnt)+'</span></div></div>'+
    '<div class="card card-green"><div class="card-icon"><i class="fas fa-file-export"></i></div><div><span class="card-label">Notas Saída</span><span class="card-value">'+fmt(tSai)+'</span></div></div>'+
    '<div class="card card-blue"><div class="card-icon"><i class="fas fa-barcode"></i></div><div><span class="card-label">Boletos</span><span class="card-value">'+fmt(tBol)+'</span></div></div>'+
    '<div class="card card-purple"><div class="card-icon"><i class="fas fa-piggy-bank"></i></div><div><span class="card-label">Depósitos</span><span class="card-value">'+fmt(tDep)+'</span></div></div>'+
    '<div class="card card-orange"><div class="card-icon"><i class="fas fa-credit-card"></i></div><div><span class="card-label">Cartões</span><span class="card-value">'+fmt(tCar)+'</span></div></div>'+
    '<div class="card card-'+(saldoTotal>=0?'green':'red')+'"><div class="card-icon"><i class="fas fa-balance-scale"></i></div><div><span class="card-label">Saldo Fiscal</span><span class="card-value">'+fmt(saldoTotal)+'</span></div></div>'+
    '<div class="card card-'+(aEmitirTotal>0?'red':'green')+'" style="'+(aEmitirTotal>0?'animation:pulse 1.5s infinite;border:2px solid #ef4444;box-shadow:0 0 20px rgba(239,68,68,0.4)':'border:2px solid #22c55e;box-shadow:0 0 15px rgba(34,197,94,0.3)')+'"><div class="card-icon" style="font-size:1.6rem"><i class="fas fa-'+(aEmitirTotal>0?'exclamation-triangle':'check-circle')+'"></i></div><div><span class="card-label" style="font-size:.95rem;font-weight:700">⚠️ A EMITIR</span><span class="card-value" style="font-size:1.4rem">'+(aEmitirTotal>0?fmt(aEmitirTotal):'✅ OK')+'</span></div></div>'+
    '<div class="card card-'+(metaOk?'green':'red')+'" style="'+(metaOk?'border:2px solid #22c55e;box-shadow:0 0 15px rgba(34,197,94,0.3)':'animation:pulse 1.5s infinite;border:2px solid #f59e0b;box-shadow:0 0 20px rgba(245,158,11,0.4)')+'"><div class="card-icon" style="font-size:1.6rem"><i class="fas fa-'+(metaOk?'trophy':'bullseye')+'"></i></div><div><span class="card-label" style="font-size:.95rem;font-weight:700">🎯 META 30%</span><span class="card-value" style="font-size:1.4rem">'+(metaOk?'✅ '+pctAtual.toFixed(0)+'%':'Falta '+fmt(faltaMeta))+'</span><span style="font-size:.75rem;color:var(--text3)">Meta: '+fmt(meta30)+' | Atual: '+pctAtual.toFixed(1)+'%</span></div></div>';
  document.getElementById('fiscalResumo').innerHTML=
    '<span class="badge badge-blue">Entradas: '+fmt(tEnt)+'</span>'+
    '<span class="badge badge-green">Saídas: '+fmt(tSai)+'</span>'+
    '<span class="badge badge-blue">Boletos: '+fmt(tBol)+'</span>'+
    '<span class="badge badge-purple">Depósitos: '+fmt(tDep)+'</span>'+
    '<span class="badge badge-orange">Cartões: '+fmt(tCar)+'</span>'+
    '<span class="badge badge-'+(saldoTotal>=0?'green':'red')+'">Saldo: '+fmt(saldoTotal)+'</span>'+
    '<span class="badge badge-'+(aEmitirTotal>0?'red':'green')+'">A Emitir: '+(aEmitirTotal>0?fmt(aEmitirTotal):'OK')+'</span>'+
    '<span class="badge badge-'+(metaOk?'green':'red')+'">Meta 30%: '+(metaOk?'✅ '+pctAtual.toFixed(0)+'%':'Falta '+fmt(faltaMeta))+'</span>';
}
async function delFisc(id){if(!confirm('Excluir lançamento fiscal?'))return;await api('DELETE','/api/fiscal/'+id);toast('Excluído!');renderFiscal();}
// REFRESH
async function refreshAll(){await renderConfig();COLABS=await api('GET','/api/colaboradores');await Promise.all([renderDashboardGeral(),renderAcerto(),renderFat(),renderContasPagar(),renderAChegar(),renderDrogaria(),renderCheques(),renderContaDono(),renderColaboradores(),renderCaixas(),renderMovimentacao(),renderFiscal()]);await Promise.all([renderDistribuicao(),renderDashboard()]);if(currentUser&&currentUser.role==='admin')renderUsuarios();}
// === USUÁRIOS ===
const ALL_PERMS=['dashboard-geral','dashboard','acerto','fat','contas-pagar','a-chegar','movimentacao','drogaria','cheques','conta-dono','distribuicao','colaboradores','relatorios','configuracoes','caixas','fiscal'];
let newUserPerms=[...ALL_PERMS];
function renderPermsGrid(){
  document.getElementById('permsGrid').innerHTML=ALL_PERMS.map(p=>{
    let checked=newUserPerms.includes(p)?'checked':'';
    return'<label class="perm-item '+checked+'"><input type="checkbox" '+(checked?'checked':'')+' onchange="NR.togglePerm(\''+p+'\');"><i class="fas '+(MENU_ICONS[p]||'fa-circle')+'"></i><span>'+(MENU_MAP[p]||p)+'</span></label>';
  }).join('');
}
function togglePerm(p){if(newUserPerms.includes(p))newUserPerms=newUserPerms.filter(x=>x!==p);else newUserPerms.push(p);renderPermsGrid();}
renderPermsGrid();
document.getElementById('formUsuario').addEventListener('submit',async function(e){
  e.preventDefault();
  let nome=document.getElementById('usr-nome').value.trim();
  let login=document.getElementById('usr-login').value.trim().toLowerCase().replace(/[^a-z0-9]/g,'');
  let senha=document.getElementById('usr-senha').value;
  if(!nome||!login||!senha){toast('Preencha todos os campos','error');return;}
  try{
    let res=await api('POST','/api/usuarios',{username:login,senha:senha,nome:nome,role:'user',permissoes:newUserPerms});
    if(res.error){toast(res.error,'error');return;}
    toast('Usuário criado!');this.reset();newUserPerms=[...ALL_PERMS];renderPermsGrid();renderUsuarios();
  }catch(e){}
});
async function renderUsuarios(){
  try{
    let users=await api('GET','/api/usuarios');
    document.querySelector('#tabelaUsuarios tbody').innerHTML=users.map(u=>{
      let perms=JSON.parse(u.permissoes||'[]');
      let tags=perms.map(p=>'<span>'+(MENU_MAP[p]||p)+'</span>').join('');
      let isAdmin=u.role==='admin';
      let editBtn=isAdmin?'':'<button class="btn btn-sm" style="background:var(--blue);color:#fff" onclick="NR.openEditPerms('+u.id+',\''+u.nome.replace(/'/g,"\\'")+'\',\''+u.username+'\')" title="Editar permissões"><i class="fas fa-edit"></i></button>';
      return'<tr><td><b>'+u.nome+'</b></td><td>'+u.username+'</td><td><span class="user-badge '+(isAdmin?'admin':'user')+'">'+(isAdmin?'Admin':'Usuário')+'</span></td><td><div class="user-perms-tags">'+tags+'</div></td><td>'+editBtn+(isAdmin?'':'<button class="btn btn-sm btn-danger" onclick="NR.delUser('+u.id+')"><i class="fas fa-trash"></i></button>')+'</td></tr>';
    }).join('');
  }catch(e){}
}
async function delUser(id){if(!confirm('Excluir usuário?'))return;await api('DELETE','/api/usuarios/'+id);toast('Usuário excluído!','info');renderUsuarios();}
// === EDITAR PERMISSÕES ===
let editPermsUserId=null,editPermsData=[];
async function openEditPerms(id,nome,username){
  editPermsUserId=id;
  document.getElementById('editPermsUserName').textContent=nome+' ('+username+')';
  let users=await api('GET','/api/usuarios');
  let u=users.find(x=>x.id===id);
  editPermsData=u?JSON.parse(u.permissoes||'[]'):[...ALL_PERMS];
  let grid=document.getElementById('editPermsGrid');
  grid.innerHTML=ALL_PERMS.map(p=>{
    let checked=editPermsData.includes(p)?'checked':'';
    let icon=MENU_ICONS[p]||'fas fa-circle';
    return'<label class="perm-item"><input type="checkbox" '+checked+' onchange="NR.toggleEditPerm(\''+p+'\',this.checked)"><i class="'+icon+'"></i> '+(MENU_MAP[p]||p)+'</label>';
  }).join('');
  document.getElementById('modalEditPerms').style.display='flex';
}
function closeEditPerms(){document.getElementById('modalEditPerms').style.display='none';editPermsUserId=null;}
function toggleEditPerm(p,checked){if(checked&&!editPermsData.includes(p))editPermsData.push(p);if(!checked)editPermsData=editPermsData.filter(x=>x!==p);}
async function saveEditPerms(){
  if(!editPermsUserId)return;
  await api('PUT','/api/usuarios/'+editPermsUserId,{permissoes:editPermsData});
  toast('Permissões atualizadas!');
  closeEditPerms();renderUsuarios();
}
// === ALTERAR SENHA ===
function openSenha(){document.getElementById('modalSenha').style.display='flex';document.getElementById('pwd-user').value='';document.getElementById('pwd-nome').value='';document.getElementById('pwd-atual').value='';document.getElementById('pwd-nova').value='';document.getElementById('pwd-confirma').value='';document.getElementById('pwd-erro').style.display='none';document.getElementById('pwd-user').placeholder=currentUser.username;document.getElementById('pwd-nome').placeholder=currentUser.nome||'';}
function closeSenha(){document.getElementById('modalSenha').style.display='none';}
document.getElementById('formAlterarSenha').addEventListener('submit',async function(e){
  e.preventDefault();
  let errEl=document.getElementById('pwd-erro');errEl.style.display='none';
  let atual=document.getElementById('pwd-atual').value;
  let nova=document.getElementById('pwd-nova').value;
  let confirma=document.getElementById('pwd-confirma').value;
  let novoUser=document.getElementById('pwd-user').value.trim();
  let novoNome=document.getElementById('pwd-nome').value.trim();
  if(!atual){errEl.textContent='A senha atual é obrigatória';errEl.style.display='block';return;}
  if(nova && nova!==confirma){errEl.textContent='As senhas não coincidem';errEl.style.display='block';return;}
  if(nova && nova.length<3){errEl.textContent='Senha deve ter pelo menos 3 caracteres';errEl.style.display='block';return;}
  if(!nova && !novoUser && !novoNome){errEl.textContent='Preencha pelo menos um campo para alterar';errEl.style.display='block';return;}
  try{
    let body={senhaAtual:atual};
    if(nova) body.senhaNova=nova;
    if(novoUser) body.novoUsername=novoUser;
    if(novoNome) body.novoNome=novoNome;
    let resp=await fetch('/api/me/senha',{method:'PUT',headers:{'Content-Type':'application/json','Authorization':'Bearer '+authToken},body:JSON.stringify(body)});
    let data=await resp.json();
    if(!resp.ok){errEl.textContent=data.error||'Erro ao alterar';errEl.style.display='block';return;}
    if(data.user){currentUser.username=data.user.username;currentUser.nome=data.user.nome;document.getElementById('userDisplay').textContent=data.user.nome||data.user.username;}
    closeSenha();toast('Conta atualizada com sucesso!');
  }catch(err){errEl.textContent='Erro de conexão';errEl.style.display='block';}
});
// === MOVIMENTAÇÃO ===
document.getElementById('formMov').addEventListener('submit',async function(e){
  e.preventDefault();
  let ent=parseFloat(document.getElementById('mov-entrada').value)||0;
  let sai=parseFloat(document.getElementById('mov-saida').value)||0;
  let dif=parseFloat(document.getElementById('mov-diferenca-form').value)||0;
  if(!ent&&!sai&&!dif){toast('Preencha entrada, saída ou diferença','error');return;}
  await api('POST','/api/movimentacao',{data:document.getElementById('mov-data').value,descricao:document.getElementById('mov-desc').value,entrada:ent,saida:sai,diferenca:dif});
  this.reset();setToday('mov-data');document.getElementById('mov-entrada').value='0';document.getElementById('mov-saida').value='0';document.getElementById('mov-diferenca-form').value='0';
  toast('Lançamento salvo!');refreshAll();
});
async function renderMovimentacao(){
  let mes=gM();
  let items=await api('GET','/api/movimentacao?mes='+mes);
  let cfg=await api('GET','/api/movimentacao/config?mes='+mes);
  let saldoAnt=cfg.saldo_anterior||0;
  let dif=cfg.diferenca||0;
  document.getElementById('mov-saldo-ant').value=saldoAnt.toFixed(2);
  document.getElementById('mov-diferenca').value=dif.toFixed(2);
  let totalEnt=0,totalSai=0,running=saldoAnt;
  let tb=document.querySelector('#tabelaMov tbody');
  let rows='<tr style="background:var(--bg3);font-weight:bold"><td>—</td><td>Saldo anterior</td><td></td><td></td><td></td><td class="tipo-entrada">'+fmt(saldoAnt)+'</td><td></td></tr>';
  items.forEach(i=>{
    totalEnt+=i.entrada;totalSai+=i.saida;
    let rDif = i.diferenca||0;
    running+=i.entrada-i.saida+rDif;
    let dia=i.data.split('-')[2];
    rows+='<tr><td>'+parseInt(dia)+'</td><td>'+i.descricao+'</td>'
      +'<td class="tipo-entrada">'+(i.entrada?fmt(i.entrada):'')+'</td>'
      +'<td class="tipo-saida">'+(i.saida?fmt(i.saida):'')+'</td>'
      +'<td><input type="number" class="inline-input" value="'+rDif+'" step="0.01" style="width:80px" onchange="NR.updateMovDif(\''+i.id+'\',this.value)"></td>'
      +'<td style="font-weight:bold">'+fmt(running)+'</td>'
      +'<td><button class="btn btn-sm btn-danger" onclick="NR.delMov(\''+i.id+'\')"><i class="fas fa-trash"></i></button></td></tr>';
  });
  if(dif!==0){
    rows+='<tr style="background:rgba(245,158,11,0.1);font-weight:bold"><td>—</td><td>Diferença do caixa</td><td class="'+(dif>0?'tipo-entrada':'tipo-saida')+'">'+fmt(Math.abs(dif))+'</td><td></td><td></td><td style="font-weight:bold;color:var(--amber)">'+fmt(running+dif)+'</td><td></td></tr>';
  }
  tb.innerHTML=rows||'<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--text3)">Nenhum lançamento</td></tr>';
  document.getElementById('mov-total-ent').textContent=fmt(totalEnt);
  document.getElementById('mov-total-sai').textContent=fmt(totalSai);
  document.getElementById('mov-saldo-atual').textContent=fmt(running+dif);
}
async function saveMovConfig(){
  let mes=gM();
  let sa=parseFloat(document.getElementById('mov-saldo-ant').value)||0;
  let dif=parseFloat(document.getElementById('mov-diferenca').value)||0;
  await api('PUT','/api/movimentacao/config',{mes:mes,saldo_anterior:sa,diferenca:dif});
  toast('Configuração salva!');renderMovimentacao();
}
async function updateMovDif(id, val){
  await api('PUT','/api/movimentacao/'+id+'/diferenca',{diferenca:parseFloat(val)||0});
  toast('Diferença atualizada!');renderMovimentacao();
}
async function delMov(id){if(!confirm('Remover este lançamento?'))return;await api('DELETE','/api/movimentacao/'+id);toast('Removido!','info');refreshAll();}
// === CAIXAS ===
document.getElementById('formCaixa').addEventListener('submit',async function(e){
  e.preventDefault();
  let nome=document.getElementById('cx-nome').value.trim();
  let saldo=parseFloat(document.getElementById('cx-saldo').value)||0;
  if(!nome){toast('Digite um nome','error');return;}
  await api('POST','/api/caixas',{nome:nome,saldo:saldo});
  this.reset();document.getElementById('cx-saldo').value='0';
  toast('Caixa criado!');refreshAll();
});
async function renderCaixas(){
  let caixas=await api('GET','/api/caixas');
  let el=document.getElementById('caixasList');
  if(!caixas.length){el.innerHTML='<p style="color:var(--text3);padding:20px">Nenhum caixa cadastrado</p>';return;}
  el.innerHTML=caixas.map(cx=>{
    let cor=cx.saldo>=0?'var(--green)':'var(--red)';
    return'<div class="card" style="border-left:4px solid '+cor+';min-width:280px"><div class="card-icon" style="background:'+cor+'22;color:'+cor+'"><i class="fas fa-cash-register"></i></div><div class="card-info"><span class="card-label">'+cx.nome+'</span><span class="card-value" style="color:'+cor+'">'+fmt(cx.saldo)+'</span><div style="margin-top:8px;display:flex;gap:6px;align-items:center"><input type="number" step="0.01" value="'+cx.saldo.toFixed(2)+'" id="cx-saldo-'+cx.id+'" style="width:120px;padding:6px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px"><button class="btn btn-sm btn-primary" onclick="NR.updateCxSaldo('+cx.id+')" style="font-size:11px"><i class="fas fa-sync"></i></button><button class="btn btn-sm btn-danger" onclick="NR.delCaixa('+cx.id+')" style="font-size:11px"><i class="fas fa-trash"></i></button></div></div></div>';
  }).join('');
}
async function updateCxSaldo(id){
  let v=parseFloat(document.getElementById('cx-saldo-'+id).value);
  if(isNaN(v)){toast('Valor inválido','error');return;}
  await api('PUT','/api/caixas/'+id,{saldo:v});
  toast('Saldo atualizado!');refreshAll();
}
async function delCaixa(id){if(!confirm('Remover este caixa?'))return;await api('DELETE','/api/caixas/'+id);toast('Caixa removido!','info');refreshAll();}
async function setCaixaPago(contaId,caixaId){
  const cxId = parseInt(caixaId) || 0;
  if(cxId > 0 && !confirm('Debitar o valor desta conta do caixa selecionado?')){refreshAll();return;}
  if(cxId === 0) {
    // Verificar se tinha caixa antes - precisa enviar para reverter o débito
  }
  await api('PUT','/api/contas-pagar/'+contaId,{caixa_id:caixaId});
  toast(cxId > 0 ? 'Valor debitado do caixa!' : 'Caixa removido');refreshAll();
}
// === PRINT RECIBO CHEQUE ===
let chequesCache=[];
function printRecibo(id){
  let i=chequesCache.find(c=>c.id===id);
  if(!i){toast('Cheque não encontrado','error');return;}
  let valorPassar=i.juros_antecipado?(i.valor-i.lucro):i.valor;
  let html='<html><head><title>Recibo</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;padding:30px;color:#222;font-size:13px}.header{text-align:center;border-bottom:2px solid #333;padding-bottom:12px;margin-bottom:16px}.header h2{font-size:16px;margin-bottom:4px}.header small{color:#666}.row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px dotted #ccc}.row .label{color:#555;font-weight:600}.row .val{font-weight:700;text-align:right}.total{background:#f0f0f0;padding:12px;border-radius:6px;margin-top:12px;text-align:center}.total .big{font-size:22px;font-weight:900;color:#006633}.total .sub{font-size:11px;color:#666;margin-top:4px}.ja{background:#fff3cd;padding:8px;border-radius:6px;margin-top:8px;text-align:center;font-size:11px;color:#856404;border:1px solid #ffc107}.footer{margin-top:20px;text-align:center;font-size:10px;color:#999;border-top:1px solid #ccc;padding-top:10px}</style></head><body>';
  html+='<div class="header"><h2>RECIBO DE TROCA DE CHEQUE</h2><small>'+new Date().toLocaleDateString('pt-BR')+'</small></div>';
  html+='<div class="row"><span class="label">Nº Cheque</span><span class="val">'+(i.numero||'—')+'</span></div>';
  html+='<div class="row"><span class="label">Responsável</span><span class="val">'+i.cliente+'</span></div>';
  html+='<div class="row"><span class="label">Dono do Cheque</span><span class="val">'+(i.dono_cheque||'—')+'</span></div>';
  html+='<div class="row"><span class="label">Data Operação</span><span class="val">'+fD(i.data)+'</span></div>';
  html+='<div class="row"><span class="label">Vencimento</span><span class="val">'+fD(i.vencimento)+'</span></div>';
  html+='<div class="row"><span class="label">Bom Para</span><span class="val">'+(i.bom_para?fD(i.bom_para):'—')+'</span></div>';
  html+='<div class="row"><span class="label">Prazo</span><span class="val">'+i.dias+' dias</span></div>';
  html+='<div class="row"><span class="label">Valor do Cheque</span><span class="val">'+fmt(i.valor)+'</span></div>';
  html+='<div class="row"><span class="label">Taxa</span><span class="val">'+i.taxa+'% ao mês</span></div>';
  html+='<div class="row"><span class="label">Juros</span><span class="val" style="color:#c00">'+fmt(i.lucro)+'</span></div>';
  if(i.juros_antecipado)html+='<div class="ja">⚠ Juros descontados antecipadamente do valor passado</div>';
  html+='<div class="total"><div class="sub">VALOR PASSADO AO CLIENTE</div><div class="big">'+fmt(valorPassar)+'</div></div>';
  html+='<div class="footer"><p>Documento sem valor fiscal — uso interno</p></div></body></html>';
  // Usar iframe oculto para evitar bloqueio de popup
  let iframe=document.getElementById('printFrame');
  if(!iframe){iframe=document.createElement('iframe');iframe.id='printFrame';iframe.style.cssText='position:fixed;top:-9999px;left:-9999px;width:450px;height:600px;border:none';document.body.appendChild(iframe);}
  iframe.contentDocument.open();iframe.contentDocument.write(html);iframe.contentDocument.close();
  setTimeout(function(){iframe.contentWindow.focus();iframe.contentWindow.print();},400);
}
// === CONFIRMAR EXCLUSÃO MODAL ===
let confirmDelTarget='';
function confirmClear(label,target){
  confirmDelTarget=target;
  document.getElementById('confirmDelMsg').innerHTML='<b style="color:var(--red)">Atenção!</b> Você irá excluir todos os dados de <b>'+label+'</b>. Esta ação não pode ser desfeita.';
  document.getElementById('confirmDelInput').value='';
  let btn=document.getElementById('btnConfirmDel');btn.disabled=true;btn.style.opacity='.5';
  document.getElementById('modalConfirmDel').style.display='flex';
  document.getElementById('confirmDelInput').focus();
}
function closeConfirmDel(){document.getElementById('modalConfirmDel').style.display='none';confirmDelTarget='';}
document.getElementById('confirmDelInput').addEventListener('input',function(){
  let ok=this.value.toLowerCase().trim()==='deletar';
  let btn=document.getElementById('btnConfirmDel');btn.disabled=!ok;btn.style.opacity=ok?'1':'.5';
});
document.getElementById('btnConfirmDel').addEventListener('click',async function(){
  if(!confirmDelTarget)return;
  if(confirmDelTarget==='__empresa__'){
    await api('DELETE','/api/empresas/'+currentEmpresa);
    currentEmpresa='nunesrocha';await loadEmpresas();toast('Empresa excluída!','info');
  }else{
    await api('DELETE','/api/clear/'+confirmDelTarget);
    toast('Todos os dados foram excluídos!','info');
  }
  closeConfirmDel();refreshAll();
});
// === BACKUP / EXPORTAÇÃO ===
async function exportarPlanilhaGeral() {
  toast('Gerando planilha, aguarde...', 'info');
  try {
    const wb = XLSX.utils.book_new();
    const [acerto, fat, cp, cheques, drog, dono, mov, caixas] = await Promise.all([
      api('GET','/api/acerto'), api('GET','/api/fat'), api('GET','/api/contas-pagar'),
      api('GET','/api/cheques'), api('GET','/api/drogaria'), api('GET','/api/conta-dono'),
      api('GET','/api/movimentacao'), api('GET','/api/caixas')
    ]);
    const formatData = (data) => data.length ? data.map(({id, ...rest}) => rest) : [{Aviso: 'Sem dados'}];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(formatData(acerto)), "Acerto");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(formatData(fat)), "FAT");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(formatData(cp)), "Contas a Pagar");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(formatData(cheques)), "Cheques");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(formatData(drog)), "Drogaria");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(formatData(dono)), "Conta Celso");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(formatData(mov)), "Movimentacao");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(formatData(caixas)), "Caixas");
    XLSX.writeFile(wb, `Backup_${currentEmpresa}_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast('Planilha exportada com sucesso!');
  } catch (e) { console.error(e); toast('Erro ao exportar planilha', 'error'); }
}
async function backupDB() {
  toast('Baixando banco de dados...', 'info');
  try {
    const resp = await fetch('/api/backup', { headers: { 'Authorization': 'Bearer ' + authToken, 'X-Empresa': currentEmpresa } });
    if (!resp.ok) throw new Error('Falha');
    const blob = await resp.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentEmpresa}_backup_${new Date().toISOString().split('T')[0]}.db`;
    document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url);
  } catch(e) { toast('Erro ao fazer backup do banco', 'error'); }
}
async function restoreDB(input) {
  if(!input.files || input.files.length === 0) return;
  const file = input.files[0];
  if(!confirm(`ATENÇÃO!\n\nRestaurar a empresa "${currentEmpresa}" usando o arquivo:\n${file.name}\n\nISSO APAGARÁ OS DADOS ATUAIS. Continuar?`)){ input.value = ''; return; }
  toast('Restaurando banco de dados...', 'info');
  try {
    const formData = new FormData(); formData.append('dbfile', file);
    const resp = await fetch('/api/restore', { method: 'POST', headers: { 'Authorization': 'Bearer ' + authToken, 'X-Empresa': currentEmpresa }, body: formData });
    if(!resp.ok) throw new Error('Falha');
    toast('Restaurado! Recarregando...');
    setTimeout(() => window.location.reload(), 1500);
  } catch(e) { toast('Erro ao restaurar banco', 'error'); }
  input.value = '';
}

function baixarModelo() {
  const wb = XLSX.utils.book_new();
  const acertoEx = [{ data: '2026-05-01', descricao: 'Exemplo Café', entrada: 0, saida: 150.00, categoria: 'Fornecedor', fornecedor: 'Betano', recorrente: 'Sim', tipo_nota: 'D' }];
  const cpEx = [{ vencimento: '2026-05-10', descricao: 'Exemplo Conta Luz', valor: 350.00, categoria: 'Energia', fornecedor: 'CEMIG', recorrente: 'Não', boleto_chegou: 'Sim' }];
  const chqEx = [{ data: '2026-05-01', cliente: 'João Silva', valor: 1000, taxa: 5, vencimento: '2026-06-01', bom_para: '2026-06-01', origem_dinheiro: 'caixa-empresa', dono_cheque: '', juros_antecipado: 'Não' }];
  const movEx = [{ data: '2026-05-01', descricao: 'Venda do dia', entrada: 500, saida: 0, diferenca: 0 }];
  const donoEx = [{ data: '2026-05-01', tipo: 'debito', descricao: 'Retirada pessoal', valor: 200 }];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(acertoEx), "Acerto");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cpEx), "Contas a Pagar");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(chqEx), "Cheques");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(movEx), "Movimentacao");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(donoEx), "Conta Celso");
  XLSX.writeFile(wb, 'Modelo_Importacao.xlsx');
  toast('Modelo baixado! Preencha e importe.');
}
async function importarPlanilha(input) {
  if (!input.files || !input.files.length) return;
  const file = input.files[0];
  toast('Lendo planilha...', 'info');
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, {cellStyles: true});
  let total = 0, erros = 0, pulados = 0;
  const sheetMap = {
    'Acerto': '/api/acerto',
    'Contas a Pagar': '/api/contas-pagar',
    'Cheques': '/api/cheques',
    'Movimentacao': '/api/movimentacao',
    'Conta Celso': '/api/conta-dono'
  };
  // Mapear nomes de abas flexíveis (caso o usuário nomeie diferente)
  const sheetAliases = {
    'conta celso': 'Conta Celso',
    'conta do celso': 'Conta Celso',
    'contacelso': 'Conta Celso',
    'celso': 'Conta Celso',
    'conta dono': 'Conta Celso',
    'acerto': 'Acerto',
    'acerto financeiro': 'Acerto',
    'contas a pagar': 'Contas a Pagar',
    'contaspagar': 'Contas a Pagar',
    'cheques': 'Cheques',
    'movimentacao': 'Movimentacao',
    'movimentação': 'Movimentacao'
  };
  // Resolver nomes de abas reais para os nomes do mapa
  const resolvedSheets = {};
  console.log('📋 Abas encontradas na planilha:', wb.SheetNames.join(', '));
  for (const realName of wb.SheetNames) {
    const normalized = realName.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    // Tentar match exato primeiro
    let mapped = sheetAliases[normalized] || Object.keys(sheetMap).find(k => k.toLowerCase() === normalized);
    // Se não achou, tentar match parcial (contém palavra-chave)
    if (!mapped) {
      if (normalized.includes('celso') || normalized.includes('dono')) mapped = 'Conta Celso';
      else if (normalized.includes('acerto')) mapped = 'Acerto';
      else if (normalized.includes('contas') || normalized.includes('pagar')) mapped = 'Contas a Pagar';
      else if (normalized.includes('cheque')) mapped = 'Cheques';
      else if (normalized.includes('moviment')) mapped = 'Movimentacao';
    }
    if (mapped && sheetMap[mapped]) {
      resolvedSheets[mapped] = wb.Sheets[realName];
      console.log(`✅ Aba "${realName}" mapeada para "${mapped}"`);
    } else {
      console.log(`⚠️ Aba "${realName}" não reconhecida (normalizado: "${normalized}")`);
    }
  }
  for (const [sheetName, endpoint] of Object.entries(sheetMap)) {
    const ws = resolvedSheets[sheetName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws);
    console.log(`📋 Processando aba "${sheetName}": ${rows.length} linhas`);
    // Detectar células amarelas na coluna A (vencimento) para Contas a Pagar
    let yellowRows = new Set();
    if (sheetName === 'Contas a Pagar') {
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      for (let r = range.s.r + 1; r <= range.e.r; r++) {
        const cellAddr = XLSX.utils.encode_cell({r, c: 0}); // coluna A
        const cell = ws[cellAddr];
        if (cell && cell.s) {
          const s = cell.s;
          const isYellow = (s.patternType === 'solid' && s.fgColor && (
            (s.fgColor.rgb && (s.fgColor.rgb.toUpperCase().includes('FFFF00') || s.fgColor.rgb.toUpperCase().includes('FFC000') || s.fgColor.rgb.toUpperCase() === 'FFFFFF00')) ||
            (s.fgColor.theme !== undefined && s.fgColor.tint !== undefined)
          )) || (s.bgColor && s.bgColor.rgb && (s.bgColor.rgb.toUpperCase().includes('FFFF00') || s.bgColor.rgb.toUpperCase().includes('FFC000')));
          if (isYellow) {
            yellowRows.add(r - range.s.r - 1); // índice da linha de dados (0-based)
            console.log(`🟡 Linha ${r} tem fundo amarelo → boleto não chegou`);
          }
        }
      }
      console.log(`🟡 Total de linhas amarelas detectadas: ${yellowRows.size}`);
    }
    let rowIdx = 0;
    for (const row of rows) {
      try {
        // Função para converter número BR (1.234,56) para float
        const parseBR = (v) => {
          if (v === undefined || v === null || v === '') return 0;
          if (typeof v === 'number') return v;
          let s = v.toString().trim();
          // Se tem vírgula, é formato BR
          if (s.includes(',')) {
            s = s.replace(/\./g, '').replace(',', '.');
          }
          return parseFloat(s) || 0;
        };
        // Normalizar campos
        if (sheetName === 'Acerto') {
          row.entrada = parseBR(row.entrada);
          row.saida = parseBR(row.saida);
          if (row.entrada === 0 && row.saida === 0) { pulados++; continue; }
          row.descricao = (row.descricao || '').toString().trim() || 'Sem descrição';
          row.categoria = (row.categoria || '').toString().trim() || 'Outros';
          row.fornecedor = (row.fornecedor || '').toString().trim() || '';
          row.tipo_nota = (row.tipo_nota || '').toString().trim() || '';
          row.recorrente = (row.recorrente || '').toString().toLowerCase() === 'sim' || row.recorrente === '1' || row.recorrente === 1;
        }
        if (sheetName === 'Contas a Pagar') {
          row.valor = parseBR(row.valor);
          if (row.valor === 0) { pulados++; rowIdx++; continue; }
          row.descricao = (row.descricao || '').toString().trim() || 'Sem descrição';
          row.categoria = (row.categoria || '').toString().trim() || 'Outros';
          row.fornecedor = (row.fornecedor || '').toString().trim() || '';
          row.recorrente = (row.recorrente || '').toString().toLowerCase() === 'sim' || row.recorrente === '1' || row.recorrente === 1;
          // Detectar boleto_chegou: pela cor amarela OU pela coluna boleto_chegou
          if (row.boleto_chegou !== undefined) {
            const bc = (row.boleto_chegou || '').toString().trim().toLowerCase();
            row.boleto_chegou = (bc === 'sim' || bc === '1' || bc === 'true' || bc === 's') ? 1 : 0;
          } else {
            // Se a linha tem fundo amarelo → boleto NÃO chegou
            row.boleto_chegou = yellowRows.has(rowIdx) ? 0 : 1;
          }
        }
        if (sheetName === 'Cheques') {
          row.valor = parseBR(row.valor);
          if (row.valor === 0) { pulados++; continue; }
          row.taxa = parseBR(row.taxa) || 5;
          row.cliente = (row.cliente || '').toString().trim() || 'Sem nome';
          row.juros_antecipado = (row.juros_antecipado || '').toString().toLowerCase() === 'sim' || row.juros_antecipado === '1' || row.juros_antecipado === 1;
        }
        if (sheetName === 'Movimentacao') {
          row.entrada = parseBR(row.entrada);
          row.saida = parseBR(row.saida);
          row.diferenca = parseBR(row.diferenca);
          if (row.entrada === 0 && row.saida === 0) { pulados++; continue; }
          row.descricao = (row.descricao || '').toString().trim() || 'Sem descrição';
        }
        if (sheetName === 'Conta Celso') {
          row.valor = parseBR(row.valor);
          if (row.valor === 0) { pulados++; continue; }
          row.descricao = (row.descricao || '').toString().trim() || 'Sem descrição';
          row.tipo = (row.tipo || '').toString().trim().toLowerCase() || 'debito';
          // Aceitar variações: "crédito" → "credito", "débito" → "debito"
          row.tipo = row.tipo.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          if (row.tipo !== 'credito' && row.tipo !== 'debito') row.tipo = 'debito';
        }
        // Converter datas do Excel (número serial) ou dia simples para string YYYY-MM-DD
        const mesSelecionado = gM(); // ex: "2026-05"
        ['data', 'vencimento', 'bom_para'].forEach(campo => {
          if (row[campo] && typeof row[campo] === 'number') {
            if (row[campo] >= 1 && row[campo] <= 31) {
              // Número pequeno = dia do mês selecionado
              row[campo] = mesSelecionado + '-' + String(Math.floor(row[campo])).padStart(2,'0');
            } else {
              // Número grande = data serial do Excel
              const dt = XLSX.SSF.parse_date_code(row[campo]);
              row[campo] = `${dt.y}-${String(dt.m).padStart(2,'0')}-${String(dt.d).padStart(2,'0')}`;
            }
          }
          if (row[campo] && typeof row[campo] === 'string') {
            row[campo] = row[campo].trim();
          }
        });
        console.log('Importando:', sheetName, JSON.stringify(row));
        await api('POST', endpoint, row);
        total++;
        rowIdx++;
      } catch (e) { erros++; console.error('Erro importando:', sheetName, row, e); }
    }
  }
  let msg = `Importação concluída! ${total} registros adicionados`;
  if (pulados) msg += `, ${pulados} linhas vazias puladas`;
  if (erros) msg += `, ${erros} erros`;
  toast(msg);
  input.value = '';
  refreshAll();
}
// === PARCELAS ===
let parcItems = [];
function openParcelas(){
  document.getElementById('modalParcelas').style.display='flex';
  document.getElementById('parc-desc').value='';
  document.getElementById('parc-valor').value='';
  document.getElementById('parc-qtd').value='6';
  let now=new Date();
  document.getElementById('parc-mes').value=now.getFullYear()+'-'+(now.getMonth()+1).toString().padStart(2,'0');
  // Populate selects
  document.getElementById('parc-cat').innerHTML=CFG.categoriasLoja.map(c=>'<option>'+c+'</option>').join('');
  document.getElementById('parc-forn').innerHTML='<option value="">—</option>'+(CFG.fornecedores||[]).map(f=>'<option>'+f+'</option>').join('');
  parcItems=[];
  renderParcelas();
}
function closeParcelas(){document.getElementById('modalParcelas').style.display='none';parcItems=[];}
function gerarParcelas(){
  let desc=document.getElementById('parc-desc').value.trim();
  if(!desc){toast('Preencha a descrição do produto','error');return;}
  let qtd=parseInt(document.getElementById('parc-qtd').value)||1;
  let valor=parseFloat(document.getElementById('parc-valor').value)||0;
  let mesInicial=document.getElementById('parc-mes').value;
  if(!mesInicial){toast('Selecione o mês inicial','error');return;}
  // Keep existing frete items
  let fretes=parcItems.filter(p=>p.frete);
  parcItems=fretes;
  let [ano,mes]=mesInicial.split('-').map(Number);
  for(let i=0;i<qtd;i++){
    let m=mes+i,a=ano;
    while(m>12){m-=12;a++;}
    parcItems.push({
      mesAno:a+'-'+String(m).padStart(2,'0'),
      dia:'15',
      descricao:desc+' '+(i+1)+'/'+qtd,
      valor:valor,
      frete:false
    });
  }
  renderParcelas();
}
function addFreteParcela(){
  let desc=document.getElementById('parc-desc').value.trim()||'Produto';
  let mesInicial=document.getElementById('parc-mes').value;
  if(!mesInicial){toast('Selecione o mês inicial','error');return;}
  parcItems.push({
    mesAno:mesInicial,
    dia:'15',
    descricao:'Frete - '+desc,
    valor:0,
    frete:true
  });
  renderParcelas();
}
function removeParcela(idx){parcItems.splice(idx,1);renderParcelas();}
function renderParcelas(){
  let tb=document.getElementById('parcList');
  if(!parcItems.length){tb.innerHTML='<tr><td colspan="5" style="text-align:center;padding:16px;color:var(--text3)">Clique em "Gerar Parcelas" para criar as linhas</td></tr>';return;}
  tb.innerHTML=parcItems.map((p,i)=>{
    let label=p.frete?'<span style="background:var(--amber);color:#000;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600">FRETE</span>':'<b>'+(i+1)+'</b>';
    return '<tr>'
      +'<td>'+label+'</td>'
      +'<td><div style="display:flex;gap:4px;align-items:center"><span style="color:var(--text3);font-size:12px">'+p.mesAno+'-</span><input type="number" class="inline-input" value="'+p.dia+'" min="1" max="31" style="width:50px" onchange="NR.setParcField('+i+',\'dia\',this.value)"></div></td>'
      +'<td><input type="text" class="inline-input" value="'+p.descricao+'" style="width:100%" onchange="NR.setParcField('+i+',\'descricao\',this.value)"></td>'
      +'<td><input type="number" class="inline-input" value="'+p.valor+'" step="0.01" style="width:90px" onchange="NR.setParcField('+i+',\'valor\',this.value)"></td>'
      +'<td><button class="btn btn-sm btn-danger" onclick="NR.removeParcela('+i+')"><i class="fas fa-times"></i></button></td>'
      +'</tr>';
  }).join('');
}
function setParcField(idx,campo,valor){
  if(campo==='valor')parcItems[idx][campo]=parseFloat(valor)||0;
  else if(campo==='dia')parcItems[idx][campo]=valor;
  else parcItems[idx][campo]=valor;
}
async function salvarParcelas(){
  if(!parcItems.length){toast('Nenhuma parcela para salvar','error');return;}
  let cat=document.getElementById('parc-cat').value;
  let forn=document.getElementById('parc-forn').value;
  let aChegar=document.getElementById('parc-achegar').checked;
  let grupo='grp_'+Date.now().toString(36)+Math.random().toString(36).substr(2,4);
  toast('Salvando '+parcItems.length+' parcelas...','info');
  let ok=0,errs=0;
  for(const p of parcItems){
    try{
      let venc=p.mesAno+'-'+String(p.dia).padStart(2,'0');
      await api('POST','/api/contas-pagar',{vencimento:venc,descricao:p.descricao,valor:p.valor,categoria:cat,fornecedor:forn,recorrente:false,a_chegar:aChegar,grupo_parcela:grupo});
      ok++;
    }catch(e){errs++;}
  }
  toast(ok+' parcelas salvas!'+(errs?' ('+errs+' erros)':''));
  closeParcelas();
  refreshAll();
}

window.NR={del,delAc,delC,delCP,comp,toggleBoleto,setPago,delCL,delCD,delForn,addCatInline,addFornInline,setAcField,chqBusca,setDest,novaEmpresa,delEmpresa,openChequePag,calcChequePag,closeChequePag,logout,togglePerm,delUser,openSenha,closeSenha,printRecibo,confirmClear,closeConfirmDel,openEditPerms,closeEditPerms,toggleEditPerm,saveEditPerms,updateCxSaldo,delCaixa,setCaixaPago,toggleAllChq,updateChqSelCount,printSelecionados,saveMovConfig,updateMovDif,delMov,exportarPlanilhaGeral,backupDB,restoreDB,baixarModelo,importarPlanilha,openParcelas,closeParcelas,gerarParcelas,addFreteParcela,removeParcela,setParcField,salvarParcelas,marcarChegou,toggleAChegar,renderDashGeral,setCor,setFundo,delFisc};
checkAuth();
})();
