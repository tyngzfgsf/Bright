-- LLM provider is now configured by Supabase secrets (LLM_BASE_URL, LLM_API_KEY, LLM_MODEL_CHAT,
-- LLM_MODEL_GRADE). Per-tier models become optional overrides; null means "use the secret".
alter table public.tiers alter column chat_model drop not null;
alter table public.tiers alter column grade_model drop not null;
update public.tiers set chat_model = null, grade_model = null;

-- Reasoning models spend part of max_tokens on hidden reasoning, so leave headroom for the JSON turn.
update public.tiers set max_output_tokens = case name when 'plus' then 1200 else 1000 end;

-- Prices (USD per 1M tokens) keyed by exact model id, plus a "default" used for any model not listed.
-- These are deliberately conservative placeholders: set the real figures from your provider's model page, e.g.
--   update public.app_config set value = jsonb_set(value, '{openai/gpt-oss-20b}',
--     '{"input": X, "cached_input": Y, "output": Z}') where key = 'prices';
-- Alternatively set the LLM_PRICE_INPUT_PER_M / LLM_PRICE_OUTPUT_PER_M secrets. If the provider reports a
-- per-request cost (OpenRouter's usage.cost), that figure is used instead.
update public.app_config
   set value = '{"default": {"input": 0.15, "cached_input": 0.15, "output": 0.60}}'::jsonb
 where key = 'prices';
