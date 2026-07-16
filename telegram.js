// Notificações via Telegram Bot
const db = require('./database');

async function sendTelegram(slug, mensagem) {
  try {
    const cfg = db.getConfig(slug);
    const token = cfg.tg_token || '';
    const chatId = cfg.tg_chat_id || '';
    if (!token || !chatId) return { error: 'Telegram não configurado' };
    const resp = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: mensagem, parse_mode: 'HTML' }),
    });
    const data = await resp.json();
    if (!data.ok) return { error: data.description || 'Erro Telegram' };
    return { ok: true };
  } catch (e) {
    return { error: e.message };
  }
}

// Avisa notas novas aguardando aprovação (chamado após consulta NF-e)
async function notificarNotasNovas(slug, qtd) {
  const cfg = db.getConfig(slug);
  if (cfg.tg_notif_notas !== '1') return;
  await sendTelegram(slug, '📄 <b>' + qtd + ' nota(s) fiscal(is) nova(s)</b> emitida(s) contra o CNPJ aguardando sua aprovação no sistema.');
}

// Boletos vencendo hoje e amanhã (cron diário)
async function notificarBoletosVencendo(slug) {
  const cfg = db.getConfig(slug);
  if (cfg.tg_notif_boletos !== '1') return;
  const hoje = new Date();
  const amanha = new Date(hoje.getTime() + 86400000);
  const fmtD = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const fmtBR = s => s.split('-').reverse().join('/');
  const fmtV = v => 'R$ ' + (v || 0).toFixed(2).replace('.', ',');
  const pend = db.getContasVencendo(slug, fmtD(hoje), fmtD(amanha));
  if (!pend.length) return;
  let msg = '⚠️ <b>Boletos vencendo:</b>\n';
  let total = 0;
  for (const c of pend) {
    const quando = c.vencimento === fmtD(hoje) ? 'HOJE' : 'amanhã';
    msg += '\n• <b>' + quando + '</b> (' + fmtBR(c.vencimento) + '): ' + c.descricao + ' — ' + fmtV(c.valor);
    total += c.valor || 0;
  }
  msg += '\n\n💰 Total: <b>' + fmtV(total) + '</b>';
  await sendTelegram(slug, msg);
}

async function notificarTodasEmpresas() {
  const empresas = db.getEmpresas();
  for (const emp of empresas) {
    try { await notificarBoletosVencendo(emp.slug); } catch (e) { console.error('Telegram cron erro [' + emp.slug + ']:', e.message); }
  }
}

module.exports = { sendTelegram, notificarNotasNovas, notificarBoletosVencendo, notificarTodasEmpresas };
