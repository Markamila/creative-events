import crypto from 'node:crypto';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { q } from './db.js';
import { getContent, normalizeSocial } from './content.js';
import { validateRequest } from './validate.js';
import { notifyManager } from './notify.js';

export const publicRouter = express.Router();

const SECRET = () => process.env.JWT_SECRET;

const sign = (payload) => crypto.createHmac('sha256', SECRET()).update(payload).digest('base64url');

/** Токен формы: подпись времени открытия. Защита от мгновенных ботов. */
export function makeFormToken() {
  const ts = String(Date.now());
  return `${ts}.${sign('form:' + ts)}`;
}

export function checkFormToken(token) {
  if (typeof token !== 'string') return false;
  const [ts, sig] = token.split('.');
  if (!ts || !sig) return false;
  const expected = sign('form:' + ts);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  const age = Date.now() - Number(ts);
  return age >= 3000 && age <= 6 * 3600 * 1000;
}

publicRouter.get('/content', async (_req, res, next) => {
  try {
    const c = await getContent();
    c.site = normalizeSocial(c.site);
    res.set('Cache-Control', 'no-cache');
    res.json(c);
  } catch (e) { next(e); }
});

publicRouter.get('/form-token', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ token: makeFormToken() });
});

const requestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.REQUEST_RATE_LIMIT || 6),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много заявок с вашего адреса. Попробуйте позже или напишите нам в мессенджер.' },
});

publicRouter.post('/requests', requestLimiter, async (req, res, next) => {
  try {
    const body = req.body || {};

    // Ловушка для ботов: скрытое поле заполнено — делаем вид, что всё хорошо.
    if (body.website) return res.json({ ok: true });

    if (!checkFormToken(body.token)) {
      return res.status(400).json({ error: 'Форма отправлена слишком быстро или устарела. Обновите страницу и попробуйте ещё раз.' });
    }

    const { rows: pk } = await q('SELECT code, name FROM packages');
    const { errors, data } = validateRequest(body, pk.map((p) => p.code));
    if (Object.keys(errors).length) return res.status(422).json({ error: 'Проверьте заполнение формы', errors });

    // Защита от дублей: одинаковый телефон за последние 2 минуты.
    const { rows: dup } = await q(
      `SELECT id FROM requests WHERE phone = $1 AND created_at > now() - interval '2 minutes' LIMIT 1`,
      [data.phone],
    );
    if (dup.length) return res.json({ ok: true });

    const { rows } = await q(
      `INSERT INTO requests (name, phone, contact_method, event_date, event_time, participants, event_type, services, package, wishes, consent_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now()) RETURNING *`,
      [data.name, data.phone, data.contact_method, data.event_date, data.event_time, data.participants, data.event_type,
        JSON.stringify(data.services), data.package, data.wishes],
    );
    const request = rows[0];
    res.json({ ok: true });

    // Уведомление не блокирует ответ клиенту.
    const pkgName = pk.find((p) => p.code === request.package)?.name || 'Не определился, нужна консультация';
    notifyManager(request, pkgName)
      .then((r) => q('UPDATE requests SET notified=$1, notify_info=$2 WHERE id=$3', [r.ok, r.info, request.id]))
      .catch((e) => console.error('[notify]', e.message));
  } catch (e) { next(e); }
});

/** Отдаёт загруженное фото из базы. */
export async function mediaHandler(req, res, next) {
  try {
    const id = String(req.params.id).replace(/\.[a-z0-9]+$/i, '');
    if (!/^[a-f0-9]{24,64}$/.test(id)) return res.sendStatus(404);
    const { rows } = await q('SELECT mime, data FROM images WHERE id=$1', [id]);
    if (!rows.length) return res.sendStatus(404);
    res.set({
      'Content-Type': rows[0].mime,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(rows[0].data);
  } catch (e) { next(e); }
}
