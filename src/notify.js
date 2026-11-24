import nodemailer from 'nodemailer';
import { CONTACT_METHODS, STATUS_LABEL } from './constants.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function integrationStatus() {
  const telegram = Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
  const email = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.MANAGER_EMAIL);
  return { telegram, email, any: telegram || email };
}

const fmtDate = (d) => {
  if (!d) return '—';
  const s = d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
  const [y, m, day] = s.split('-');
  return `${day}.${m}.${y}`;
};

function adminLink() {
  const base = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
  return base ? `${base}/admin` : '';
}

function lines(r, packageName) {
  return [
    ['Имя', r.name],
    ['Телефон', r.phone],
    ['Связь', CONTACT_METHODS[r.contact_method] || r.contact_method],
    ['Дата', `${fmtDate(r.event_date)}${r.event_time ? ' в ' + r.event_time : ''}`],
    ['Участников', r.participants ?? '—'],
    ['Формат', r.event_type || '—'],
    ['Услуги', (r.services || []).join(', ') || '—'],
    ['Пакет', packageName || r.package],
    ['Пожелания', r.wishes || '—'],
  ];
}

export function buildTelegramText(r, packageName) {
  const phoneDigits = String(r.phone).replace(/\D/g, '');
  const body = lines(r, packageName).map(([k, v]) => `<b>${esc(k)}:</b> ${esc(v)}`).join('\n');
  const wa = phoneDigits ? `\n\nWhatsApp: https://wa.me/${phoneDigits}` : '';
  const admin = adminLink() ? `\nАдминка: ${adminLink()}` : '';
  return `🌸 <b>Новая заявка №${r.id}</b>\n\n${body}${wa}${admin}`;
}

async function sendTelegram(text) {
  const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: process.env.TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Telegram ${res.status}: ${t.slice(0, 200)}`);
  }
}

let transporter;
function getTransport() {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 465);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
  }
  return transporter;
}

async function sendEmail(r, packageName) {
  const rows = lines(r, packageName)
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#8a6a73"><b>${esc(k)}</b></td><td style="padding:4px 0">${esc(v)}</td></tr>`)
    .join('');
  const admin = adminLink();
  await getTransport().sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: process.env.MANAGER_EMAIL,
    subject: `Новая заявка №${r.id} — ${r.name}`,
    text: lines(r, packageName).map(([k, v]) => `${k}: ${v}`).join('\n') + (admin ? `\n\nАдминка: ${admin}` : ''),
    html: `<h2 style="font-family:sans-serif">Новая заявка №${r.id}</h2><table style="font-family:sans-serif;font-size:15px">${rows}</table>${admin ? `<p><a href="${esc(admin)}">Открыть в админ-панели</a></p>` : ''}`,
  });
}

/**
 * Отправляет уведомление всеми настроенными каналами.
 * Возвращает { ok, info } — ok=true, если сработал хотя бы один канал.
 */
export async function notifyManager(request, packageName) {
  const st = integrationStatus();
  if (!st.any) return { ok: false, info: 'Каналы уведомлений не настроены' };

  const results = [];
  let ok = false;
  if (st.telegram) {
    try { await sendTelegram(buildTelegramText(request, packageName)); ok = true; results.push('telegram: ок'); }
    catch (e) { results.push(`telegram: ${e.message}`); }
  }
  if (st.email) {
    try { await sendEmail(request, packageName); ok = true; results.push('email: ок'); }
    catch (e) { results.push(`email: ${e.message}`); }
  }
  return { ok, info: results.join('; ') };
}

export const statusLabel = (k) => STATUS_LABEL[k] || k;
