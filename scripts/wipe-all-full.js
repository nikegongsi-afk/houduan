/**
 * 彻底清空：删除全部用户（含 admin/superadmin）、交易员资料、视频/文档及关联业务数据。
 * 用法: node scripts/wipe-all-full.js [--dry-run]
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const DRY_RUN = process.argv.includes('--dry-run');

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_KEY || ''
);

const TABLES_DELETE_ALL = [
  'like_records',
  'daily_likes',
  'contact_records',
  'membership_points_log',
  'payment_records',
  'ai_stock_picker',
  'visit_stats',
  'invitation_code',
  'question_bank',
  'leaderboard_traders',
  'whatsapp_agents',
  'partner_organizations',
  'web_links',
  'vip_announcements',
  'vip_trades',
  'trades',
  'trades1',
  'trading_strategies',
  'announcements',
  'documents',
  'videos',
  'trade_market',
  'membership_levels',
  'membership_points_rules',
  'avatars',
  'trader_profiles',
];

const STORAGE_BUCKETS = ['videos', 'documents', 'images'];

async function countTable(table) {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
  if (error) return { table, error: error.message };
  return { table, count: count ?? 0 };
}

async function deleteAllRows(table) {
  if (DRY_RUN) {
    const { count } = await countTable(table);
    return count ?? 0;
  }

  const { error, count } = await supabase
    .from(table)
    .delete({ count: 'exact' })
    .not('id', 'is', null);

  if (error) {
    const retry = await supabase.from(table).delete({ count: 'exact' }).gte('created_at', '1970-01-01');
    if (retry.error) throw new Error(`${table}: ${error.message}`);
    return retry.count ?? 0;
  }
  return count ?? 0;
}

async function deleteAllUsers() {
  const { count: totalUsers } = await countTable('users');
  if (DRY_RUN) return { deleted: totalUsers ?? 0, kept: 0 };

  const { count: sessionCount, error: sessionErr } = await supabase
    .from('user_sessions')
    .delete({ count: 'exact' })
    .not('id', 'is', null);
  if (sessionErr) throw new Error(`删除会话失败: ${sessionErr.message}`);
  console.log(`  user_sessions: 删除 ${sessionCount ?? 0} 条`);

  const { count: userDelCount, error: userErr } = await supabase
    .from('users')
    .delete({ count: 'exact' })
    .not('id', 'is', null);
  if (userErr) throw new Error(`删除全部用户失败: ${userErr.message}`);

  return { deleted: userDelCount ?? totalUsers ?? 0, kept: 0, sessions: sessionCount ?? 0 };
}

async function listBucketFiles(bucket, prefix = '') {
  const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error) throw new Error(`${bucket}/${prefix}: ${error.message}`);

  const paths = [];
  for (const item of data || []) {
    const itemPath = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.metadata) {
      paths.push(itemPath);
    } else {
      const nested = await listBucketFiles(bucket, itemPath);
      paths.push(...nested);
    }
  }
  return paths;
}

async function emptyStorageBucket(bucket) {
  const files = await listBucketFiles(bucket);
  if (files.length === 0) return 0;
  if (DRY_RUN) return files.length;

  const batchSize = 100;
  let removed = 0;
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    const { error } = await supabase.storage.from(bucket).remove(batch);
    if (error) throw new Error(`${bucket} storage: ${error.message}`);
    removed += batch.length;
  }
  return removed;
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    console.error('缺少 SUPABASE_URL 或 SUPABASE_KEY');
    process.exit(1);
  }

  console.log(DRY_RUN ? '=== 预览模式（不执行删除）===' : '=== 开始彻底清空数据库 ===');
  console.log(`Supabase: ${process.env.SUPABASE_URL}\n`);

  console.log('当前记录数:');
  for (const table of [...TABLES_DELETE_ALL, 'users', 'user_sessions']) {
    const result = await countTable(table);
    console.log(`  ${table}: ${result.error ? `(跳过) ${result.error}` : result.count}`);
  }

  const { data: usersByRole } = await supabase.from('users').select('role');
  const roleCount = (usersByRole || []).reduce((acc, u) => {
    acc[u.role] = (acc[u.role] || 0) + 1;
    return acc;
  }, {});
  console.log('\n用户角色分布:', roleCount);
  console.log('将删除全部用户（含 admin / superadmin / user）');
  console.log('将清空全部视频、文档、交易员档案及关联数据\n');

  if (DRY_RUN) {
    for (const bucket of STORAGE_BUCKETS) {
      try {
        const n = await emptyStorageBucket(bucket);
        console.log(`  storage/${bucket}: ${n} 个文件`);
      } catch (e) {
        console.log(`  storage/${bucket}: ${e.message}`);
      }
    }
    return;
  }

  console.log('1. 删除业务数据表...');
  for (const table of TABLES_DELETE_ALL) {
    try {
      const deleted = await deleteAllRows(table);
      console.log(`  ${table}: 删除 ${deleted} 条`);
    } catch (err) {
      console.log(`  ${table}: 失败 - ${err.message}`);
    }
  }

  console.log('\n2. 删除全部用户及会话...');
  const userResult = await deleteAllUsers();
  console.log(`  users: 删除 ${userResult.deleted} 个`);

  console.log('\n3. 清空 Storage 文件...');
  for (const bucket of STORAGE_BUCKETS) {
    try {
      const n = await emptyStorageBucket(bucket);
      console.log(`  storage/${bucket}: 删除 ${n} 个文件`);
    } catch (err) {
      console.log(`  storage/${bucket}: 失败 - ${err.message}`);
    }
  }

  console.log('\n=== 彻底清空完成 ===');
  console.log('所有管理员账号已删除，需重新创建 superadmin 才能登录后台。');
}

main().catch((err) => {
  console.error('\n执行失败:', err.message);
  process.exit(1);
});
