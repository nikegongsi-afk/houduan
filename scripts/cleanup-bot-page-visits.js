/**
 * 清理历史爬虫/扫描器访问记录
 * 用法: node scripts/cleanup-bot-page-visits.js
 * 加 --dry-run 仅预览不删除
 */
require('dotenv').config();
const { select, delete: del } = require('../config/supabase');
const { isBotVisit } = require('../config/visitBotFilter');

const dryRun = process.argv.includes('--dry-run');

const cleanup = async () => {
  const botIds = [];
  let offset = 0;
  const pageSize = 1000;
  let total = 0;

  while (true) {
    const visits = await select(
      'page_visits',
      'id, user_agent, visit_host, ip_address, country, visited_at',
      [],
      pageSize,
      offset,
      { column: 'id', ascending: true }
    );
    if (!visits?.length) break;
    total += visits.length;
    botIds.push(...visits.filter(isBotVisit).map((v) => v.id));
    if (visits.length < pageSize) break;
    offset += pageSize;
  }

  console.log(`共 ${total} 条，疑似机器人/扫描 ${botIds.length} 条`);

  if (!botIds.length) {
    console.log('无需清理');
    return;
  }

  if (dryRun) {
    console.log('dry-run 模式，未删除。示例 ID:', botIds.slice(0, 10).join(', '));
    return;
  }

  const batchSize = 100;
  let deleted = 0;
  for (let i = 0; i < botIds.length; i += batchSize) {
    const batch = botIds.slice(i, i + batchSize);
    await del('page_visits', [{ type: 'in', column: 'id', value: batch }]);
    deleted += batch.length;
  }

  console.log(`已删除 ${deleted} 条机器人/扫描访问记录`);
};

cleanup().catch((error) => {
  console.error('清理失败:', error);
  process.exit(1);
});
