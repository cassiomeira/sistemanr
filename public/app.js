(function(){
'use strict';
let CFG={pctAdmin:23,pctDono:36,pctReserva:30,categoriasLoja:[],categoriasDrog:[]},COLABS=[];
let currentEmpresa='nunesrocha';
let empresasList=[],chequePagContaId='',chequePagContas=[],chequePagContext='contas-pagar',acertoFinanceiroGeral=[],ocultarContasPagas=true;
let currentUser=null,authToken=localStorage.getItem('authToken')||'';
const MENU_MAP={'dashboard':'Painel Geral','acerto':'Acerto Financeiro','abastecimentos':'Abastecimentos','fat':'Fat (Recorrentes)','contas-pagar':'Contas a Pagar','a-chegar':'Produtos a Chegar','movimentacao':'Movimentação','drogaria':'Drogaria','cheques':'Troca de Cheques','conta-dono':'Conta do Celso','distribuicao':'Distribuição','notas-nfe':'Notas CNPJ','fornecedores-cad':'Fornecedores','folha':'Folha Pagamento','colaboradores':'Comissionados','relatorios':'Relatórios','configuracoes':'Configurações','caixas':'Caixas','somas':'Somas','usuarios':'Usuários'};
const MENU_ICONS={'dashboard':'fa-chart-pie','acerto':'fa-cash-register','abastecimentos':'fa-gas-pump','fat':'fa-redo','contas-pagar':'fa-file-invoice-dollar','a-chegar':'fa-truck-loading','movimentacao':'fa-exchange-alt','drogaria':'fa-pills','cheques':'fa-money-check-alt','conta-dono':'fa-user-tie','distribuicao':'fa-percentage','notas-nfe':'fa-file-download','fornecedores-cad':'fa-address-book','folha':'fa-file-invoice-dollar','colaboradores':'fa-users','relatorios':'fa-file-alt','configuracoes':'fa-cog','caixas':'fa-cash-register','somas':'fa-calculator','usuarios':'fa-users-cog'};
const COLORS=['#00d4aa','#3b82f6','#f59e0b','#ec4899','#8b5cf6','#06b6d4','#f43f5e','#14b8a6','#6366f1'];
function fmt(v){return'R$ '+Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});}
function fD(d){if(!d)return'-';d=d.split('T')[0];let p=d.split('-');return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:d;}
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
ms.addEventListener('change',()=>{updateMonthDisplay();refreshAll();});
// Month display bar
const MONTH_NAMES=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
function updateMonthDisplay(){
  let v=ms.value;if(!v)return;
  let [y,m]=v.split('-').map(Number);
  document.getElementById('monthDisplayText').textContent=MONTH_NAMES[m-1]+' '+y;
}
updateMonthDisplay();
document.getElementById('monthPrev').addEventListener('click',()=>{
  let [y,m]=ms.value.split('-').map(Number);m--;if(m<1){m=12;y--;}
  ms.value=y+'-'+String(m).padStart(2,'0');updateMonthDisplay();refreshAll();
});
document.getElementById('monthNext').addEventListener('click',()=>{
  let [y,m]=ms.value.split('-').map(Number);m++;if(m>12){m=1;y++;}
  ms.value=y+'-'+String(m).padStart(2,'0');updateMonthDisplay();refreshAll();
});
function setToday(id){let e=document.getElementById(id);if(e)e.value=now.toISOString().split('T')[0];}
['ac-data','drog-data','chq-data','chq-venc','dono-data','cp-venc','mov-data','fat-data'].forEach(setToday);
function populateCats(){
  let catDatalistOpts=CFG.categoriasLoja.map(c=>'<option value="'+c+'">').join('');
  let acCatList=document.getElementById('ac-cat-list'); if(acCatList) acCatList.innerHTML=catDatalistOpts;
  let cpCatList=document.getElementById('cp-cat-list'); if(cpCatList) cpCatList.innerHTML=catDatalistOpts;
  let fatCatList=document.getElementById('fat-cat-list'); if(fatCatList) fatCatList.innerHTML=catDatalistOpts;
  let drogCat=document.getElementById('drog-cat');if(drogCat)drogCat.innerHTML='<option value="">—</option>'+CFG.categoriasDrog.map(c=>'<option>'+c+'</option>').join('');
  document.getElementById('rel-cat').innerHTML='<option value="">Todas</option>'+CFG.categoriasLoja.map(c=>'<option value="'+c+'">'+c+'</option>').join('');
  let fornDatalistOpts=(CFG.fornecedores||[]).map(f=>'<option value="'+f+'">').join('');
  let acFornList=document.getElementById('ac-forn-list'); if(acFornList) acFornList.innerHTML=fornDatalistOpts;
  let cpFornList=document.getElementById('cp-forn-list'); if(cpFornList) cpFornList.innerHTML=fornDatalistOpts;
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
const showAbastecimento = function(){document.getElementById('abastecimentoFields').style.display=this.value==='Abastecimento'?'block':'none';};
document.getElementById('ac-cat').addEventListener('change',showAbastecimento);
document.getElementById('ac-cat').addEventListener('input',showAbastecimento);
document.getElementById('formAcerto').addEventListener('submit',async function(e){e.preventDefault();let body={data:document.getElementById('ac-data').value,descricao:document.getElementById('ac-desc').value,entrada:parseFloat(document.getElementById('ac-entrada').value)||0,saida:parseFloat(document.getElementById('ac-saida').value)||0,categoria:document.getElementById('ac-cat').value,fornecedor:document.getElementById('ac-forn').value,recorrente:document.getElementById('ac-rec').value==='1',tipo_nota:document.getElementById('ac-nota').value,a_chegar:document.getElementById('ac-achegar').value==='1'};if(body.categoria==='Abastecimento'){let sel=document.getElementById('ac-veiculo');body.veiculo_id=sel.value;body.veiculo=sel.options[sel.selectedIndex]?.text||'';body.placa=document.getElementById('ac-placa').value.trim().toUpperCase();body.km=document.getElementById('ac-km').value.trim();body.localidade=document.getElementById('ac-localidade').value.trim();body.condutor=document.getElementById('ac-condutor').value.trim();}await api('POST','/api/acerto',body);this.reset();setToday('ac-data');populateCats();document.getElementById('abastecimentoFields').style.display='none';toast('Lançamento salvo!');refreshAll();});
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
    let achegar=i.a_chegar?'<span style="background:var(--amber);color:#000;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:700;margin-left:4px"><i class="fas fa-truck-loading"></i> A CHEGAR</span>':'';
    let chegarBtn='';
    if(i.saida > 0) {
      chegarBtn=i.a_chegar?'<button class="btn btn-sm" style="background:var(--green);color:#fff;font-size:10px;margin-right:4px" onclick="NR.marcarChegou(\''+i.id+'\',\'acerto\')" title="Marcar como chegou"><i class="fas fa-check"></i> Chegou</button> ':'<button class="btn btn-sm" style="background:var(--bg3);color:var(--amber);font-size:10px;border:1px solid var(--amber);margin-right:4px" onclick="NR.toggleAChegar(\''+i.id+'\',\'acerto\')" title="Marcar como produto a chegar"><i class="fas fa-truck-loading"></i></button> ';
    }
    let catSel='<select class="inline-select" onchange="NR.setAcField(\''+i.id+'\',\'categoria\',this.value)"><option value=""'+((!i.categoria||i.categoria==='')?' selected':'')+'>—</option>'+CFG.categoriasLoja.map(c=>'<option'+(c===i.categoria?' selected':'')+'>'+c+'</option>').join('')+'</select>';
    let fornSel='<select class="inline-select" onchange="NR.setAcField(\''+i.id+'\',\'fornecedor\',this.value)"><option value=""'+((!i.fornecedor||i.fornecedor==='')?' selected':'')+'>—</option>'+(CFG.fornecedores||[]).map(f=>'<option'+(f===i.fornecedor?' selected':'')+'>'+f+'</option>').join('')+'</select>';
    let recSel='<select class="inline-select" onchange="NR.setAcField(\''+i.id+'\',\'recorrente\',this.value)"><option value="0"'+(i.recorrente?'':' selected')+'>Não</option><option value="1"'+(i.recorrente?' selected':'')+'>Sim</option></select>';
    let dfSel='<select class="inline-select" onchange="NR.setAcField(\''+i.id+'\',\'tipo_nota\',this.value)"><option value=""'+(!i.tipo_nota?' selected':'')+'>—</option><option value="D"'+(i.tipo_nota==='D'?' selected':'')+'>D</option><option value="F"'+(i.tipo_nota==='F'?' selected':'')+'>F</option></select>';
    return'<tr data-id="'+i.id+'" data-row="'+encodeURIComponent(JSON.stringify(i))+'"><td>'+fD(i.data)+'</td><td>'+i.descricao+achegar+'</td><td class="tipo-entrada">'+(i.entrada?fmt(i.entrada):'')+'</td><td class="tipo-saida">'+(i.saida?fmt(i.saida):'')+'</td><td>'+catSel+'</td><td>'+fornSel+'</td><td>'+recSel+'</td><td>'+dfSel+'</td><td><div style="display:flex;align-items:center">'+chqBtn+chegarBtn+'<button class="btn-edit" onclick="NR.editRow(\'acerto\',\''+i.id+'\')"><i class="fas fa-edit"></i></button><button class="btn btn-sm btn-danger" onclick="NR.delAc(\''+i.id+'\')"><i class="fas fa-trash"></i></button></div></td></tr>';}).join('');
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
document.getElementById('formFat').addEventListener('submit',async function(e){
  e.preventDefault();
  await api('POST','/api/acerto',{data:document.getElementById('fat-data').value,descricao:document.getElementById('fat-desc').value,entrada:0,saida:parseFloat(document.getElementById('fat-valor').value)||0,categoria:document.getElementById('fat-cat').value,fornecedor:'',recorrente:1,tipo_nota:document.getElementById('fat-nota').value});
  this.reset();setToday('fat-data');populateCats();toast('Gasto recorrente salvo!');refreshAll();
});
async function renderFat(){
  let items=await api('GET','/api/fat?mes='+gM()),total=0;
  document.querySelector('#tabelaFat tbody').innerHTML=items.map(i=>{total+=i.saida||0;return'<tr data-id="'+i.id+'" data-row="'+encodeURIComponent(JSON.stringify(i))+'"><td>'+fD(i.data)+'</td><td>'+i.descricao+'</td><td class="tipo-saida">'+fmt(i.saida)+'</td><td>'+i.categoria+'</td><td><button class="btn-edit" onclick="NR.editRow(\'fat\',\''+i.id+'\')"><i class="fas fa-edit"></i></button><button class="btn btn-sm btn-danger" onclick="NR.delAc(\''+i.id+'\')"><i class="fas fa-trash"></i></button></td></tr>';}).join('');
  document.getElementById('fat-total').textContent=fmt(total);
  // Chart por categoria
  let agr={};items.forEach(i=>{let c=i.categoria||'Outros';agr[c]=(agr[c]||0)+(i.saida||0);});
  let cats=Object.entries(agr).map(([categoria,total])=>({categoria,total})).sort((a,b)=>b.total-a.total);
  let ch=document.getElementById('chartFat');
  if(!cats.length){ch.innerHTML='<p style="color:var(--text3)">Sem dados recorrentes</p>';return;}
  let max=Math.max(...cats.map(c=>c.total));
  ch.innerHTML=cats.map((c,i)=>'<div class="chart-bar-row"><span class="chart-bar-label">'+c.categoria+'</span><div class="chart-bar-track"><div class="chart-bar-fill" style="width:'+Math.max(c.total/max*100,5)+'%;background:'+COLORS[i%COLORS.length]+'">'+Math.round(c.total/max*100)+'%</div></div><span class="chart-bar-value">'+fmt(c.total)+'</span></div>').join('');
}
// CONTAS A PAGAR
document.getElementById('formContaPagar').addEventListener('submit',async function(e){e.preventDefault();await api('POST','/api/contas-pagar',{vencimento:document.getElementById('cp-venc').value,descricao:document.getElementById('cp-desc').value,valor:parseFloat(document.getElementById('cp-valor').value),categoria:document.getElementById('cp-cat').value,fornecedor:document.getElementById('cp-forn').value,recorrente:document.getElementById('cp-rec').value==='1',tipo_nota:document.getElementById('cp-nota').value,a_chegar:document.getElementById('cp-achegar').value==='1'});this.reset();setToday('cp-venc');populateCats();toast('Conta salva!');refreshAll();});
async function renderContasPagar(){
  let items=await api('GET','/api/contas-pagar?mes='+gM()),tp=0,tpg=0;
  let caixas=await api('GET','/api/caixas');
  chequePagContas=items;
  const btn = document.getElementById('btnToggleOcultarPagas');
  if (btn) {
    btn.innerHTML = ocultarContasPagas 
      ? '<i class="fas fa-eye-slash"></i> Ocultando Pagas' 
      : '<i class="fas fa-eye"></i> Mostrando Pagas';
  }
  let colabOpts='<option value="">—</option><option value="A Pagar">A Pagar</option>'+COLABS.map(c=>'<option value="'+c.nome+'">'+c.nome+'</option>').join('');
  let caixaOpts='<option value="0">—</option>'+caixas.map(cx=>'<option value="'+cx.id+'">'+cx.nome+' ('+fmt(cx.saldo)+')</option>').join('');
  let tb=document.querySelector('#tabelaContasPagar tbody');
  tb.innerHTML=items.map(i=>{
    let pago=i.pago_por&&i.pago_por!==''&&i.pago_por!=='A Pagar';
    let boletoN=!i.boleto_chegou;
    let cls=pago?'row-pago':(boletoN?'row-boleto-pendente':'');
    if(pago)tpg+=i.valor;else tp+=i.valor;
    if(ocultarContasPagas && pago)return'';
    let chqBtn=pago?'':'<button class="btn-cheque-pay" onclick="NR.openChequePag(\''+i.id+'\')" title="Pagar com cheque"><i class="fas fa-money-check-alt"></i> Cheque</button> ';
    let cxSel='<select class="inline-select" onchange="NR.setCaixaPago(\''+i.id+'\',this.value)">'+caixaOpts.replace('value="'+(i.caixa_id||0)+'"','value="'+(i.caixa_id||0)+'" selected')+'</select>';
    let achegar=i.a_chegar?'<span style="background:var(--amber);color:#000;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:700;margin-left:4px"><i class="fas fa-truck-loading"></i> A CHEGAR</span>':'';
    let chegarBtn=i.a_chegar?'<button class="btn btn-sm" style="background:var(--green);color:#fff;font-size:10px" onclick="NR.marcarChegou(\''+i.id+'\')" title="Marcar como chegou"><i class="fas fa-check"></i> Chegou</button> ':'<button class="btn btn-sm" style="background:var(--bg3);color:var(--amber);font-size:10px;border:1px solid var(--amber)" onclick="NR.toggleAChegar(\''+i.id+'\')" title="Marcar como produto a chegar"><i class="fas fa-truck-loading"></i></button> ';
    let cb=pago?'<td></td>':'<td><input type="checkbox" class="cp-sel-cb" data-id="'+i.id+'" data-valor="'+i.valor+'" onchange="NR.updateCpBatch()"></td>';
    return'<tr data-id="'+i.id+'" data-row="'+encodeURIComponent(JSON.stringify(i))+'" class="'+cls+'">'+cb+'<td>'+fD(i.vencimento)+'</td><td>'+i.descricao+achegar+'</td><td>'+fmt(i.valor)+'</td><td>'+i.categoria+'</td><td>'+(i.fornecedor||'—')+'</td><td>'+(i.recorrente?'Sim':'Não')+'</td><td>'+(i.tipo_nota||'—')+'</td><td><button class="inline-toggle '+(i.boleto_chegou?'is-yes':'is-no')+'" onclick="NR.toggleBoleto(\''+i.id+'\','+(! i.boleto_chegou?1:0)+')">'+(i.boleto_chegou?'Sim':'Não')+'</button></td><td><select class="inline-select" onchange="NR.setPago(\''+i.id+'\',this.value)">'+colabOpts.replace('value="'+(i.pago_por||'')+'"','value="'+(i.pago_por||'')+'" selected')+'</select></td><td>'+cxSel+'</td><td>'+chegarBtn+'<button class="btn-edit" onclick="NR.editRow(\'contas-pagar\',\''+i.id+'\')"><i class="fas fa-edit"></i></button> '+chqBtn+'<button class="btn btn-sm btn-danger" onclick="NR.delCP(\''+i.id+'\')"><i class="fas fa-trash"></i></button></td></tr>';
  }).join('');
  document.getElementById('cp-total-pend').textContent=fmt(tp);
  document.getElementById('cp-total-pago').textContent=fmt(tpg);
  // Atualizar pagador do batch bar
  let batchSel=document.getElementById('cpBatchPagador');
  batchSel.innerHTML='<option value="">— Escolha —</option>'+COLABS.map(c=>'<option value="'+c.nome+'">'+c.nome+'</option>').join('');
  document.getElementById('cpBatchBar').style.display='none';
  document.getElementById('cpSelectAll').checked=false;
}
function toggleOcultarPagas(){
  ocultarContasPagas=!ocultarContasPagas;
  renderContasPagar();
}
function updateCpBatch(){
  let cbs=document.querySelectorAll('.cp-sel-cb:checked');
  let total=0;cbs.forEach(cb=>total+=parseFloat(cb.dataset.valor)||0);
  let bar=document.getElementById('cpBatchBar');
  if(cbs.length>0){bar.style.display='flex';document.getElementById('cpBatchCount').textContent=cbs.length;document.getElementById('cpBatchTotal').textContent=fmt(total);}
  else{bar.style.display='none';}
}
function toggleAllCp(checked){
  document.querySelectorAll('.cp-sel-cb').forEach(cb=>{cb.checked=checked;});
  updateCpBatch();
}
function limparSelecaoCp(){
  document.querySelectorAll('.cp-sel-cb').forEach(cb=>{cb.checked=false;});
  document.getElementById('cpSelectAll').checked=false;
  updateCpBatch();
}
async function pagarSelecionadas(){
  let pagador=document.getElementById('cpBatchPagador').value;
  if(!pagador){toast('Escolha quem vai pagar!','error');return;}
  let cbs=document.querySelectorAll('.cp-sel-cb:checked');
  if(!cbs.length){toast('Nenhuma conta selecionada','error');return;}
  let total=0;cbs.forEach(cb=>total+=parseFloat(cb.dataset.valor)||0);
  if(!confirm('Pagar '+cbs.length+' contas no valor total de '+fmt(total)+' por '+pagador+'?'))return;
  let promises=[];
  cbs.forEach(cb=>promises.push(api('PUT','/api/contas-pagar/'+cb.dataset.id,{pago_por:pagador})));
  await Promise.all(promises);
  toast(cbs.length+' contas pagas por '+pagador+'!');
  refreshAll();
}
// PRODUTOS A CHEGAR
async function renderAChegar(){
  let items=await api('GET','/api/a-chegar');
  let badge=document.getElementById('badge-achegar');
  if(items.length){badge.textContent=items.length;badge.style.display='inline';}else{badge.style.display='none';}
  document.getElementById('achegar-total').textContent=items.length;
  let tb=document.querySelector('#tabelaAChegar tbody');
  if(!items.length){tb.innerHTML='<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text3)"><i class="fas fa-check-circle" style="font-size:2rem;margin-bottom:8px;display:block;color:var(--green)"></i>Todos os produtos chegaram!</td></tr>';return;}
  tb.innerHTML=items.map(i=>'<tr><td>'+fD(i.vencimento)+'</td><td>'+i.descricao+'</td><td>'+fmt(i.valor)+'</td><td>'+(i.fornecedor||'—')+'</td><td><button class="btn btn-sm" style="background:var(--green);color:#fff" onclick="NR.marcarChegou(\''+i.id+'\',\''+i.origem+'\')"><i class="fas fa-check"></i> Chegou</button></td></tr>').join('');
}
async function marcarChegou(id, origem='contas-pagar'){
  let msg = origem==='acerto' ? 'Marcar produto como chegou?' : 'Marcar produto como chegou? (Todas as parcelas do mesmo produto serão desmarcadas)';
  if(!confirm(msg))return;
  if(origem==='acerto'){
    await api('PUT','/api/acerto/'+id+'/chegou');
  } else {
    await api('PUT','/api/contas-pagar/'+id+'/chegou');
  }
  toast('Produto marcado como chegou!');
  refreshAll();
}
async function toggleAChegar(id, origem='contas-pagar'){
  if(origem==='acerto'){
    await api('PUT','/api/acerto/'+id+'/a-chegar');
  } else {
    await api('PUT','/api/contas-pagar/'+id+'/a-chegar');
  }
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
    return'<tr data-id="'+i.id+'" data-row="'+encodeURIComponent(JSON.stringify(i))+'"><td>'+fD(i.data)+'</td><td class="'+tipoClass+'">'+(i.tipo==='entrada'?'↑ ':'↓ ')+tipoLabel+'</td><td>'+i.descricao+'</td><td class="'+tipoClass+'">'+fmt(i.valor)+'</td><td style="color:'+(saldo>=0?'var(--green)':'var(--red)')+'">'+fmt(saldo)+'</td><td><button class="btn-edit" onclick="NR.editRow(\'drogaria\',\''+i.id+'\')"><i class="fas fa-edit"></i></button><button class="btn btn-sm btn-danger" onclick="NR.del(\'drogaria\',\''+i.id+'\')"><i class="fas fa-trash"></i></button></td></tr>';
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
  return'<tr data-id="'+i.id+'" data-row="'+encodeURIComponent(JSON.stringify(i))+'"><td><input type="checkbox" class="chq-sel" data-id="'+i.id+'" onchange="NR.updateChqSelCount()" style="accent-color:var(--green);width:16px;height:16px;cursor:pointer"></td><td><b>'+(i.numero||'\u2014')+'</b></td><td>'+fD(i.data)+'</td><td>'+i.cliente+'</td><td>'+(i.dono_cheque||'—')+'</td><td>'+fmt(i.valor)+jaLabel+'</td><td>'+destCell+'</td><td'+bpClass+'>'+bp+'</td><td>'+dias+'d</td><td>'+i.taxa+'%/m'+extraLabel+'</td><td class="tipo-entrada">'+fmt(i.lucro)+'</td><td>'+(i.origem_dinheiro==='caixa-empresa'?'Caixa':'Celso')+'</td><td>'+fD(i.vencimento)+'</td><td class="status-'+sl+'">'+(statusLabel[sl]||sl)+'</td><td>'+'<button class="btn-edit" onclick="NR.editRow(\'cheques\',\''+i.id+'\')"><i class="fas fa-edit"></i></button><button class="btn btn-sm" style="background:var(--blue);color:#fff" onclick="NR.printRecibo(\''+i.id+'\')" title="Imprimir recibo"><i class="fas fa-print"></i></button>'+(sl==='pendente'?'<button class="btn btn-sm btn-primary" onclick="NR.comp(\''+i.id+'\')">'+'<i class="fas fa-check"></i></button>':'')+'<button class="btn btn-sm btn-danger" onclick="NR.del(\'cheques\',\''+i.id+'\')">'+'<i class="fas fa-trash"></i></button></td></tr>';
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
async function renderContaDono(){let items=await api('GET','/api/conta-dono?mes='+gM()),td=0,tc=0,sa=0;document.querySelector('#tabelaDono tbody').innerHTML=items.map(i=>{if(i.tipo==='debito'){td+=i.valor;sa+=i.valor;}else{tc+=i.valor;sa-=i.valor;}return'<tr data-id="'+i.id+'" data-row="'+encodeURIComponent(JSON.stringify(i))+'"><td>'+fD(i.data)+'</td><td class="tipo-'+i.tipo+'">'+(i.tipo==='debito'?'↑ Débito':'↓ Crédito')+'</td><td>'+i.descricao+'</td><td class="tipo-'+i.tipo+'">'+fmt(i.valor)+'</td><td>'+fmt(Math.abs(sa))+'</td><td><button class="btn-edit" onclick="NR.editRow(\'conta-dono\',\''+i.id+'\')"><i class="fas fa-edit"></i></button><button class="btn btn-sm btn-danger" onclick="NR.del(\'conta-dono\',\''+i.id+'\')"><i class="fas fa-trash"></i></button></td></tr>';}).join('');document.getElementById('dono-total-deb').textContent=fmt(td);document.getElementById('dono-total-cred').textContent=fmt(tc);let s=td-tc;document.getElementById('dono-saldo').textContent=fmt(Math.abs(s))+(s>0?' (Deve)':s<0?' (A receber)':' (Zerado)');}
// COLABORADORES
document.getElementById('formColab').addEventListener('submit',async function(e){e.preventDefault();await api('POST','/api/colaboradores',{nome:document.getElementById('colab-nome').value.trim(),percentual:parseFloat(document.getElementById('colab-pct').value)});this.reset();toast('Adicionado!');refreshAll();});
async function renderColaboradores(){COLABS=await api('GET','/api/colaboradores');let d=await api('GET','/api/dashboard?mes='+gM()),l=d.summary.lojaEnt-d.summary.lojaSai,tp=0;COLABS.forEach(c=>tp+=c.percentual);document.getElementById('colabList').innerHTML=COLABS.map(c=>{let v=l*c.percentual/100,ini=c.nome.split(' ').map(w=>w[0]).join('').substring(0,2).toUpperCase();return'<div class="colab-card"><div class="avatar">'+ini+'</div><div class="colab-info"><div class="name">'+c.nome+'</div><div class="pct">'+c.percentual+'%</div><div class="commission">'+fmt(v)+'</div></div><button class="btn-remove" onclick="NR.delC('+c.id+')"><i class="fas fa-times"></i></button></div>';}).join('');document.getElementById('colab-total-pct').textContent=tp.toFixed(1)+'%';document.getElementById('colab-base-valor').textContent=fmt(l);}
// DISTRIBUIÇÃO
async function renderDistribuicao(){let d=await api('GET','/api/dashboard?mes='+gM()),s=d.summary,c=d.config,co=d.colaboradores;let ll=s.lojaEnt-s.lojaSai,ld=s.drogEnt-s.drogSai,lm=s.movEnt-s.movSai,lt=ll+ld+s.chqLucro-s.cpPago+lm;let vA=ll*c.pctAdmin/100,vD=ll*c.pctDono/100,vR=ll*c.pctReserva/100,tc=0;co.forEach(x=>tc+=ll*x.percentual/100);document.getElementById('distribGrid').innerHTML='<div class="distrib-item"><div class="distrib-bar" style="--pct:'+c.pctAdmin+'%;--clr:#00d4aa"><span>'+c.pctAdmin+'%</span></div><p>Cássio</p><h2>'+fmt(vA)+'</h2></div><div class="distrib-item"><div class="distrib-bar" style="--pct:'+c.pctDono+'%;--clr:#f59e0b"><span>'+c.pctDono+'%</span></div><p>Celso</p><h2>'+fmt(vD)+'</h2></div><div class="distrib-item"><div class="distrib-bar" style="--pct:'+c.pctReserva+'%;--clr:#6366f1"><span>'+c.pctReserva+'%</span></div><p>Reserva</p><h2>'+fmt(vR)+'</h2></div><div class="distrib-item" style="border-color:var(--pink)"><p>Comissões</p><h2 style="color:var(--pink)">'+fmt(tc)+'</h2><small style="color:var(--text3)">Base: Lucro Loja</small></div>';let h='<div class="line"><span>Receita Loja</span><b>'+fmt(s.lojaEnt)+'</b></div><div class="line"><span>(-) Despesas Loja</span><b>'+fmt(s.lojaSai)+'</b></div><div class="line"><span>= Lucro Loja</span><b>'+fmt(ll)+'</b></div><div class="line"><span>Lucro Drogaria</span><b>'+fmt(ld)+'</b></div><div class="line"><span>Lucro Cheques</span><b>'+fmt(s.chqLucro)+'</b></div><div class="line"><span>(-) Contas Pagas</span><b style="color:var(--red)">-'+fmt(s.cpPago)+'</b></div><div class="line"><span>Movimentação</span><b>'+fmt(lm)+'</b></div><div class="line total"><span>LUCRO TOTAL</span><b>'+fmt(lt)+'</b></div>';co.forEach(x=>h+='<div class="line comissao"><span>→ '+x.nome+' ('+x.percentual+'%)</span><b>'+fmt(ll*x.percentual/100)+'</b></div>');document.getElementById('calcSummary').innerHTML=h;}
// DASHBOARD
async function renderDashboard(){let d=await api('GET','/api/dashboard?mes='+gM()),s=d.summary,c=d.config,co=d.colaboradores,caixas=d.caixas||[];let ll=s.lojaEnt-s.lojaSai,ld=s.drogEnt-s.drogSai,lm=s.movEnt-s.movSai,lt=ll+ld+s.chqLucro-s.cpPago+lm,tc=0;co.forEach(x=>tc+=ll*x.percentual/100);document.getElementById('dash-receita-loja').textContent=fmt(ll);document.getElementById('dash-receita-drogaria').textContent=fmt(ld);document.getElementById('dash-lucro-cheques').textContent=fmt(s.chqLucro);document.getElementById('dash-lucro-total').textContent=fmt(lt);document.getElementById('dash-parte-admin').textContent=fmt(ll*c.pctAdmin/100);document.getElementById('dash-parte-dono').textContent=fmt(ll*c.pctDono/100);document.getElementById('dash-parte-colab').textContent=fmt(tc);document.getElementById('dash-reserva').textContent=fmt(ll*c.pctReserva/100);document.getElementById('dash-label-admin').textContent='Parte Cássio ('+c.pctAdmin+'%)';document.getElementById('dash-label-dono').textContent='Parte Celso ('+c.pctDono+'%)';  let sd=s.donoDeb-s.donoCred;
  let elPessoal=document.getElementById('dash-saldo-celso-pessoal');
  if(elPessoal){
    elPessoal.textContent=fmt(Math.abs(sd))+(sd>0?' (Celso deve)':sd<0?' (Crédito Celso)':' (Zerado)');
    elPessoal.style.color=sd>0?'var(--red)':'var(--green)';
  }
  let elDrog=document.getElementById('dash-saldo-celso-drogaria');
  if(elDrog){
    elDrog.textContent=fmt(Math.abs(ld))+(ld>0?' (Crédito Drog.)':ld<0?' (Drogaria deve)':' (Zerado)');
    elDrog.style.color=ld>0?'var(--green)':'var(--red)';
  }
  let totalDebt=sd-ld;
  let elTotal=document.getElementById('dash-saldo-celso-total');
  if(elTotal){
    elTotal.textContent=fmt(Math.abs(totalDebt))+(totalDebt>0?' (Celso deve)':totalDebt<0?' (Empresa deve)':' (Zerado)');
    elTotal.style.color=totalDebt>0?'var(--red)':'var(--green)';
  }
  // Caixas no dashboard
  let dc=document.getElementById('dashCaixasCards');
  if(!caixas.length){dc.innerHTML='<p style="color:var(--text3)">Nenhum caixa cadastrado</p>';return;}
  dc.innerHTML=caixas.map(cx=>{let cor=cx.saldo>=0?'card-green':'card-red';return'<div class="card '+cor+'"><div class="card-icon"><i class="fas fa-cash-register"></i></div><div class="card-info"><span class="card-label">'+cx.nome+'</span><span class="card-value">'+fmt(cx.saldo)+'</span></div></div>';}).join('');
}
// CONFIG
async function renderConfig(){CFG=await api('GET','/api/config');if(CFG.categoriasLoja)CFG.categoriasLoja.sort((a,b)=>a.localeCompare(b));if(CFG.categoriasDrog)CFG.categoriasDrog.sort((a,b)=>a.localeCompare(b));if(CFG.fornecedores)CFG.fornecedores.sort((a,b)=>a.localeCompare(b));document.getElementById('cfg-pct-admin').value=CFG.pctAdmin;document.getElementById('cfg-pct-dono').value=CFG.pctDono;document.getElementById('cfg-pct-reserva').value=CFG.pctReserva;let t=CFG.pctAdmin+CFG.pctDono+CFG.pctReserva;document.getElementById('cfg-pct-total').value=t.toFixed(1)+'%'+(t===100?' ✓':t<100?' (falta '+(100-t).toFixed(1)+'%)':' (excede)');document.getElementById('catLojaList').innerHTML=CFG.categoriasLoja.map((c,i)=>'<div class="tag-item"><span>'+c+'</span><button class="tag-remove" onclick="NR.delCL('+i+')"><i class="fas fa-times"></i></button></div>').join('');document.getElementById('catDrogList').innerHTML=CFG.categoriasDrog.map((c,i)=>'<div class="tag-item"><span>'+c+'</span><button class="tag-remove" onclick="NR.delCD('+i+')"><i class="fas fa-times"></i></button></div>').join('');document.getElementById('fornList').innerHTML=(CFG.fornecedores||[]).map((f,i)=>'<div class="tag-item"><span>'+f+'</span><button class="tag-remove" onclick="NR.delForn('+i+')"><i class="fas fa-times"></i></button></div>').join('');populateCats();document.getElementById('cfg-ftp-host').value=CFG.ftp_host||'';document.getElementById('cfg-ftp-user').value=CFG.ftp_user||'';document.getElementById('cfg-ftp-pass').value=CFG.ftp_pass||'';document.getElementById('cfg-ftp-path').value=CFG.ftp_path||'/backups';document.getElementById('cfg-google-credentials').value=CFG.google_credentials||'';document.getElementById('cfg-google-folder').value=CFG.google_folder_id||'';loadBackupStatus();}
document.getElementById('formPercentuais').addEventListener('submit',async function(e){e.preventDefault();await api('PUT','/api/config',{pctAdmin:parseFloat(document.getElementById('cfg-pct-admin').value),pctDono:parseFloat(document.getElementById('cfg-pct-dono').value),pctReserva:parseFloat(document.getElementById('cfg-pct-reserva').value)});toast('Salvo!');refreshAll();});
document.getElementById('formCatLoja').addEventListener('submit',async function(e){e.preventDefault();let v=document.getElementById('cfg-cat-loja').value.trim();if(!v)return;CFG.categoriasLoja.push(v);await api('PUT','/api/config',{categoriasLoja:CFG.categoriasLoja});document.getElementById('cfg-cat-loja').value='';toast('Adicionada!');refreshAll();});
document.getElementById('formCatDrog').addEventListener('submit',async function(e){e.preventDefault();let v=document.getElementById('cfg-cat-drog').value.trim();if(!v)return;CFG.categoriasDrog.push(v);await api('PUT','/api/config',{categoriasDrog:CFG.categoriasDrog});document.getElementById('cfg-cat-drog').value='';toast('Adicionada!');refreshAll();});
document.getElementById('formFornecedor').addEventListener('submit',async function(e){e.preventDefault();let v=document.getElementById('cfg-forn').value.trim();if(!v)return;if(!CFG.fornecedores)CFG.fornecedores=[];CFG.fornecedores.push(v);await api('PUT','/api/config',{fornecedores:CFG.fornecedores});document.getElementById('cfg-forn').value='';toast('Fornecedor adicionado!');refreshAll();});
// BACKUP CONFIG
document.getElementById('formBackupFTP').addEventListener('submit',async function(e){e.preventDefault();await api('PUT','/api/config',{ftp_host:document.getElementById('cfg-ftp-host').value.trim(),ftp_user:document.getElementById('cfg-ftp-user').value.trim(),ftp_pass:document.getElementById('cfg-ftp-pass').value.trim(),ftp_path:document.getElementById('cfg-ftp-path').value.trim()||'/backups'});toast('Configuração FTP salva!');});
document.getElementById('formBackupGDrive').addEventListener('submit',async function(e){e.preventDefault();await api('PUT','/api/config',{google_credentials:document.getElementById('cfg-google-credentials').value.trim(),google_folder_id:document.getElementById('cfg-google-folder').value.trim()});toast('Configuração Google Drive salva!');});
async function backupManual(){toast('Iniciando backup...','info');try{let r=await api('POST','/api/backup/manual');if(r.ok){let s=r.status;let msg='Backup concluído! FTP: '+(s.ftp||'?')+', GDrive: '+(s.gdrive||'?');toast(msg);loadBackupStatus();}else{toast('Erro no backup','error');}}catch(e){toast('Erro: '+e.message,'error');}}
async function loadBackupStatus(){try{let s=await api('GET','/api/backup/status');let box=document.getElementById('backupStatusBox');if(!s||!s.time){box.innerHTML='<i class="fas fa-info-circle"></i> Nenhum backup realizado ainda.';}else{let dt=new Date(s.time).toLocaleString('pt-BR');box.innerHTML='<div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap"><span><i class="fas fa-clock" style="color:var(--blue)"></i> Último: <b>'+dt+'</b></span><span><i class="fas fa-server" style="color:'+(s.ftp==='ok'?'var(--green)':'var(--red)')+'"></i> FTP: <b>'+(s.ftp||'—')+'</b></span><span><i class="fab fa-google-drive" style="color:'+(s.gdrive==='ok'?'var(--green)':'var(--red)')+'"></i> GDrive: <b>'+(s.gdrive||'—')+'</b></span>'+(s.error?'<span style="color:var(--red)"><i class="fas fa-exclamation-triangle"></i> '+s.error+'</span>':'')+'</div>';}}catch(e){}}
// ACTIONS
async function del(c,id){if(!confirm('Excluir?'))return;await api('DELETE','/api/'+c+'/'+id);toast('Excluído!','info');refreshAll();}
async function delAc(id){if(!confirm('Excluir?'))return;await api('DELETE','/api/acerto/'+id);toast('Excluído!','info');refreshAll();}
async function delC(id){if(!confirm('Remover?'))return;await api('DELETE','/api/colaboradores/'+id);toast('Removido!','info');refreshAll();}
async function delCP(id){
  let conta=chequePagContas.find(c=>c.id===id);
  if(conta&&conta.grupo_parcela){
    let parcelas=await api('GET','/api/contas-pagar/grupo/'+encodeURIComponent(conta.grupo_parcela));
    if(!parcelas||!parcelas.length){if(!confirm('Excluir?'))return;await api('DELETE','/api/contas-pagar/'+id);toast('Excluído!','info');refreshAll();return;}
    let tbody=document.getElementById('delParcList');
    tbody.innerHTML=parcelas.map(p=>'<tr data-id="'+p.id+'"><td><input type="checkbox" class="delparc-cb" value="'+p.id+'" '+(p.id===id?'checked':'')+' style="width:16px;height:16px"></td><td><input type="date" class="dp-venc" value="'+p.vencimento+'" style="background:var(--bg3);border:1px solid var(--border);border-radius:4px;color:var(--text);padding:4px 6px;font-size:.82rem;width:130px" data-orig="'+p.vencimento+'"></td><td><input type="text" class="dp-desc" value="'+(p.descricao||'').replace(/"/g,'&quot;')+'" style="background:var(--bg3);border:1px solid var(--border);border-radius:4px;color:var(--text);padding:4px 6px;font-size:.82rem;width:100%" data-orig="'+(p.descricao||'').replace(/"/g,'&quot;')+'"></td><td><input type="number" class="dp-valor" value="'+p.valor+'" step="0.01" style="background:var(--bg3);border:1px solid var(--border);border-radius:4px;color:var(--text);padding:4px 6px;font-size:.82rem;width:90px;text-align:right" data-orig="'+p.valor+'"></td><td>'+(p.pago_por&&p.pago_por!=='A Pagar'?'<span style="color:var(--green)">Pago</span>':'<span style="color:var(--amber)">A Pagar</span>')+'</td></tr>').join('');
    document.getElementById('btnSalvarParcEdit').style.display='none';
    document.getElementById('delParc-all').checked=false;
    updateDelParcCount();
    document.getElementById('modalDelParcelas').style.display='flex';
  }else{
    if(!confirm('Excluir?'))return;
    await api('DELETE','/api/contas-pagar/'+id);toast('Excluído!','info');refreshAll();
  }
}
function updateDelParcCount(){
  let cbs=document.querySelectorAll('.delparc-cb');
  let checked=document.querySelectorAll('.delparc-cb:checked').length;
  document.getElementById('delParc-count').textContent=checked+' selecionada(s)';
  document.getElementById('btnDelParcConfirm').disabled=checked===0;
  document.getElementById('delParc-all').checked=checked===cbs.length&&cbs.length>0;
}
function closeDelParcelas(){document.getElementById('modalDelParcelas').style.display='none';}
function checkParcEdited(){
  let edited=false;
  document.querySelectorAll('#delParcList tr').forEach(tr=>{
    ['dp-venc','dp-desc','dp-valor'].forEach(cls=>{
      let inp=tr.querySelector('.'+cls);
      if(inp&&inp.value!==inp.dataset.orig)edited=true;
    });
  });
  document.getElementById('btnSalvarParcEdit').style.display=edited?'':'none';
}
async function salvarEditParcelas(){
  let updates=[];
  document.querySelectorAll('#delParcList tr').forEach(tr=>{
    let id=tr.dataset.id;
    let venc=tr.querySelector('.dp-venc'),desc=tr.querySelector('.dp-desc'),val=tr.querySelector('.dp-valor');
    let changed={};
    if(venc&&venc.value!==venc.dataset.orig)changed.vencimento=venc.value;
    if(desc&&desc.value!==desc.dataset.orig)changed.descricao=desc.value;
    if(val&&val.value!==val.dataset.orig)changed.valor=parseFloat(val.value)||0;
    if(Object.keys(changed).length)updates.push({id,changed});
  });
  if(!updates.length){toast('Nenhuma alteração detectada','info');return;}
  for(let u of updates)await api('PUT','/api/contas-pagar/'+u.id,u.changed);
  toast(updates.length+' parcela(s) atualizada(s)!');
  closeDelParcelas();refreshAll();
}
async function confirmarDelParcelas(){
  let ids=[...document.querySelectorAll('.delparc-cb:checked')].map(cb=>cb.value);
  if(!ids.length){toast('Selecione ao menos uma parcela','error');return;}
  if(!confirm('Excluir '+ids.length+' parcela(s)?'))return;
  await api('POST','/api/contas-pagar/excluir-multi',{ids});
  toast(ids.length+' parcela(s) excluída(s)!','info');
  closeDelParcelas();refreshAll();
}
async function comp(id){await api('PUT','/api/cheques/'+id+'/compensar');toast('Compensado!');refreshAll();}
async function toggleBoleto(id,v){await api('PUT','/api/contas-pagar/'+id,{boleto_chegou:v});refreshAll();}
async function setPago(id,v){await api('PUT','/api/contas-pagar/'+id,{pago_por:v});toast(v&&v!=='A Pagar'?'Pago por '+v:'Status atualizado');refreshAll();}
async function setAcField(id,campo,valor){let body={};if(campo==='recorrente')body.recorrente=valor==='1';else body[campo]=valor;await api('PUT','/api/acerto/'+id,body);refreshAll();}
async function delCL(i){if(CFG.categoriasLoja[i]==='Abastecimento'){toast('A categoria "Abastecimento" não pode ser excluída','error');return;}CFG.categoriasLoja.splice(i,1);await api('PUT','/api/config',{categoriasLoja:CFG.categoriasLoja});refreshAll();}
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
  let b=new Blob([csv],{type:'text/csv'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='relatorio_'+gM()+'.csv';a.click();toast('CSV exportado!');});
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
  let veiculosAlerta=VEICULOS.filter(v=>(v.km_proxima_troca-v.km_atual)<=100);
  let totalAlertas=totalContas+totalMercs+veiculosAlerta.length;
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
      emp.items.forEach(m=>{html+='<div class="alerta-item"><span style="background:var(--bg1);color:var(--amber);font-size:11px;font-weight:700;padding:2px 6px;border-radius:4px;margin-right:8px;white-space:nowrap">'+emp.empresa+'</span><span class="desc">'+m.descricao+'</span><span class="valor">'+fmt(m.valor)+'</span><span class="forn">'+(m.fornecedor||'')+'</span><span class="dias" style="background:rgba(245,158,11,.15);color:#d97706">'+fD(m.vencimento)+'</span></div>';});
      html+='</div></div>';});
  }
  if(veiculosAlerta.length){html+='<h3 style="margin:20px 0 10px;color:var(--text1)"><i class="fas fa-car" style="color:var(--red)"></i> Troca de Óleo Pendente</h3>';
    html+='<div class="alerta-empresa atrasado"><div class="alerta-header"><i class="fas fa-oil-can" style="color:#ef4444"></i><span class="empresa-nome">Frota</span><span class="alerta-count">'+veiculosAlerta.length+' veículo'+(veiculosAlerta.length>1?'s':'')+'</span></div><div class="alerta-lista">';
    veiculosAlerta.forEach(v=>{let diff=v.km_proxima_troca-v.km_atual;let msg=diff<=0?('Atrasado '+(diff*-1)+' km'):('Faltam '+diff+' km');html+='<div class="alerta-item"><span style="background:var(--bg1);color:var(--cyan);font-size:11px;font-weight:700;padding:2px 6px;border-radius:4px;margin-right:8px;white-space:nowrap">'+v.placa+'</span><span class="desc">'+v.nome+'</span><span class="valor" style="font-size:12px;color:var(--text2)">KM: '+v.km_atual+'</span><span class="dias atrasado">'+msg+'</span></div>';});
    html+='</div></div>';
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
    return '<tr data-id="'+i.id+'" data-row="'+encodeURIComponent(JSON.stringify(i))+'"><td>'+fD(i.data)+'</td><td class="tipo-saida">'+fmt(i.nota_entrada)+'</td><td class="tipo-entrada">'+fmt(i.nota_saida)+'</td><td>'+fmt(bol)+'</td><td>'+fmt(dep)+'</td><td>'+fmt(car)+'</td><td style="font-weight:600">'+fmt(bancoTotal)+'</td><td class="'+saldoCls+'">'+fmt(saldo)+'</td><td class="'+emitCls+'">'+(aEmitir>0?fmt(aEmitir):'✅ OK')+'</td><td style="font-size:.8rem;color:var(--text3)">'+((i.observacao||''))+'</td><td><button class="btn-edit" onclick="NR.editRow(\'fiscal\',\''+i.id+'\')"><i class="fas fa-edit"></i></button><button class="btn btn-danger btn-sm" onclick="NR.delFisc(\''+i.id+'\')"><i class="fas fa-trash"></i></button></td></tr>';
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
    '<div class="card card-cyan"><div class="card-icon"><i class="fas fa-university"></i></div><div><span class="card-label">Soma Banco</span><span class="card-value">'+fmt(tBanco)+'</span></div></div>'+
    '<div class="card card-'+(saldoTotal>=0?'green':'red')+'"><div class="card-icon"><i class="fas fa-balance-scale"></i></div><div><span class="card-label">Saldo Fiscal</span><span class="card-value">'+fmt(saldoTotal)+'</span></div></div>'+
    '<div class="card card-'+(aEmitirTotal>0?'red':'green')+'" style="'+(aEmitirTotal>0?'animation:pulse 1.5s infinite;border:2px solid #ef4444;box-shadow:0 0 20px rgba(239,68,68,0.4)':'border:2px solid #22c55e;box-shadow:0 0 15px rgba(34,197,94,0.3)')+'"><div class="card-icon" style="font-size:1.6rem"><i class="fas fa-'+(aEmitirTotal>0?'exclamation-triangle':'check-circle')+'"></i></div><div><span class="card-label" style="font-size:.95rem;font-weight:700">⚠️ A EMITIR</span><span class="card-value" style="font-size:1.4rem">'+(aEmitirTotal>0?fmt(aEmitirTotal):'✅ OK')+'</span></div></div>'+
    '<div class="card card-'+(metaOk?'green':'red')+'" style="'+(metaOk?'border:2px solid #22c55e;box-shadow:0 0 15px rgba(34,197,94,0.3)':'animation:pulse 1.5s infinite;border:2px solid #f59e0b;box-shadow:0 0 20px rgba(245,158,11,0.4)')+'"><div class="card-icon" style="font-size:1.6rem"><i class="fas fa-'+(metaOk?'trophy':'bullseye')+'"></i></div><div><span class="card-label" style="font-size:.95rem;font-weight:700">🎯 META 30%</span><span class="card-value" style="font-size:1.4rem">'+(metaOk?'✅ '+pctAtual.toFixed(0)+'%':'Falta '+fmt(faltaMeta))+'</span><span style="font-size:.75rem;color:var(--text3)">Meta: '+fmt(meta30)+' | Atual: '+pctAtual.toFixed(1)+'%</span></div></div>';
  document.getElementById('fiscalResumo').innerHTML=
    '<span class="badge badge-blue">Entradas: '+fmt(tEnt)+'</span>'+
    '<span class="badge badge-green">Saídas: '+fmt(tSai)+'</span>'+
    '<span class="badge badge-blue">Boletos: '+fmt(tBol)+'</span>'+
    '<span class="badge badge-purple">Depósitos: '+fmt(tDep)+'</span>'+
    '<span class="badge badge-orange">Cartões: '+fmt(tCar)+'</span>'+
    '<span class="badge badge-blue">Soma Banco: '+fmt(tBanco)+'</span>'+
    '<span class="badge badge-'+(saldoTotal>=0?'green':'red')+'">Saldo: '+fmt(saldoTotal)+'</span>'+
    '<span class="badge badge-'+(aEmitirTotal>0?'red':'green')+'">A Emitir: '+(aEmitirTotal>0?fmt(aEmitirTotal):'OK')+'</span>'+
    '<span class="badge badge-'+(metaOk?'green':'red')+'">Meta 30%: '+(metaOk?'✅ '+pctAtual.toFixed(0)+'%':'Falta '+fmt(faltaMeta))+'</span>';
}
async function delFisc(id){if(!confirm('Excluir lançamento fiscal?'))return;await api('DELETE','/api/fiscal/'+id);toast('Excluído!');renderFiscal();}
// REFRESH
async function refreshAll(){await renderConfig();COLABS=await api('GET','/api/colaboradores');await Promise.all([renderDashboardGeral(),renderAcerto(),renderFat(),renderContasPagar(),renderAChegar(),renderDrogaria(),renderCheques(),renderContaDono(),renderColaboradores(),renderCaixas(),renderMovimentacao(),renderFiscal(),renderLembretes(),renderVeiculos(),renderAbastecimentos(),renderSomas(),renderFolha(),renderNotasNfe(),renderFornecedoresCad(),renderAlertas()]);fillTelegramCfg();await Promise.all([renderDistribuicao(),renderDashboard()]);if(currentUser&&currentUser.role==='admin'){renderUsuarios();renderAuditoria();}}

