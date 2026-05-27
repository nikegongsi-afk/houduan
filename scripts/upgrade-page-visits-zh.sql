-- 访问记录增加中文字段
ALTER TABLE page_visits ADD COLUMN IF NOT EXISTS country_zh TEXT;
ALTER TABLE page_visits ADD COLUMN IF NOT EXISTS city_zh TEXT;
