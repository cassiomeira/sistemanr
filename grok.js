// Integração com a API do Grok (xAI) — leitura de comprovantes e interpretação de comandos
// API compatível com OpenAI: POST https://api.x.ai/v1/chat/completions
const BASE = 'https://api.x.ai/v1';
const MODELO_PADRAO = 'grok-4.3';

function parseJson(text) {
  let t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const ini = t.indexOf('{'), fim = t.lastIndexOf('}');
  if (ini === -1 || fim === -1) throw new Error('A IA não devolveu JSON');
  return JSON.parse(t.substring(ini, fim + 1));
}

async function post(apiKey, rota, body) {
  const resp = await fetch(BASE + rota, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
    body: JSON.stringify(body),
  });
  const txt = await resp.text();
  let data = {};
  try { data = JSON.parse(txt); } catch (e) { data = { raw: txt }; }
  if (!resp.ok) {
    const msg = (data.error && (data.error.message || data.error)) || data.message || txt.slice(0, 200);
    const err = new Error('Grok ' + resp.status + ': ' + (typeof msg === 'string' ? msg : JSON.stringify(msg)));
    err.status = resp.status;
    throw err;
  }
  return data;
}

/**
 * Pergunta ao Grok e devolve o JSON interpretado.
 * @param {{apiKey:string, modelo?:string}} cfg
 * @param {{system:string, texto:string, imagens?:{buffer:Buffer, mimeType:string}[]}} entrada
 */
async function perguntarJson(cfg, entrada) {
  if (!cfg || !cfg.apiKey) throw new Error('Chave da API do Grok não configurada');
  const modelo = cfg.modelo || MODELO_PADRAO;
  const imagens = (entrada.imagens || []).filter(i => i && i.buffer && /^image\/(jpe?g|png)$/i.test(i.mimeType));
  const partes = [];
  for (const img of imagens) partes.push({ type: 'image_url', image_url: { url: 'data:' + img.mimeType + ';base64,' + img.buffer.toString('base64'), detail: 'high' } });
  partes.push({ type: 'text', text: entrada.texto });
  const body = {
    model: modelo,
    messages: [{ role: 'system', content: entrada.system }, { role: 'user', content: partes }],
    response_format: { type: 'json_object' },
    temperature: 0,
  };
  try {
    const data = await post(cfg.apiKey, '/chat/completions', body);
    return parseJson(data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content);
  } catch (e) {
    // Alguns modelos/versões só aceitam imagem pela Responses API — tenta o formato alternativo
    if (imagens.length && e.status && e.status >= 400 && e.status < 500 && e.status !== 401 && e.status !== 429) {
      const input = [{ role: 'user', content: imagens.map(img => ({ type: 'input_image', image_url: 'data:' + img.mimeType + ';base64,' + img.buffer.toString('base64') })).concat([{ type: 'input_text', text: entrada.system + '\n\n' + entrada.texto + '\n\nResponda somente com o JSON.' }]) }];
      const data = await post(cfg.apiKey, '/responses', { model: modelo, input });
      const txt = (data.output || []).flatMap(o => o.content || []).map(c => c.text || '').join('') || data.output_text || '';
      return parseJson(txt);
    }
    throw e;
  }
}

async function testar(cfg) {
  const r = await perguntarJson(cfg, { system: 'Responda apenas JSON.', texto: 'Devolva {"ok":true,"modelo":"<seu nome de modelo>"}' });
  return { ok: true, resposta: r };
}

module.exports = { perguntarJson, testar, MODELO_PADRAO };
