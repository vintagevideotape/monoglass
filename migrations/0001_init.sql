-- MonoGlass: первая схема. У каждой записи есть владелец (owner) — под будущие профили.
-- Деньги — целые копейки (минимальные единицы валюты счёта). Время — unix-секунды, updated_at — миллисекунды.

CREATE TABLE profiles (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE TABLE accounts (
  owner TEXT NOT NULL,
  id TEXT NOT NULL,
  source TEXT NOT NULL,                       -- mono | cash
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT '',
  currency INTEGER NOT NULL DEFAULT 980,
  balance INTEGER NOT NULL DEFAULT 0,         -- карты: остаток вместе с кредитным лимитом
  credit_limit INTEGER NOT NULL DEFAULT 0,
  opening_balance INTEGER NOT NULL DEFAULT 0, -- наличные: сумма на момент заведения счёта
  opened_at INTEGER NOT NULL DEFAULT 0,
  masked_pan TEXT NOT NULL DEFAULT '',
  sync INTEGER NOT NULL DEFAULT 0,            -- загружать ли выписку
  backfill_queued INTEGER NOT NULL DEFAULT 0, -- очередь загрузки истории уже создана
  synced_to INTEGER NOT NULL DEFAULT 0,
  checked_at INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (owner, id)
);

CREATE TABLE jars (
  owner TEXT NOT NULL,
  id TEXT NOT NULL,
  title TEXT NOT NULL,
  currency INTEGER NOT NULL DEFAULT 980,
  balance INTEGER NOT NULL DEFAULT 0,
  goal INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (owner, id)
);

CREATE TABLE ops (
  owner TEXT NOT NULL,
  id TEXT NOT NULL,
  source TEXT NOT NULL,                       -- mono | legacy | manual
  account_id TEXT NOT NULL DEFAULT '',
  at INTEGER NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  mcc TEXT NOT NULL DEFAULT '',
  amount INTEGER NOT NULL,
  currency INTEGER NOT NULL DEFAULT 980,
  operation_amount INTEGER,
  operation_currency INTEGER,
  balance INTEGER,
  hold INTEGER NOT NULL DEFAULT 0,
  cashback INTEGER NOT NULL DEFAULT 0,
  commission INTEGER NOT NULL DEFAULT 0,
  comment TEXT NOT NULL DEFAULT '',
  counter_name TEXT NOT NULL DEFAULT '',
  legacy_id TEXT,                             -- ID строки старой таблицы, если склеено по сумме и времени
  legacy_account TEXT,
  legacy_category TEXT,
  legacy_subcategory TEXT,
  legacy_project INTEGER NOT NULL DEFAULT 0,
  legacy_transfer INTEGER NOT NULL DEFAULT 0,
  set_kind TEXT,                              -- ручная разметка
  set_category TEXT,
  set_subcategory TEXT,
  note TEXT NOT NULL DEFAULT '',
  recurring_id TEXT,
  period TEXT,
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (owner, id)
);
CREATE INDEX ops_at ON ops (owner, at);
CREATE INDEX ops_updated ON ops (owner, updated_at);
CREATE INDEX ops_source_at ON ops (owner, source, at);

CREATE TABLE recurring (
  owner TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  currency INTEGER NOT NULL DEFAULT 980,
  day INTEGER NOT NULL DEFAULT 1,
  category TEXT NOT NULL DEFAULT '',
  account_id TEXT,
  variable INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (owner, id)
);

-- Настройки пользователя: конверты, доход, правила. Значение — JSON.
CREATE TABLE settings (
  owner TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (owner, key)
);

-- Служебное состояние синхронизации и курс валют.
CREATE TABLE state (
  owner TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (owner, key)
);

-- Очередь запросов выписки: банк разрешает один запрос в минуту и не больше 31 дня за раз.
CREATE TABLE sync_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner TEXT NOT NULL,
  account_id TEXT NOT NULL,
  from_ts INTEGER NOT NULL,
  to_ts INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',     -- pending | done | failed
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at INTEGER NOT NULL,
  done_at INTEGER
);
CREATE INDEX sync_jobs_pending ON sync_jobs (owner, status, to_ts);
