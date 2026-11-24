import crypto from 'node:crypto';
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import sharp from 'sharp';
import rateLimit from 'express-rate-limit';
import { q } from './db.js';
import { STATUSES, STATUS_KEYS, STATUS_LABEL, CONTACT_METHODS, PRICE_UNITS } from './constants.js';
import { DEFAULT_SITE } from './seed.js';
import { getContent } from './content.js';
import { integrationStatus, notifyManager } from './notify.js';

export const adminRouter = express.Router();

const COOKIE = 'admin_session';
const isProd = () => process.env.NODE_ENV === 'production';
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const int = (v, def = 0) => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Math.trunc(Number(v)) : def);

// ───────────── Авторизация ─────────────

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много попыток входа. Подождите 15 минут.' },
});

adminRouter.post('/login', loginLimiter, wrap(async (req, res) => {
  const username = str(req.body?.username, 80);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const { rows } = await q('SELECT * FROM admins WHERE username=$1', [username]);
  // Сравниваем хеш всегда, чтобы время ответа не выдавало существование логина.
  const hash = rows[0]?.password_hash || '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
  const ok = await bcrypt.compare(password, hash);
  if (!rows.length || !ok) return res.status(401).json({ error: 'Неверный логин или пароль' });
  const token = jwt.sign({ uid: rows[0].id, u: rows[0].username }, process.env.JWT_SECRET, { expiresIn: '12h' });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: isProd(), maxAge: 12 * 3600 * 1000, path: '/' });
  res.json({ ok: true, username: rows[0].username });
}));

adminRouter.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

/** Всё, что ниже, — только для авторизованных. */
adminRouter.use((req, res, next) => {
  // CSRF: изменяющие запросы должны идти из нашего JS (кастомный заголовок) — кросс-сайтовая форма его не поставит.
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('x-requested-with') !== 'fetch') {
    return res.status(403).json({ error: 'Запрещено' });
  }
  try {
    const payload = jwt.verify(req.cookies?.[COOKIE] || '', process.env.JWT_SECRET);
    req.admin = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Требуется вход' });
  }
});

adminRouter.get('/me', (req, res) => res.json({ username: req.admin.u }));

adminRouter.post('/change-password', wrap(async (req, res) => {
  const current = String(req.body?.current || '');
  const next = String(req.body?.next || '');
  if (next.length < 10) return res.status(422).json({ error: 'Новый пароль — не короче 10 символов' });
  const { rows } = await q('SELECT * FROM admins WHERE id=$1', [req.admin.uid]);
  if (!rows.length || !(await bcrypt.compare(current, rows[0].password_hash))) {
    return res.status(403).json({ error: 'Текущий пароль указан неверно' });
  }
  await q('UPDATE admins SET password_hash=$1 WHERE id=$2', [await bcrypt.hash(next, 12), req.admin.uid]);
  res.json({ ok: true });
}));

// ───────────── Заявки ─────────────

adminRouter.get('/meta', (_req, res) => {
  res.json({ statuses: STATUSES, contactMethods: CONTACT_METHODS, priceUnits: PRICE_UNITS });
});

adminRouter.get('/requests', wrap(async (req, res) => {
  const params = [];
  const where = [];
  const status = str(req.query.status, 30);
  if (status && STATUS_KEYS.includes(status)) { params.push(status); where.push(`r.status = $${params.length}`); }
  const search = str(req.query.q, 100);
  if (search) {
    params.push(`%${search.replace(/[%_]/g, '')}%`);
    where.push(`(r.name ILIKE $${params.length} OR r.phone ILIKE $${params.length} OR r.wishes ILIKE $${params.length})`);
  }
  const { rows } = await q(
    `SELECT r.*, (SELECT COUNT(*)::int FROM request_comments c WHERE c.request_id = r.id) AS comments_count
     FROM requests r ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY r.created_at DESC LIMIT 500`,
    params,
  );
  const { rows: counts } = await q('SELECT status, COUNT(*)::int AS n FROM requests GROUP BY status');
  res.json({ requests: rows, counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) });
}));

