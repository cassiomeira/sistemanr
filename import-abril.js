async function post(data) {
  const res = await fetch('http://localhost:3000/api/acerto', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Empresa': 'nunesrocha' },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

const entries = [
// Dia 1
{dia:1,desc:'caixa',entrada:13919.83,saida:0,rec:false,df:'',cat:'Outros'},
{dia:1,desc:'ST.Whirlpool Nf:5103466',entrada:0,saida:455.03,rec:false,df:'D',cat:'Equipamentos'},
{dia:1,desc:'Itatiaia',entrada:0,saida:11961.57,rec:true,df:'D',cat:'Fornecedor'},
{dia:1,desc:'ST Atlas NF:30588',entrada:0,saida:514.60,rec:true,df:'D',cat:'Fornecedor'},
{dia:1,desc:'frete lopas',entrada:0,saida:133.93,rec:true,df:'D',cat:'Fornecedor'},
{dia:1,desc:'lopas',entrada:0,saida:460.39,rec:false,df:'F',cat:'Fornecedor'},
{dia:1,desc:'novo horizonte frete',entrada:0,saida:164.13,rec:false,df:'F',cat:'Fornecedor'},
{dia:1,desc:'Gazin',entrada:0,saida:6889.00,rec:false,df:'F',cat:'Fornecedor'},
{dia:1,desc:'Gazin',entrada:0,saida:944.79,rec:false,df:'',cat:'Fornecedor'},
{dia:1,desc:'bom pastor',entrada:0,saida:6161.72,rec:false,df:'',cat:'Fornecedor'},
{dia:1,desc:'lopas',entrada:0,saida:5597.36,rec:false,df:'',cat:'Fornecedor'},
{dia:1,desc:'mor',entrada:0,saida:2374.25,rec:false,df:'',cat:'Fornecedor'},
{dia:1,desc:'jcm',entrada:0,saida:3091.72,rec:false,df:'',cat:'Fornecedor'},
{dia:1,desc:'propaganda painel',entrada:0,saida:227.50,rec:false,df:'',cat:'Outros'},
{dia:1,desc:'propaganda tv',entrada:0,saida:130.00,rec:false,df:'',cat:'Outros'},
{dia:1,desc:'lopas frete',entrada:0,saida:1339.65,rec:false,df:'',cat:'Fornecedor'},
{dia:1,desc:'papel eva',entrada:0,saida:9.96,rec:false,df:'',cat:'Outros'},
{dia:1,desc:'tarifa banco do brasil',entrada:0,saida:3.85,rec:false,df:'',cat:'Outros'},
// Dia 2
{dia:2,desc:'caixa',entrada:18563.41,saida:0,rec:false,df:'',cat:'Outros'},
{dia:2,desc:'colaboradores',entrada:0,saida:58404.21,rec:false,df:'',cat:'Salário'},
{dia:2,desc:'Itatiaia',entrada:0,saida:959.29,rec:false,df:'',cat:'Fornecedor'},
{dia:2,desc:'Itatiaia',entrada:0,saida:930.95,rec:false,df:'',cat:'Fornecedor'},
{dia:2,desc:'Itatiaia',entrada:0,saida:2618.43,rec:false,df:'',cat:'Fornecedor'},
{dia:2,desc:'Pandin',entrada:0,saida:1687.13,rec:false,df:'',cat:'Fornecedor'},
{dia:2,desc:'internet',entrada:0,saida:71.43,rec:false,df:'',cat:'Internet'},
{dia:2,desc:'aciac',entrada:0,saida:81.05,rec:false,df:'',cat:'Outros'},
{dia:2,desc:'Electrolux',entrada:0,saida:677.93,rec:false,df:'',cat:'Fornecedor'},
{dia:2,desc:'Ponto Magico',entrada:0,saida:3173.11,rec:false,df:'',cat:'Fornecedor'},
{dia:2,desc:'lopas',entrada:0,saida:4603.67,rec:false,df:'',cat:'Fornecedor'},
{dia:2,desc:'Britania',entrada:0,saida:2470.69,rec:false,df:'',cat:'Fornecedor'},
{dia:2,desc:'Britania',entrada:0,saida:1142.01,rec:false,df:'',cat:'Fornecedor'},
{dia:2,desc:'Britania',entrada:0,saida:1306.33,rec:false,df:'',cat:'Fornecedor'},
{dia:2,desc:'internews',entrada:0,saida:567.35,rec:false,df:'',cat:'Fornecedor'},
{dia:2,desc:'Pandin',entrada:0,saida:1561.24,rec:false,df:'',cat:'Fornecedor'},
{dia:2,desc:'colormaq',entrada:0,saida:588.47,rec:false,df:'',cat:'Fornecedor'},
{dia:2,desc:'colormaq',entrada:0,saida:2620.76,rec:false,df:'',cat:'Fornecedor'},
{dia:2,desc:'mor',entrada:0,saida:2548.12,rec:false,df:'',cat:'Fornecedor'},
{dia:2,desc:'mor',entrada:0,saida:6340.68,rec:false,df:'',cat:'Fornecedor'},
{dia:2,desc:'colormaq',entrada:0,saida:4176.50,rec:false,df:'',cat:'Fornecedor'},
{dia:2,desc:'whirlpool',entrada:0,saida:18437.51,rec:false,df:'',cat:'Fornecedor'},
{dia:2,desc:'whirlpool',entrada:0,saida:12378.79,rec:false,df:'',cat:'Fornecedor'},
{dia:2,desc:'Taiff',entrada:0,saida:1528.24,rec:false,df:'',cat:'Fornecedor'},
{dia:2,desc:'ventisol',entrada:0,saida:3026.50,rec:false,df:'',cat:'Fornecedor'},
{dia:2,desc:'Atlas',entrada:0,saida:1449.06,rec:false,df:'',cat:'Fornecedor'},
{dia:2,desc:'serasa',entrada:0,saida:167.19,rec:false,df:'',cat:'Outros'},
{dia:2,desc:'tarifa banco do brasil',entrada:0,saida:6.00,rec:false,df:'',cat:'Outros'},
// Dia 4
{dia:4,desc:'caixa',entrada:9611.30,saida:0,rec:false,df:'',cat:'Outros'},
{dia:4,desc:'frete colormaq',entrada:0,saida:674.08,rec:false,df:'',cat:'Fornecedor'},
{dia:4,desc:'papel eva',entrada:0,saida:4.98,rec:false,df:'',cat:'Outros'},
{dia:4,desc:'papel eva',entrada:0,saida:7.47,rec:false,df:'',cat:'Outros'},
{dia:4,desc:'linha nylon',entrada:0,saida:12.90,rec:false,df:'',cat:'Outros'},
{dia:4,desc:'internews (Fabricio)',entrada:0,saida:300.00,rec:false,df:'',cat:'Outros'},
{dia:4,desc:'papel eva',entrada:0,saida:18.96,rec:false,df:'',cat:'Outros'},
// Dia 6
{dia:6,desc:'caixa',entrada:30227.46,saida:0,rec:false,df:'',cat:'Outros'},
{dia:6,desc:'paropas',entrada:0,saida:5641.12,rec:false,df:'',cat:'Fornecedor'},
{dia:6,desc:'Pandin',entrada:0,saida:1561.24,rec:false,df:'',cat:'Fornecedor'},
{dia:6,desc:'Taiff',entrada:0,saida:1508.24,rec:false,df:'',cat:'Fornecedor'},
{dia:6,desc:'Electrolux',entrada:0,saida:395.54,rec:false,df:'',cat:'Fornecedor'},
{dia:6,desc:'colormaq',entrada:0,saida:1441.95,rec:false,df:'',cat:'Fornecedor'},
{dia:6,desc:'lopas',entrada:0,saida:419.00,rec:false,df:'',cat:'Fornecedor'},
{dia:6,desc:'bom pastor',entrada:0,saida:5614.33,rec:false,df:'',cat:'Fornecedor'},
{dia:6,desc:'lopas',entrada:0,saida:5100.00,rec:false,df:'',cat:'Fornecedor'},
{dia:6,desc:'alimentação (café da manhã)',entrada:0,saida:175.00,rec:false,df:'',cat:'Outros'},
{dia:6,desc:'ST Whirlpool Nf:5140347',entrada:0,saida:3073.30,rec:false,df:'',cat:'Fornecedor'},
{dia:6,desc:'whirlpool',entrada:0,saida:1779.70,rec:false,df:'',cat:'Fornecedor'},
{dia:6,desc:'recarga midias',entrada:0,saida:20.00,rec:false,df:'',cat:'Outros'},
{dia:6,desc:'Férias Stephany',entrada:0,saida:1991.14,rec:false,df:'',cat:'Salário'},
{dia:6,desc:'Férias Nicole',entrada:0,saida:1991.14,rec:false,df:'',cat:'Salário'},
{dia:6,desc:'Papel toalha',entrada:0,saida:7.30,rec:false,df:'',cat:'Outros'},
{dia:6,desc:'radio lider',entrada:0,saida:299.00,rec:false,df:'',cat:'Outros'},
{dia:6,desc:'Multilaser',entrada:0,saida:3139.30,rec:false,df:'',cat:'Fornecedor'},
{dia:6,desc:'rollu',entrada:0,saida:5729.05,rec:false,df:'',cat:'Fornecedor'},
{dia:6,desc:'tarifa banco do brasil',entrada:0,saida:19.25,rec:false,df:'',cat:'Outros'},
// Dia 7
{dia:7,desc:'caixa',entrada:21732.17,saida:0,rec:false,df:'',cat:'Outros'},
{dia:7,desc:'fujioka',entrada:0,saida:1346.12,rec:false,df:'',cat:'Fornecedor'},
{dia:7,desc:'banner (Piaza)',entrada:0,saida:200.00,rec:false,df:'',cat:'Outros'},
{dia:7,desc:'azaleia',entrada:0,saida:1835.86,rec:false,df:'',cat:'Fornecedor'},
{dia:7,desc:'dae',entrada:0,saida:16565.65,rec:false,df:'',cat:'Fornecedor'},
{dia:7,desc:'Whirlpool ST. NF:5141758',entrada:0,saida:279.89,rec:false,df:'',cat:'Fornecedor'},
{dia:7,desc:'Ingá Nf:77222',entrada:0,saida:286.81,rec:false,df:'',cat:'Fornecedor'},
{dia:7,desc:'valdamoveis',entrada:0,saida:16837.63,rec:false,df:'',cat:'Fornecedor'},
{dia:7,desc:'valdemoveis',entrada:0,saida:10156.04,rec:false,df:'',cat:'Fornecedor'},
{dia:7,desc:'valdemoveis frete',entrada:0,saida:1467.69,rec:false,df:'',cat:'Fornecedor'},
{dia:7,desc:'colormaq',entrada:0,saida:588.47,rec:false,df:'',cat:'Fornecedor'},
{dia:7,desc:'tarifa banco do brasil',entrada:0,saida:11.75,rec:false,df:'',cat:'Outros'},
// Dia 8
{dia:8,desc:'caixa',entrada:35416.35,saida:0,rec:false,df:'',cat:'Outros'},
{dia:8,desc:'black deker',entrada:0,saida:2118.98,rec:false,df:'',cat:'Fornecedor'},
{dia:8,desc:'fone (vivo)',entrada:0,saida:60.00,rec:false,df:'',cat:'Outros'},
{dia:8,desc:'tutri baby',entrada:0,saida:8038.16,rec:false,df:'',cat:'Fornecedor'},
{dia:8,desc:'inga impot',entrada:0,saida:4001.82,rec:false,df:'',cat:'Fornecedor'},
{dia:8,desc:'inga impot',entrada:0,saida:3217.74,rec:false,df:'',cat:'Fornecedor'},
{dia:8,desc:'tarifa banco do brasil',entrada:0,saida:6.60,rec:false,df:'',cat:'Outros'},
// Dia 9
{dia:9,desc:'caixa',entrada:13655.01,saida:0,rec:false,df:'',cat:'Outros'},
{dia:9,desc:'V2',entrada:0,saida:7824.97,rec:false,df:'',cat:'Fornecedor'},
{dia:9,desc:'Atlas frete',entrada:0,saida:425.20,rec:false,df:'',cat:'Fornecedor'},
{dia:9,desc:'Atlas frete',entrada:0,saida:947.48,rec:false,df:'',cat:'Fornecedor'},
{dia:9,desc:'Atlas',entrada:0,saida:3067.81,rec:false,df:'',cat:'Fornecedor'},
{dia:9,desc:'Atlas',entrada:0,saida:4846.47,rec:false,df:'',cat:'Fornecedor'},
{dia:9,desc:'conserto lampada CRA30',entrada:0,saida:20.00,rec:false,df:'',cat:'Outros'},
{dia:9,desc:'atacado andrade',entrada:0,saida:10519.00,rec:false,df:'',cat:'Fornecedor'},
{dia:9,desc:'conserto Hilux (filtros)',entrada:0,saida:96.00,rec:false,df:'',cat:'Outros'},
{dia:9,desc:'conserto Hilux',entrada:0,saida:4990.00,rec:false,df:'',cat:'Outros'},
{dia:9,desc:'Gomes e Silva',entrada:0,saida:1920.90,rec:false,df:'',cat:'Fornecedor'},
{dia:9,desc:'tarifa banco do brasil',entrada:0,saida:8.00,rec:false,df:'',cat:'Outros'},
// Dia 10
{dia:10,desc:'caixa',entrada:25861.56,saida:0,rec:false,df:'',cat:'Outros'},
{dia:10,desc:'alimentação',entrada:0,saida:360.00,rec:false,df:'',cat:'Outros'},
{dia:10,desc:'tarifa banco do brasil',entrada:0,saida:2.20,rec:false,df:'',cat:'Outros'},
// Dia 11
{dia:11,desc:'caixa',entrada:12779.85,saida:0,rec:false,df:'',cat:'Outros'},
{dia:11,desc:'alimentação (café da manha)',entrada:0,saida:125.00,rec:false,df:'',cat:'Outros'},
{dia:11,desc:'modernut',entrada:0,saida:1516.78,rec:false,df:'',cat:'Fornecedor'},
{dia:11,desc:'luz',entrada:0,saida:103.49,rec:false,df:'',cat:'Energia'},
{dia:11,desc:'fone (vivo)',entrada:0,saida:59.38,rec:false,df:'',cat:'Outros'},
{dia:11,desc:'frete rv',entrada:0,saida:581.58,rec:false,df:'',cat:'Fornecedor'},
{dia:11,desc:'pipoca/algodao doce',entrada:0,saida:650.00,rec:false,df:'',cat:'Outros'},
{dia:11,desc:'agua',entrada:0,saida:74.57,rec:false,df:'',cat:'Água'},
// Dia 13
{dia:13,desc:'caixa',entrada:31291.12,saida:0,rec:false,df:'',cat:'Outros'},
{dia:13,desc:'aces. Juridica (Lucas)',entrada:0,saida:300.00,rec:false,df:'',cat:'Outros'},
{dia:13,desc:'gazin',entrada:0,saida:7836.60,rec:false,df:'',cat:'Fornecedor'},
{dia:13,desc:'gazin',entrada:0,saida:1027.52,rec:false,df:'',cat:'Fornecedor'},
{dia:13,desc:'gazin',entrada:0,saida:3659.70,rec:false,df:'',cat:'Fornecedor'},
{dia:13,desc:'gazin',entrada:0,saida:479.86,rec:false,df:'',cat:'Fornecedor'},
{dia:13,desc:'tarifa banco do brasil',entrada:0,saida:7.20,rec:false,df:'',cat:'Outros'},
// Dia 14
{dia:14,desc:'caixa',entrada:9598.82,saida:0,rec:false,df:'',cat:'Outros'},
{dia:14,desc:'abastecimento',entrada:0,saida:400.00,rec:false,df:'',cat:'Outros'},
{dia:14,desc:'alimentação roça',entrada:0,saida:60.00,rec:false,df:'',cat:'Outros'},
{dia:14,desc:'Athor',entrada:0,saida:4167.95,rec:false,df:'',cat:'Fornecedor'},
{dia:14,desc:'bovina',entrada:0,saida:80.00,rec:false,df:'',cat:'Outros'},
{dia:14,desc:'oriental celulares',entrada:0,saida:2550.00,rec:false,df:'',cat:'Outros'},
{dia:14,desc:'darf',entrada:0,saida:33302.09,rec:false,df:'',cat:'Outros'},
{dia:14,desc:'zum zum',entrada:0,saida:759.90,rec:false,df:'',cat:'Fornecedor'},
{dia:14,desc:'zum zum',entrada:0,saida:1360.50,rec:false,df:'',cat:'Fornecedor'},
{dia:14,desc:'contabilidade',entrada:0,saida:2431.60,rec:false,df:'',cat:'Outros'},
{dia:14,desc:'inss',entrada:0,saida:6420.14,rec:false,df:'',cat:'Outros'},
{dia:14,desc:'fgts',entrada:0,saida:2581.03,rec:false,df:'',cat:'Outros'},
{dia:14,desc:'aces. trabalhista',entrada:0,saida:264.00,rec:false,df:'',cat:'Outros'},
{dia:14,desc:'pés para G Roupa',entrada:0,saida:380.00,rec:false,df:'',cat:'Outros'},
{dia:14,desc:'tarifa banco do brasil',entrada:0,saida:3.25,rec:false,df:'',cat:'Outros'},
// Dia 15
{dia:15,desc:'caixa',entrada:13567.31,saida:0,rec:false,df:'',cat:'Outros'},
{dia:15,desc:'frete lj',entrada:0,saida:562.52,rec:false,df:'',cat:'Fornecedor'},
{dia:15,desc:'tcil',entrada:0,saida:22772.45,rec:false,df:'',cat:'Fornecedor'},
{dia:15,desc:'frete tcil',entrada:0,saida:2205.57,rec:false,df:'',cat:'Fornecedor'},
{dia:15,desc:'tinta spray',entrada:0,saida:17.90,rec:false,df:'',cat:'Outros'},
{dia:15,desc:'lj',entrada:0,saida:859.00,rec:false,df:'',cat:'Fornecedor'},
{dia:15,desc:'lj',entrada:0,saida:831.96,rec:false,df:'',cat:'Fornecedor'},
{dia:15,desc:'tarifa banco do brasil',entrada:0,saida:2.45,rec:false,df:'',cat:'Outros'},
// Dia 16
{dia:16,desc:'caixa',entrada:7913.05,saida:0,rec:false,df:'',cat:'Outros'},
{dia:16,desc:'Patrocinio carboarte',entrada:0,saida:400.00,rec:false,df:'',cat:'Outros'},
{dia:16,desc:'ventisol',entrada:0,saida:2567.14,rec:false,df:'',cat:'Fornecedor'},
{dia:16,desc:'tarifa banco do brasil',entrada:0,saida:1.40,rec:false,df:'',cat:'Outros'},
// Dia 17
{dia:17,desc:'caixa',entrada:16378.41,saida:0,rec:false,df:'',cat:'Outros'},
{dia:17,desc:'looping',entrada:0,saida:16836.22,rec:false,df:'',cat:'Fornecedor'},
{dia:17,desc:'frete ventisol',entrada:0,saida:355.81,rec:false,df:'',cat:'Fornecedor'},
{dia:17,desc:'Vulcabras',entrada:0,saida:1473.12,rec:false,df:'',cat:'Fornecedor'},
{dia:17,desc:'alimentação roça',entrada:0,saida:60.00,rec:false,df:'',cat:'Outros'},
{dia:17,desc:'balsa',entrada:0,saida:30.00,rec:false,df:'',cat:'Outros'},
{dia:17,desc:'azaleia',entrada:0,saida:1473.12,rec:false,df:'',cat:'Fornecedor'},
// Dia 18
{dia:18,desc:'caixa',entrada:5651.55,saida:0,rec:false,df:'',cat:'Outros'},
{dia:18,desc:'Serasa',entrada:0,saida:15.81,rec:false,df:'',cat:'Outros'},
{dia:18,desc:'alimentacao',entrada:0,saida:21.25,rec:false,df:'',cat:'Outros'},
// Dia 20
{dia:20,desc:'caixa',entrada:30228.57,saida:0,rec:false,df:'',cat:'Outros'},
{dia:20,desc:'delrio',entrada:0,saida:4847.40,rec:false,df:'',cat:'Fornecedor'},
];
const SKIP = 63; // já inseridos na rodada anterior
const delay = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const todo = entries.slice(SKIP);
  console.log(`Importando ${todo.length} lançamentos restantes (pulando ${SKIP} já inseridos)...`);
  let ok = 0, fail = 0;
  for (const e of todo) {
    const data = `2026-04-${String(e.dia).padStart(2, '0')}`;
    try {
      await post({
        data,
        descricao: e.desc,
        entrada: e.entrada,
        saida: e.saida,
        categoria: e.cat,
        recorrente: e.rec,
        tipo_nota: e.df,
        fornecedor: ''
      });
      ok++;
      process.stdout.write(`\r✅ ${ok}/${todo.length}`);
    } catch (err) {
      fail++;
      console.error(`\n❌ Erro: ${e.desc} - ${err.message}`);
    }
    await delay(50);
  }
  console.log(`\n\nConcluído! ✅ ${ok} inseridos | ❌ ${fail} erros`);
}

main();
