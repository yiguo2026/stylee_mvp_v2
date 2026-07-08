-- AI 用量监控表 + 汇总视图 + RLS
-- 在 Supabase SQL Editor 里执行一次即可。配合 src/lib/aiUsage.ts 埋点与 tools/ai-usage-dashboard 看板。

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  provider TEXT,                 -- 'deepseek' | 'qwen'
  model TEXT,                    -- deepseek-v4-flash / qwen3-vl-plus / qwen-image-2.0-pro ...
  feature TEXT,                  -- recommend / recognize / standardize / tryon-image ...
  call_type TEXT,                -- 'chat' | 'vision' | 'image'
  dev_tag TEXT,                  -- EXPO_PUBLIC_DEV_TAG：区分开发者/环境
  user_id TEXT,                  -- 登录用户（如有）
  prompt_tokens INT,
  cached_tokens INT,
  completion_tokens INT,
  reasoning_tokens INT,          -- 推理模型的隐藏思考 token
  total_tokens INT,
  image_count INT,               -- 生图张数
  cost_cny NUMERIC(12,6),        -- 按 aiUsage.ts 定价计算（Qwen 价填 0 时为 0）
  duration_ms INT,
  ok BOOLEAN,
  request_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_feature ON ai_usage_logs (feature);
CREATE INDEX IF NOT EXISTS idx_ai_usage_dev ON ai_usage_logs (dev_tag);
CREATE INDEX IF NOT EXISTS idx_ai_usage_model ON ai_usage_logs (model);

-- 内部可观测性工具：允许匿名写入（客户端埋点）与读取（看板）。仅此一张表，风险可控。
ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_usage anon insert" ON ai_usage_logs;
DROP POLICY IF EXISTS "ai_usage anon read" ON ai_usage_logs;
CREATE POLICY "ai_usage anon insert" ON ai_usage_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "ai_usage anon read" ON ai_usage_logs FOR SELECT USING (true);

-- ── 汇总视图（Supabase 控制台可直接查）─────────────────────
CREATE OR REPLACE VIEW ai_usage_daily AS
  SELECT date_trunc('day', created_at) AS day, provider, model, feature,
         count(*) AS calls, sum(total_tokens) AS tokens, sum(image_count) AS images,
         round(sum(cost_cny), 4) AS cost_cny
  FROM ai_usage_logs GROUP BY 1, 2, 3, 4 ORDER BY 1 DESC;

CREATE OR REPLACE VIEW ai_usage_by_feature AS
  SELECT feature, provider, model, count(*) AS calls,
         sum(total_tokens) AS tokens, sum(image_count) AS images,
         sum(reasoning_tokens) AS reasoning_tokens,
         round(sum(cost_cny), 4) AS cost_cny
  FROM ai_usage_logs GROUP BY 1, 2, 3 ORDER BY cost_cny DESC NULLS LAST;

CREATE OR REPLACE VIEW ai_usage_by_dev AS
  SELECT dev_tag, count(*) AS calls, sum(total_tokens) AS tokens,
         sum(image_count) AS images, round(sum(cost_cny), 4) AS cost_cny
  FROM ai_usage_logs GROUP BY 1 ORDER BY cost_cny DESC NULLS LAST;
