// Integração com a API do Grok (xAI) — leitura de comprovantes e interpretação de comandos
// API compatível com OpenAI: POST https://api.x.ai/v1/chat/completions
const BASE = 'https://api.x.ai/v1';
const MODELO_PADRAO = 'grok-4.3';
// IA reserva: NVIDIA (build.nvidia.com), também compatível com OpenAI — usada quando o Grok falha (sem crédito, fora do ar...)
const NV_BASE = 'https://integrate.api.nvidia.com/v1';
const NV_MODELO = 'meta/llama-4-maverick-17b-128e-instruct';

function parseJson(text) {
  let t = String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const ini = t.indexOf('{'), fim = t.lastIndexOf('}');
  if (ini === -1 || fim === -1) throw new Error('A IA não devolveu JSON');
  return JSON.parse(t.substring(ini, fim + 1));
}

async function post(apiKey, rota, body, base, rotulo) {
  const resp = await fetch((base || BASE) + rota, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
    body: JSON.stringify(body),
  });
  const txt = await resp.text();
  let data = {};
  try { data = JSON.parse(txt); } catch (e) { data = { raw: txt }; }
  if (!resp.ok) {
    const msg = (data.error && (data.error.message || data.error)) || data.message || txt.slice(0, 200);
    const err = new Error((rotulo || 'Grok') + ' ' + resp.status + ': ' + (typeof msg === 'string' ? msg : JSON.stringify(msg)));
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
  const reserva = cfg && cfg.reserva && cfg.reserva.apiKey ? cfg.reserva : null;
  if (!cfg || !cfg.apiKey) {
    if (reserva) return perguntarNvidia(reserva, entrada);
    throw new Error('Chave da API do Grok não configurada');
  }
  try { return await perguntarGrok(cfg, entrada); }
  catch (e) {
    if (!reserva) throw e;
    if (typeof cfg.onReserva === 'function') { try { cfg.onReserva(e); } catch (x) {} }
    try { return await perguntarNvidia(reserva, entrada); }
    catch (e2) { throw new Error(e.message + ' | reserva: ' + e2.message); }
  }
}

// NVIDIA: sem response_format (nem todo modelo aceita); o JSON é extraído da resposta
async function perguntarNvidia(cfg, entrada) {
  const modelo = cfg.modelo || NV_MODELO;
  const imagens = (entrada.imagens || []).filter(i => i && i.buffer && /^image\/(jpe?g|png)$/i.test(i.mimeType));
  const user = imagens.length
    ? imagens.map(img => ({ type: 'image_url', image_url: { url: 'data:' + img.mimeType + ';base64,' + img.buffer.toString('base64') } })).concat([{ type: 'text', text: entrada.texto + '\n\nResponda somente com o JSON.' }])
    : entrada.texto + '\n\nResponda somente com o JSON.';
  const data = await post(cfg.apiKey, '/chat/completions', {
    model: modelo,
    messages: [{ role: 'system', content: entrada.system }, { role: 'user', content: user }],
    temperature: 0, max_tokens: 4096,
  }, NV_BASE, 'NVIDIA');
  return parseJson(data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content);
}

async function perguntarGrok(cfg, entrada) {
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

// Áudio → texto (Voice API do xAI: POST /v1/stt, multipart; o campo "file" tem de ser o último)
const EXT_AUDIO = { 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/wav': 'wav', 'audio/webm': 'webm', 'audio/flac': 'flac', 'audio/opus': 'opus' };
async function transcreverAudio(cfg, buffer, mimeType) {
  if (!cfg || !cfg.apiKey) throw new Error('Chave da API do Grok não configurada');
  const mime = String(mimeType || 'audio/ogg').split(';')[0].toLowerCase();
  const tentativas = [{ language: 'pt', format: 'true' }, { language: 'pt' }, {}];
  let ultimo;
  for (const extra of tentativas) {
    const fd = new FormData();
    fd.append('model', 'grok-voice-transcribe-2.0');
    for (const k of Object.keys(extra)) fd.append(k, extra[k]);
    fd.append('file', new Blob([buffer], { type: mime }), 'audio.' + (EXT_AUDIO[mime] || 'ogg'));
    const resp = await fetch(BASE + '/stt', { method: 'POST', headers: { Authorization: 'Bearer ' + cfg.apiKey }, body: fd });
    const txt = await resp.text();
    let data = {}; try { data = JSON.parse(txt); } catch (e) {}
    if (resp.ok) return String(data.text || '').trim();
    const msg = (data.error && (data.error.message || data.error)) || data.message || txt.slice(0, 200);
    ultimo = new Error('Grok (áudio) ' + resp.status + ': ' + (typeof msg === 'string' ? msg : JSON.stringify(msg)));
    ultimo.status = resp.status;
    if (resp.status !== 400) break; // 400 pode ser idioma/formatação não aceitos: tenta sem eles
  }
  throw ultimo;
}

// PDF (inclusive escaneado) → resposta JSON: sobe em /v1/files, pergunta em /v1/responses e apaga o arquivo
async function perguntarPdfJson(cfg, buffer, nome, instrucao) {
  if (!cfg || !cfg.apiKey) throw new Error('Chave da API do Grok não configurada');
  const fd = new FormData();
  fd.append('purpose', 'assistants');
  fd.append('expires_after', '3600');
  fd.append('file', new Blob([buffer], { type: 'application/pdf' }), (nome && /\.pdf$/i.test(nome) ? nome : 'documento.pdf'));
  const up = await fetch(BASE + '/files', { method: 'POST', headers: { Authorization: 'Bearer ' + cfg.apiKey }, body: fd });
  const upTxt = await up.text();
  let arq = {}; try { arq = JSON.parse(upTxt); } catch (e) {}
  if (!up.ok || !arq.id) throw new Error('Grok (envio do PDF) ' + up.status + ': ' + ((arq.error && (arq.error.message || arq.error)) || upTxt.slice(0, 200)));
  try {
    const modelos = [...new Set([cfg.modelo || MODELO_PADRAO, 'grok-4.7'])];
    let erro;
    for (const modelo of modelos) {
      try {
        const data = await post(cfg.apiKey, '/responses', { model: modelo, input: [{ role: 'user', content: [{ type: 'input_text', text: instrucao + '\n\nResponda somente com o JSON.' }, { type: 'input_file', file_id: arq.id }] }] });
        const txt = (data.output || []).flatMap(o => o.content || []).map(c => c.text || '').join('') || data.output_text || '';
        return parseJson(txt);
      } catch (e) { erro = e; if (!(e.status >= 400 && e.status < 500) || e.status === 401 || e.status === 429) break; }
    }
    throw erro;
  } finally {
    fetch(BASE + '/files/' + encodeURIComponent(arq.id), { method: 'DELETE', headers: { Authorization: 'Bearer ' + cfg.apiKey } }).catch(() => {});
  }
}

async function testar(cfg, soReserva) {
  if (soReserva) {
    if (!cfg.reserva || !cfg.reserva.apiKey) throw new Error('Chave da NVIDIA não configurada');
    return { ok: true, resposta: await perguntarNvidia(cfg.reserva, { system: 'Responda apenas JSON.', texto: 'Devolva {"ok":true,"modelo":"<seu nome de modelo>"}' }) };
  }
  const r = await perguntarGrok(cfg, { system: 'Responda apenas JSON.', texto: 'Devolva {"ok":true,"modelo":"<seu nome de modelo>"}' });
  return { ok: true, resposta: r };
}

module.exports = { perguntarJson, transcreverAudio, perguntarPdfJson, testar, MODELO_PADRAO, NV_MODELO };
