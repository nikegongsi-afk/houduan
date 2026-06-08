-- 同一 IP 累计访问次数 + 首次/最近访问时间
ALTER TABLE page_visits ADD COLUMN IF NOT EXISTS visit_count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE page_visits ADD COLUMN IF NOT EXISTS first_visited_at TIMESTAMPTZ;

UPDATE page_visits
SET first_visited_at = visited_at
WHERE first_visited_at IS NULL AND visited_at IS NOT NULL;

UPDATE page_visits
SET visit_count = 1
WHERE visit_count IS NULL OR visit_count < 1;