// === VEICULOS ===
let VEICULOS=[];
document.getElementById('formVeiculo').addEventListener('submit',async function(e){e.preventDefault();let id=document.getElementById('veiculo-id').value;let body={nome:document.getElementById('v-nome').value.trim(),placa:document.getElementById('v-placa').value.trim().toUpperCase(),km_atual:parseFloat(document.getElementById('v-kmatual').value)||0,km_proxima_troca:parseFloat(document.getElementById('v-kmtroca').value)||0};if(id){await api('PUT','/api/veiculos/'+id,body);toast('Veículo atualizado!');}else{await api('POST','/api/veiculos',body);toast('Veículo cadastrado!');}this.reset();document.getElementById('veiculo-id').value='';refreshAll();});
async function renderVeiculos(){
    VEICULOS=await api('GET','/api/veiculos');
    let tb=document.querySelector('#tabelaVeiculos tbody');
    if(!VEICULOS.length){tb.innerHTML='<tr><td colspan="6" style="text-align:center;color:var(--text3)">Nenhum veículo cadastrado</td></tr>';}else{
        tb.innerHTML=VEICULOS.map(v=>{
            let diff=v.km_proxima_troca-v.km_atual;
            let status='<span class="badge badge-green">OK ('+diff+' km)</span>';
            if(diff<=100)status='<span class="badge badge-red">Trocar Óleo!</span>';
            else if(diff<=500)status='<span class="badge badge-orange">Atenção ('+diff+' km)</span>';
            return '<tr><td>'+v.nome+'</td><td>'+v.placa+'</td><td>'+v.km_atual+'</td><td>'+v.km_proxima_troca+'</td><td>'+status+'</td>'+
            '<td><button class="btn btn-sm btn-outline" onclick="NR.editVeiculo(\''+v.id+'\')"><i class="fas fa-edit"></i></button> <button class="btn btn-sm btn-danger" onclick="NR.delVeiculo(\''+v.id+'\')"><i class="fas fa-trash"></i></button></td></tr>';
        }).join('');
    }
    // Preencher select do Acerto
    let sel=document.getElementById('ac-veiculo');
    let vAtual=sel.value;
    sel.innerHTML='<option value="">— Selecione —</option>'+VEICULOS.map(v=>'<option value="'+v.id+'" data-placa="'+v.placa+'">'+v.nome+'</option>').join('');
    if(vAtual)sel.value=vAtual;
}
function editVeiculo(id){
    console.log('editVeiculo chamando id:', id, typeof id);
    console.log('Veículos disponíveis:', VEICULOS);
    let v=VEICULOS.find(x=>x.id===id);
    if(!v){
        console.warn('Não encontrado com ===, tentando com ==');
        v=VEICULOS.find(x=>x.id==id);
    }
    console.log('Veículo encontrado:', v);
    if(!v)return;
    document.getElementById('veiculo-id').value=v.id;
    document.getElementById('v-nome').value=v.nome;
    document.getElementById('v-placa').value=v.placa;
    document.getElementById('v-kmatual').value=v.km_atual;
    document.getElementById('v-kmtroca').value=v.km_proxima_troca;
}
async function delVeiculo(id){if(!confirm('Excluir veículo?'))return;await api('DELETE','/api/veiculos/'+id);toast('Excluído!');refreshAll();}

