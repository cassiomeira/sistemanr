// Módulo IA (Gemini, camada gratuita): lê PDF/imagem de pedidos de compra e boletos escaneados
const db = require('./database');
const boleto = require('./boleto');

const MIMES_ACEITOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

function getGeminiConfig(slug) {
  const cfg = db.getConfig(slug);
  // fallback: chave configurada na empresa padrão serve para todas
  const cfgPadrao = slug !== 'nunesrocha' ? db.getConfig('nunesrocha') : cfg;
  return {
    apiKey: cfg.gemini_api_key || cfgPadrao.gemini_api_key || '',
    model: cfg.gemini_model || cfgPadrao.gemini_model || 'gemini-flash-latest',
  };
}

function parseJsonResposta(text) {
  let t = String(text || '').trim();
  // remove cercas de código se o modelo devolver ```json ... ```
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const ini = t.indexOf('{');
  const fim = t.lastIndexOf('}');
  if (ini === -1 || fim === -1) throw new Error('A IA não retornou dados estruturados');
  return JSON.parse(t.substring(ini, fim + 1));
}

// Chama o Gemini com um arquivo + prompt. Tenta o modelo configurado e cai para
// alternativos quando sobrecarregado (503), limitado (429) ou inexistente (404).
async function chamarGemini(slug, buffer, mimeType, prompt) {
  const { apiKey, model } = getGeminiConfig(slug);
  if (!apiKey) return { error: 'Chave da API do Gemini não configurada. Vá em Configurações e cole sua chave (grátis em aistudio.google.com).' };
  if (!MIMES_ACEITOS.includes(mimeType)) return { error: 'Formato não suportado. Envie PDF ou imagem (JPG/PNG/WEBP).' };

  const body = JSON.stringify({
    contents: [{
      parts: [
        { inline_data: { mime_type: mimeType, data: buffer.toString('base64') } },
        { text: prompt },
      ],
    }],
    generationConfig: { response_mime_type: 'application/json', temperature: 0 },
  });

  const candidatos = [...new Set([model, 'gemini-flash-latest', 'gemini-flash-lite-latest'])];
  let ultimoErro = null, erroSobrecarga = null;
  for (const m of candidatos) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(apiKey)}`;
    let d;
    try {
      const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      d = await resp.json();
    } catch (e) {
      ultimoErro = 'Falha ao conectar na API do Gemini: ' + e.message;
      continue;
    }
    if (d.error) {
      const msg = d.error.message || d.error.status || 'erro desconhecido';
      if (d.error.code === 400 && /API key/i.test(msg)) return { error: 'Chave da API do Gemini inválida. Confira em Configurações.' };
      if (d.error.code === 503) { erroSobrecarga = 'Modelos do Gemini sobrecarregados no momento. Tente novamente em alguns minutos.'; continue; }
      if (d.error.code === 429) { erroSobrecarga = 'Limite gratuito do Gemini atingido. Tente novamente em alguns minutos.'; continue; }
      if (d.error.code === 404) { ultimoErro = 'Modelo "' + m + '" não encontrado na API do Gemini.'; continue; }
      return { error: 'Gemini: ' + msg };
    }
    const text = (((d.candidates || [])[0] || {}).content || {}).parts?.map(p => p.text || '').join('') || '';
    if (!text) { ultimoErro = 'A IA não conseguiu ler o documento. Tente uma imagem mais nítida.'; continue; }
    return { text };
  }
  return { error: erroSobrecarga || ultimoErro || 'Não foi possível consultar a API do Gemini.' };
}

const PROMPT_PEDIDO = `Você está lendo um pedido de compra (ordem de compra) feito a um fornecedor no Brasil.
Extraia os dados e responda SOMENTE com JSON válido, sem comentários, neste formato exato:
{"fornecedor":"nome do fornecedor","numero":"número do pedido se houver","data":"YYYY-MM-DD","valor_total":0.00,"itens":[{"produto":"descrição do item","qtd":0,"valor_unit":0.00,"valor":0.00}],"observacoes":"condições de pagamento, prazo de entrega ou outras observações relevantes"}
Regras:
- Valores numéricos com ponto decimal (1234.56), nunca vírgula.
- Se a data estiver em formato brasileiro (DD/MM/AAAA), converta para YYYY-MM-DD.
- Se um campo não existir no documento, use string vazia ou 0.
- "valor_total" é o valor total do pedido. Se não estiver explícito, some os itens.`;

async function lerPedido(buffer, mimeType, slug) {
  const g = await chamarGemini(slug, buffer, mimeType, PROMPT_PEDIDO);
  if (g.error) return g;

  let r;
  try { r = parseJsonResposta(g.text); } catch (e) { return { error: 'Não consegui interpretar a resposta da IA: ' + e.message }; }

  const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : Math.round(n * 100) / 100; };
  const itens = (Array.isArray(r.itens) ? r.itens : []).map(i => ({
    produto: String(i.produto || '').trim(),
    qtd: parseFloat(i.qtd) || 0,
    valor_unit: num(i.valor_unit),
    valor: num(i.valor),
  })).filter(i => i.produto);
  let valor = num(r.valor_total);
  if (!valor && itens.length) valor = Math.round(itens.reduce((s, i) => s + i.valor, 0) * 100) / 100;
  let dataPedido = String(r.data || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataPedido)) dataPedido = '';

  return {
    fornecedor: String(r.fornecedor || '').trim(),
    numero: String(r.numero || '').trim(),
    data: dataPedido,
    valor,
    itens,
    observacoes: String(r.observacoes || '').trim(),
  };
}

const PROMPT_BOLETO = `Você está lendo um arquivo com um ou mais BOLETOS bancários brasileiros (pode ser escaneado ou foto).
Extraia TODOS os boletos encontrados e responda SOMENTE com JSON válido, sem comentários, neste formato exato:
{"boletos":[{"linha_digitavel":"apenas os dígitos da linha digitável (47 ou 48 dígitos), se legível","valor":0.00,"vencimento":"YYYY-MM-DD","beneficiario":"nome do beneficiário/cedente","cnpj":"apenas os dígitos do CNPJ do beneficiário"}]}
Regras:
- Valores numéricos com ponto decimal (1234.56), nunca vírgula.
- Datas em formato brasileiro (DD/MM/AAAA) devem ser convertidas para YYYY-MM-DD.
- Na linha digitável, transcreva os dígitos com máximo cuidado, na ordem em que aparecem.
- Se um campo não for legível, use string vazia ou 0.
- Um mesmo boleto pode aparecer duas vezes no documento (recibo do pagador e ficha de compensação): liste-o apenas uma vez.`;

async function lerBoletos(buffer, mimeType, slug) {
  const g = await chamarGemini(slug, buffer, mimeType, PROMPT_BOLETO);
  if (g.error) return g;

  let r;
  try { r = parseJsonResposta(g.text); } catch (e) { return { error: 'Não consegui interpretar a resposta da IA: ' + e.message }; }

  const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : Math.round(n * 100) / 100; };
  const vistos = new Set();
  const boletos = [];
  for (const b of (Array.isArray(r.boletos) ? r.boletos : [])) {
    const item = {
      linha: String(b.linha_digitavel || '').replace(/\D/g, ''),
      valor: num(b.valor),
      vencimento: /^\d{4}-\d{2}-\d{2}$/.test(String(b.vencimento || '')) ? b.vencimento : '',
      beneficiario: String(b.beneficiario || '').trim(),
      cnpj: String(b.cnpj || '').replace(/\D/g, ''),
    };
    // Se a linha digitável foi lida, o código de barras é mais confiável que o OCR dos campos
    if ([44, 47, 48].includes(item.linha.length)) {
      const dec = boleto.decodeLinhaDigitavel(item.linha);
      if (dec.valido) {
        if (dec.valor) item.valor = dec.valor;
        if (dec.vencimento) item.vencimento = dec.vencimento;
      }
    } else {
      item.linha = '';
    }
    if (!item.valor && !item.linha) continue;
    const chave = item.linha || (item.valor + '|' + item.vencimento + '|' + item.cnpj);
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    boletos.push(item);
  }
  return { boletos };
}

module.exports = { lerPedido, lerBoletos, getGeminiConfig };
