-- 为 page_visits 增加域名字段与中文字段
ALTER TABLE page_visits ADD COLUMN IF NOT EXISTS visit_host TEXT;
ALTER TABLE page_visits ADD COLUMN IF NOT EXISTS visit_url TEXT;
ALTER TABLE page_visits ADD COLUMN IF NOT EXISTS country_zh TEXT;
ALTER TABLE page_visits ADD COLUMN IF NOT EXISTS city_zh TEXT;

DROP POLICY IF EXISTS "page_visits_update" ON page_visits;
CREATE POLICY "page_visits_update" ON page_visits
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- 可选：合并历史重复 IP（保留每个 IP 最新一条）
DELETE FROM page_visits a
USING page_visits b
WHERE a.id < b.id
  AND a.trader_uuid = b.trader_uuid
  AND a.ip_address = b.ip_address
  AND a.ip_address IS NOT NULL
  AND a.ip_address <> '';
