/**
 * 初始化交易市场数据（trade_market 表）
 * 用法: node scripts/seed-trade-markets.js [--force]
 *
 * --force  清空现有数据后重新写入
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const FORCE = process.argv.includes('--force');

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_KEY || ''
);

// 与后台交易录入、实时行情接口保持一致
const DEFAULT_MARKETS = [
  { marketname: 'US', currency: '$', exchange_rate: '1' },
  { marketname: 'India', currency: '₹', exchange_rate: '83' },
  { marketname: 'HK', currency: 'HK$', exchange_rate: '7.8' },
  { marketname: 'CN', currency: '¥', exchange_rate: '7.2' },
  { marketname: 'UK', currency: '£', exchange_rate: '0.79' },
];

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    console.error('缺少 SUPABASE_URL 或 SUPABASE_KEY');
    process.exit(1);
  }

  const { data: existing, error: fetchError } = await supabase
    .from('trade_market')
    .select('id, marketname')
    .order('id', { ascending: true });

  if (fetchError) {
    console.error('读取 trade_market 失败:', fetchError.message);
    process.exit(1);
  }

  if (existing && existing.length > 0 && !FORCE) {
    console.log(`trade_market 已有 ${existing.length} 条记录，跳过写入。`);
    existing.forEach((row) => console.log(`  - [${row.id}] ${row.marketname}`));
    console.log('如需覆盖，请执行: node scripts/seed-trade-markets.js --force');
    return;
  }

  if (FORCE && existing && existing.length > 0) {
    const ids = existing.map((row) => row.id);
    const { error: deleteError } = await supabase.from('trade_market').delete().in('id', ids);
    if (deleteError) {
      console.error('清空 trade_market 失败:', deleteError.message);
      process.exit(1);
    }
    console.log(`已清空 ${ids.length} 条旧记录。`);
  }

  const { data: inserted, error: insertError } = await supabase
    .from('trade_market')
    .insert(DEFAULT_MARKETS)
    .select();

  if (insertError) {
    console.error('写入 trade_market 失败:', insertError.message);
    process.exit(1);
  }

  console.log(`成功写入 ${inserted.length} 条交易市场数据：`);
  inserted.forEach((row) => {
    console.log(`  [${row.id}] ${row.marketname} | ${row.currency} | 汇率 ${row.exchange_rate}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
