/**
 * 根据 visit_host 回填 page_visits.trader_uuid（历史数据未写入交易员时使用）
 * 用法: node scripts/backfill-page-visits-trader-uuid.js
 */
require('dotenv').config();
const { select, update } = require('../config/supabase');
const { TRADER_UUID_BY_HOST } = require('../config/visitTraderConfig');

const backfill = async () => {
  const visits = await select(
    'page_visits',
    'id, trader_uuid, visit_host',
    [],
    10000,
    0,
    { column: 'visited_at', ascending: false }
  );

  let updated = 0;
  for (const visit of visits || []) {
    if (visit.trader_uuid || !visit.visit_host) continue;

    const traderUuid = TRADER_UUID_BY_HOST[String(visit.visit_host).toLowerCase()];
    if (!traderUuid) continue;

    await update('page_visits', { trader_uuid: traderUuid }, [
      { type: 'eq', column: 'id', value: visit.id },
    ]);
    updated += 1;
  }

  console.log(`回填完成，更新 ${updated} 条记录`);
};

backfill().catch((error) => {
  console.error('回填失败:', error);
  process.exit(1);
});
