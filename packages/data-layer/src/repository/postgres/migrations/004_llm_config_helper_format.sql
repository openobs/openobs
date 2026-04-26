-- 004 — instance_llm_config: api_key_helper + api_format (Postgres)
--
-- Mirrors SQLite migration 022. Adds two NULLable columns:
--   api_key_helper TEXT — shell command that prints a fresh API key.
--   api_format     TEXT — corp-gateway upstream wire format
--                          ('anthropic', 'openai', 'gemini',
--                           'anthropic-bedrock').

ALTER TABLE instance_llm_config ADD COLUMN IF NOT EXISTS api_key_helper TEXT;
ALTER TABLE instance_llm_config ADD COLUMN IF NOT EXISTS api_format TEXT;