adminRouter.get('/requests.csv', wrap(async (_req, res) => {
  const { rows } = await q('SELECT * FROM requests ORDER BY created_at DESC');
  const cell = (v) => {
    let s = Array.isArray(v) ? v.join('; ') : v instanceof Date ? v.toISOString() : String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // защита от формул в Excel
    return `"${s.replace(/"/g, '""')}"`;
  };
  const head = ['№', 'Создана', 'Имя', 'Телефон', 'Связь', 'Дата', 'Время', 'Участников', 'Формат', 'Услуги', 'Пакет', 'Пожелания', 'Статус'];
  const lines = rows.map((r) => [
    r.id, r.created_at, r.name, r.phone, CONTACT_METHODS[r.contact_method] || r.contact_method,
    r.event_date ? new Date(r.event_date).toISOString().slice(0, 10) : '', r.event_time, r.participants, r.event_type,
    r.services, r.package, r.wishes, STATUS_LABEL[r.status] || r.status,
  ].map(cell).join(','));
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="requests.csv"' });
  res.send('﻿' + [head.map(cell).join(','), ...lines].join('\r\n'));
}));

adminRouter.get('/requests/:id', wrap(async (req, res) => {
  const id = int(req.params.id, -1);
  const { rows } = await q('SELECT * FROM requests WHERE id=$1', [id]);
  if (!rows.length) return res.sendStatus(404);
  const { rows: comments } = await q('SELECT * FROM request_comments WHERE request_id=$1 ORDER BY created_at', [id]);
  res.json({ request: rows[0], comments });
}));

adminRouter.patch('/requests/:id', wrap(async (req, res) => {
  const status = str(req.body?.status, 30);
  if (!STATUS_KEYS.includes(status)) return res.status(422).json({ error: 'Неизвестный статус' });
  const { rowCount } = await q('UPDATE requests SET status=$1 WHERE id=$2', [status, int(req.params.id, -1)]);
  if (!rowCount) return res.sendStatus(404);
  res.json({ ok: true });
}));

adminRouter.post('/requests/:id/comments', wrap(async (req, res) => {
  const text = str(req.body?.text, 2000);
  if (!text) return res.status(422).json({ error: 'Введите комментарий' });
  const id = int(req.params.id, -1);
  const { rows: r } = await q('SELECT id FROM requests WHERE id=$1', [id]);
  if (!r.length) return res.sendStatus(404);
  const { rows } = await q('INSERT INTO request_comments (request_id, author, text) VALUES ($1,$2,$3) RETURNING *', [id, req.admin.u, text]);
  res.json({ comment: rows[0] });
}));

adminRouter.delete('/requests/:id', wrap(async (req, res) => {
  await q('DELETE FROM requests WHERE id=$1', [int(req.params.id, -1)]);
  res.json({ ok: true });
}));

// ───────────── Контент ─────────────

adminRouter.get('/content', wrap(async (_req, res) => {
  res.json(await getContent({ includeInactive: true }));
}));

adminRouter.put('/settings', wrap(async (req, res) => {
  const incoming = req.body || {};
  for (const key of Object.keys(DEFAULT_SITE)) {
    if (!(key in incoming)) continue;
    const limit = ['about_text', 'hero_subtitle', 'price_note', 'seo_description', 'cta_subtitle'].includes(key) ? 4000 : 300;
    await q(
      'INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
      [key, JSON.stringify(str(String(incoming[key] ?? ''), limit))],
    );
  }
  res.json({ ok: true });
}));

// Услуги
const serviceFields = (b) => ({
  category: str(b.category, 80),
  category_fr: str(b.category_fr, 80),
  title_fr: str(b.title_fr, 160),
  short_fr: str(b.short_fr, 300),
  description_fr: str(b.description_fr, 3000),

  title: str(b.title, 160),
  short: str(b.short, 300),
  description: str(b.description, 3000),
  image: str(b.image, 500),
  examples: Array.isArray(b.examples) ? b.examples.map((e) => str(e, 500)).filter(Boolean).slice(0, 12) : [],
  sort: int(b.sort, 0),
  active: b.active !== false,
});

