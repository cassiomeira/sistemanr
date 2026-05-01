(function(){
'use strict';
let CFG={pctAdmin:23,pctDono:36,pctReserva:30,categoriasLoja:[],categoriasDrog:[]},COLABS=[];
let currentEmpresa='nunesrocha';
let empresasList=[],chequePagContaId='',chequePagContas=[];
let currentUser=null,authToken=localStorage.getItem('authToken')||'';
const MENU_MAP={'dashboard':'Painel Geral','acerto':'Acerto Financeiro','fat':'Fat (Recorrentes)','contas-pagar':'Contas a Pagar','movimentacao':'Movimentação','drogaria':'Drogaria','cheques':'Troca de Cheques','conta-dono':'Conta do Celso','distribuicao':'Distribuição','colaboradores':'Comissionados','relatorios':'Relatórios','configuracoes':'Configurações','caixas':'Caixas','usuarios':'Usuários'};
const MENU_ICONS={'dashboard':'fa-chart-pie','acerto':'fa-cash-register','fat':'fa-redo','contas-pagar':'fa-file-invoice-dollar','movimentacao':'fa-exchange-alt','drogaria':'fa-pills','cheques':'fa-money-check-alt','conta-dono':'fa-user-tie','distribuicao':'fa-percentage','colaboradores':'fa-users','relatorios':'fa-file-alt','configuracoes':'fa-cog','caixas':'fa-cash-register','usuarios':'fa-users-cog'};
const COLORS=['#00d4aa','#3b82f6','#f59e0b','#ec4899','#8b5cf6','#06b6d4','#f43f5e','#14b8a6','#6366f1'];
function fmt(v){return'R$ '+Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});}
function fD(d){if(!d)return'-';let p=d.split('-');return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:d;}
function gM(){return document.getElementById('monthSelector').value;}
function toast(m,t){t=t||'success';let c=document.getElementById('toastContainer'),e=document.createElement('div');e.className='toast toast-'+t;e.textContent=m;c.appendChild(e);setTimeout(()=>e.remove(),3000);}
async function api(method,path,body){
  const o={method,headers:{'Content-Type':'application/json','X-Empresa':currentEmpresa}};
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
async function loadEmpresas(){
  empresasList=await api('GET','/api/empresas');
  let sel=document.getElementById('empresaSelector');
  sel.innerHTML=empresasList.map(e=>'<option value="'+e.slug+'"'+(e.slug===currentEmpresa?' selected':'')+'>'+e.nome+'</option>').join('');
  let emp=empresasList.find(e=>e.slug===currentEmpresa);
  document.getElementById('empresaNome').textContent=emp?emp.nome:'Sistema';
  document.title=(emp?emp.nome:'Sistema')+' — Controle Financeiro';
}
document.getElementById('empresaSelector').addEventListener('change',function(){
  currentEmpresa=this.value;
  let emp=empresasList.find(e=>e.slug===currentEmpresa);
  document.getElementById('empresaNome').textContent=emp?emp.nome:'Sistema';
  document.title=(emp?emp.nome:'Sistema')+' — Controle Financeiro';
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
  tb.innerHTML=items.map(i=>{
    te+=i.entrada||0;ts+=i.saida||0;
    let catSel='<select class="inline-select" onchange="NR.setAcField(\''+i.id+'\',\'categoria\',this.value)">'+CFG.categoriasLoja.map(c=>'<option'+(c===i.categoria?' selected':'')+'>'+c+'</option>').join('')+'</select>';
    let fornSel='<select class="inline-select" onchange="NR.setAcField(\''+i.id+'\',\'fornecedor\',this.value)"><option value=""'+((!i.fornecedor||i.fornecedor==='')?' selected':'')+'>—</option>'+(CFG.fornecedores||[]).map(f=>'<option'+(f===i.fornecedor?' selected':'')+'>'+f+'</option>').join('')+'</select>';
    let recSel='<select class="inline-select" onchange="NR.setAcField(\''+i.id+'\',\'recorrente\',this.value)"><option value="0"'+(i.recorrente?'':' selected')+'>Não</option><option value="1"'+(i.recorrente?' selected':'')+'>Sim</option></select>';
    let dfSel='<select class="inline-select" onchange="NR.setAcField(\''+i.id+'\',\'tipo_nota\',this.value)"><option value=""'+(!i.tipo_nota?' selected':'')+'>—</option><option value="D"'+(i.tipo_nota==='D'?' selected':'')+'>D</option><option value="F"'+(i.tipo_nota==='F'?' selected':'')+'>F</option></select>';
    return'<tr><td>'+fD(i.data)+'</td><td>'+i.descricao+'</td><td class="tipo-entrada">'+(i.entrada?fmt(i.entrada):'')+'</td><td class="tipo-saida">'+(i.saida?fmt(i.saida):'')+'</td><td>'+catSel+'</td><td>'+fornSel+'</td><td>'+recSel+'</td><td>'+dfSel+'</td><td><button class="btn btn-sm btn-danger" onclick="NR.delAc(\''+i.id+'\')"><i class="fas fa-trash"></i></button></td></tr>';}).join('');
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
  document.querySelector('#tabelaFat tbody').innerHTML=items.map(i=>{total+=i.saida||0;return'<tr><td>'+fD(i.data)+'</td><td>'+i.descricao+'</td><td class="tipo-saida">'+fmt(i.saida)+'</td><td>'+i.categoria+'</td></tr>';}).join('');
  document.getElementById('fat-total').textContent=fmt(total);
  // Chart por categoria
  let catMap={};items.forEach(i=>{let c=i.categoria||'Outros';catMap[c]=(catMap[c]||0)+(i.saida||0);});
  let cats=Object.entries(catMap).map(([k,v])=>({categoria:k,total:v})).sort((a,b)=>b.total-a.total);
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
    return'<tr class="'+cls+'"><td>'+fD(i.vencimento)+'</td><td>'+i.descricao+'</td><td>'+fmt(i.valor)+'</td><td>'+i.categoria+'</td><td>'+(i.fornecedor||'—')+'</td><td>'+(i.recorrente?'Sim':'Não')+'</td><td>'+(i.tipo_nota||'—')+'</td><td><button class="inline-toggle '+(i.boleto_chegou?'is-yes':'is-no')+'" onclick="NR.toggleBoleto(\''+i.id+'\','+(!i.boleto_chegou?1:0)+')">'+(i.boleto_chegou?'Sim':'Não')+'</button></td><td><select class="inline-select" onchange="NR.setPago(\''+i.id+'\',this.value)">'+colabOpts.replace('value="'+(i.pago_por||'')+'"','value="'+(i.pago_por||'')+'" selected')+'</select></td><td>'+cxSel+'</td><td>'+chqBtn+'<button class="btn btn-sm btn-danger" onclick="NR.delCP(\''+i.id+'\')"><i class="fas fa-trash"></i></button></td></tr>';
  }).join('');
  document.getElementById('cp-total-pend').textContent=fmt(tp);
  document.getElementById('cp-total-pago').textContent=fmt(tpg);
}
// PAGAR COM CHEQUE (MODAL)
async function openChequePag(contaId){
  let conta=chequePagContas.find(c=>c.id===contaId);
  if(!conta){toast('Conta não encontrada','error');return;}
  chequePagContaId=contaId;
  document.getElementById('chequePagInfo').innerHTML=
    '<div class="cpag-info-line"><span>Descrição:</span><b>'+conta.descricao+'</b></div>'+
    '<div class="cpag-info-line"><span>Fornecedor:</span><b>'+(conta.fornecedor||'—')+'</b></div>'+
    '<div class="cpag-info-line"><span>Valor da Conta:</span><b style="color:var(--red);font-size:1.1rem">'+fmt(conta.valor)+'</b></div>';
  let cheques=await api('GET','/api/cheques');
  let pendentes=cheques.filter(c=>c.status==='pendente');
  let sel=document.getElementById('chequePagSelect');
  sel.innerHTML='<option value="">— Selecione um cheque —</option>'+pendentes.map(c=>
    '<option value="'+c.id+'" data-valor="'+c.valor+'">'+(c.numero?'Nº '+c.numero+' — ':'')+c.cliente+(c.dono_cheque?' ('+c.dono_cheque+')':'')+' — '+fmt(c.valor)+(c.bom_para?' (Bom p/ '+fD(c.bom_para)+')':'')+' ['+c.dias+'d]</option>').join('');
  sel.dataset.contaValor=conta.valor;
  sel.dataset.contaForn=conta.fornecedor||conta.descricao;
  document.getElementById('chequePagCalc').style.display='none';
  document.getElementById('btnConfirmChequePag').disabled=true;
  document.getElementById('modalCheque').style.display='flex';
}
function calcChequePag(){
  let sel=document.getElementById('chequePagSelect'),calc=document.getElementById('chequePagCalc'),btn=document.getElementById('btnConfirmChequePag');
  if(!sel.value){calc.style.display='none';btn.disabled=true;return;}
  let opt=sel.options[sel.selectedIndex];
  let chequeV=parseFloat(opt.dataset.valor)||0,contaV=parseFloat(sel.dataset.contaValor)||0;
  let resto=contaV-chequeV;
  calc.style.display='';
  btn.disabled=false;
  calc.innerHTML='<div class="cpag-calc-box">'+
    '<div class="cpag-calc-line"><span>Valor da Conta:</span><b style="color:var(--text)">'+fmt(contaV)+'</b></div>'+
    '<div class="cpag-calc-line"><span>Valor do Cheque:</span><b style="color:var(--green)">- '+fmt(chequeV)+'</b></div>'+
    '<div class="cpag-calc-line result"><span>'+(resto>0?'💵 Pagar em Dinheiro:':'✅ Cheque cobre tudo')+'</span><b style="color:'+(resto>0?'var(--amber)':'var(--green)')+'">'+
    (resto>0?fmt(resto):(resto<0?'Troco: '+fmt(Math.abs(resto)):'R$ 0,00'))+'</b></div></div>';
}
async function confirmChequePag(){
  let sel=document.getElementById('chequePagSelect');
  if(!sel.value||!chequePagContaId)return;
  let chequeId=sel.value,forn=sel.dataset.contaForn;
  let opt=sel.options[sel.selectedIndex];
  let chequeV=parseFloat(opt.dataset.valor)||0,contaV=parseFloat(sel.dataset.contaValor)||0;
  let resto=contaV-chequeV;
  await api('PUT','/api/cheques/'+chequeId+'/destino',{destino:forn});
  let pagLabel='Cheque'+(opt.text.includes('Nº')?' '+opt.text.split('—')[0].trim():'');
  await api('PUT','/api/contas-pagar/'+chequePagContaId,{pago_por:pagLabel});
  closeChequePag();
  let msg='Conta paga com cheque!';
  if(resto>0)msg+=' Falta '+fmt(resto)+' em dinheiro.';
  toast(msg);refreshAll();
}
function closeChequePag(){document.getElementById('modalCheque').style.display='none';chequePagContaId='';}
document.getElementById('chequePagSelect').addEventListener('change',calcChequePag);
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
async function renderDistribuicao(){let d=await api('GET','/api/dashboard?mes='+gM()),s=d.summary,c=d.config,co=d.colaboradores;let ll=s.lojaEnt-s.lojaSai,lt=ll+(s.drogEnt-s.drogSai)+s.chqLucro;let vA=lt*c.pctAdmin/100,vD=lt*c.pctDono/100,vR=lt*c.pctReserva/100,tc=0;co.forEach(x=>tc+=ll*x.percentual/100);document.getElementById('distribGrid').innerHTML='<div class="distrib-item"><div class="distrib-bar" style="--pct:'+c.pctAdmin+'%;--clr:#00d4aa"><span>'+c.pctAdmin+'%</span></div><p>Cássio</p><h2>'+fmt(vA)+'</h2></div><div class="distrib-item"><div class="distrib-bar" style="--pct:'+c.pctDono+'%;--clr:#f59e0b"><span>'+c.pctDono+'%</span></div><p>Celso</p><h2>'+fmt(vD)+'</h2></div><div class="distrib-item"><div class="distrib-bar" style="--pct:'+c.pctReserva+'%;--clr:#6366f1"><span>'+c.pctReserva+'%</span></div><p>Reserva</p><h2>'+fmt(vR)+'</h2></div><div class="distrib-item" style="border-color:var(--pink)"><p>Comissões</p><h2 style="color:var(--pink)">'+fmt(tc)+'</h2><small style="color:var(--text3)">Base: Lucro Loja</small></div>';let h='<div class="line"><span>Receita Loja</span><b>'+fmt(s.lojaEnt)+'</b></div><div class="line"><span>(-) Despesas</span><b>'+fmt(s.lojaSai)+'</b></div><div class="line"><span>= Lucro Loja</span><b>'+fmt(ll)+'</b></div><div class="line"><span>Lucro Drogaria</span><b>'+fmt(s.drogEnt-s.drogSai)+'</b></div><div class="line"><span>Lucro Cheques</span><b>'+fmt(s.chqLucro)+'</b></div><div class="line total"><span>LUCRO TOTAL</span><b>'+fmt(lt)+'</b></div>';co.forEach(x=>h+='<div class="line comissao"><span>→ '+x.nome+' ('+x.percentual+'%)</span><b>'+fmt(ll*x.percentual/100)+'</b></div>');document.getElementById('calcSummary').innerHTML=h;}
// DASHBOARD
async function renderDashboard(){let d=await api('GET','/api/dashboard?mes='+gM()),s=d.summary,c=d.config,co=d.colaboradores,caixas=d.caixas||[];let ll=s.lojaEnt-s.lojaSai,lt=ll+(s.drogEnt-s.drogSai)+s.chqLucro,tc=0;co.forEach(x=>tc+=ll*x.percentual/100);document.getElementById('dash-receita-loja').textContent=fmt(ll);document.getElementById('dash-receita-drogaria').textContent=fmt(s.drogEnt-s.drogSai);document.getElementById('dash-lucro-cheques').textContent=fmt(s.chqLucro);document.getElementById('dash-lucro-total').textContent=fmt(lt);document.getElementById('dash-parte-admin').textContent=fmt(lt*c.pctAdmin/100);document.getElementById('dash-parte-dono').textContent=fmt(lt*c.pctDono/100);document.getElementById('dash-parte-colab').textContent=fmt(tc);document.getElementById('dash-reserva').textContent=fmt(lt*c.pctReserva/100);document.getElementById('dash-label-admin').textContent='Parte Cássio ('+c.pctAdmin+'%)';document.getElementById('dash-label-dono').textContent='Parte Celso ('+c.pctDono+'%)';let sd=s.donoDeb-s.donoCred,el=document.getElementById('dash-saldo-dono');el.textContent=fmt(Math.abs(sd))+(sd>0?' (Celso deve)':sd<0?' (Empresa deve)':' (Zerado)');el.style.color=sd>0?'var(--red)':'var(--green)';
  // Caixas no dashboard
  let dc=document.getElementById('dashCaixasCards');
  if(!caixas.length){dc.innerHTML='<p style="color:var(--text3)">Nenhum caixa cadastrado</p>';return;}
  dc.innerHTML=caixas.map(cx=>{let cor=cx.saldo>=0?'card-green':'card-red';return'<div class="card '+cor+'"><div class="card-icon"><i class="fas fa-cash-register"></i></div><div class="card-info"><span class="card-label">'+cx.nome+'</span><span class="card-value">'+fmt(cx.saldo)+'</span></div></div>';}).join('');
}
// CONFIG
async function renderConfig(){CFG=await api('GET','/api/config');document.getElementById('cfg-pct-admin').value=CFG.pctAdmin;document.getElementById('cfg-pct-dono').value=CFG.pctDono;document.getElementById('cfg-pct-reserva').value=CFG.pctReserva;let t=CFG.pctAdmin+CFG.pctDono+CFG.pctReserva;document.getElementById('cfg-pct-total').value=t.toFixed(1)+'%'+(t===100?' ✓':t<100?' (falta '+(100-t).toFixed(1)+'%)':' (excede)');document.getElementById('catLojaList').innerHTML=CFG.categoriasLoja.map((c,i)=>'<div class="tag-item"><span>'+c+'</span><button class="tag-remove" onclick="NR.delCL('+i+')"><i class="fas fa-times"></i></button></div>').join('');document.getElementById('catDrogList').innerHTML=CFG.categoriasDrog.map((c,i)=>'<div class="tag-item"><span>'+c+'</span><button class="tag-remove" onclick="NR.delCD('+i+')"><i class="fas fa-times"></i></button></div>').join('');populateCats();}
document.getElementById('formPercentuais').addEventListener('submit',async function(e){e.preventDefault();await api('PUT','/api/config',{pctAdmin:parseFloat(document.getElementById('cfg-pct-admin').value),pctDono:parseFloat(document.getElementById('cfg-pct-dono').value),pctReserva:parseFloat(document.getElementById('cfg-pct-reserva').value)});toast('Salvo!');refreshAll();});
document.getElementById('formCatLoja').addEventListener('submit',async function(e){e.preventDefault();let v=document.getElementById('cfg-cat-loja').value.trim();if(!v)return;CFG.categoriasLoja.push(v);await api('PUT','/api/config',{categoriasLoja:CFG.categoriasLoja});document.getElementById('cfg-cat-loja').value='';toast('Adicionada!');refreshAll();});
document.getElementById('formCatDrog').addEventListener('submit',async function(e){e.preventDefault();let v=document.getElementById('cfg-cat-drog').value.trim();if(!v)return;CFG.categoriasDrog.push(v);await api('PUT','/api/config',{categoriasDrog:CFG.categoriasDrog});document.getElementById('cfg-cat-drog').value='';toast('Adicionada!');refreshAll();});
// ACTIONS
async function del(c,id){if(!confirm('Excluir?'))return;await api('DELETE','/api/'+c+'/'+id);toast('Excluído!','info');refreshAll();}
async function delAc(id){if(!confirm('Excluir?'))return;await api('DELETE','/api/acerto/'+id);toast('Excluído!','info');refreshAll();}
async function delC(id){if(!confirm('Remover?'))return;await api('DELETE','/api/colaboradores/'+id);toast('Removido!','info');refreshAll();}
async function delCP(id){if(!confirm('Excluir?'))return;await api('DELETE','/api/contas-pagar/'+id);toast('Excluído!','info');refreshAll();}
async function comp(id){await api('PUT','/api/cheques/'+id+'/compensar');toast('Compensado!');refreshAll();}
async function toggleBoleto(id,v){await api('PUT','/api/contas-pagar/'+id,{boleto_chegou:v});refreshAll();}
async function setPago(id,v){await api('PUT','/api/contas-pagar/'+id,{pago_por:v});toast(v&&v!=='A Pagar'?'Pago por '+v:'Status atualizado');refreshAll();}
async function setAcField(id,campo,valor){let body={};if(campo==='recorrente')body.recorrente=valor==='1';else body[campo]=valor;await api('PUT','/api/acerto/'+id,body);}
async function delCL(i){CFG.categoriasLoja.splice(i,1);await api('PUT','/api/config',{categoriasLoja:CFG.categoriasLoja});refreshAll();}
async function delCD(i){CFG.categoriasDrog.splice(i,1);await api('PUT','/api/config',{categoriasDrog:CFG.categoriasDrog});refreshAll();}
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
// REFRESH
async function refreshAll(){await renderConfig();COLABS=await api('GET','/api/colaboradores');await Promise.all([renderAcerto(),renderFat(),renderContasPagar(),renderDrogaria(),renderCheques(),renderContaDono(),renderColaboradores(),renderCaixas(),renderMovimentacao()]);await Promise.all([renderDistribuicao(),renderDashboard()]);if(currentUser&&currentUser.role==='admin')renderUsuarios();}
// === USUÁRIOS ===
const ALL_PERMS=['dashboard','acerto','fat','contas-pagar','movimentacao','drogaria','cheques','conta-dono','distribuicao','colaboradores','relatorios','configuracoes','caixas'];
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
function openSenha(){document.getElementById('modalSenha').style.display='flex';document.getElementById('pwd-atual').value='';document.getElementById('pwd-nova').value='';document.getElementById('pwd-confirma').value='';document.getElementById('pwd-erro').style.display='none';}
function closeSenha(){document.getElementById('modalSenha').style.display='none';}
document.getElementById('formAlterarSenha').addEventListener('submit',async function(e){
  e.preventDefault();
  let errEl=document.getElementById('pwd-erro');errEl.style.display='none';
  let atual=document.getElementById('pwd-atual').value,nova=document.getElementById('pwd-nova').value,confirma=document.getElementById('pwd-confirma').value;
  if(nova!==confirma){errEl.textContent='As senhas não coincidem';errEl.style.display='block';return;}
  if(nova.length<3){errEl.textContent='Senha deve ter pelo menos 3 caracteres';errEl.style.display='block';return;}
  try{
    let resp=await fetch('/api/me/senha',{method:'PUT',headers:{'Content-Type':'application/json','Authorization':'Bearer '+authToken},body:JSON.stringify({senhaAtual:atual,senhaNova:nova})});
    let data=await resp.json();
    if(!resp.ok){errEl.textContent=data.error||'Erro ao alterar senha';errEl.style.display='block';return;}
    closeSenha();toast('Senha alterada com sucesso!');
  }catch(err){errEl.textContent='Erro de conexão';errEl.style.display='block';}
});
// === MOVIMENTAÇÃO ===
document.getElementById('formMov').addEventListener('submit',async function(e){
  e.preventDefault();
  let ent=parseFloat(document.getElementById('mov-entrada').value)||0;
  let sai=parseFloat(document.getElementById('mov-saida').value)||0;
  if(!ent&&!sai){toast('Preencha entrada ou saída','error');return;}
  await api('POST','/api/movimentacao',{data:document.getElementById('mov-data').value,descricao:document.getElementById('mov-desc').value,entrada:ent,saida:sai});
  this.reset();setToday('mov-data');document.getElementById('mov-entrada').value='0';document.getElementById('mov-saida').value='0';
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
  let rows='<tr style="background:var(--bg3);font-weight:bold"><td>—</td><td>Saldo anterior</td><td></td><td></td><td class="tipo-entrada">'+fmt(saldoAnt)+'</td><td></td></tr>';
  items.forEach(i=>{
    totalEnt+=i.entrada;totalSai+=i.saida;
    running+=i.entrada-i.saida;
    let dia=i.data.split('-')[2];
    rows+='<tr><td>'+parseInt(dia)+'</td><td>'+i.descricao+'</td>'
      +'<td class="tipo-entrada">'+(i.entrada?fmt(i.entrada):'')+'</td>'
      +'<td class="tipo-saida">'+(i.saida?fmt(i.saida):'')+'</td>'
      +'<td style="font-weight:bold">'+fmt(running)+'</td>'
      +'<td><button class="btn btn-sm btn-danger" onclick="NR.delMov(\''+i.id+'\')"><i class="fas fa-trash"></i></button></td></tr>';
  });
  if(dif!==0){
    rows+='<tr style="background:rgba(245,158,11,0.1);font-weight:bold"><td>—</td><td>Diferença do caixa</td><td class="'+(dif>0?'tipo-entrada':'tipo-saida')+'">'+fmt(Math.abs(dif))+'</td><td></td><td style="font-weight:bold;color:var(--amber)">'+fmt(running+dif)+'</td><td></td></tr>';
  }
  tb.innerHTML=rows||'<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text3)">Nenhum lançamento</td></tr>';
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
  if(parseInt(caixaId)===0)return;
  if(!confirm('Debitar o valor desta conta do caixa selecionado?'))return;
  await api('PUT','/api/contas-pagar/'+contaId,{caixa_id:caixaId});
  toast('Valor debitado do caixa!');refreshAll();
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
window.NR={del,delAc,delC,delCP,comp,toggleBoleto,setPago,delCL,delCD,addCatInline,addFornInline,setAcField,chqBusca,setDest,novaEmpresa,delEmpresa,openChequePag,closeChequePag,logout,togglePerm,delUser,openSenha,closeSenha,printRecibo,confirmClear,closeConfirmDel,openEditPerms,closeEditPerms,toggleEditPerm,saveEditPerms,updateCxSaldo,delCaixa,setCaixaPago,toggleAllChq,updateChqSelCount,printSelecionados,saveMovConfig,delMov};
checkAuth();
})();