// === ABASTECIMENTOS ===
async function renderAbastecimentos(){
    let items=await api('GET','/api/abastecimentos?mes='+gM());
    let total=0;
    items.forEach(i=>total+=i.saida||0);
    document.getElementById('abast-total').textContent=fmt(total);
    document.getElementById('abast-count').textContent=items.length;
    let tb=document.querySelector('#tabelaAbastecimentos tbody');
    if(!items.length){tb.innerHTML='<tr><td colspan="9" style="text-align:center;color:var(--text3)">Nenhum abastecimento no mês</td></tr>';return;}
    tb.innerHTML=items.map(i=>'<tr data-id="'+i.id+'" data-row="abastecimentos">'+
        '<td>'+i.data+'</td><td>'+i.descricao+'</td>'+
        '<td>'+(i.veiculo||'')+'</td><td>'+(i.placa||'')+'</td>'+
        '<td>'+(i.km||'')+'</td><td>'+(i.localidade||'')+'</td>'+
        '<td>'+(i.condutor||'')+'</td><td class="text-red">'+fmt(i.saida||0)+'</td>'+
        '<td><button class="btn btn-sm btn-danger" onclick="NR.delAc(\''+i.id+'\')"><i class="fas fa-trash"></i></button></td>'+
    '</tr>').join('');
}

// === LEMBRETES ===
async function renderLembretes(){
    if(!currentUser)return;
    const hideKey = 'hideLembretes_' + currentUser.username;
    if(localStorage.getItem(hideKey) === 'true'){
        document.getElementById('lembretesWrapper').style.display='none';
    }else{
        document.getElementById('lembretesWrapper').style.display='block';
    }
    const items = await api('GET','/api/lembretes');
    const container = document.getElementById('lembretesContainer');
    if(!items.length){
        container.innerHTML='<div style="padding:10px;color:var(--text3);font-size:13px;width:100%">Nenhum lembrete pendente.</div>';
        return;
    }
    container.innerHTML = items.map(i=>`
        <div class="lembrete-card ${i.concluido?'concluido':''}">
            <div class="lembrete-texto">${i.texto}</div>
            <div class="lembrete-actions">
                <button class="${i.concluido?'btn-desmarcar':'btn-concluir'}" onclick="NR.toggleStatusLembrete('${i.id}', ${i.concluido?0:1})" title="${i.concluido?'Desmarcar':'Concluir'}">
                    <i class="fas ${i.concluido?'fa-undo':'fa-check'}"></i>
                </button>
                <button class="btn-excluir" onclick="NR.delLembrete('${i.id}')" title="Excluir"><i class="fas fa-trash"></i></button>
            </div>
        </div>
    `).join('');
}
function toggleLembretes(){
    if(!currentUser)return;
    const hideKey = 'hideLembretes_' + currentUser.username;
    const wrapper = document.getElementById('lembretesWrapper');
    if(wrapper.style.display === 'none'){
        wrapper.style.display = 'block';
        localStorage.setItem(hideKey, 'false');
    }else{
        wrapper.style.display = 'none';
        localStorage.setItem(hideKey, 'true');
    }
}
async function toggleStatusLembrete(id, concluido){
    await api('PUT','/api/lembretes/'+id+'/toggle',{concluido});
    renderLembretes();
}
async function delLembrete(id){
    if(!confirm('Excluir este lembrete?'))return;
    await api('DELETE','/api/lembretes/'+id);
    renderLembretes();
}
document.getElementById('formLembrete').addEventListener('submit', async function(e){
    e.preventDefault();
    const texto = document.getElementById('novoLembreteText').value.trim();
    if(!texto)return;
    await api('POST','/api/lembretes',{texto});
    document.getElementById('novoLembreteText').value = '';
    renderLembretes();
});

