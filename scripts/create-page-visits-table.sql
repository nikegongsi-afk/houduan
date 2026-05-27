-- 页面访问记录表（在 Supabase SQL Editor 中执行）
CREATE TABLE IF NOT EXISTS page_visits (
  id BIGSERIAL PRIMARY KEY,
  trader_uuid UUID,
  ip_address TEXT,
  country TEXT,
  country_zh TEXT,
  city TEXT,
  city_zh TEXT,
  region TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  path TEXT,
  visit_host TEXT,
  visit_url TEXT,
  visitor_label TEXT DEFAULT '游客',
  user_id BIGINT,
  user_agent TEXT,
  visited_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_page_visits_trader_uuid ON page_visits (trader_uuid);
CREATE INDEX IF NOT EXISTS idx_page_visits_visited_at ON page_visits (visited_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_visits_city ON page_visits (city);

-- 允许后端 API 读写（Supabase 新建表默认开启 RLS，需显式放行）
ALTER TABLE page_visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "page_visits_insert" ON page_visits;
DROP POLICY IF EXISTS "page_visits_select" ON page_visits;
DROP POLICY IF EXISTS "page_visits_delete" ON page_visits;

CREATE POLICY "page_visits_insert" ON page_visits
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "page_visits_select" ON page_visits
  FOR SELECT
  USING (true);

CREATE POLICY "page_visits_delete" ON page_visits
  FOR DELETE
  USING (true);

CREATE POLICY "page_visits_update" ON page_visits
  FOR UPDATE
  USING (true)
  WITH CHECK (true);
