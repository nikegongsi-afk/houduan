/**
 * 清空所有访问记录
 * 用法: node scripts/clear-all-page-visits.js
 *
 * 若 API Key 无 DELETE 权限，请在 Supabase SQL Editor 执行:
 *   scripts/truncate-page-visits.sql
 * 并设置 .env 中的 VISIT_STATS_START_AT 为当前时间。
 */
require('dotenv').config();
const { supabase } = require('../config/supabase');

const clearAll = async () => {
  const { count: beforeCount, error: countError } = await supabase
    .from('page_visits')
    .select('*', { count: 'exact', head: true });

  if (countError) throw countError;

  const total = beforeCount || 0;
  if (!total) {
    console.log('访问记录已为空');
    return;
  }

  const { error } = await supabase.from('page_visits').delete().gte('id', 0);
  if (error) throw error;

  const { count: afterCount } = await supabase
    .from('page_visits')
    .select('*', { count: 'exact', head: true });

  if ((afterCount || 0) > 0) {
    const resetAt = new Date().toISOString();
    console.log(`API 无删除权限，仍有 ${afterCount} 条记录。`);
    console.log('请在 Supabase SQL Editor 执行: scripts/truncate-page-visits.sql');
    console.log(`并在 .env 设置: VISIT_STATS_START_AT=${resetAt}`);
    return;
  }

  console.log(`已清空 ${total} 条访问记录`);
};

clearAll().catch((error) => {
  console.error('清空失败:', error.message || error);
  process.exit(1);
});
