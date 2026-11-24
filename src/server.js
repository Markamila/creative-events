import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { pool, migrate } from './db.js';
import { seed } from './seed.js';
import { getSite, normalizeSocial } from './content.js';
import { publicRouter, mediaHandler } from './routes-public.js';
import { adminRouter } from './routes-admin.js';
import { integrationStatus } from './notify.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const isProd = process.env.NODE_ENV === 'production';
if (!process.env.JWT_SECRET) {
  if (isProd) {
    console.error('Не задан JWT_SECRET. Сгенерируйте длинную случайную строку и добавьте её в переменные окружения.');
    process.exit(1);
  }
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  console.warn('[server] JWT_SECRET не задан — использую временный (сессии сбросятся после перезапуска).');
}
if (!process.env.DATABASE_URL) {
  console.error('Не задан DATABASE_URL (строка подключения к PostgreSQL).');
  process.exit(1);
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Render и большинство хостингов стоят за прокси

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
        'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
        'img-src': ["'self'", 'data:', 'blob:'],
        'connect-src': ["'self'"],
        'frame-ancestors': ["'none'"],
        'form-action': ["'self'"],
        'object-src': ["'none'"],
        'upgrade-insecure-requests': isProd ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: isProd,
  }));
  app.use(compression());
  app.use(cookieParser());
  app.use(express.json({ limit: '50kb' }));

  app.get('/healthz', async (_req, res) => {
    try { await pool.query('SELECT 1'); res.json({ ok: true }); }
    catch { res.status(503).json({ ok: false }); }
  });

  app.use('/api/admin', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, adminRouter);
  app.use('/api', publicRouter);
  app.get('/media/:id', mediaHandler);

  const indexTemplate = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
  const escAttr = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const baseUrl = (req) => (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');

  async function renderIndex(req, res, next) {
    try {
      const site = normalizeSocial(await getSite());
      const base = baseUrl(req);
      const ld = {
        '@context': 'https://schema.org',
        '@type': 'LocalBusiness',
        name: site.company_name,
        description: site.seo_description,
        url: base + '/',
        telephone: site.phone || undefined,
        areaServed: site.city || undefined,
        address: site.city ? { '@type': 'PostalAddress', addressLocality: site.city } : undefined,
        openingHours: site.work_hours || undefined,
        sameAs: [site.instagram_url, site.telegram_url].filter(Boolean),
      };
      const html = indexTemplate
        .replaceAll('{{SEO_TITLE}}', escAttr(site.seo_title || site.company_name))
        .replaceAll('{{SEO_DESCRIPTION}}', escAttr(site.seo_description))
        .replaceAll('{{COMPANY}}', escAttr(site.company_name))
        .replaceAll('{{CANONICAL}}', escAttr(base + '/'))
        .replaceAll('{{OG_IMAGE}}', escAttr(base + (site.hero_image || '/img/hero.svg')))
        .replaceAll('{{JSONLD}}', JSON.stringify(ld).replace(/</g, '\\u003c'));
      res.set('Cache-Control', 'no-cache').type('html').send(html);
    } catch (e) { next(e); }
  }

  app.get(['/', '/index.html'], renderIndex);

  app.get('/robots.txt', (req, res) => {
    res.type('text/plain').send(`User-agent: *\nDisallow: /admin\nDisallow: /api/\nAllow: /\n\nSitemap: ${baseUrl(req)}/sitemap.xml\n`);
  });
  app.get('/sitemap.xml', (req, res) => {
    res.type('application/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${baseUrl(req)}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>\n</urlset>\n`,
    );
  });

  // Админ-панель: отдельная страница, не индексируется.
  app.get(['/admin', '/admin/'], (_req, res) => {
    res.set({ 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-cache' });
    res.sendFile(path.join(PUBLIC_DIR, 'admin', 'index.html'));
  });

  app.use(express.static(PUBLIC_DIR, {
    index: false,
    setHeaders(res, file) {
      if (/\.(css|js|html)$/.test(file)) res.set('Cache-Control', 'no-cache');
      else res.set('Cache-Control', 'public, max-age=604800');
      if (file.includes(`${path.sep}admin${path.sep}`)) res.set('X-Robots-Tag', 'noindex, nofollow');
    },
  }));

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Не найдено' }));
  app.use((_req, res) => res.status(404).type('html').send(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Страница не найдена</title>' +
    '<body style="font-family:system-ui;text-align:center;padding:20vh 1rem;color:#5b3a45;background:#fff6f8"><h1>Страница не найдена</h1><p><a href="/" style="color:#c2587a">Вернуться на главную</a></p></body>',
  ));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Некорректный запрос' });
    console.error('[error]', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера. Попробуйте позже.' });
  });

  return app;
}

export async function start() {
  // На Render база может подниматься одновременно с сервисом — несколько попыток.
  for (let i = 1; ; i++) {
    try { await migrate(); break; }
    catch (e) {
      if (i >= 10) throw e;
      console.warn(`[db] нет соединения (попытка ${i}/10): ${e.message}`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  await seed();

  const st = integrationStatus();
  console.log(`[notify] Telegram: ${st.telegram ? 'настроен' : 'не настроен'}, e-mail: ${st.email ? 'настроен' : 'не настроен'}`);
  if (!st.any) console.warn('[notify] Уведомления не настроены — заявки сохраняются в базе и видны в /admin (см. README).');

  const port = Number(process.env.PORT || 3000);
  const server = createApp().listen(port, () => console.log(`[server] http://localhost:${port}`));
  const shutdown = () => server.close(() => pool.end().then(() => process.exit(0)));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  start().catch((e) => { console.error(e); process.exit(1); });
}
