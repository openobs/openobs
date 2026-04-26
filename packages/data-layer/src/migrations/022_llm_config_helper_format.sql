-- 022 — instance_llm_config: api_key_helper + api_format
--
-- Adds two optional fields:
--   api_key_helper TEXT — shell command that prints a fresh API key on
--                          stdout; lets users plug in aws-vault / op /
--                          custom rotating-credential helpers.
--   api_format TEXT     — for corporate-gateway only; which wire format
--                          the gateway's upstream speaks ('anthropic',
--                          'openai', 'gemini', 'anthropic-bedrock').
--                          Backend dispatches to the matching provider
--                          implementation.
--
-- Both columns are NULLable since native providers don't need them.

ALTER TABLE instance_llm_config ADD COLUMN api_key_helper TEXT;
ALTER TABLE instance_llm_config ADD COLUMN api_format TEXT;
