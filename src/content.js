import { q } from './db.js';

export async function getSite() {
  const { rows } = await q('SELECT key, value FROM settings');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function getContent({ includeInactive = false } = {}) {
  const [site, services, packages, gallery, faq] = await Promise.all([
    getSite(),
    q(`SELECT * FROM services ${includeInactive ? '' : 'WHERE active'} ORDER BY sort, id`),
    q('SELECT * FROM packages ORDER BY sort, id'),
    q('SELECT * FROM gallery ORDER BY sort, id'),
    q('SELECT * FROM faq ORDER BY sort, id'),
  ]);
  return { site, services: services.rows, packages: packages.rows, gallery: gallery.rows, faq: faq.rows };
}

/** Приводит ссылки на соцсети к полноценным URL. */
export function normalizeSocial(site) {
  const out = { ...site };
  const tg = String(site.telegram || '').trim();
  if (tg) out.telegram_url = /^https?:\/\//i.test(tg) ? tg : `https://t.me/${tg.replace(/^@/, '').replace(/^t\.me\//i, '')}`;
  const ig = String(site.instagram || '').trim();
  if (ig) out.instagram_url = /^https?:\/\//i.test(ig) ? ig : `https://instagram.com/${ig.replace(/^@/, '')}`;
  const wa = String(site.whatsapp || '').replace(/\D/g, '');
  if (wa) out.whatsapp_url = `https://wa.me/${wa}`;
  return out;
}
