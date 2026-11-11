-- Токен Monobank закрепляется за профилем. В базе лежит только шифротекст:
-- ключ — секрет воркера TOKEN_KEY, из базы его не достать.
ALTER TABLE profiles ADD COLUMN mono_token TEXT;
ALTER TABLE profiles ADD COLUMN mono_token_at INTEGER;