adminRouter.post('/services', wrap(async (req, res) => {
  const s = serviceFields(req.body || {});
  if (!s.title || !s.category) return res.status(422).json({ error: 'Укажите категорию и название' });
  const { rows } = await q(
    `INSERT INTO services (category,title,short,description,image,examples,sort,active,category_fr,title_fr,short_fr,description_fr)
     VALUES ($1,$2,$3,$4,$5,$6,COALESCE(NULLIF($7,0),(SELECT COALESCE(MAX(sort),0)+10 FROM services)),$8,$9,$10,$11,$12) RETURNING *`,
    [s.category, s.title, s.short, s.description, s.image, JSON.stringify(s.examples), s.sort, s.active, s.category_fr, s.title_fr, s.short_fr, s.description_fr],
  );
  res.json({ service: rows[0] });
}));

adminRouter.put('/services/:id', wrap(async (req, res) => {
  const s = serviceFields(req.body || {});
  if (!s.title || !s.category) return res.status(422).json({ error: 'Укажите категорию и название' });
  const { rows } = await q(
    `UPDATE services SET category=$1,title=$2,short=$3,description=$4,image=$5,examples=$6,sort=$7,active=$8,category_fr=$10,title_fr=$11,short_fr=$12,description_fr=$13 WHERE id=$9 RETURNING *`,
    [s.category, s.title, s.short, s.description, s.image, JSON.stringify(s.examples), s.sort, s.active, int(req.params.id, -1), s.category_fr, s.title_fr, s.short_fr, s.description_fr],
  );
  if (!rows.length) return res.sendStatus(404);
  res.json({ service: rows[0] });
}));

adminRouter.delete('/services/:id', wrap(async (req, res) => {
  await q('DELETE FROM services WHERE id=$1', [int(req.params.id, -1)]);
  res.json({ ok: true });
}));

// Пакеты и цены
adminRouter.put('/packages/:id', wrap(async (req, res) => {
  const b = req.body || {};
  const unit = Object.keys(PRICE_UNITS).includes(b.price_unit) ? b.price_unit : 'per_person';
  const price = b.price_from === '' || b.price_from === null || b.price_from === undefined ? null : Math.max(0, int(b.price_from, 0));
  const features = Array.isArray(b.features) ? b.features.map((f) => str(f, 200)).filter(Boolean).slice(0, 15) : [];
  const { rows } = await q(
    `UPDATE packages SET name=$1, description=$2, includes=$3, features=$4, price_from=$5, price_unit=$6, price_note=$7, highlighted=$8
     WHERE id=$9 RETURNING *`,
    [str(b.name, 60) || 'Пакет', str(b.description, 400), str(b.includes, 200), JSON.stringify(features), price, unit,
      str(b.price_note, 200), b.highlighted === true, int(req.params.id, -1)],
  );
  if (!rows.length) return res.sendStatus(404);
  res.json({ package: rows[0] });
}));

// FAQ
adminRouter.post('/faq', wrap(async (req, res) => {
  const question = str(req.body?.question, 300);
  const answer = str(req.body?.answer, 2000);
  if (!question || !answer) return res.status(422).json({ error: 'Заполните вопрос и ответ' });
  const { rows } = await q(
    'INSERT INTO faq (question, answer, sort, question_fr, answer_fr) VALUES ($1,$2,(SELECT COALESCE(MAX(sort),0)+10 FROM faq),$3,$4) RETURNING *',
    [question, answer, str(req.body?.question_fr,300), str(req.body?.answer_fr,2000)],
  );
  res.json({ item: rows[0] });
}));

adminRouter.put('/faq/:id', wrap(async (req, res) => {
  const question = str(req.body?.question, 300);
  const answer = str(req.body?.answer, 2000);
  if (!question || !answer) return res.status(422).json({ error: 'Заполните вопрос и ответ' });
  const { rows } = await q('UPDATE faq SET question=$1, answer=$2, sort=$3, question_fr=$5, answer_fr=$6 WHERE id=$4 RETURNING *',
    [question, answer, int(req.body?.sort, 0), int(req.params.id, -1), str(req.body?.question_fr,300), str(req.body?.answer_fr,2000)]);
  if (!rows.length) return res.sendStatus(404);
  res.json({ item: rows[0] });
}));

adminRouter.delete('/faq/:id', wrap(async (req, res) => {
  await q('DELETE FROM faq WHERE id=$1', [int(req.params.id, -1)]);
  res.json({ ok: true });
}));

