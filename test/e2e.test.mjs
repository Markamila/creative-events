// Сквозной тест на настоящем PostgreSQL: DATABASE_URL=... ADMIN_PASSWORD=... npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';

process.env.JWT_SECRET ||= 'test-secret';
process.env.ADMIN_PASSWORD ||= 'TestPass12345';
process.env.REQUEST_RATE_LIMIT = '50';
const { createApp } = await import('../src/server.js');
const { migrate, pool } = await import('../src/db.js');
const { seed } = await import('../src/seed.js');

await migrate(); await seed();
const server = createApp().listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
test.after(async () => { server.close(); await pool.end(); });

let cookie = '';
const call = async (path, { method = 'GET', body, form, admin = true, headers = {} } = {}) => {
  const h = { ...headers };
  if (admin) { h['X-Requested-With'] = 'fetch'; if (cookie) h.Cookie = cookie; }
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const res = await fetch(base + path, { method, headers: h, body: form || (body !== undefined ? JSON.stringify(body) : undefined), redirect: 'manual' });
  const text = await res.text(); let json; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text, res };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const goodRequest = (extra = {}) => ({
  name: 'Анна', phone: '+7 701 555 12 34', contact_method: 'whatsapp', event_date: new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10),
  event_time: '18:30', participants: 8, event_type: 'День рождения', services: ['Роспись шопперов', 'Роспись керамики'],
  package: 'STANDARD', wishes: 'Нежные розовые тона <b>тест</b>', consent: true, website: '', ...extra,
});

