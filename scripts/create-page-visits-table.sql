-- 页面访问记录表（在 Supabase SQL Editor 中执行）
CREATE TABLE IF NOT EXISTS page_visits (
  id BIGSERIAL PRIMARY KEY,
  trader_uuid UUID,
  ip_address TEXT,
  country TEXT,
  city TEXT,
  region TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  path TEXT,
  user_agent TEXT,
  visited_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_page_visits_trader_uuid ON page_visits (trader_uuid);
CREATE INDEX IF NOT EXISTS idx_page_visits_visited_at ON page_visits (visited_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_visits_city ON page_visits (city);
