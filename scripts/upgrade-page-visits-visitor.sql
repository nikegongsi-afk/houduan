-- 访问记录增加访客身份字段
ALTER TABLE page_visits ADD COLUMN IF NOT EXISTS visitor_label TEXT DEFAULT '游客';
ALTER TABLE page_visits ADD COLUMN IF NOT EXISTS user_id BIGINT;