// === USUÁRIOS ===
const ALL_PERMS=['dashboard-geral','dashboard','acerto','abastecimentos','fat','contas-pagar','a-chegar','movimentacao','drogaria','cheques','conta-dono','distribuicao','notas-nfe','fornecedores-cad','folha','colaboradores','relatorios','configuracoes','caixas','fiscal','somas'];
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
    rows+='<tr data-id="'+i.id+'" data-row="'+encodeURIComponent(JSON.stringify(i))+'"><td>'+parseInt(dia)+'</td><td>'+i.descricao+'</td>'
      +'<td class="tipo-entrada">'+(i.entrada?fmt(i.entrada):'')+'</td>'
      +'<td class="tipo-saida">'+(i.saida?fmt(i.saida):'')+'</td>'
      +'<td><input type="number" class="inline-input" value="'+rDif+'" step="0.01" style="width:80px" onchange="NR.updateMovDif(\''+i.id+'\',this.value)"></td>'
      +'<td style="font-weight:bold">'+fmt(running)+'</td>'
      +'<td><button class="btn-edit" onclick="NR.editRow(\'movimentacao\',\''+i.id+'\')"><i class="fas fa-edit"></i></button><button class="btn btn-sm btn-danger" onclick="NR.delMov(\''+i.id+'\')"><i class="fas fa-trash"></i></button></td></tr>';
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
            // Limpar datas ISO (ex: 2026-06-01T03:00:00.000Z → 2026-06-01)
            row[campo] = row[campo].trim().split('T')[0];
          }
          // Se for objeto Date do JS
          if (row[campo] instanceof Date) {
            row[campo] = row[campo].toISOString().split('T')[0];
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
  document.getElementById('parc-cat').value='';
  document.getElementById('parc-forn').value='';
  let parcCatList=document.getElementById('parc-cat-list'); if(parcCatList) parcCatList.innerHTML=CFG.categoriasLoja.map(c=>'<option value="'+c+'">').join('');
  let parcFornList=document.getElementById('parc-forn-list'); if(parcFornList) parcFornList.innerHTML=(CFG.fornecedores||[]).map(f=>'<option value="'+f+'">').join('');
  document.getElementById('parc-intervalo').value='mensal';
  parcItems=[];
  renderParcelas();
}
function closeParcelas(){document.getElementById('modalParcelas').style.display='none';parcItems=[];}
function toYMD(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function gerarParcelas(){
  let desc=document.getElementById('parc-desc').value.trim();
  if(!desc){toast('Preencha a descrição do produto','error');return;}
  let qtd=parseInt(document.getElementById('parc-qtd').value)||1;
  let valor=parseFloat(document.getElementById('parc-valor').value)||0;
  let mesInicial=document.getElementById('parc-mes').value;
  let diaVenc=parseInt(document.getElementById('parc-dia').value)||15;
  let intervalo=document.getElementById('parc-intervalo').value;
  if(!mesInicial){toast('Selecione o mês inicial','error');return;}
  // Keep existing frete items
  let fretes=parcItems.filter(p=>p.frete);
  parcItems=fretes;
  let [ano,mes]=mesInicial.split('-').map(Number);
  if(intervalo==='mensal'){
    for(let i=0;i<qtd;i++){
      let m=mes+i,a=ano;
      while(m>12){m-=12;a++;}
      let ultimoDia=new Date(a,m,0).getDate();
      let dia=Math.min(diaVenc,ultimoDia);
      parcItems.push({
        data:a+'-'+String(m).padStart(2,'0')+'-'+String(dia).padStart(2,'0'),
        descricao:desc+' '+(i+1)+'/'+qtd,
        valor:valor,
        frete:false
      });
    }
  }else{
    let dias=parseInt(intervalo);
    let dt=new Date(ano,mes-1,diaVenc);
    for(let i=0;i<qtd;i++){
      parcItems.push({
        data:toYMD(dt),
        descricao:desc+' '+(i+1)+'/'+qtd,
        valor:valor,
        frete:false
      });
      dt=new Date(dt.getFullYear(),dt.getMonth(),dt.getDate()+dias);
    }
  }
  renderParcelas();
}
function addFreteParcela(){
  let desc=document.getElementById('parc-desc').value.trim()||'Produto';
  let mesInicial=document.getElementById('parc-mes').value;
  let diaVenc=String(parseInt(document.getElementById('parc-dia').value)||15).padStart(2,'0');
  if(!mesInicial){toast('Selecione o mês inicial','error');return;}
  parcItems.push({
    data:mesInicial+'-'+diaVenc,
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
      +'<td><input type="date" class="inline-input" value="'+p.data+'" style="width:140px" onchange="NR.setParcField('+i+',\'data\',this.value)"></td>'
      +'<td><input type="text" class="inline-input" value="'+p.descricao+'" style="width:100%" onchange="NR.setParcField('+i+',\'descricao\',this.value)"></td>'
      +'<td><input type="number" class="inline-input" value="'+p.valor+'" step="0.01" style="width:90px" onchange="NR.setParcField('+i+',\'valor\',this.value)"></td>'
      +'<td><button class="btn btn-sm btn-danger" onclick="NR.removeParcela('+i+')"><i class="fas fa-times"></i></button></td>'
      +'</tr>';
  }).join('');
}
function setParcField(idx,campo,valor){
  if(campo==='valor')parcItems[idx][campo]=parseFloat(valor)||0;
  else parcItems[idx][campo]=valor;
}
async function salvarParcelas(){
  if(!parcItems.length){toast('Nenhuma parcela para salvar','error');return;}
  let cat=document.getElementById('parc-cat').value;
  let forn=document.getElementById('parc-forn').value;
  let aChegar=document.getElementById('parc-achegar').checked;
  let boletoChegou=document.getElementById('parc-boleto').checked;
  let recorrente=document.getElementById('parc-recorrente').checked;
  let grupo='grp_'+Date.now().toString(36)+Math.random().toString(36).substr(2,4);
  toast('Salvando '+parcItems.length+' parcelas...','info');
  let ok=0,errs=0;
  for(const p of parcItems){
    try{
      await api('POST','/api/contas-pagar',{vencimento:p.data,descricao:p.descricao,valor:p.valor,categoria:cat,fornecedor:forn,recorrente:recorrente,a_chegar:aChegar,boleto_chegou:boletoChegou,grupo_parcela:grupo});
      ok++;
    }catch(e){errs++;}
  }
  toast(ok+' parcelas salvas!'+(errs?' ('+errs+' erros)':''));
  closeParcelas();
  refreshAll();
}

// === INLINE EDITING ===
let editCache={};
function editRow(section,id){
  const tableMap = {'acerto':'#tabelaAcerto','fat':'#tabelaFat','contas-pagar':'#tabelaContasPagar','drogaria':'#tabelaDrogaria','conta-dono':'#tabelaDono','movimentacao':'#tabelaMov','cheques':'#tabelaCheques','fiscal':'#tabelaFiscal'};
  const sel = tableMap[section] || '';
  const tr=document.querySelector(sel+' tr[data-id="'+id+'"]');
  if(!tr)return;
  let data;
  try{data=JSON.parse(decodeURIComponent(tr.dataset.row));}catch(e){toast('Erro ao editar','error');return;}
  editCache={section,id,data};
  tr.classList.add('row-editing');
  const fields=getEditFields(section,data);
  let cells=tr.querySelectorAll('td');
  fields.forEach((f,idx)=>{
    if(f.skip)return;
    let cell=cells[f.cellIndex!==undefined?f.cellIndex:idx];
    if(!cell)return;
    if(f.type==='select'){
      cell.innerHTML='<select class="edit-input" data-field="'+f.field+'">'+f.options.map(o=>'<option value="'+o.v+'"'+(o.v==f.value?' selected':'')+'>'+o.l+'</option>').join('')+'</select>';
    } else {
      cell.innerHTML='<input class="edit-input" type="'+f.type+'" data-field="'+f.field+'" value="'+(f.value||'')+'" '+(f.step?'step="'+f.step+'"':'')+'>';
    }
  });
  let lastCell=cells[cells.length-1];
  lastCell.innerHTML='<div style="display:flex;gap:4px"><button class="btn-save" onclick="NR.saveRow(\''+section+'\',\''+id+'\')" title="Salvar"><i class="fas fa-check"></i></button><button class="btn-cancel" onclick="NR.cancelEdit(\''+section+'\')" title="Cancelar"><i class="fas fa-times"></i></button></div>';
}
function getEditFields(section,d){
  const catOpts=[{v:'',l:'\u2014'}].concat(CFG.categoriasLoja.map(c=>({v:c,l:c})));
  const fornOpts=[{v:'',l:'\u2014'}].concat((CFG.fornecedores||[]).map(f=>({v:f,l:f})));
  const dfOpts=[{v:'',l:'\u2014'},{v:'D',l:'D'},{v:'F',l:'F'}];
  const recOpts=[{v:'0',l:'N\u00e3o'},{v:'1',l:'Sim'}];
  const tipoOpts=[{v:'entrada',l:'Cr\u00e9dito'},{v:'saida',l:'D\u00e9bito'}];
  const tipoDOpts=[{v:'debito',l:'D\u00e9bito'},{v:'credito',l:'Cr\u00e9dito'}];
  const origemOpts=[{v:'caixa-empresa',l:'Caixa'},{v:'dinheiro-dono',l:'Celso'}];
  switch(section){
    case 'fiscal':return[
      {field:'data',type:'date',value:d.data?d.data.split('T')[0]:'',cellIndex:0},
      {field:'nota_entrada',type:'number',value:d.nota_entrada||0,step:'0.01',cellIndex:1},
      {field:'nota_saida',type:'number',value:d.nota_saida||0,step:'0.01',cellIndex:2},
      {field:'banco_boleto',type:'number',value:d.banco_boleto||0,step:'0.01',cellIndex:3},
      {field:'banco_deposito',type:'number',value:d.banco_deposito||0,step:'0.01',cellIndex:4},
      {field:'banco_cartao',type:'number',value:d.banco_cartao||0,step:'0.01',cellIndex:5},
      {skip:true,cellIndex:6},
      {skip:true,cellIndex:7},
      {skip:true,cellIndex:8},
      {field:'observacao',type:'text',value:d.observacao||'',cellIndex:9}
    ];
    case 'acerto':return[
      {field:'data',type:'date',value:d.data?d.data.split('T')[0]:''},
      {field:'descricao',type:'text',value:d.descricao},
      {field:'entrada',type:'number',value:d.entrada||0,step:'0.01'},
      {field:'saida',type:'number',value:d.saida||0,step:'0.01'},
      {skip:true},{skip:true},{skip:true},{skip:true}
    ];
    case 'fat':return[
      {field:'data',type:'date',value:d.data?d.data.split('T')[0]:''},
      {field:'descricao',type:'text',value:d.descricao},
      {field:'saida',type:'number',value:d.saida||0,step:'0.01'},
      {field:'categoria',type:'select',value:d.categoria,options:catOpts},
      {skip:true}
    ];
    case 'contas-pagar':return[
      {field:'vencimento',type:'date',value:d.vencimento?d.vencimento.split('T')[0]:''},
      {field:'descricao',type:'text',value:d.descricao},
      {field:'valor',type:'number',value:d.valor||0,step:'0.01'},
      {field:'categoria',type:'select',value:d.categoria,options:catOpts},
      {field:'fornecedor',type:'select',value:d.fornecedor||'',options:fornOpts},
      {field:'recorrente',type:'select',value:d.recorrente?'1':'0',options:recOpts},
      {field:'tipo_nota',type:'select',value:d.tipo_nota||'',options:dfOpts},
      {skip:true},{skip:true},{skip:true}
    ];
    case 'drogaria':return[
      {field:'data',type:'date',value:d.data?d.data.split('T')[0]:''},
      {field:'tipo',type:'select',value:d.tipo,options:tipoOpts},
      {field:'descricao',type:'text',value:d.descricao},
      {field:'valor',type:'number',value:d.valor||0,step:'0.01'},
      {skip:true}
    ];
    case 'conta-dono':return[
      {field:'data',type:'date',value:d.data?d.data.split('T')[0]:''},
      {field:'tipo',type:'select',value:d.tipo,options:tipoDOpts},
      {field:'descricao',type:'text',value:d.descricao},
      {field:'valor',type:'number',value:d.valor||0,step:'0.01'},
      {skip:true}
    ];
    case 'movimentacao':return[
      {field:'data',type:'date',value:d.data?d.data.split('T')[0]:'',cellIndex:0},
      {field:'descricao',type:'text',value:d.descricao,cellIndex:1},
      {field:'entrada',type:'number',value:d.entrada||0,step:'0.01',cellIndex:2},
      {field:'saida',type:'number',value:d.saida||0,step:'0.01',cellIndex:3},
      {field:'diferenca',type:'number',value:d.diferenca||0,step:'0.01',cellIndex:4},
    ];
    case 'cheques':return[
      {skip:true},
      {field:'numero',type:'text',value:d.numero||'',cellIndex:1},
      {field:'data',type:'date',value:d.data?d.data.split('T')[0]:'',cellIndex:2},
      {field:'cliente',type:'text',value:d.cliente,cellIndex:3},
      {field:'dono_cheque',type:'text',value:d.dono_cheque||'',cellIndex:4},
      {field:'valor',type:'number',value:d.valor||0,step:'0.01',cellIndex:5},
      {skip:true},
      {field:'bom_para',type:'date',value:d.bom_para?d.bom_para.split('T')[0]:'',cellIndex:7},
      {skip:true},
      {field:'taxa',type:'number',value:d.taxa||5,step:'0.1',cellIndex:9},
      {skip:true},
      {field:'origem_dinheiro',type:'select',value:d.origem_dinheiro||'caixa-empresa',options:origemOpts,cellIndex:11},
      {field:'vencimento',type:'date',value:d.vencimento?d.vencimento.split('T')[0]:'',cellIndex:12},
    ];
    default:return[];
  }
}
async function saveRow(section,id){
  const tableMap = {'acerto':'#tabelaAcerto','fat':'#tabelaFat','contas-pagar':'#tabelaContasPagar','drogaria':'#tabelaDrogaria','conta-dono':'#tabelaDono','movimentacao':'#tabelaMov','cheques':'#tabelaCheques','fiscal':'#tabelaFiscal'};
  const sel = tableMap[section] || '';
  const tr=document.querySelector(sel+' tr[data-id="'+id+'"]');
  if(!tr)return;
  const inputs=tr.querySelectorAll('.edit-input');
  const updates={};
  inputs.forEach(inp=>{
    const field=inp.dataset.field;
    let val=inp.value;
    if(inp.type==='number')val=parseFloat(val)||0;
    updates[field]=val;
  });
  if(section==='cheques'&&(updates.data||updates.vencimento)){
    const d1=updates.data||editCache.data.data;
    const d2=updates.vencimento||editCache.data.vencimento;
    if(d1&&d2)updates.dias=Math.max(Math.round((new Date(d2)-new Date(d1))/86400000),1);
  }
  const apiMap={'acerto':'acerto','fat':'acerto','contas-pagar':'contas-pagar','drogaria':'drogaria','conta-dono':'conta-dono','movimentacao':'movimentacao','cheques':'cheques','fiscal':'fiscal'};
  const endpoint=apiMap[section];
  if(!endpoint)return;
  try{
    await api('PUT','/api/'+endpoint+'/'+id,updates);
    toast('Registro atualizado!');
    refreshAll();
  }catch(e){toast('Erro ao atualizar','error');}
}
function cancelEdit(section){refreshAll();}
// === AUDITORIA ===
async function buscarAuditoria(){
  let params=new URLSearchParams();
  let u=document.getElementById('audit-usuario').value;if(u)params.set('usuario',u);
  let s=document.getElementById('audit-secao').value;if(s)params.set('secao',s);
  let di=document.getElementById('audit-inicio').value;if(di)params.set('dataInicio',di);
  let df=document.getElementById('audit-fim').value;if(df)params.set('dataFim',df);
  let logs=await api('GET','/api/auditoria?'+params.toString());
  document.getElementById('audit-total').textContent=logs.length;
  let tb=document.querySelector('#tabelaAuditoria tbody');
  if(!logs.length){tb.innerHTML='<tr><td colspan="5" style="text-align:center;padding:30px;color:var(--text3)"><i class="fas fa-clipboard-check" style="font-size:2rem;display:block;margin-bottom:8px;color:var(--green)"></i>Nenhum registro encontrado</td></tr>';return;}
  const acaoIcons={'criou':'<span style="color:var(--green)"><i class="fas fa-plus-circle"></i> Criou</span>','alterou':'<span style="color:var(--amber)"><i class="fas fa-edit"></i> Alterou</span>','excluiu':'<span style="color:var(--red)"><i class="fas fa-trash"></i> Excluiu</span>','limpou tudo':'<span style="color:var(--red);font-weight:700"><i class="fas fa-eraser"></i> Limpou Tudo</span>'};
  tb.innerHTML=logs.map(l=>{
    let dt=new Date(l.data);
    let dataStr=dt.toLocaleDateString('pt-BR')+' '+dt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    let acaoHtml=acaoIcons[l.acao]||('<span>'+l.acao+'</span>');
    let det=l.detalhes||'';if(det.length>80)det=det.substring(0,80)+'...';
    return'<tr><td style="white-space:nowrap">'+dataStr+'</td><td><b>'+l.usuario+'</b></td><td>'+acaoHtml+'</td><td>'+l.secao+'</td><td style="font-size:12px;color:var(--text3);max-width:300px;overflow:hidden;text-overflow:ellipsis">'+det+'</td></tr>';
  }).join('');
}
async function renderAuditoria(){
  // Popular lista de usuários no filtro
  try{
    let users=await api('GET','/api/usuarios');
    let sel=document.getElementById('audit-usuario');
    sel.innerHTML='<option value="">Todos</option>'+users.map(u=>'<option value="'+u.nome+'">'+u.nome+'</option>').join('');
  }catch(e){}
  buscarAuditoria();
}
// === SOMAS / RASCUNHOS COMPARTILHADOS ===
let somaFocusTarget=null;
function calcExpr(str){
  str=(str||'').toString().replace(/,/g,'.').trim();
  let subtract=false;
  if(str.length>1&&str.endsWith('-')){subtract=true;str=str.slice(0,-1).trim();}
  str=str.replace(/[^0-9+\-*/.() ]/g,'').trim();
  if(!str)return 0;
  try{let r=Function('"use strict";return('+str+')')();if(!isFinite(r))r=parseFloat(str)||0;r=Math.round(Math.abs(r)*100)/100;return subtract?-r:r;}catch(e){let r=parseFloat(str)||0;return subtract?-Math.abs(r):r;}
}
function somaLocalTotal(card){
  let vals=card.querySelectorAll('.soma-val');
  let total=0;vals.forEach(function(v){total+=calcExpr(v.value);});
  let el=card.querySelector('.soma-total-display');
  if(el)el.textContent=fmt(total);
}
async function renderSomas(){
  let somas=await api('GET','/api/somas');
  let container=document.getElementById('somasContainer');
  if(!somas.length){container.innerHTML='<div style="text-align:center;padding:40px;color:var(--text3);width:100%"><i class="fas fa-calculator" style="font-size:2.5rem;display:block;margin-bottom:12px;opacity:.4"></i>Nenhuma soma criada ainda.<br>Clique em <b>Nova Soma</b> para começar.</div>';return;}
  container.innerHTML=somas.map(function(s){
    let itensHtml=s.itens.map(function(it){
      let isSub=it.valor<0;
      let displayVal=isSub?Math.abs(it.valor)+'-':it.valor;
      let valStyle='width:100%;padding:6px 8px;background:var(--bg3);border:1px solid '+(isSub?'var(--red)':'var(--border)')+';border-radius:4px;color:'+(isSub?'var(--red)':'var(--text)')+';font-size:13px;text-align:right;font-weight:600';
      return'<tr data-item-id="'+it.id+'">'+(isSub?'<td style="position:relative"><span style="position:absolute;left:4px;top:50%;transform:translateY(-50%);font-size:10px;color:var(--red);font-weight:700"><i class="fas fa-minus-circle"></i></span><input type="text" class="inline-input soma-desc" value="'+(it.descricao||'').replace(/"/g,'&quot;')+'" placeholder="Descrição (opcional)" data-id="'+it.id+'" style="width:100%;padding:6px 8px 6px 20px;background:var(--bg3);border:1px solid var(--red);border-radius:4px;color:var(--red);font-size:13px"></td>':'<td><input type="text" class="inline-input soma-desc" value="'+(it.descricao||'').replace(/"/g,'&quot;')+'" placeholder="Descrição (opcional)" data-id="'+it.id+'" style="width:100%;padding:6px 8px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:13px"></td>')+'<td style="width:140px"><input type="text" class="inline-input soma-val" value="'+displayVal+'" data-id="'+it.id+'" data-soma="'+s.id+'" placeholder="0 ou 5*3" style="'+valStyle+'"></td><td style="width:36px"><button class="btn btn-sm btn-danger" onclick="NR.delSomaItem(\''+it.id+'\',\''+s.id+'\')" style="padding:4px 6px"><i class="fas fa-times"></i></button></td></tr>';
    }).join('');
    let dt=new Date(s.data_criacao);
    let dataStr=dt.toLocaleDateString('pt-BR')+' '+dt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    return'<div class="panel" style="flex:1;min-width:320px;max-width:500px;margin:0;border:1px solid var(--border)" data-soma-id="'+s.id+'">'
      +'<div class="panel-header" style="padding:12px 16px;display:flex;align-items:center;gap:8px">'
      +'<input type="text" class="soma-titulo" value="'+s.titulo.replace(/"/g,'&quot;')+'" data-id="'+s.id+'" style="flex:1;padding:6px 10px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:15px;font-weight:600">'
      +'<button class="btn btn-sm btn-danger" onclick="NR.delSoma(\''+s.id+'\')" title="Excluir soma"><i class="fas fa-trash"></i></button>'
      +'</div>'
      +'<div style="padding:0 16px 4px;font-size:.75rem;color:var(--text3)"><i class="fas fa-user"></i> '+s.criado_por+' — '+dataStr+'</div>'
      +'<div style="padding:4px 16px 4px;font-size:.7rem;color:var(--text3)"><i class="fas fa-info-circle"></i> Aceita expressões: 5*3, 100-20, 1500/3, 2+3</div>'
      +'<div style="padding:0 16px 12px"><table class="data-table" style="font-size:.85rem"><thead><tr><th>Descrição</th><th style="width:140px">Valor</th><th style="width:36px"></th></tr></thead><tbody>'+itensHtml+'</tbody></table>'
      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-top:10px">'
      +'<button class="btn btn-sm btn-outline" onclick="NR.addSomaItem(\''+s.id+'\')" style="font-size:12px"><i class="fas fa-plus"></i> Linha</button>'
      +'<div style="font-size:1.2rem;font-weight:700;color:var(--green)"><i class="fas fa-equals"></i> <span class="soma-total-display">'+fmt(s.total)+'</span></div>'
      +'</div></div></div>';
  }).join('');
  container.querySelectorAll('.soma-titulo').forEach(function(el){
    el.addEventListener('change',function(){NR.updateSomaTitulo(this.dataset.id,this.value);});
  });
  container.querySelectorAll('.soma-desc').forEach(function(el){
    el.addEventListener('change',function(){NR.updateSomaItem(this.dataset.id,{descricao:this.value});});
    el.addEventListener('keydown',function(e){
      if(e.key==='Enter'){e.preventDefault();let valInput=this.closest('tr').querySelector('.soma-val');if(valInput)valInput.focus();}
    });
  });
  container.querySelectorAll('.soma-val').forEach(function(el){
    el.addEventListener('blur',function(){
      let v=calcExpr(this.value);
      this.value=v;
      NR.updateSomaItemQuiet(this.dataset.id,{valor:v});
      somaLocalTotal(this.closest('[data-soma-id]'));
    });
    el.addEventListener('keydown',function(e){
      if(e.key==='Enter'){
        e.preventDefault();
        let v=calcExpr(this.value);
        this.value=v;
        NR.updateSomaItemQuiet(this.dataset.id,{valor:v});
        somaLocalTotal(this.closest('[data-soma-id]'));
        NR.addSomaItemAndFocus(this.dataset.soma);
      }
    });
    el.addEventListener('input',function(){
      somaLocalTotal(this.closest('[data-soma-id]'));
    });
  });
  if(somaFocusTarget){
    let card=container.querySelector('[data-soma-id="'+somaFocusTarget+'"]');
    if(card){let vals=card.querySelectorAll('.soma-val');if(vals.length)vals[vals.length-1].focus();}
    somaFocusTarget=null;
  }
}
async function novaSoma(){
  let titulo=prompt('Título da soma:');
  if(!titulo||!titulo.trim())return;
  let res=await api('POST','/api/somas',{titulo:titulo.trim()});
  toast('Soma criada!');
  somaFocusTarget=res.id;
  await addSomaItem(res.id);
}
async function delSoma(id){
  if(!confirm('Excluir esta soma e todos os itens?'))return;
  await api('DELETE','/api/somas/'+id);
  toast('Soma excluída!');renderSomas();
}
async function updateSomaTitulo(id,titulo){
  await api('PUT','/api/somas/'+id,{titulo:titulo});
}
async function addSomaItem(somaId){
  somaFocusTarget=somaId;
  await api('POST','/api/somas/'+somaId+'/itens',{descricao:'',valor:0});
  renderSomas();
}
async function addSomaItemAndFocus(somaId){
  somaFocusTarget=somaId;
  await api('POST','/api/somas/'+somaId+'/itens',{descricao:'',valor:0});
  await renderSomas();
}
async function updateSomaItem(id,fields){
  await api('PUT','/api/soma-itens/'+id,fields);
  renderSomas();
}
async function updateSomaItemQuiet(id,fields){
  await api('PUT','/api/soma-itens/'+id,fields);
}
async function delSomaItem(id,somaId){
  await api('DELETE','/api/soma-itens/'+id);
  renderSomas();
}

// === MENU CONTEXTO AUDITORIA POR ITEM ===
const ctxMenu=document.getElementById('ctxMenuAudit');
const ctxBtn=document.getElementById('ctxMenuAuditBtn');
let ctxItemId='',ctxItemSecao='',ctxItemDesc='';
const TABLE_SECAO={'tabelaAcerto':'Acerto','tabelaFat':'Acerto','tabelaContasPagar':'Contas a Pagar','tabelaCheques':'Cheques','tabelaDono':'Conta Dono','tabelaDrogaria':'Drogaria','tabelaMov':'Movimentação','tabelaFiscal':'Controle Fiscal','tabelaAbastecimentos':'Acerto'};
document.addEventListener('contextmenu',function(e){
  let tr=e.target.closest('tr[data-id]');
  if(!tr){ctxMenu.style.display='none';return;}
  let table=tr.closest('.data-table');
  if(!table||!table.id)return;
  let secaoNome=TABLE_SECAO[table.id];
  if(!secaoNome)return;
  e.preventDefault();
  ctxItemId=tr.dataset.id;
  ctxItemSecao=secaoNome;
  try{let d=JSON.parse(decodeURIComponent(tr.dataset.row));ctxItemDesc=d.descricao||d.cliente||d.nome||'';}catch(ex){ctxItemDesc='';}
  ctxMenu.style.display='block';
  let mx=e.clientX,my=e.clientY;
  if(mx+200>window.innerWidth)mx=window.innerWidth-210;
  if(my+50>window.innerHeight)my=window.innerHeight-60;
  ctxMenu.style.left=mx+'px';ctxMenu.style.top=my+'px';
});
document.addEventListener('click',function(){ctxMenu.style.display='none';});
ctxBtn.addEventListener('click',async function(){
  ctxMenu.style.display='none';
  let logs=await api('GET','/api/auditoria/item?secao='+encodeURIComponent(ctxItemSecao)+'&id='+encodeURIComponent(ctxItemId));
  document.getElementById('auditItemDesc').innerHTML='<i class="fas fa-tag"></i> <b>'+ctxItemSecao+'</b>: '+(ctxItemDesc||'ID '+ctxItemId);
  let body=document.getElementById('auditItemBody');
  const acaoIcons={'criou':'<span style="color:var(--green)"><i class="fas fa-plus-circle"></i> Criou</span>','alterou':'<span style="color:var(--amber)"><i class="fas fa-edit"></i> Alterou</span>','excluiu':'<span style="color:var(--red)"><i class="fas fa-trash"></i> Excluiu</span>'};
  if(!logs.length){
    body.innerHTML='<div style="text-align:center;padding:30px;color:var(--text3)"><i class="fas fa-search" style="font-size:2rem;display:block;margin-bottom:8px"></i>Nenhum registro de auditoria encontrado para este item.<br><span style="font-size:12px">Itens criados antes da auditoria não terão histórico.</span></div>';
  }else{
    body.innerHTML='<table class="data-table" style="font-size:.85rem"><thead><tr><th>Data/Hora</th><th>Usuário</th><th>Ação</th><th>Detalhes</th></tr></thead><tbody>'+logs.map(function(l){
      let dt=new Date(l.data);
      let dataStr=dt.toLocaleDateString('pt-BR')+' '+dt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
      let acaoHtml=acaoIcons[l.acao]||('<span>'+l.acao+'</span>');
      let det=l.detalhes||'';if(det.length>120)det=det.substring(0,120)+'...';
      return'<tr><td style="white-space:nowrap">'+dataStr+'</td><td><b>'+l.usuario+'</b></td><td>'+acaoHtml+'</td><td style="font-size:12px;color:var(--text3);max-width:250px;overflow:hidden;text-overflow:ellipsis">'+det+'</td></tr>';
    }).join('')+'</tbody></table>';
  }
  document.getElementById('modalAuditItem').style.display='flex';
});
function closeAuditItem(){document.getElementById('modalAuditItem').style.display='none';}

document.getElementById('delParc-all').addEventListener('change',function(){let ch=this.checked;document.querySelectorAll('.delparc-cb').forEach(cb=>cb.checked=ch);updateDelParcCount();});
document.getElementById('delParcList').addEventListener('change',function(e){if(e.target.classList.contains('delparc-cb'))updateDelParcCount();else checkParcEdited();});
document.getElementById('delParcList').addEventListener('input',function(e){if(!e.target.classList.contains('delparc-cb'))checkParcEdited();});

// === FOLHA DE PAGAMENTO ===
document.getElementById('hol-files').addEventListener('change',function(){
  let n=this.files.length;
  document.getElementById('hol-file-count').textContent=n?n+' arquivo(s) selecionado(s)':'Nenhum arquivo selecionado';
});

function switchFolhaTab(btn){
  document.querySelectorAll('.folha-tab').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.folha-tab-content').forEach(d=>d.style.display='none');
  btn.classList.add('active');
  document.getElementById(btn.dataset.tab).style.display='';
}

let VERBAS=[],FOLHA_VALS={};
function verbasDoColab(c){let v=[];try{v=JSON.parse(c.verbas_json||'[]');}catch(e){}return v;}
function valorFolha(colabId,verbaId){return (FOLHA_VALS[colabId]&&FOLHA_VALS[colabId][verbaId])||0;}
function totalColabFolha(c){
  let t=0;
  for(const vb of VERBAS){
    let v=valorFolha(c.id,vb.id);
    if(!v)continue;
    t+=vb.tipo==='desconto'?-v:v;
  }
  return Math.round(t*100)/100;
}
let EMPRESTIMOS=[];
function iconeEmprestimo(colabId){
  let emps=EMPRESTIMOS.filter(e=>e.colaborador_id===colabId&&e.status==='ativo');
  if(!emps.length)return '';
  let tip=emps.map(e=>(e.descricao||'Empréstimo')+' — parcela '+parcelaProjetadaEmp(e)+'/'+(e.total_parcelas||0)+' — '+fmt(e.valor_parcela||0)).join('&#10;');
  return '<span title="'+tip.replace(/"/g,'&quot;')+'" style="cursor:help;font-size:1.35rem;vertical-align:middle;line-height:1">💳</span>'
    +(emps.length>1?'<span style="background:var(--amber);color:#000;border-radius:10px;font-size:12px;font-weight:700;padding:2px 7px;margin-left:3px;vertical-align:middle">×'+emps.length+'</span>':'')+' ';
}
async function renderFolha(){
  let mes=gM();
  let [verbas,valores,holerites,emprestimos]=await Promise.all([api('GET','/api/verbas'),api('GET','/api/folha-valores?mes='+mes),api('GET','/api/holerites?mes='+mes),api('GET','/api/emprestimos')]);
  VERBAS=verbas||[];
  EMPRESTIMOS=emprestimos||[];
  FOLHA_VALS={};
  (valores||[]).forEach(v=>{(FOLHA_VALS[v.colaborador_id]=FOLHA_VALS[v.colaborador_id]||{})[v.verba_id]=v.valor;});
  let colabs=COLABS||await api('GET','/api/colaboradores');
  let folhaColabs=colabs.filter(c=>c.ativo&&c.na_folha!==0);
  // Agrupar por grupo
  let ordemGrupos=['Montador','Vendedor','Supervisor','Administrativo'];
  let grupos={};
  folhaColabs.forEach(c=>{
    let g=c.grupo||'Sem grupo';
    (grupos[g]=grupos[g]||[]).push(c);
  });
  let nomesGrupos=[...ordemGrupos.filter(g=>grupos[g]),...Object.keys(grupos).filter(g=>!ordemGrupos.includes(g)).sort()];
  let iconeGrupo={'Montador':'fa-couch','Vendedor':'fa-shopping-bag','Supervisor':'fa-user-tie','Administrativo':'fa-briefcase','Sem grupo':'fa-users'};
  let totalGeral=0;
  let html='';
  for(const g of nomesGrupos){
    let lista=grupos[g];
    // Colunas do grupo: união das verbas dos colaboradores (na ordem do catálogo)
    let usadas=new Set();
    lista.forEach(c=>verbasDoColab(c).forEach(v=>usadas.add(v)));
    let cols=VERBAS.filter(vb=>usadas.has(vb.id));
    let totGrupo=0;
    let linhas=lista.map(c=>{
      let minhas=new Set(verbasDoColab(c));
      let cells=cols.map(vb=>{
        if(!minhas.has(vb.id))return '<td style="text-align:center;color:var(--text3)">—</td>';
        let v=valorFolha(c.id,vb.id);
        return '<td><input type="number" step="0.01" value="'+(v||0)+'" style="width:78px;background:var(--bg3);border:1px solid '+(vb.tipo==='desconto'?'var(--red)':'var(--border)')+';border-radius:4px;color:var(--text);padding:2px 4px;font-size:.8rem;text-align:right" onchange="NR.setFolhaVal('+c.id+',\''+vb.id+'\',this.value)"></td>';
      }).join('');
      let t=totalColabFolha(c);
      totGrupo+=t;
      let cfg=minhas.size?'':'<span title="Sem verbas configuradas - edite o colaborador" style="color:var(--amber)"><i class="fas fa-exclamation-triangle"></i></span> ';
      return '<tr><td style="white-space:nowrap">'+cfg+iconeEmprestimo(c.id)+'<b>'+c.nome+'</b></td>'+cells+'<td style="color:var(--green);font-weight:bold;text-align:right">'+fmt(t)+'</td>'
        +'<td style="white-space:nowrap"><button class="btn btn-sm btn-outline" title="Imprimir recibo" onclick="NR.printReciboFolha('+c.id+')"><i class="fas fa-print"></i></button> '
        +'<button class="btn btn-sm btn-outline" title="Editar cadastro/verbas" onclick="NR.editColab('+c.id+')"><i class="fas fa-user-cog"></i></button> '
        +'<button class="btn btn-sm btn-danger" title="Limpar valores do mês" onclick="NR.limparFolhaColab('+c.id+',\''+c.nome.replace(/'/g,"\\'")+'\')"><i class="fas fa-eraser"></i></button> '
        +'<button class="btn btn-sm btn-outline" title="Tirar da Folha de Pagamento (continua nas comissões; volta pela aba Colaboradores)" onclick="NR.tirarDaFolha('+c.id+',\''+c.nome.replace(/'/g,"\\'")+'\')"><i class="fas fa-user-slash"></i></button></td></tr>';
    }).join('');
    totalGeral+=totGrupo;
    html+='<div style="margin-bottom:22px"><h4 style="margin-bottom:8px;color:var(--text2)"><i class="fas '+(iconeGrupo[g]||'fa-users')+'"></i> '+g+' <span style="font-size:.8rem;color:var(--text3)">('+lista.length+')</span><span style="float:right;color:var(--green)">'+fmt(totGrupo)+'</span></h4>'
      +'<div style="overflow-x:auto"><table class="data-table" style="font-size:.82rem"><thead><tr><th>Colaborador</th>'
      +cols.map(vb=>'<th style="'+(vb.tipo==='desconto'?'color:var(--red)':'')+'">'+vb.nome+(vb.tipo==='desconto'?' (−)':'')+'</th>').join('')
      +'<th style="color:var(--green);text-align:right">TOTAL</th><th></th></tr></thead><tbody>'+linhas+'</tbody></table></div></div>';
  }
  if(!html)html='<div style="text-align:center;padding:30px;color:var(--text3)"><i class="fas fa-users" style="font-size:2rem;display:block;margin-bottom:8px"></i>Nenhum colaborador na folha. Cadastre ou importe holerites.</div>';
  document.getElementById('folhaGrupos').innerHTML=html;
  document.getElementById('folha-qtd-colabs').textContent=folhaColabs.length;
  document.getElementById('folha-total').textContent=fmt(totalGeral);
  document.getElementById('folha-qtd-holerites').textContent=holerites.length;
  renderVerbasCfg();
  renderEmprestimos();

  // Holerites
  if(!holerites.length){
    document.getElementById('holeritesList').innerHTML='<div style="text-align:center;padding:30px;color:var(--text3)"><i class="fas fa-file-pdf" style="font-size:2rem;display:block;margin-bottom:8px"></i>Nenhum holerite importado para este mês.<br>Clique em "Importar Holerites" para começar.</div>';
  }else{
    document.getElementById('holeritesList').innerHTML='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px">'+holerites.map(h=>{
      let prov=[];try{prov=JSON.parse(h.proventos_json||'[]');}catch(e){}
      let desc=[];try{desc=JSON.parse(h.descontos_json||'[]');}catch(e){}
      return '<div style="background:var(--bg3);border-radius:10px;padding:16px;border:1px solid var(--border)">'+
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><b style="font-size:.95rem">'+h.nome+'</b><button class="btn btn-sm btn-danger" onclick="NR.delHolerite(\''+h.id+'\')"><i class="fas fa-trash"></i></button></div>'+
        '<div style="font-size:.8rem;color:var(--text3);margin-bottom:8px">'+h.cargo+' | CPF: '+h.cpf+' | Adm: '+h.data_admissao+'</div>'+
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:.82rem">'+
        '<div>Sal.Base: <b>'+fmt(h.salario_base)+'</b></div>'+
        '<div>Proventos: <b style="color:var(--green)">'+fmt(h.total_proventos)+'</b></div>'+
        '<div>Descontos: <b style="color:var(--red)">'+fmt(h.total_descontos)+'</b></div>'+
        '<div>Líquido: <b style="color:var(--blue)">'+fmt(h.liquido)+'</b></div>'+
        '<div>FGTS: <b>'+fmt(h.fgts_mes)+'</b></div>'+
        '<div>INSS: <b>'+fmt(h.sal_cont_inss)+'</b></div>'+
        '</div>'+
        '<details style="margin-top:8px;font-size:.8rem"><summary style="cursor:pointer;color:var(--text2)">Detalhes ('+prov.length+' prov / '+desc.length+' desc)</summary>'+
        '<div style="margin-top:4px">'+prov.map(p=>'<div style="display:flex;justify-content:space-between"><span>'+p.descricao+'</span><span style="color:var(--green)">'+fmt(p.valor)+'</span></div>').join('')+
        desc.map(d=>'<div style="display:flex;justify-content:space-between"><span>'+d.descricao+'</span><span style="color:var(--red)">-'+fmt(d.valor)+'</span></div>').join('')+'</div></details>'+
        '<div style="font-size:.75rem;color:var(--text3);margin-top:6px"><i class="fas fa-file-pdf"></i> '+h.nome_pdf+'</div></div>';
    }).join('')+'</div>';
  }

  // Comparação
  let holMap={};holerites.forEach(h=>{if(h.colaborador_id)holMap[h.colaborador_id]=h;});
  let compHtml=folhaColabs.map(c=>{
    let temFolha=FOLHA_VALS[c.id]&&Object.keys(FOLHA_VALS[c.id]).length>0;
    let h=holMap[c.id];
    if(!temFolha&&!h)return '';
    let salF=valorFolha(c.id,'vb_salario')+valorFolha(c.id,'vb_acerto');
    let preF=valorFolha(c.id,'vb_premio');
    if(!h){
      // Sem holerite (sem registro): mostra só a folha
      let salPre=salF+preF;
      return '<tr style="opacity:.6"><td><b>'+c.nome+'</b></td><td>'+fmt(salF)+'</td><td>'+fmt(preF)+'</td><td>'+fmt(salPre)+'</td><td>-</td><td>-</td><td>-</td><td>-</td><td><span style="color:var(--text3)"><i class="fas fa-user-slash"></i> Sem holerite</span></td></tr>';
    }
    if(!temFolha){
      return '<tr><td><b>'+c.nome+'</b></td><td>-</td><td>-</td><td>-</td><td>'+fmt(h.total_proventos||0)+'</td><td>'+fmt(h.total_descontos||0)+'</td><td style="color:var(--blue)">'+fmt(h.liquido)+'</td><td>-</td><td><span style="color:var(--amber)"><i class="fas fa-exclamation-circle"></i> Sem folha</span></td></tr>';
    }
    let salPre=salF+preF;
    let liqH=h.liquido||0,provH=h.total_proventos||0,descH=h.total_descontos||0;
    let dif=salPre-liqH;
    let liqOk=Math.abs(dif)<=0.05;
    // Tooltips com os itens detalhados do holerite
    let provItens=[],descItens=[];
    try{provItens=JSON.parse(h.proventos_json||'[]');}catch(e){}
    try{descItens=JSON.parse(h.descontos_json||'[]');}catch(e){}
    let provTip=provItens.map(p=>p.descricao+': '+fmt(p.valor)).join('&#10;')||'Sem detalhes';
    let descTip=descItens.map(d=>d.descricao+': '+fmt(d.valor)).join('&#10;')||'Sem detalhes';
    function cc(ok,v){return '<td style="color:var(--'+(ok?'green':'red')+');font-weight:'+(ok?'normal':'bold')+'">'+fmt(v)+'</td>';}
    return '<tr><td><b>'+c.nome+'</b></td><td>'+fmt(salF)+'</td><td>'+fmt(preF)+'</td>'+cc(liqOk,salPre)+
      '<td style="color:var(--green);cursor:help;text-decoration:underline dotted" title="'+provTip+'">'+fmt(provH)+'</td>'+
      '<td style="color:var(--red);cursor:help;text-decoration:underline dotted" title="'+descTip+'">'+fmt(descH)+'</td>'+
      cc(liqOk,liqH)+
      '<td style="color:var(--'+(liqOk?'text3':'red')+')">'+(liqOk?'-':fmt(dif))+'</td>'+
      '<td>'+(liqOk?'<span style="color:var(--green)"><i class="fas fa-check-circle"></i> OK</span>':'<span style="color:var(--red)"><i class="fas fa-exclamation-triangle"></i> Diverge</span>')+'</td></tr>';
  }).filter(Boolean).join('');
  if(!compHtml)compHtml='<tr><td colspan="9" style="text-align:center;color:var(--text3);padding:20px">Preencha a folha e importe holerites para comparar</td></tr>';
  document.getElementById('compararGrid').innerHTML=compHtml;

  // Lista de Colaboradores
  document.getElementById('colabsFullList').innerHTML='<div style="overflow-x:auto"><table class="data-table" style="font-size:.82rem"><thead><tr><th>Cad.</th><th>Nome</th><th>Grupo</th><th>Verbas</th><th>CPF</th><th>Cargo</th><th>Sal.Base</th><th>Admissão</th><th>Com.%</th><th>CLT</th><th>Folha</th><th>Ativo</th><th></th></tr></thead><tbody>'+
    colabs.map(c=>{
      let nv=verbasDoColab(c).length;
      return '<tr style="'+(c.ativo?'':'opacity:.5')+'"><td>'+(c.cadastro||'-')+'</td><td>'+iconeEmprestimo(c.id)+'<b>'+c.nome+'</b></td><td>'+(c.grupo||'<span style="color:var(--amber)">—</span>')+'</td><td>'+(nv?nv+' verba(s)':'<span style="color:var(--amber)"><i class="fas fa-exclamation-triangle"></i> configurar</span>')+'</td><td>'+(c.cpf||'-')+'</td><td>'+(c.cargo||'-')+'</td><td>'+fmt(c.salario_base||0)+'</td><td>'+(c.data_admissao||'-')+'</td><td>'+(c.percentual||0)+'%</td><td>'+(c.registrado?'<i class="fas fa-check" style="color:var(--green)"></i>':'<i class="fas fa-times" style="color:var(--red)"></i>')+'</td><td><button class="btn btn-sm '+(c.na_folha!==0?'btn-primary':'btn-outline')+'" title="'+(c.na_folha!==0?'Aparece na folha - clique para remover':'Fora da folha - clique para incluir')+'" onclick="NR.toggleNaFolha('+c.id+','+(c.na_folha!==0?0:1)+')">'+(c.na_folha!==0?'<i class="fas fa-check"></i>':'<i class="fas fa-minus"></i>')+'</button></td><td>'+(c.ativo?'<i class="fas fa-check" style="color:var(--green)"></i>':'<span style="color:var(--red)"><i class="fas fa-times"></i></span>')+'</td><td style="white-space:nowrap"><button class="btn btn-sm btn-outline" onclick="NR.editColab('+c.id+')"><i class="fas fa-edit"></i></button> <button class="btn btn-sm btn-danger" onclick="NR.delC('+c.id+')"><i class="fas fa-trash"></i></button></td></tr>';
    }).join('')+
    '</tbody></table></div>';
}

async function setFolhaVal(colabId,verbaId,valor){
  await api('PUT','/api/folha-valores',{colaborador_id:colabId,mes:gM(),verba_id:verbaId,valor:parseFloat(valor)||0});
  (FOLHA_VALS[colabId]=FOLHA_VALS[colabId]||{})[verbaId]=parseFloat(valor)||0;
  renderFolha();
}
async function copiarFolhaMesAnterior(){
  if(!confirm('Copiar os valores da folha do mês anterior para '+gM()+'?\n\nSó preenche o que estiver vazio — valores já lançados neste mês não são alterados.'))return;
  let r=await api('POST','/api/folha-valores/copiar-mes',{mes:gM()});
  if(r&&r.error){toast('Erro: '+r.error,'error');return;}
  toast(r.copiados+' valor(es) copiado(s) de '+r.origem+'!');
  renderFolha();
}
async function limparFolhaColab(colabId,nome){
  if(!confirm('Limpar todos os valores de '+nome+' neste mês?'))return;
  await api('DELETE','/api/folha-valores/'+colabId+'/'+gM());
  toast('Valores limpos!');renderFolha();
}
// Catálogo de verbas (Configurações)
function renderVerbasCfg(){
  let box=document.getElementById('verbasCfgList');
  if(!box)return;
  box.innerHTML=VERBAS.map(vb=>'<span class="tag-item" style="display:inline-flex;align-items:center;gap:6px'+(vb.tipo==='desconto'?';border:1px solid var(--red)':'')+'">'
    +(vb.tipo==='desconto'?'<i class="fas fa-minus-circle" style="color:var(--red)"></i>':'<i class="fas fa-plus-circle" style="color:var(--green)"></i>')
    +'<span>'+vb.nome+'</span><button class="tag-remove" onclick="NR.delVerbaCfg(\''+vb.id+'\',\''+vb.nome.replace(/'/g,"\\'")+'\')"><i class="fas fa-times"></i></button></span>').join('');
}
async function addVerbaCfg(){
  let nome=document.getElementById('vb-nome').value.trim();
  if(!nome){toast('Digite o nome da verba','error');return;}
  await api('POST','/api/verbas',{nome:nome,tipo:document.getElementById('vb-tipo').value});
  document.getElementById('vb-nome').value='';
  toast('Verba adicionada!');renderFolha();
}
async function delVerbaCfg(id,nome){
  if(!confirm('Excluir a verba "'+nome+'"? Os valores já lançados nela deixam de aparecer.'))return;
  await api('DELETE','/api/verbas/'+id);
  toast('Verba excluída!');renderFolha();
}

// === EMPRÉSTIMOS ===
// Projeta a parcela para o mês selecionado (consignado desconta todo mês).
// A última confirmação real vem da importação do holerite (mes_referencia).
function parcelaProjetadaEmp(e){
  if(!e.mes_referencia||!e.total_parcelas)return e.parcela_atual||0;
  let [ra,rm]=e.mes_referencia.split('-').map(Number);
  let [sa,sm]=gM().split('-').map(Number);
  let diff=(sa*12+sm)-(ra*12+rm);
  return Math.max(0,Math.min(e.total_parcelas,(e.parcela_atual||0)+diff));
}
function previsaoTerminoEmp(e){
  let base=(e.mes_referencia||gM());
  let [a,m]=base.split('-').map(Number);
  let restam=Math.max(0,(e.total_parcelas||0)-(e.parcela_atual||0));
  let d=new Date(a,(m-1)+restam,1);
  return MESES_NOME[d.getMonth()]+'/'+d.getFullYear();
}
function renderEmprestimos(){
  let box=document.getElementById('emprestimosList');
  if(!box)return;
  let ativos=EMPRESTIMOS.filter(e=>e.status==='ativo');
  let badge=document.getElementById('emp-badge');
  if(badge){if(ativos.length){badge.textContent=ativos.length;badge.style.display='inline';}else badge.style.display='none';}
  if(!EMPRESTIMOS.length){
    box.innerHTML='<div style="text-align:center;padding:30px;color:var(--text3)"><i class="fas fa-hand-holding-usd" style="font-size:2rem;display:block;margin-bottom:8px"></i>Nenhum empréstimo registrado. Eles entram sozinhos ao importar holerites com consignado, ou cadastre manual.</div>';
    return;
  }
  box.innerHTML='<div style="overflow-x:auto"><table class="data-table" style="font-size:.82rem"><thead><tr><th>Colaborador</th><th>Descrição</th><th>Contrato</th><th>Banco</th><th>Parcela</th><th>Progresso</th><th>Valor Parcela</th><th>Falta Pagar</th><th>Término Previsto</th><th>Status</th><th></th></tr></thead><tbody>'+
    EMPRESTIMOS.map(e=>{
      let quitado=e.status==='quitado';
      let proj=quitado?(e.total_parcelas||0):parcelaProjetadaEmp(e);
      let ehProjecao=!quitado&&proj!==(e.parcela_atual||0);
      let pct=e.total_parcelas?Math.min(100,Math.round((proj/e.total_parcelas)*100)):0;
      let restante=Math.max(0,((e.total_parcelas||0)-proj))*(e.valor_parcela||0);
      let refBR=e.mes_referencia?e.mes_referencia.split('-').reverse().join('/'):'-';
      let parcelaCell=ehProjecao
        ?'<span title="Projeção para o mês selecionado. Última confirmação real (holerite): '+(e.parcela_atual||0)+'/'+(e.total_parcelas||0)+' em '+refBR+'. Importe o holerite do mês para confirmar." style="cursor:help;color:var(--amber)"><b>~'+proj+'/'+(e.total_parcelas||0)+'</b></span>'
        :'<b>'+proj+'/'+(e.total_parcelas||0)+'</b>';
      let statusCell;
      if(quitado)statusCell='<span style="color:var(--green)"><i class="fas fa-check-circle"></i> Quitado</span>';
      else if(proj>=(e.total_parcelas||0)&&e.total_parcelas)statusCell='<span style="color:var(--amber)" title="Pela projeção, termina neste mês - confirme pelo holerite"><i class="fas fa-flag-checkered"></i> Terminando</span>';
      else statusCell='<span style="color:var(--blue)"><i class="fas fa-sync-alt"></i> Ativo</span>';
      return '<tr style="'+(quitado?'opacity:.55':'')+'"><td><b>'+(e.colab_nome||'')+'</b></td><td>'+(e.descricao||'-')+'</td><td style="font-size:11px">'+(e.contrato||'-')+'</td><td>'+(e.banco||'-')+'</td>'
        +'<td style="white-space:nowrap">'+parcelaCell+'</td>'
        +'<td><div style="background:var(--bg3);border-radius:6px;height:10px;width:110px;overflow:hidden"><div style="width:'+pct+'%;background:'+(quitado?'var(--green)':'var(--blue)')+';height:100%"></div></div></td>'
        +'<td>'+fmt(e.valor_parcela||0)+'</td><td style="color:var(--amber);font-weight:600">'+fmt(restante)+'</td>'
        +'<td>'+(quitado?'-':previsaoTerminoEmp(e))+'</td>'
        +'<td>'+statusCell+'</td>'
        +'<td style="white-space:nowrap"><button class="btn btn-sm btn-outline" title="Editar" onclick="NR.editEmp(\''+e.id+'\')"><i class="fas fa-edit"></i></button> '
        +(quitado?'':'<button class="btn btn-sm" style="background:var(--green);color:#fff" title="Marcar como quitado" onclick="NR.quitarEmp(\''+e.id+'\')"><i class="fas fa-check"></i></button> ')
        +'<button class="btn btn-sm btn-danger" title="Excluir" onclick="NR.delEmp(\''+e.id+'\')"><i class="fas fa-trash"></i></button></td></tr>';
    }).join('')+'</tbody></table></div>';
}
function preencherSelectColabEmp(sel){
  document.getElementById('em-colab').innerHTML=(COLABS||[]).filter(c=>c.ativo).map(c=>'<option value="'+c.id+'"'+(sel===c.id?' selected':'')+'>'+c.nome+'</option>').join('');
}
function openCadEmp(){
  preencherSelectColabEmp(null);
  document.getElementById('em-desc').value='Empréstimo Crédito do Trabalhador';
  ['em-contrato','em-banco','em-valor','em-atual','em-total','em-obs'].forEach(id=>document.getElementById(id).value='');
  delete document.getElementById('modalCadEmp').dataset.editId;
  document.getElementById('cadEmpTitulo').innerHTML='<i class="fas fa-hand-holding-usd" style="color:var(--amber)"></i> Cadastrar Empréstimo';
  document.getElementById('modalCadEmp').style.display='flex';
}
function closeCadEmp(){document.getElementById('modalCadEmp').style.display='none';}
function editEmp(id){
  let e=EMPRESTIMOS.find(x=>x.id===id);if(!e)return;
  preencherSelectColabEmp(e.colaborador_id);
  document.getElementById('em-desc').value=e.descricao||'';
  document.getElementById('em-contrato').value=e.contrato||'';
  document.getElementById('em-banco').value=e.banco||'';
  document.getElementById('em-valor').value=e.valor_parcela||'';
  document.getElementById('em-atual').value=e.parcela_atual||'';
  document.getElementById('em-total').value=e.total_parcelas||'';
  document.getElementById('em-obs').value=e.observacao||'';
  document.getElementById('modalCadEmp').dataset.editId=id;
  document.getElementById('cadEmpTitulo').innerHTML='<i class="fas fa-edit"></i> Editar Empréstimo';
  document.getElementById('modalCadEmp').style.display='flex';
}
async function salvarCadEmp(){
  let dados={
    colaborador_id:parseInt(document.getElementById('em-colab').value),
    descricao:document.getElementById('em-desc').value.trim()||'Empréstimo',
    contrato:document.getElementById('em-contrato').value.trim(),
    banco:document.getElementById('em-banco').value.trim(),
    valor_parcela:parseFloat(document.getElementById('em-valor').value)||0,
    parcela_atual:parseInt(document.getElementById('em-atual').value)||0,
    total_parcelas:parseInt(document.getElementById('em-total').value)||0,
    observacao:document.getElementById('em-obs').value.trim()
  };
  if(!dados.colaborador_id){toast('Selecione o colaborador','error');return;}
  if(dados.total_parcelas&&dados.parcela_atual>=dados.total_parcelas)dados.status='quitado';
  let editId=document.getElementById('modalCadEmp').dataset.editId;
  if(editId)await api('PUT','/api/emprestimos/'+editId,dados);
  else await api('POST','/api/emprestimos',dados);
  toast(editId?'Empréstimo atualizado!':'Empréstimo cadastrado!');
  closeCadEmp();renderFolha();
}
async function quitarEmp(id){
  if(!confirm('Marcar este empréstimo como quitado?'))return;
  await api('PUT','/api/emprestimos/'+id,{status:'quitado'});
  toast('Empréstimo quitado!');renderFolha();
}
async function delEmp(id){
  if(!confirm('Excluir este empréstimo do controle?'))return;
  await api('DELETE','/api/emprestimos/'+id);
  toast('Excluído!');renderFolha();
}

function renderVerbasChecklist(selecionadas){
  let sel=new Set(selecionadas||[]);
  document.getElementById('cc-verbas').innerHTML=VERBAS.map(vb=>
    '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:.83rem">'
    +'<input type="checkbox" class="cc-verba-cb" value="'+vb.id+'" '+(sel.has(vb.id)?'checked':'')+' style="width:15px;height:15px">'
    +(vb.tipo==='desconto'?'<span style="color:var(--red)">'+vb.nome+' (−)</span>':'<span>'+vb.nome+'</span>')+'</label>'
  ).join('')||'<span style="color:var(--text3);font-size:.8rem">Nenhuma verba cadastrada (Configurações → Verbas da Folha)</span>';
}
function openCadColab(){
  document.getElementById('formCadColab').reset();
  document.getElementById('cc-registrado').checked=true;
  document.getElementById('cc-ativo').checked=true;
  document.getElementById('cc-grupo').value='';
  renderVerbasChecklist([]);
  delete document.getElementById('modalCadColab').dataset.editId;
  document.getElementById('modalCadColab').querySelector('h3').innerHTML='<i class="fas fa-user-plus"></i> Cadastrar Colaborador';
  document.getElementById('modalCadColab').style.display='flex';
}
function closeCadColab(){document.getElementById('modalCadColab').style.display='none';delete document.getElementById('modalCadColab').dataset.editId;}
function getColabFormData(){
  return {
    nome:document.getElementById('cc-nome').value.trim(),
    cadastro:document.getElementById('cc-cadastro').value.trim(),
    cpf:document.getElementById('cc-cpf').value.trim(),
    rg:document.getElementById('cc-rg').value.trim(),
    cbo:document.getElementById('cc-cbo').value.trim(),
    cargo:document.getElementById('cc-cargo').value.trim(),
    departamento:document.getElementById('cc-depto').value.trim(),
    salario_base:parseFloat(document.getElementById('cc-salario').value)||0,
    data_admissao:document.getElementById('cc-admissao').value,
    dependentes:parseInt(document.getElementById('cc-dependentes').value)||0,
    faixa:parseFloat(document.getElementById('cc-faixa').value)||0,
    percentual:parseFloat(document.getElementById('cc-pct').value)||0,
    registrado:document.getElementById('cc-registrado').checked?1:0,
    ativo:document.getElementById('cc-ativo').checked?1:0,
    grupo:document.getElementById('cc-grupo').value,
    verbas_json:JSON.stringify([...document.querySelectorAll('.cc-verba-cb:checked')].map(cb=>cb.value))
  };
}
async function salvarCadColab(){
  let data=getColabFormData();
  if(!data.nome){toast('Nome obrigatório','error');return;}
  let editId=document.getElementById('modalCadColab').dataset.editId;
  if(editId){
    await api('PUT','/api/colaboradores/'+editId,data);
    toast('Colaborador atualizado!');
  }else{
    await api('POST','/api/colaboradores',data);
    toast('Colaborador cadastrado!');
  }
  closeCadColab();refreshAll();
}

function editColab(id){
  let c=COLABS.find(x=>x.id===id);if(!c)return;
  document.getElementById('cc-nome').value=c.nome||'';
  document.getElementById('cc-cadastro').value=c.cadastro||'';
  document.getElementById('cc-cpf').value=c.cpf||'';
  document.getElementById('cc-rg').value=c.rg||'';
  document.getElementById('cc-cbo').value=c.cbo||'';
  document.getElementById('cc-cargo').value=c.cargo||'';
  document.getElementById('cc-depto').value=c.departamento||'';
  document.getElementById('cc-salario').value=c.salario_base||0;
  document.getElementById('cc-admissao').value=c.data_admissao||'';
  document.getElementById('cc-dependentes').value=c.dependentes||0;
  document.getElementById('cc-faixa').value=c.faixa||0;
  document.getElementById('cc-pct').value=c.percentual||0;
  document.getElementById('cc-registrado').checked=!!c.registrado;
  document.getElementById('cc-ativo').checked=c.ativo!==0;
  document.getElementById('cc-grupo').value=c.grupo||'';
  renderVerbasChecklist(verbasDoColab(c));
  document.getElementById('modalCadColab').dataset.editId=id;
  document.getElementById('modalCadColab').querySelector('h3').innerHTML='<i class="fas fa-user-edit"></i> Editar Colaborador';
  document.getElementById('modalCadColab').style.display='flex';
}

function openImportHolerite(){
  document.getElementById('hol-mes').value=gM();
  document.getElementById('hol-files').value='';
  document.getElementById('hol-file-count').textContent='Nenhum arquivo selecionado';
  document.getElementById('hol-progress').style.display='none';
  document.getElementById('modalImportHolerite').style.display='flex';
}
function closeImportHolerite(){document.getElementById('modalImportHolerite').style.display='none';}
async function uploadHolerites(){
  let files=document.getElementById('hol-files').files;
  let mes=document.getElementById('hol-mes').value;
  if(!files.length){toast('Selecione pelo menos um PDF','error');return;}
  if(!mes){toast('Selecione o mês','error');return;}
  let fd=new FormData();
  fd.append('mes',mes);
  for(let i=0;i<files.length;i++)fd.append('pdfs',files[i]);
  document.getElementById('hol-progress').style.display='';
  document.getElementById('hol-bar').style.width='30%';
  document.getElementById('hol-status').textContent='Enviando '+files.length+' arquivo(s)...';
  document.getElementById('btnImportHol').disabled=true;
  try{
    let hdrs={};if(authToken)hdrs['Authorization']='Bearer '+authToken;hdrs['X-Empresa']=currentEmpresa;
    let r=await fetch('/api/holerites/upload',{method:'POST',headers:hdrs,body:fd});
    let text=await r.text();
    console.log('Upload response:', r.status, text);
    let data;
    try{data=JSON.parse(text);}catch(pe){document.getElementById('hol-status').textContent='Erro servidor: '+text.substring(0,200);toast('Erro ao importar','error');document.getElementById('btnImportHol').disabled=false;return;}
    if(data.error){document.getElementById('hol-status').textContent='Erro: '+data.error;toast('Erro: '+data.error,'error');document.getElementById('btnImportHol').disabled=false;return;}
    document.getElementById('hol-bar').style.width='100%';
    let ok=Array.isArray(data)?data.filter(d=>d.ok).length:0;
    let errs=Array.isArray(data)?data.filter(d=>!d.ok).length:0;
    document.getElementById('hol-status').textContent=ok+' importado(s)'+(errs?' | '+errs+' erro(s)':'');
    toast(ok+' holerite(s) importado(s)!'+(errs?' ('+errs+' erros)':''));
    if(errs&&Array.isArray(data)){let errMsgs=data.filter(d=>!d.ok).map(d=>d.file+': '+d.error);console.error('Erros importação:',errMsgs);}
    setTimeout(()=>{closeImportHolerite();refreshAll();},1500);
  }catch(e){
    console.error('Upload error:', e);
    document.getElementById('hol-status').textContent='Erro: '+e.message;
    toast('Erro ao importar: '+e.message,'error');
  }
  document.getElementById('btnImportHol').disabled=false;
}
async function delHolerite(id){
  if(!confirm('Excluir este holerite?'))return;
  await api('DELETE','/api/holerites/'+id);toast('Excluído!');renderFolha();
}
async function toggleNaFolha(id,v){
  await api('PUT','/api/colaboradores/'+id,{na_folha:v});
  toast(v?'Incluído na folha':'Removido da folha');
  COLABS=await api('GET','/api/colaboradores');
  renderFolha();
}
async function tirarDaFolha(id,nome){
  if(!confirm('Tirar '+nome+' da Folha de Pagamento?\n\nEle continua no sistema (comissões, pagamentos etc.) — só sai da folha. Para voltar, use o botão da coluna "Folha" na aba Colaboradores.'))return;
  await toggleNaFolha(id,0);
}

// === NOTAS CNPJ (NF-e SEFAZ) ===
let notasNfe=[];
function fmtCnpj(c){c=(c||'').replace(/\D/g,'');if(c.length!==14)return c;return c.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,'$1.$2.$3/$4-$5');}
function filtrarNotas(){renderNotasNfe(true);}
async function renderNotasNfe(semFetch){
  if(!document.getElementById('notasNfeGrid'))return;
  if(!semFetch){try{notasNfe=await api('GET','/api/notas-recebidas');}catch(e){notasNfe=[];}}
  let mostrarTodas=document.getElementById('nfe-mostrar-todas').checked;
  let novas=notasNfe.filter(n=>n.status==='nova').length;
  let lancadas=notasNfe.filter(n=>n.status==='lancada').length;
  document.getElementById('nfe-qtd-novas').textContent=novas;
  document.getElementById('nfe-qtd-lancadas').textContent=lancadas;
  let navBadge=document.getElementById('badge-nfe');
  if(navBadge){if(novas){navBadge.textContent=novas;navBadge.style.display='inline';}else{navBadge.style.display='none';}}
  let lista=mostrarTodas?notasNfe:notasNfe.filter(n=>n.status==='nova');
  let busca=(document.getElementById('nfe-busca')?.value||'').trim().toLowerCase();
  if(busca){
    lista=lista.filter(n=>{
      let dups=[];try{dups=JSON.parse(n.duplicatas_json||'[]');}catch(e){}
      let campos=[
        (n.numero||''),
        (n.emitente||''),
        (n.emitente_cnpj||''),
        (n.valor||0).toFixed(2),                       // 3345.49
        (n.valor||0).toFixed(2).replace('.',','),      // 3345,49
        fD(n.data_emissao||''),                        // dd/mm/aaaa
        (n.data_emissao||''),                          // aaaa-mm-dd
        dups.map(d=>fD(d.vencimento)+' '+(d.vencimento||'')+' '+(d.valor||0).toFixed(2).replace('.',',')).join(' ')
      ].join(' ').toLowerCase();
      return campos.includes(busca);
    });
  }
  let statusLbl={'nova':'<span style="color:var(--amber)"><i class="fas fa-hourglass-half"></i> Aguardando aprovação</span>','lancada':'<span style="color:var(--green)"><i class="fas fa-check-circle"></i> Aprovada</span>','ignorada':'<span style="color:var(--text3)"><i class="fas fa-eye-slash"></i> Ignorada</span>'};
  document.getElementById('notasNfeGrid').innerHTML=lista.length?lista.map(n=>{
    let dups=[];try{dups=JSON.parse(n.duplicatas_json||'[]');}catch(e){}
    let pagInfo;
    if(n.tipo==='resumo')pagInfo='<span style="color:var(--amber)" title="Aguardando XML completo da SEFAZ (chega na próxima consulta)"><i class="fas fa-hourglass-half"></i> aguardando XML</span>';
    else pagInfo='<span title="'+dups.map(d=>fD(d.vencimento)+': '+fmt(d.valor)).join('&#10;')+'">'+(n.forma_pagamento||(dups.length>1?dups.length+'x':'à vista'))+'</span>';
    let acoes='';
    if(n.status==='nova'){
      acoes='<button class="btn btn-sm" style="background:var(--green);color:#fff" onclick="NR.openLancarNota(\''+n.id+'\')" title="Conferir e Aprovar"><i class="fas fa-check-double"></i> Aprovar</button> '
        +'<button class="btn btn-sm btn-outline" onclick="NR.ignorarNota(\''+n.id+'\',\'ignorada\')" title="Ignorar"><i class="fas fa-eye-slash"></i></button>';
    }else if(n.status==='ignorada'){
      acoes='<button class="btn btn-sm btn-outline" onclick="NR.ignorarNota(\''+n.id+'\',\'nova\')" title="Restaurar"><i class="fas fa-undo"></i></button>';
    }
    if(n.tipo==='completa')acoes+=' <button class="btn btn-sm btn-outline" onclick="NR.baixarXmlNota(\''+n.id+'\')" title="Baixar XML da nota"><i class="fas fa-file-code"></i></button>';
    return '<tr'+(n.status!=='nova'?' style="opacity:.55"':'')+'><td><input type="checkbox" class="nfe-sel-cb" value="'+n.id+'" style="width:16px;height:16px" onchange="NR.updateNotasSel()"></td><td style="white-space:nowrap">'+fD(n.data_emissao)+'</td><td>'+(n.numero||'-')+'</td><td><b>'+n.emitente+'</b></td><td style="white-space:nowrap;font-size:11px">'+fmtCnpj(n.emitente_cnpj)+'</td><td style="font-weight:bold">'+fmt(n.valor)+'</td><td>'+pagInfo+'</td><td>'+(statusLbl[n.status]||n.status)+'</td><td style="white-space:nowrap">'+acoes+'</td></tr>';
  }).join(''):'<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--text3)"><i class="fas fa-inbox" style="font-size:1.6rem;display:block;margin-bottom:8px"></i>'+(busca?'Nenhuma nota encontrada para "'+busca+'".':'Nenhuma nota aguardando aprovação. Configure o certificado e clique em "Consultar Agora".')+'</td></tr>';
  document.getElementById('nfe-sel-all').checked=false;
  updateNotasSel();
  // Info da config (só admin consegue; ignora erro para os demais)
  try{
    let cfg=await api('GET','/api/nfe/config');
    let info=[];
    if(!cfg.temCert)info.push('⚠️ Certificado não enviado');
    if(cfg.ultimaConsulta)info.push('Última consulta: '+new Date(cfg.ultimaConsulta).toLocaleString('pt-BR'));
    if(cfg.proxConsulta&&new Date(cfg.proxConsulta).getTime()>Date.now())info.push('⏳ Em dia — próxima consulta liberada às '+new Date(cfg.proxConsulta).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}));
    if(cfg.auto)info.push('Consulta automática ativa (a cada hora)');
    document.getElementById('nfe-info').textContent=info.join(' | ');
    let badge=document.getElementById('nfe-status-badge');
    if(cfg.ultimoErro){badge.style.display='';badge.innerHTML='<i class="fas fa-exclamation-triangle"></i> '+cfg.ultimoErro;}
    else badge.style.display='none';
  }catch(e){}
}
async function nfeConsultar(){
  let btn=document.getElementById('btnNfeConsultar');
  btn.disabled=true;btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Consultando SEFAZ...';
  try{
    let r=await api('POST','/api/nfe/consultar',{});
    if(r.error)toast('Erro: '+r.error,'error');
    else toast(r.novas+' nota(s) nova(s), '+r.atualizadas+' completada(s)');
  }catch(e){toast('Erro ao consultar','error');}
  btn.disabled=false;btn.innerHTML='<i class="fas fa-sync-alt"></i> Consultar Agora';
  renderNotasNfe();
}
async function openNfeConfig(){
  try{
    let cfg=await api('GET','/api/nfe/config');
    document.getElementById('nfe-cnpj').value=cfg.cnpj||'';
    document.getElementById('nfe-uf').value=cfg.uf||'31';
    document.getElementById('nfe-auto').checked=!!cfg.auto;
    document.getElementById('nfe-senha').value='';
    document.getElementById('nfe-pfx').value='';
    let st=[];
    st.push(cfg.temCert?'<span style="color:var(--green)"><i class="fas fa-check-circle"></i> Certificado enviado</span>':'<span style="color:var(--red)"><i class="fas fa-times-circle"></i> Certificado ainda não enviado</span>');
    st.push(cfg.temSenha?'<span style="color:var(--green)"><i class="fas fa-check-circle"></i> Senha salva</span>':'<span style="color:var(--red)"><i class="fas fa-times-circle"></i> Senha não salva</span>');
    if(cfg.ultimaConsulta)st.push('Última consulta: '+new Date(cfg.ultimaConsulta).toLocaleString('pt-BR'));
    document.getElementById('nfe-cfg-status').innerHTML=st.join('<br>');
  }catch(e){toast('Apenas administradores podem configurar','error');return;}
  document.getElementById('modalNfeConfig').style.display='flex';
}
function closeNfeConfig(){document.getElementById('modalNfeConfig').style.display='none';}
async function salvarNfeConfig(){
  let fd=new FormData();
  let pfx=document.getElementById('nfe-pfx').files[0];
  if(pfx)fd.append('pfx',pfx);
  let senha=document.getElementById('nfe-senha').value;
  if(senha)fd.append('senha',senha);
  fd.append('cnpj',document.getElementById('nfe-cnpj').value);
  fd.append('uf',document.getElementById('nfe-uf').value);
  fd.append('auto',document.getElementById('nfe-auto').checked?'1':'0');
  try{
    let hdrs={};if(authToken)hdrs['Authorization']='Bearer '+authToken;hdrs['X-Empresa']=currentEmpresa;
    let r=await fetch('/api/nfe/config',{method:'POST',headers:hdrs,body:fd});
    let data=await r.json();
    if(data.error){toast('Erro: '+data.error,'error');return;}
    toast('Configuração salva!');closeNfeConfig();renderNotasNfe();
  }catch(e){toast('Erro ao salvar','error');}
}
let lancarNotaId=null,lancarNotaParcelas=[];
function openLancarNota(id){
  let n=notasNfe.find(x=>x.id===id);if(!n)return;
  if(n.tipo==='resumo'){toast('XML completo ainda não chegou. Clique em "Consultar Agora" para buscar (a SEFAZ libera após a ciência).','error');return;}
  lancarNotaId=id;
  let dups=[];try{dups=JSON.parse(n.duplicatas_json||'[]');}catch(e){}
  let descBase=(n.emitente||'Nota')+(n.numero?' NF '+n.numero:'');
  if(dups.length){
    lancarNotaParcelas=dups.map((d,i)=>({vencimento:d.vencimento||'',valor:d.valor||0,descricao:descBase+' '+(i+1)+'/'+dups.length}));
  }else{
    lancarNotaParcelas=[{vencimento:n.data_emissao||'',valor:n.valor||0,descricao:descBase}];
  }
  document.getElementById('lancarNotaInfo').innerHTML='<b>'+n.emitente+'</b> — NF '+(n.numero||'-')+' — Total: <b style="color:var(--green)">'+fmt(n.valor)+'</b>'
    +(n.forma_pagamento?'<br><i class="fas fa-credit-card" style="color:var(--blue)"></i> Pagamento: <b>'+n.forma_pagamento+'</b>':'')
    +(dups.length?' — '+dups.length+' parcela(s) vindas do XML da nota':'');
  document.getElementById('ln-cat').value='Fornecedor';
  document.getElementById('ln-forn').value=n.emitente||'';
  document.getElementById('ln-nota').value='D';
  document.getElementById('ln-recorrente').checked=false;
  document.getElementById('ln-boleto').checked=dups.length>0;
  document.getElementById('ln-achegar').checked=false;
  document.getElementById('ln-fiscal').checked=true;
  document.getElementById('ln-fiscal-valor').textContent=fmt(n.valor||0);
  renderLancarNotaParcelas();
  // Verificar possível duplicidade com contas já lançadas
  let simBox=document.getElementById('lancarNotaSimilares');
  simBox.style.display='none';
  api('GET','/api/notas-recebidas/'+id+'/similares').then(sims=>{
    if(sims&&sims.length){
      simBox.innerHTML='<b style="color:var(--amber)"><i class="fas fa-exclamation-triangle"></i> Atenção: já existe(m) '+sims.length+' conta(s) parecida(s) lançada(s):</b><br>'
        +sims.slice(0,5).map(s=>'• '+fD(s.vencimento)+' — '+s.descricao+' — '+fmt(s.valor)+(s.pago_por&&s.pago_por!=='A Pagar'?' <span style="color:var(--green)">(paga)</span>':'')).join('<br>')
        +(sims.length>5?'<br>... e mais '+(sims.length-5):'')
        +'<br><span style="color:var(--text3)">Confira antes de aprovar para não duplicar.</span>';
      simBox.style.display='';
    }
  }).catch(()=>{});
  document.getElementById('modalLancarNota').style.display='flex';
}
function renderLancarNotaParcelas(){
  document.getElementById('lancarNotaParcelas').innerHTML=lancarNotaParcelas.map((p,i)=>
    '<tr><td><b>'+(i+1)+'</b></td>'
    +'<td><input type="date" class="inline-input" value="'+p.vencimento+'" style="width:140px" onchange="NR.setParcelaNota('+i+',\'vencimento\',this.value)"></td>'
    +'<td><input type="text" class="inline-input" value="'+p.descricao.replace(/"/g,'&quot;')+'" style="width:100%" onchange="NR.setParcelaNota('+i+',\'descricao\',this.value)"></td>'
    +'<td><input type="number" class="inline-input" value="'+p.valor+'" step="0.01" style="width:90px" onchange="NR.setParcelaNota('+i+',\'valor\',this.value)"></td>'
    +'<td><button class="btn btn-sm btn-danger" onclick="NR.removeParcelaNota('+i+')"><i class="fas fa-times"></i></button></td></tr>'
  ).join('');
}
function setParcelaNota(i,campo,valor){if(campo==='valor')lancarNotaParcelas[i][campo]=parseFloat(valor)||0;else lancarNotaParcelas[i][campo]=valor;}
function addParcelaNota(){
  let ult=lancarNotaParcelas[lancarNotaParcelas.length-1]||{vencimento:'',valor:0,descricao:''};
  lancarNotaParcelas.push({vencimento:ult.vencimento,valor:ult.valor,descricao:ult.descricao});
  renderLancarNotaParcelas();
}
function removeParcelaNota(i){lancarNotaParcelas.splice(i,1);renderLancarNotaParcelas();}
function closeLancarNota(){document.getElementById('modalLancarNota').style.display='none';lancarNotaId=null;}
async function confirmarLancarNota(){
  if(!lancarNotaId||!lancarNotaParcelas.length){toast('Nenhuma parcela','error');return;}
  for(let p of lancarNotaParcelas){if(!p.vencimento){toast('Preencha o vencimento de todas as parcelas','error');return;}}
  let r=await api('POST','/api/notas-recebidas/'+lancarNotaId+'/lancar',{
    parcelas:lancarNotaParcelas,
    categoria:document.getElementById('ln-cat').value,
    fornecedor:document.getElementById('ln-forn').value,
    tipo_nota:document.getElementById('ln-nota').value,
    recorrente:document.getElementById('ln-recorrente').checked,
    boleto_chegou:document.getElementById('ln-boleto').checked,
    a_chegar:document.getElementById('ln-achegar').checked,
    fiscal_entrada:document.getElementById('ln-fiscal').checked
  });
  if(r&&r.error){toast('Erro: '+r.error,'error');return;}
  toast((r.criadas||0)+' conta(s) lançada(s)!'+(r.fiscal?' + nota de entrada fiscal':''));
  closeLancarNota();refreshAll();
}
async function ignorarNota(id,status){
  await api('PUT','/api/notas-recebidas/'+id,{status:status});
  toast(status==='ignorada'?'Nota ignorada':'Nota restaurada');
  renderNotasNfe();
}
// Seleção em massa de notas
function toggleAllNotas(checked){document.querySelectorAll('.nfe-sel-cb').forEach(cb=>cb.checked=checked);updateNotasSel();}
function updateNotasSel(){
  let sel=document.querySelectorAll('.nfe-sel-cb:checked').length;
  let el=document.getElementById('nfe-sel-count');
  let bar=document.getElementById('nfe-sel-actions');
  if(el)el.textContent=sel?sel+' selecionada(s)':'';
  if(bar)bar.style.display=sel?'flex':'none';
}
function getNotasSel(){return [...document.querySelectorAll('.nfe-sel-cb:checked')].map(cb=>cb.value);}
async function aprovarNotasSel(){
  let ids=getNotasSel();
  if(!ids.length){toast('Selecione ao menos uma nota','error');return;}
  if(!confirm('Aprovar '+ids.length+' nota(s) e lançar em Contas a Pagar?\n\n• Parcelas com vencimentos e valores do XML de cada nota\n• Todas como D (Dentro) e NÃO recorrentes\n• Nota de entrada lançada automaticamente no Controle Fiscal'))return;
  let r=await api('POST','/api/notas-recebidas/aprovar-multi',{ids});
  if(r&&r.error){toast('Erro: '+r.error,'error');return;}
  let msg=r.aprovadas+' aprovada(s)';
  if(r.duplicadas)msg+=' | '+r.duplicadas+' pulada(s) por possível duplicidade (aprove manualmente)';
  if(r.semXml)msg+=' | '+r.semXml+' aguardando XML';
  toast(msg,r.duplicadas||r.semXml?'info':undefined);
  refreshAll();
}
async function ignorarNotasSel(){
  let ids=getNotasSel();
  if(!ids.length){toast('Selecione ao menos uma nota','error');return;}
  if(!confirm('Ocultar '+ids.length+' nota(s)? Elas saem da lista mas podem ser restauradas.'))return;
  await api('PUT','/api/notas-recebidas-multi',{ids,status:'ignorada'});
  toast(ids.length+' nota(s) ocultada(s)');
  renderNotasNfe();
}
async function baixarXmlNota(id){
  try{
    let hdrs={};if(authToken)hdrs['Authorization']='Bearer '+authToken;hdrs['X-Empresa']=currentEmpresa;
    let r=await fetch('/api/notas-recebidas/'+id+'/xml',{headers:hdrs});
    if(!r.ok){toast('XML não disponível','error');return;}
    let blob=await r.blob();
    let n=notasNfe.find(x=>x.id===id);
    let a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='NFe_'+(n&&n.numero?n.numero+'_':'')+(n?n.chave:id)+'.xml';
    a.click();
    URL.revokeObjectURL(a.href);
  }catch(e){toast('Erro ao baixar XML','error');}
}

// === FORNECEDORES (CADASTRO) ===
let fornecedoresCad=[];
async function renderFornecedoresCad(){
  if(!document.getElementById('fornCadGrid'))return;
  try{fornecedoresCad=await api('GET','/api/fornecedores-cad');}catch(e){fornecedoresCad=[];}
  let busca=(document.getElementById('forn-busca').value||'').toLowerCase();
  let lista=busca?fornecedoresCad.filter(f=>((f.razao||'')+' '+(f.fantasia||'')+' '+(f.cnpj||'')+' '+(f.municipio||'')+' '+(f.telefone||'')+' '+(f.responsavel||'')).toLowerCase().includes(busca)):fornecedoresCad;
  document.getElementById('fornCadGrid').innerHTML=lista.length?lista.map(f=>{
    let tel=f.telefone?'<a href="tel:'+f.telefone.replace(/\D/g,'')+'" style="color:var(--blue)"><i class="fas fa-phone"></i> '+f.telefone+'</a>':'-';
    let mail=f.email?'<a href="mailto:'+f.email+'" style="color:var(--blue)">'+f.email+'</a>':'-';
    let origem=f.origem==='nfe'?'<span title="Cadastrado automaticamente pela nota fiscal" style="color:var(--blue)"><i class="fas fa-magic"></i> NF-e</span>':'<span style="color:var(--text3)">Manual</span>';
    return '<tr><td><b>'+(f.razao||'-')+'</b>'+(f.fantasia?'<br><span style="font-size:11px;color:var(--text3)">'+f.fantasia+'</span>':'')+'</td>'
      +'<td style="white-space:nowrap;font-size:11px">'+fmtCnpj(f.cnpj)+'</td>'
      +'<td style="white-space:nowrap">'+tel+'</td><td>'+mail+'</td><td>'+(f.responsavel||'-')+'</td>'
      +'<td>'+(f.municipio?f.municipio+(f.uf?'/'+f.uf:''):'-')+'</td><td>'+origem+'</td>'
      +'<td style="white-space:nowrap"><button class="btn btn-sm btn-outline" onclick="NR.editFornCad(\''+f.id+'\')" title="Editar / completar dados"><i class="fas fa-edit"></i></button> <button class="btn btn-sm btn-danger" onclick="NR.delFornCad(\''+f.id+'\')"><i class="fas fa-trash"></i></button></td></tr>';
  }).join(''):'<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text3)"><i class="fas fa-address-book" style="font-size:1.6rem;display:block;margin-bottom:8px"></i>'+(busca?'Nenhum fornecedor encontrado na busca.':'Nenhum fornecedor ainda. Eles são cadastrados automaticamente quando as notas chegam.')+'</td></tr>';
}
function openCadForn(){
  ['razao','fantasia','cnpj','telefone','email','responsavel','ie','endereco','municipio','uf','cep','obs'].forEach(k=>document.getElementById('cf-'+k).value='');
  delete document.getElementById('modalCadForn').dataset.editId;
  document.getElementById('cadFornTitulo').innerHTML='<i class="fas fa-address-book"></i> Cadastrar Fornecedor';
  document.getElementById('modalCadForn').style.display='flex';
}
function closeCadForn(){document.getElementById('modalCadForn').style.display='none';}
function editFornCad(id){
  let f=fornecedoresCad.find(x=>x.id===id);if(!f)return;
  document.getElementById('cf-razao').value=f.razao||'';
  document.getElementById('cf-fantasia').value=f.fantasia||'';
  document.getElementById('cf-cnpj').value=f.cnpj||'';
  document.getElementById('cf-telefone').value=f.telefone||'';
  document.getElementById('cf-email').value=f.email||'';
  document.getElementById('cf-responsavel').value=f.responsavel||'';
  document.getElementById('cf-ie').value=f.ie||'';
  document.getElementById('cf-endereco').value=f.endereco||'';
  document.getElementById('cf-municipio').value=f.municipio||'';
  document.getElementById('cf-uf').value=f.uf||'';
  document.getElementById('cf-cep').value=f.cep||'';
  document.getElementById('cf-obs').value=f.observacao||'';
  document.getElementById('modalCadForn').dataset.editId=id;
  document.getElementById('cadFornTitulo').innerHTML='<i class="fas fa-edit"></i> Editar Fornecedor';
  document.getElementById('modalCadForn').style.display='flex';
}
async function salvarCadForn(){
  let dados={
    razao:document.getElementById('cf-razao').value.trim(),
    fantasia:document.getElementById('cf-fantasia').value.trim(),
    cnpj:document.getElementById('cf-cnpj').value.trim(),
    telefone:document.getElementById('cf-telefone').value.trim(),
    email:document.getElementById('cf-email').value.trim(),
    responsavel:document.getElementById('cf-responsavel').value.trim(),
    ie:document.getElementById('cf-ie').value.trim(),
    endereco:document.getElementById('cf-endereco').value.trim(),
    municipio:document.getElementById('cf-municipio').value.trim(),
    uf:document.getElementById('cf-uf').value.trim().toUpperCase(),
    cep:document.getElementById('cf-cep').value.trim(),
    observacao:document.getElementById('cf-obs').value.trim()
  };
  if(!dados.razao){toast('Razão social obrigatória','error');return;}
  let editId=document.getElementById('modalCadForn').dataset.editId;
  if(editId)await api('PUT','/api/fornecedores-cad/'+editId,dados);
  else await api('POST','/api/fornecedores-cad',dados);
  toast(editId?'Fornecedor atualizado!':'Fornecedor cadastrado!');
  closeCadForn();renderFornecedoresCad();
}
async function delFornCad(id){
  if(!confirm('Excluir este fornecedor do cadastro?'))return;
  await api('DELETE','/api/fornecedores-cad/'+id);toast('Excluído!');renderFornecedoresCad();
}

// === ALERTAS DASHBOARD ===
async function renderAlertas(){
  let boxes=[document.getElementById('dashAlertas'),document.getElementById('dashAlertasGeral')].filter(Boolean);
  if(!boxes.length)return;
  try{
    let a=await api('GET','/api/alertas');
    let cards=[];
    if(a.notasNovas)cards.push('<div onclick="document.getElementById(\'nav-notas-nfe\').click()" style="cursor:pointer;flex:1;min-width:220px;background:rgba(59,130,246,.12);border:1px solid var(--blue);border-radius:10px;padding:12px 16px;display:flex;align-items:center;gap:12px"><i class="fas fa-file-download" style="font-size:1.4rem;color:var(--blue)"></i><div><b style="font-size:1.1rem">'+a.notasNovas+'</b> nota(s) fiscal(is) aguardando aprovação</div></div>');
    if(a.boletosHoje.length){
      let tot=a.boletosHoje.reduce((s,c)=>s+(c.valor||0),0);
      cards.push('<div onclick="document.getElementById(\'nav-contas-pagar\').click()" style="cursor:pointer;flex:1;min-width:220px;background:rgba(239,68,68,.12);border:1px solid var(--red);border-radius:10px;padding:12px 16px;display:flex;align-items:center;gap:12px"><i class="fas fa-exclamation-circle" style="font-size:1.4rem;color:var(--red)"></i><div><b style="font-size:1.1rem">'+a.boletosHoje.length+'</b> boleto(s) vencendo <b>HOJE</b> — '+fmt(tot)+'</div></div>');
    }
    if(a.boletosAmanha.length){
      let tot=a.boletosAmanha.reduce((s,c)=>s+(c.valor||0),0);
      cards.push('<div onclick="document.getElementById(\'nav-contas-pagar\').click()" style="cursor:pointer;flex:1;min-width:220px;background:rgba(245,158,11,.12);border:1px solid var(--amber);border-radius:10px;padding:12px 16px;display:flex;align-items:center;gap:12px"><i class="fas fa-clock" style="font-size:1.4rem;color:var(--amber)"></i><div><b style="font-size:1.1rem">'+a.boletosAmanha.length+'</b> boleto(s) vencendo amanhã — '+fmt(tot)+'</div></div>');
    }
    let html=cards.length?'<div style="display:flex;gap:12px;flex-wrap:wrap">'+cards.join('')+'</div>':'';
    boxes.forEach(box=>{if(cards.length){box.innerHTML=html;box.style.display='';}else box.style.display='none';});
  }catch(e){boxes.forEach(box=>box.style.display='none');}
}

// === TELEGRAM ===
function fillTelegramCfg(){
  let el=document.getElementById('tg-token');
  if(!el||document.activeElement===el)return;
  el.value=CFG.tg_token||'';
  let ch=document.getElementById('tg-chatid');
  if(ch&&document.activeElement!==ch)ch.value=CFG.tg_chat_id||'';
  document.getElementById('tg-notif-notas').checked=CFG.tg_notif_notas==='1';
  document.getElementById('tg-notif-boletos').checked=CFG.tg_notif_boletos==='1';
  let re=document.getElementById('rc-empresa');
  if(re&&document.activeElement!==re)re.value=CFG.recibo_empresa||'';
  let rc=document.getElementById('rc-cidade');
  if(rc&&document.activeElement!==rc)rc.value=CFG.recibo_cidade||'';
}
async function salvarTelegram(){
  await api('PUT','/api/config',{
    tg_token:document.getElementById('tg-token').value.trim(),
    tg_chat_id:document.getElementById('tg-chatid').value.trim(),
    tg_notif_notas:document.getElementById('tg-notif-notas').checked?'1':'0',
    tg_notif_boletos:document.getElementById('tg-notif-boletos').checked?'1':'0'
  });
  toast('Configuração do Telegram salva!');
}
async function testarTelegram(){
  await salvarTelegram();
  let r=await api('POST','/api/telegram/testar',{});
  if(r&&r.error)toast('Erro: '+r.error,'error');
  else toast('Mensagem de teste enviada! Confira o Telegram.');
}
async function detectarChatId(){
  let token=document.getElementById('tg-token').value.trim();
  if(!token){toast('Cole o token do bot primeiro','error');return;}
  try{
    let r=await fetch('https://api.telegram.org/bot'+token+'/getUpdates');
    let data=await r.json();
    if(!data.ok){toast('Token inválido','error');return;}
    let msgs=(data.result||[]).filter(u=>u.message&&u.message.chat);
    if(!msgs.length){toast('Mande uma mensagem qualquer para o bot no Telegram e clique de novo','error');return;}
    let chat=msgs[msgs.length-1].message.chat;
    document.getElementById('tg-chatid').value=chat.id;
    toast('Chat ID detectado: '+chat.id+' ('+(chat.first_name||chat.title||'')+')');
  }catch(e){toast('Erro ao consultar Telegram','error');}
}

// === RECIBOS DE PAGAMENTO (FOLHA) ===
function extenso(v){
  v=Math.round((v||0)*100)/100;
  const u=['','um','dois','três','quatro','cinco','seis','sete','oito','nove','dez','onze','doze','treze','quatorze','quinze','dezesseis','dezessete','dezoito','dezenove'];
  const dz=['','','vinte','trinta','quarenta','cinquenta','sessenta','setenta','oitenta','noventa'];
  const ct=['','cento','duzentos','trezentos','quatrocentos','quinhentos','seiscentos','setecentos','oitocentos','novecentos'];
  function ate999(n){
    if(n===0)return'';
    if(n===100)return'cem';
    let s='';const ch=Math.floor(n/100),r=n%100;
    if(ch)s+=ct[ch];
    if(r){if(s)s+=' e ';if(r<20)s+=u[r];else{s+=dz[Math.floor(r/10)];if(r%10)s+=' e '+u[r%10];}}
    return s;
  }
  const intg=Math.floor(v),cent=Math.round((v-intg)*100);
  let partes=[];
  const mi=Math.floor(intg/1000000),ml=Math.floor((intg%1000000)/1000),rs=intg%1000;
  if(mi)partes.push(ate999(mi)+(mi===1?' milhão':' milhões'));
  if(ml)partes.push(ml===1?'mil':ate999(ml)+' mil');
  if(rs)partes.push(ate999(rs));
  let s;
  if(!partes.length)s='zero';
  else if(partes.length===1)s=partes[0];
  else{
    let ult=partes.pop();
    s=partes.join(', ')+((rs&&(rs<100||rs%100===0))?' e ':', ')+ult;
  }
  if(mi&&!ml&&!rs)s+=' de';
  s+=(intg===1?' real':' reais');
  if(cent)s+=' e '+ate999(cent)+(cent===1?' centavo':' centavos');
  return s;
}
const MESES_NOME=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
// Monta as linhas do recibo a partir das verbas do colaborador com valor no mês
function linhasDoRecibo(c){
  let out=[];
  for(const vb of VERBAS){
    let v=valorFolha(c.id,vb.id);
    if(!v)continue;
    out.push({campo:vb.id,label:vb.nome,valor:Math.round((vb.tipo==='desconto'?-v:v)*100)/100});
  }
  return out;
}
function montarReciboHtml(linhas,c){
  let total=Math.round(linhas.reduce((s,l)=>s+(l.valor||0),0)*100)/100;
  let det='';
  linhas.forEach(l=>{
    let neg=l.valor<0;
    det+='<tr><td>'+l.label+(neg?' (−)':'')+'</td><td style="text-align:right">'+(neg?'−':'')+fmt(Math.abs(l.valor))+'</td></tr>';
  });
  det+='<tr class="tot"><td><b>TOTAL</b></td><td style="text-align:right"><b>'+fmt(total)+'</b></td></tr>';
  let sel=document.getElementById('empresaSelector');
  let empNome=(CFG.recibo_empresa||'').trim()||(sel&&sel.options[sel.selectedIndex]?sel.options[sel.selectedIndex].text:'')||document.getElementById('empresaNome').textContent;
  let cidade=((CFG.recibo_cidade||'').trim()||'CARBONITA').toUpperCase();
  let [ano,mesN]=gM().split('-').map(Number);
  let mesRef=MESES_NOME[mesN-1]+' de '+ano;
  let hoje=new Date();
  let dataStr=cidade+', '+hoje.getDate()+' DE '+MESES_NOME[hoje.getMonth()].toUpperCase()+' DE '+hoje.getFullYear();
  return '<div class="recibo">'
    +'<div class="rec-head"><b>RECIBO</b><span class="rec-val">'+fmt(total)+'</span></div>'
    +'<p class="rec-texto">Recebi da <b>'+empNome+'</b>, a importância de <b>'+fmt(total)+'</b> ('+extenso(total)+'), referente ao pagamento salarial do mês de <b>'+mesRef+'</b>.</p>'
    +'<p class="rec-data">'+dataStr+'</p>'
    +'<div class="rec-ass">_____________________________________________<br><b>'+(c?c.nome:'')+'</b>'
    +(c&&c.cpf?'<br>CPF '+c.cpf:'')+(c&&c.rg?'<br>RG '+c.rg:'')+'</div>'
    +'<table class="rec-det">'+det+'</table>'
    +'</div>';
}
function abrirJanelaRecibos(html){
  let w=window.open('','','width=820,height=900');
  w.document.write('<html><head><title>Recibos de Pagamento</title><style>'
    +'body{font-family:Arial,Helvetica,sans-serif;color:#000;background:#fff;padding:24px;font-size:13px}'
    +'.recibo{max-width:700px;margin:0 auto 18px;padding:14px 6px 18px;page-break-inside:avoid;border-bottom:2px dashed #999}'
    +'.rec-head{display:flex;justify-content:space-between;font-size:15px;margin-bottom:10px}'
    +'.rec-val{font-weight:bold}'
    +'.rec-texto{line-height:1.5;margin-bottom:14px;text-align:justify}'
    +'.rec-data{margin:14px 0 26px;font-weight:600}'
    +'.rec-ass{text-align:center;margin-bottom:14px;line-height:1.5}'
    +'.rec-det{width:60%;margin:0 auto;border-collapse:collapse;font-size:12px}'
    +'.rec-det td{padding:2px 8px;border-bottom:1px solid #ddd}'
    +'.rec-det .tot td{border-top:2px solid #000;border-bottom:none;padding-top:5px}'
    +'@media print{.recibo{margin-bottom:10px}}'
    +'</style></head><body>'+html+'</body></html>');
  w.document.close();
  setTimeout(()=>w.print(),400);
}
let reciboLinhasArr=[],reciboColabId=null;
function printReciboFolha(colabId){
  let c=COLABS.find(x=>x.id===colabId);
  if(!c){toast('Colaborador não encontrado','error');return;}
  reciboColabId=c.id;
  reciboLinhasArr=linhasDoRecibo(c);
  if(!reciboLinhasArr.length)reciboLinhasArr=[{campo:'',label:'Salário',valor:0}];
  document.getElementById('reciboColabNome').textContent=c.nome;
  renderReciboLinhas();
  document.getElementById('modalRecibo').style.display='flex';
}
function renderReciboLinhas(){
  document.getElementById('reciboLinhas').innerHTML=reciboLinhasArr.map((l,i)=>
    '<tr><td><input type="text" class="inline-input" value="'+l.label.replace(/"/g,'&quot;')+'" style="width:100%" onchange="NR.setLinhaRecibo('+i+',\'label\',this.value)"></td>'
    +'<td><input type="number" class="inline-input" value="'+l.valor+'" step="0.01" style="width:100px;text-align:right" onchange="NR.setLinhaRecibo('+i+',\'valor\',this.value)"></td>'
    +'<td><button class="btn btn-sm btn-danger" onclick="NR.delLinhaRecibo('+i+')"><i class="fas fa-times"></i></button></td></tr>'
  ).join('');
  atualizarTotalRecibo();
}
function atualizarTotalRecibo(){
  let t=Math.round(reciboLinhasArr.reduce((s,l)=>s+(l.valor||0),0)*100)/100;
  document.getElementById('reciboTotal').textContent=fmt(t);
}
function setLinhaRecibo(i,campo,valor){
  if(campo==='valor')reciboLinhasArr[i].valor=parseFloat(valor)||0;
  else reciboLinhasArr[i].label=valor;
  atualizarTotalRecibo();
}
function addLinhaRecibo(){reciboLinhasArr.push({campo:'',label:'',valor:0});renderReciboLinhas();}
function delLinhaRecibo(i){reciboLinhasArr.splice(i,1);renderReciboLinhas();}
function closeRecibo(){document.getElementById('modalRecibo').style.display='none';}
function imprimirReciboModal(){
  let c=COLABS.find(x=>x.id===reciboColabId);
  abrirJanelaRecibos(montarReciboHtml(reciboLinhasArr.filter(l=>l.valor!==0||l.label),c));
  closeRecibo();
}
function printRecibosMes(){
  let itens=(COLABS||[]).filter(c=>c.ativo&&c.na_folha!==0).map(c=>({linhas:linhasDoRecibo(c),c}))
    .filter(x=>x.linhas.length&&x.linhas.reduce((s,l)=>s+l.valor,0)>0);
  if(!itens.length){toast('Nenhum colaborador com valores na folha deste mês','error');return;}
  let html=itens.map(x=>montarReciboHtml(x.linhas,x.c)).join('');
  abrirJanelaRecibos(html);
}
async function salvarReciboCfg(){
  await api('PUT','/api/config',{
    recibo_empresa:document.getElementById('rc-empresa').value.trim(),
    recibo_cidade:document.getElementById('rc-cidade').value.trim()
  });
  toast('Configuração dos recibos salva!');
  CFG.recibo_empresa=document.getElementById('rc-empresa').value.trim();
  CFG.recibo_cidade=document.getElementById('rc-cidade').value.trim();
}

// === BACKUP COMPLETO ===
let restCompFile=null;
async function baixarBackupCompleto(){
  toast('Gerando backup completo... aguarde','info');
  try{
    let hdrs={};if(authToken)hdrs['Authorization']='Bearer '+authToken;hdrs['X-Empresa']=currentEmpresa;
    let r=await fetch('/api/backup-completo',{headers:hdrs});
    if(!r.ok){let e=await r.json().catch(()=>({}));toast('Erro: '+(e.error||r.status),'error');return;}
    let blob=await r.blob();
    let a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='backup_completo_'+new Date().toISOString().split('T')[0]+'.zip';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Backup completo baixado! Guarde em local seguro (contém todos os dados e certificados).');
  }catch(e){toast('Erro ao gerar backup','error');}
}
function abrirRestauraCompleto(input){
  if(!input.files[0])return;
  restCompFile=input.files[0];
  input.value='';
  document.getElementById('restCompArquivo').innerHTML='<i class="fas fa-file-archive"></i> Arquivo: <b>'+restCompFile.name+'</b> ('+(restCompFile.size/1024/1024).toFixed(1)+' MB)';
  let sel=document.getElementById('empresaSelector');
  document.getElementById('rest-empresa').innerHTML=sel?[...sel.options].map(o=>'<option value="'+o.value+'">'+o.text+'</option>').join(''):'';
  document.querySelector('input[name="rest-modo"][value="tudo"]').checked=true;
  document.getElementById('modalRestauraCompleto').style.display='flex';
}
function closeRestauraCompleto(){document.getElementById('modalRestauraCompleto').style.display='none';restCompFile=null;}
async function confirmarRestauraCompleto(){
  if(!restCompFile){toast('Nenhum arquivo selecionado','error');return;}
  let modo=document.querySelector('input[name="rest-modo"]:checked').value;
  let alvo=modo==='tudo'?'tudo':document.getElementById('rest-empresa').value;
  let msg=modo==='tudo'
    ?'Restaurar TODAS as empresas, usuários e certificados do backup?\n\nOs dados atuais serão substituídos pelos do backup.'
    :'Restaurar somente a empresa "'+alvo+'" do backup?\n\nOs dados atuais dela serão substituídos.';
  if(!confirm(msg))return;
  if(!confirm('Confirma mesmo? Esta ação não tem desfazer.'))return;
  let fd=new FormData();
  fd.append('zip',restCompFile);
  fd.append('modo',alvo);
  try{
    let hdrs={};if(authToken)hdrs['Authorization']='Bearer '+authToken;hdrs['X-Empresa']=currentEmpresa;
    let r=await fetch('/api/backup-completo/restaurar',{method:'POST',headers:hdrs,body:fd});
    let data=await r.json();
    if(data.error){toast('Erro: '+data.error,'error');return;}
    toast('Restaurado: '+data.empresas.join(', ')+(data.extras&&data.extras.length?' + '+data.extras.join(', '):'')+'. Recarregando...');
    setTimeout(()=>location.reload(),2000);
  }catch(e){toast('Erro na restauração','error');}
}

// === BOLETO (BIPE / IMPORTAR PDF) ===
let boletoDest='contas-pagar', boletoDados=null, boletoTimer=null;
function openBoleto(modo,destino){
  boletoDados=null;
  document.getElementById('boleto-linha').value='';
  document.getElementById('boleto-bipe-status').textContent='';
  document.getElementById('boleto-pdf-file').value='';
  document.getElementById('boleto-pdf-nome').textContent='Nenhum arquivo';
  document.getElementById('boleto-pdf-status').textContent='';
  document.getElementById('boleto-dados').style.display='none';
  document.getElementById('boleto-match').style.display='none';
  setBoletoDest(destino==='acerto'?'acerto':'contas-pagar');
  let bipe=modo==='bipe';
  document.getElementById('boleto-entrada-bipe').style.display=bipe?'':'none';
  document.getElementById('boleto-entrada-pdf').style.display=bipe?'none':'';
  document.getElementById('boletoTitulo').innerHTML=bipe?'<i class="fas fa-barcode"></i> Bipar Boleto':'<i class="fas fa-file-pdf"></i> Importar Boleto (PDF)';
  document.getElementById('modalBoleto').style.display='flex';
  if(bipe)setTimeout(()=>document.getElementById('boleto-linha').focus(),100);
}
function closeBoleto(){document.getElementById('modalBoleto').style.display='none';}
function setBoletoDest(d){
  boletoDest=d;
  document.querySelectorAll('.boleto-dest').forEach(el=>{
    let on=el.dataset.dest===d;
    el.style.borderColor=on?'var(--blue)':'var(--border)';
    el.style.background=on?'rgba(59,130,246,.1)':'transparent';
    el.querySelector('input').checked=on;
  });
}
async function analisarBipe(){
  let linha=document.getElementById('boleto-linha').value.replace(/\D/g,'');
  let st=document.getElementById('boleto-bipe-status');
  if(linha.length<44){st.textContent=linha.length?'Aguardando código completo... ('+linha.length+' dígitos)':'';return;}
  st.innerHTML='<i class="fas fa-spinner fa-spin"></i> Lendo código...';
  try{
    let r=await api('POST','/api/boleto/analisar',{linha});
    if(r&&r.error){st.innerHTML='<span style="color:var(--red)">'+r.error+'</span>';return;}
    st.innerHTML='<span style="color:var(--green)"><i class="fas fa-check"></i> Código lido!</span>';
    preencherBoleto(r);
  }catch(e){st.innerHTML='<span style="color:var(--red)">Erro ao ler o código</span>';}
}
async function importarBoletoPdf(file){
  let st=document.getElementById('boleto-pdf-status');
  st.innerHTML='<i class="fas fa-spinner fa-spin"></i> Lendo PDF...';
  let fd=new FormData();fd.append('pdf',file);
  try{
    let hdrs={};if(authToken)hdrs['Authorization']='Bearer '+authToken;hdrs['X-Empresa']=currentEmpresa;
    let r=await fetch('/api/boleto/importar-pdf',{method:'POST',headers:hdrs,body:fd});
    let data=await r.json();
    if(data.error){st.innerHTML='<span style="color:var(--red)">'+data.error+'</span>';return;}
    st.innerHTML='<span style="color:var(--green)"><i class="fas fa-check"></i> Boleto lido!</span>';
    preencherBoleto(data);
  }catch(e){st.innerHTML='<span style="color:var(--red)">Erro ao ler PDF</span>';}
}
function preencherBoleto(d){
  boletoDados=d;
  document.getElementById('bl-forn').value=d.fornecedor||'';
  document.getElementById('bl-valor').value=d.valor||'';
  document.getElementById('bl-venc').value=d.vencimento||'';
  document.getElementById('bl-cat').value='';
  document.getElementById('bl-rec').value='0';
  document.getElementById('bl-nota').value='';
  let desc=(d.fornecedor||'Boleto');
  if(d.nota_numero)desc+=' NF '+d.nota_numero;
  document.getElementById('bl-desc').value=desc;
  let mBox=document.getElementById('boleto-match');
  if(d.match&&d.match.indexOf('nota')>=0){
    mBox.innerHTML='<i class="fas fa-link" style="color:var(--green)"></i> Casou com a nota fiscal <b>'+(d.nota_numero||'')+'</b> de <b>'+(d.fornecedor||'')+'</b>.';
    mBox.style.display='';
  }else if(d.match==='cnpj'){
    mBox.innerHTML='<i class="fas fa-check" style="color:var(--green)"></i> Fornecedor identificado pelo cadastro (CNPJ).';
    mBox.style.display='';
  }else{mBox.style.display='none';}
  document.getElementById('boleto-dados').style.display='';
}
async function salvarBoleto(){
  let forn=document.getElementById('bl-forn').value.trim();
  let valor=parseFloat(document.getElementById('bl-valor').value)||0;
  let venc=document.getElementById('bl-venc').value;
  let cat=document.getElementById('bl-cat').value.trim();
  let desc=document.getElementById('bl-desc').value.trim()||forn||'Boleto';
  let rec=document.getElementById('bl-rec').value==='1';
  let df=document.getElementById('bl-nota').value;
  if(!valor){toast('Informe o valor','error');return;}
  if(!venc){toast('Informe o vencimento','error');return;}
  let linha=(boletoDados&&boletoDados.linha)||'';
  if(boletoDest==='contas-pagar'){
    await api('POST','/api/contas-pagar',{vencimento:venc,descricao:desc,valor:valor,categoria:cat||'Outros',fornecedor:forn,boleto_chegou:true,recorrente:rec,tipo_nota:df,linha_digitavel:linha});
    toast('Boleto lançado em Contas a Pagar!');
  }else{
    await api('POST','/api/acerto',{data:venc,descricao:desc,entrada:0,saida:valor,categoria:cat||'Outros',fornecedor:forn,recorrente:rec,tipo_nota:df});
    toast('Boleto lançado no Acerto (saída)!');
  }
  closeBoleto();refreshAll();
}
document.getElementById('boleto-linha').addEventListener('input',function(){clearTimeout(boletoTimer);boletoTimer=setTimeout(analisarBipe,350);});
document.getElementById('boleto-linha').addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();clearTimeout(boletoTimer);analisarBipe();}});
document.getElementById('boleto-pdf-file').addEventListener('change',function(){if(this.files[0]){document.getElementById('boleto-pdf-nome').textContent=this.files[0].name;importarBoletoPdf(this.files[0]);}});

window.NR={del,delAc,delC,delCP,comp,toggleBoleto,setPago,delCL,delCD,delForn,addCatInline,addFornInline,setAcField,chqBusca,setDest,novaEmpresa,delEmpresa,openChequePag,calcChequePag,closeChequePag,logout,togglePerm,delUser,openSenha,closeSenha,printRecibo,confirmClear,closeConfirmDel,openEditPerms,closeEditPerms,toggleEditPerm,saveEditPerms,updateCxSaldo,delCaixa,setCaixaPago,toggleAllChq,updateChqSelCount,printSelecionados,saveMovConfig,updateMovDif,delMov,exportarPlanilhaGeral,backupDB,restoreDB,baixarModelo,importarPlanilha,openParcelas,closeParcelas,gerarParcelas,addFreteParcela,removeParcela,setParcField,salvarParcelas,marcarChegou,toggleAChegar,renderDashGeral,setCor,setFundo,delFisc,editRow,saveRow,cancelEdit,toggleLembretes,toggleStatusLembrete,delLembrete,backupManual,loadBackupStatus,updateCpBatch,toggleAllCp,limparSelecaoCp,pagarSelecionadas,buscarAuditoria,editVeiculo,delVeiculo,toggleOcultarPagas,closeAuditItem,closeDelParcelas,confirmarDelParcelas,salvarEditParcelas,novaSoma,delSoma,updateSomaTitulo,addSomaItem,addSomaItemAndFocus,updateSomaItem,updateSomaItemQuiet,delSomaItem,switchFolhaTab,setFolhaVal,limparFolhaColab,copiarFolhaMesAnterior,addVerbaCfg,delVerbaCfg,openCadEmp,closeCadEmp,salvarCadEmp,editEmp,quitarEmp,delEmp,openCadColab,closeCadColab,salvarCadColab,editColab,openImportHolerite,closeImportHolerite,uploadHolerites,delHolerite,toggleNaFolha,tirarDaFolha,renderNotasNfe,nfeConsultar,openNfeConfig,closeNfeConfig,salvarNfeConfig,openLancarNota,closeLancarNota,confirmarLancarNota,setParcelaNota,addParcelaNota,removeParcelaNota,ignorarNota,toggleAllNotas,updateNotasSel,aprovarNotasSel,ignorarNotasSel,baixarXmlNota,filtrarNotas,renderFornecedoresCad,openCadForn,closeCadForn,editFornCad,salvarCadForn,delFornCad,salvarTelegram,testarTelegram,detectarChatId,openBoleto,closeBoleto,setBoletoDest,salvarBoleto,baixarBackupCompleto,abrirRestauraCompleto,closeRestauraCompleto,confirmarRestauraCompleto,printReciboFolha,printRecibosMes,salvarReciboCfg,closeRecibo,addLinhaRecibo,delLinhaRecibo,setLinhaRecibo,imprimirReciboModal};
checkAuth();
})();