test('главная страница отдаётся с SEO и JSON-LD', async () => {
  const r = await call('/', { admin: false });
  assert.equal(r.status, 200);
  assert.match(r.text, /<title>Pastel Studio — выездные/);
  assert.match(r.text, /application\/ld\+json/);
  assert.doesNotMatch(r.text, /\{\{/);
  assert.match(r.res.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal((await call('/robots.txt', { admin: false })).status, 200);
  assert.match((await call('/sitemap.xml', { admin: false })).text, /<loc>/);
  assert.equal((await call('/net-takoy', { admin: false })).status, 404);
});

test('публичный контент заполнен', async () => {
  const { json } = await call('/api/content', { admin: false });
  assert.equal(json.services.length, 10); assert.equal(json.packages.length, 3);
  assert.equal(json.gallery.length, 14); assert.equal(json.faq.length, 9);
  assert.ok(json.site.whatsapp_url.startsWith('https://wa.me/'));
  assert.ok(json.site.telegram_url.startsWith('https://t.me/'));
});

let reqToken;
test('заявка: защита от ботов и валидация', async () => {
  assert.equal((await call('/api/requests', { method: 'POST', body: goodRequest(), admin: false })).status, 400, 'без токена');
  reqToken = (await call('/api/form-token', { admin: false })).json.token;
  assert.equal((await call('/api/requests', { method: 'POST', body: goodRequest({ token: reqToken }), admin: false })).status, 400, 'слишком быстро');
  await sleep(3200);
  const bad = await call('/api/requests', { method: 'POST', body: goodRequest({ token: reqToken, name: '', phone: '12', participants: 0, consent: false, package: 'GOLD' }), admin: false });
  assert.equal(bad.status, 422);
  for (const k of ['name', 'phone', 'participants', 'consent', 'package']) assert.ok(bad.json.errors[k], 'ошибка для ' + k);
  const fakeTok = await call('/api/requests', { method: 'POST', body: goodRequest({ token: reqToken.replace(/.$/, 'x') }), admin: false });
  assert.equal(fakeTok.status, 400, 'подделанный токен');
});

test('заявка сохраняется; ловушка и дубль не создают лишнего', async () => {
  const before = (await pool.query('SELECT COUNT(*)::int n FROM requests')).rows[0].n;
  const ok = await call('/api/requests', { method: 'POST', body: goodRequest({ token: reqToken }), admin: false });
  assert.equal(ok.status, 200); assert.equal(ok.json.ok, true);
  await call('/api/requests', { method: 'POST', body: goodRequest({ token: reqToken }), admin: false }); // дубль
  await call('/api/requests', { method: 'POST', body: goodRequest({ token: reqToken, phone: '+7 702 000 00 00', website: 'http://spam' }), admin: false }); // honeypot
  const after = (await pool.query('SELECT COUNT(*)::int n FROM requests')).rows[0].n;
  assert.equal(after - before, 1);
  await sleep(300);
  const row = (await pool.query('SELECT * FROM requests ORDER BY id DESC LIMIT 1')).rows[0];
  assert.equal(row.status, 'new'); assert.equal(row.notified, false); assert.match(row.notify_info, /не настроен/);
  assert.deepEqual(row.services, ['Роспись шопперов', 'Роспись керамики']);
});

test('админка закрыта без входа и защищена от CSRF', async () => {
  assert.equal((await call('/api/admin/requests')).status, 401);
  assert.equal((await call('/api/admin/login', { method: 'POST', body: { username: 'admin', password: 'wrong' } })).status, 401);
  const noHdr = await call('/api/admin/requests/1', { method: 'DELETE', admin: false });
  assert.equal(noHdr.status, 403);
});

test('вход и работа с заявками', async () => {
  const login = await call('/api/admin/login', { method: 'POST', body: { username: 'admin', password: process.env.ADMIN_PASSWORD } });
  assert.equal(login.status, 200);
  const sc = login.res.headers.get('set-cookie'); assert.match(sc, /HttpOnly/i); assert.match(sc, /SameSite=Strict/i);
  cookie = sc.split(';')[0];
  const list = await call('/api/admin/requests?status=new');
  assert.ok(list.json.requests.length >= 1); const id = list.json.requests[0].id;
  assert.equal((await call(`/api/admin/requests/${id}`, { method: 'PATCH', body: { status: 'offer_sent' } })).status, 200);
  assert.equal((await call(`/api/admin/requests/${id}`, { method: 'PATCH', body: { status: 'bogus' } })).status, 422);
  assert.equal((await call(`/api/admin/requests/${id}/comments`, { method: 'POST', body: { text: 'Позвонила, ждём ответа' } })).status, 200);
  const one = await call(`/api/admin/requests/${id}`);
  assert.equal(one.json.request.status, 'offer_sent'); assert.equal(one.json.comments.length, 1);
  const search = await call('/api/admin/requests?q=' + encodeURIComponent('Анн'));
  assert.ok(search.json.requests.length >= 1);
  const csv = await call('/api/admin/requests.csv'); assert.match(csv.text, /Анна/); assert.match(csv.res.headers.get('content-type'), /csv/);
});

test('цены, настройки, услуги, FAQ', async () => {
  const { json: c } = await call('/api/admin/content'); const p = c.packages.find((x) => x.code === 'MINI');
  const up = await call(`/api/admin/packages/${p.id}`, { method: 'PUT', body: { ...p, price_from: 9500, price_unit: 'per_group', features: ['A', 'B'] } });
  assert.equal(up.json.package.price_from, 9500);
  await call('/api/admin/settings', { method: 'PUT', body: { company_name: 'Роза & Кисть', phone: '+7 777 111 22 33', evil: 'x' } });
  const pub = (await call('/api/content', { admin: false })).json;
  assert.equal(pub.site.company_name, 'Роза & Кисть'); assert.equal(pub.packages.find((x) => x.code === 'MINI').price_unit, 'per_group');
  assert.equal(pub.site.evil, undefined);
  const home = (await call('/', { admin: false })).text; assert.match(home, /Роза &amp; Кисть/);

  const s = await call('/api/admin/services', { method: 'POST', body: { category: 'Handmade', title: 'Свечи', short: 'x', examples: [] } });
  assert.equal(s.status, 200); const sid = s.json.service.id;
  assert.equal((await call('/api/content', { admin: false })).json.services.length, 11);
  await call(`/api/admin/services/${sid}`, { method: 'PUT', body: { ...s.json.service, active: false } });
  assert.equal((await call('/api/content', { admin: false })).json.services.length, 10, 'скрытая услуга не видна');
  await call(`/api/admin/services/${sid}`, { method: 'DELETE' });

  const f = await call('/api/admin/faq', { method: 'POST', body: { question: 'Тест?', answer: 'Да.' } });
  assert.equal(f.status, 200); await call(`/api/admin/faq/${f.json.item.id}`, { method: 'DELETE' });
});

test('загрузка фото: оптимизация, выдача, отказ для не-картинок', async () => {
  const png = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#f8b4c8' } }).png().toBuffer();
  const fd = new FormData(); fd.append('file', new Blob([png], { type: 'image/png' }), 'a.png'); fd.append('caption', 'Тест');
  const g = await call('/api/admin/gallery', { method: 'POST', form: fd });
  assert.equal(g.status, 200); assert.match(g.json.item.image, /^\/media\/[a-f0-9]{32}$/);
  const media = await fetch(base + g.json.item.image);
  assert.equal(media.headers.get('content-type'), 'image/webp');
  const meta = await sharp(Buffer.from(await media.arrayBuffer())).metadata(); assert.equal(meta.width, 1800);

  const svg = new FormData(); svg.append('file', new Blob(['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'], { type: 'image/svg+xml' }), 'x.svg');
  assert.equal((await call('/api/admin/upload', { method: 'POST', form: svg })).status, 422);
  const txt = new FormData(); txt.append('file', new Blob(['hello'], { type: 'image/png' }), 'x.png');
  assert.equal((await call('/api/admin/upload', { method: 'POST', form: txt })).status, 422);

  await call(`/api/admin/gallery/${g.json.item.id}`, { method: 'DELETE' });
  assert.equal((await fetch(base + g.json.item.image)).status, 404, 'файл удалён вместе с записью');
});

test('смена пароля и выход', async () => {
  assert.equal((await call('/api/admin/change-password', { method: 'POST', body: { current: 'bad', next: 'NewPassword123' } })).status, 403);
  assert.equal((await call('/api/admin/change-password', { method: 'POST', body: { current: process.env.ADMIN_PASSWORD, next: 'short' } })).status, 422);
  assert.equal((await call('/api/admin/integrations')).json.any, false);
  await call('/api/admin/logout', { method: 'POST' }); cookie = '';
  assert.equal((await call('/api/admin/me')).status, 401);
});