// ───────────── Загрузка фото ─────────────

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024, files: 1 } });
const ALLOWED = new Set(['jpeg', 'png', 'webp', 'gif', 'avif', 'heif']);

async function storeImage(buffer) {
  // sharp определяет реальный формат по содержимому, а не по расширению; SVG и прочее отсеиваются.
  const meta = await sharp(buffer, { failOn: 'error' }).metadata();
  if (!ALLOWED.has(meta.format)) throw Object.assign(new Error('Допустимы JPG, PNG, WebP, GIF'), { status: 422 });
  const out = await sharp(buffer, { failOn: 'error' })
    .rotate()
    .resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  const id = crypto.randomBytes(16).toString('hex');
  await q('INSERT INTO images (id, mime, data) VALUES ($1,$2,$3)', [id, 'image/webp', out]);
  return `/media/${id}`;
}

async function deleteImageByUrl(url) {
  const m = /^\/media\/([a-f0-9]+)$/.exec(url || '');
  if (m) await q('DELETE FROM images WHERE id=$1', [m[1]]);
}

const uploadMw = (req, res, next) => upload.single('file')(req, res, (err) => {
  if (err) return res.status(422).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Файл больше 12 МБ' : 'Не удалось загрузить файл' });
  next();
});

adminRouter.post('/upload', uploadMw, wrap(async (req, res) => {
  if (!req.file) return res.status(422).json({ error: 'Файл не выбран' });
  try {
    res.json({ url: await storeImage(req.file.buffer) });
  } catch (e) {
    res.status(e.status || 422).json({ error: e.status ? e.message : 'Файл не похож на изображение' });
  }
}));

// Галерея
adminRouter.post('/gallery', uploadMw, wrap(async (req, res) => {
  if (!req.file) return res.status(422).json({ error: 'Файл не выбран' });
  let url;
  try { url = await storeImage(req.file.buffer); }
  catch (e) { return res.status(e.status || 422).json({ error: e.status ? e.message : 'Файл не похож на изображение' }); }
  const { rows } = await q(
    'INSERT INTO gallery (image, caption, category, sort) VALUES ($1,$2,$3,(SELECT COALESCE(MAX(sort),0)+10 FROM gallery)) RETURNING *',
    [url, str(req.body?.caption, 200), str(req.body?.category, 60)],
  );
  res.json({ item: rows[0] });
}));

adminRouter.put('/gallery/:id', wrap(async (req, res) => {
  const { rows } = await q('UPDATE gallery SET caption=$1, category=$2, sort=$3 WHERE id=$4 RETURNING *',
    [str(req.body?.caption, 200), str(req.body?.category, 60), int(req.body?.sort, 0), int(req.params.id, -1), str(req.body?.question_fr,300), str(req.body?.answer_fr,2000)]);
  if (!rows.length) return res.sendStatus(404);
  res.json({ item: rows[0] });
}));

adminRouter.delete('/gallery/:id', wrap(async (req, res) => {
  const { rows } = await q('DELETE FROM gallery WHERE id=$1 RETURNING image', [int(req.params.id, -1)]);
  if (rows[0]) await deleteImageByUrl(rows[0].image);
  res.json({ ok: true });
}));

// ───────────── Интеграции ─────────────

adminRouter.get('/integrations', (_req, res) => {
  const st = integrationStatus();
  res.json({
    ...st,
    publicUrl: process.env.PUBLIC_URL || '',
    smtpHost: process.env.SMTP_HOST ? process.env.SMTP_HOST : '',
    managerEmail: process.env.MANAGER_EMAIL ? process.env.MANAGER_EMAIL.replace(/^(.).*(@.*)$/, '$1***$2') : '',
  });
});

adminRouter.post('/integrations/test', wrap(async (_req, res) => {
  const fake = {
    id: 0, name: 'Тестовая заявка', phone: '+7 700 000 00 00', contact_method: 'whatsapp',
    event_date: new Date(), event_time: '18:00', participants: 6, event_type: 'День рождения',
    services: ['Проверка уведомлений'], package: 'STANDARD', wishes: 'Это проверка связи из админ-панели.',
  };
  res.json(await notifyManager(fake, 'STANDARD'));
}));
