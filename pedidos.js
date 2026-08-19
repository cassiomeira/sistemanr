// Módulo Pedidos: lê PDF/imagem de pedido de compra via API do Gemini (camada gratuita)
// e extrai fornecedor, data, itens e valor para controle de pedidos aguardando faturamento
const db = require('./database');

const MIMES_ACEITOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

function getGeminiConfig(slug) {
  const cfg = db.getConfig(slug);
  // fallback: chave configurada na empresa padrão serve para todas
  const cfgPadrao = slug !== 'nunesrocha' ? db.getConfig('nunesrocha') : cfg;
  return {
    apiKey: cfg.gemini_api_key || cfgPadrao.gemini_api_key || '',
    model: cfg.gemini_model || cfgPadrao.gemini_model || 'gemini-2.5-flash',
  };
}

const PROMPT = `Você está lendo um pedido de compra (ordem de compra) feito a um fornecedor no Brasil.
Extraia os dados e responda SOMENTE com JSON válido, sem comentários, neste formato exato:
{"fornecedor":"nome do fornecedor","numero":"número do pedido se houver","data":"YYYY-MM-DD","valor_total":0.00,"itens":[{"produto":"descrição do item","qtd":0,"valor_unit":0.00,"valor":0.00}],"observacoes":"condições de pagamento, prazo de entrega ou outras observações relevantes"}
Regras:
- Valores numéricos com ponto decimal (1234.56), nunca vírgula.
- Se a data estiver em formato brasileiro (DD/MM/AAAA), converta para YYYY-MM-DD.
- Se um campo não existir no documento, use string vazia ou 0.
- "valor_total" é o valor total do pedido. Se não estiver explícito, some os itens.`;

function parseJsonResposta(text) {
  let t = String(text || '').trim();
  // remove cercas de código se o modelo devolver ```json ... ```
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const ini = t.indexOf('{');
  const fim = t.lastIndexOf('}');
  if (ini === -1 || fim === -1) throw new Error('A IA não retornou dados estruturados');
  return JSON.parse(t.substring(ini, fim + 1));
}

async function lerPedido(buffer, mimeType, slug) {
  const { apiKey, model } = getGeminiConfig(slug);
  if (!apiKey) return { error: 'Chave da API do Gemini não configurada. Vá em Configurações e cole sua chave (grátis em aistudio.google.com).' };
  if (!MIMES_ACEITOS.includes(mimeType)) return { error: 'Formato não suportado. Envie PDF ou imagem (JPG/PNG/WEBP).' };

  const body = JSON.stringify({
    contents: [{
      parts: [
        { inline_data: { mime_type: mimeType, data: buffer.toString('base64') } },
        { text: PROMPT },
      ],
    }],
    generationConfig: { response_mime_type: 'application/json', temperature: 0 },
  });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  let resp, data;
  try {
    resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    data = await resp.json();
  } catch (e) {
    return { error: 'Falha ao conectar na API do Gemini: ' + e.message };
  }
  if (data.error) {
    const msg = data.error.message || data.error.status || 'erro desconhecido';
    if (data.error.code === 400 && /API key/i.test(msg)) return { error: 'Chave da API do Gemini inválida. Confira em Configurações.' };
    if (data.error.code === 429) return { error: 'Limite gratuito do Gemini atingido. Tente novamente em alguns minutos.' };
    if (data.error.code === 404) return { error: 'Modelo "' + model + '" não encontrado na API do Gemini. Ajuste o modelo em Configurações.' };
    return { error: 'Gemini: ' + msg };
  }

  const text = (((data.candidates || [])[0] || {}).content || {}).parts?.map(p => p.text || '').join('') || '';
  if (!text) return { error: 'A IA não conseguiu ler o documento. Tente uma imagem mais nítida.' };

  let r;
  try { r = parseJsonResposta(text); } catch (e) { return { error: 'Não consegui interpretar a resposta da IA: ' + e.message }; }

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

module.exports = { lerPedido, getGeminiConfig };
