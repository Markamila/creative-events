import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => console.error('[db] неожиданная ошибка пула:', err.message));

export const q = (text, params) => pool.query(text, params);

/** Создаёт таблицы, если их ещё нет. Безопасно запускать при каждом старте. */
export async function migrate() {
  await q(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value JSONB NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admins (
      id            SERIAL PRIMARY KEY,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS images (
      id         TEXT PRIMARY KEY,
      mime       TEXT NOT NULL,
      data       BYTEA NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS services (
      id          SERIAL PRIMARY KEY,
      category    TEXT NOT NULL,
      title       TEXT NOT NULL,
      short       TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      image       TEXT NOT NULL DEFAULT '',
      examples    JSONB NOT NULL DEFAULT '[]',
      sort        INTEGER NOT NULL DEFAULT 0,
      active      BOOLEAN NOT NULL DEFAULT TRUE
    );

    CREATE TABLE IF NOT EXISTS packages (
      id          SERIAL PRIMARY KEY,
      code        TEXT UNIQUE NOT NULL,
      name        TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      includes    TEXT NOT NULL DEFAULT '',
      features    JSONB NOT NULL DEFAULT '[]',
      price_from  INTEGER,
      price_unit  TEXT NOT NULL DEFAULT 'per_person',
      price_note  TEXT NOT NULL DEFAULT '',
      highlighted BOOLEAN NOT NULL DEFAULT FALSE,
      sort        INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS gallery (
      id       SERIAL PRIMARY KEY,
      image    TEXT NOT NULL,
      caption  TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      sort     INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS faq (
      id       SERIAL PRIMARY KEY,
      question TEXT NOT NULL,
      answer   TEXT NOT NULL,
      sort     INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS requests (
      id             SERIAL PRIMARY KEY,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      name           TEXT NOT NULL,
      phone          TEXT NOT NULL,
      contact_method TEXT NOT NULL,
      event_date     DATE,
      event_time     TEXT NOT NULL DEFAULT '',
      participants   INTEGER,
      event_type     TEXT NOT NULL DEFAULT '',
      services       JSONB NOT NULL DEFAULT '[]',
      package        TEXT NOT NULL DEFAULT 'UNDECIDED',
      wishes         TEXT NOT NULL DEFAULT '',
      status         TEXT NOT NULL DEFAULT 'new',
      consent_at     TIMESTAMPTZ,
      notified       BOOLEAN NOT NULL DEFAULT FALSE,
      notify_info    TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS requests_created_idx ON requests (created_at DESC);
    CREATE INDEX IF NOT EXISTS requests_status_idx ON requests (status);

    CREATE TABLE IF NOT EXISTS request_comments (
      id         SERIAL PRIMARY KEY,
      request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
      author     TEXT NOT NULL,
      text       TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}
