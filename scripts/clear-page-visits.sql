-- 清空所有访问记录
TRUNCATE TABLE page_visits RESTART IDENTITY;

-- 若 TRUNCATE 不可用，可改用下面两行（需先有 page_visits_delete 策略）：
-- DROP POLICY IF EXISTS "page_visits_delete" ON page_visits;
-- CREATE POLICY "page_visits_delete" ON page_visits FOR DELETE USING (true);
-- DELETE FROM page_visits;
