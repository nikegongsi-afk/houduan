/**
 * 清空业务数据：保留 role 为 admin / superadmin 的用户，删除其余用户及全部老师/业务资料。
 * 用法: node scripts/wipe-database.js [--dry-run]
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

async function countTable(table) {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
  if (error) return { table, error: error.message };
  return { table, count: count ?? 0 };
}

async function deleteAllRows(table) {
  const { error, count } = await supabase
    .from(table)
    .delete({ count: 'exact' })
    .not('id', 'is', null);

  if (error) {
    // 部分表主键可能不是 id，再试 uuid 列
    const retry = await supabase.from(table).delete({ count: 'exact' }).gte('created_at', '1970-01-01');
    if (retry.error) throw new Error(`${table}: ${error.message} / retry: ${retry.error.message}`);
    return retry.count ?? 0;
  }
  return count ?? 0;
}

async function deleteNonAdminUsers() {
  const { data: keepUsers, error: keepErr } = await supabase
    .from('users')
    .select('id, username, role')
    .in('role', ['admin', 'superadmin']);

  if (keepErr) throw new Error(`查询保留用户失败: ${keepErr.message}`);

  const { count: totalUsers, error: totalErr } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true });
  if (totalErr) throw new Error(`统计用户失败: ${totalErr.message}`);

  const keepIds = (keepUsers || []).map((u) => u.id);
  const deleteCount = (totalUsers ?? 0) - keepIds.length;

  if (DRY_RUN) {
    console.log('\n保留的管理员账号:');
    (keepUsers || []).forEach((u) => console.log(`  - ${u.username} (${u.role})`));
    return { deleted: deleteCount, kept: keepIds.length };
  }

  if (keepIds.length > 0) {
    const { error: sessionErr, count: sessionCount } = await supabase
      .from('user_sessions')
      .delete({ count: 'exact' })
      .not('user_id', 'in', `(${keepIds.map((id) => `"${id}"`).join(',')})`);
    if (sessionErr) throw new Error(`删除非管理员会话失败: ${sessionErr.message}`);
    console.log(`  user_sessions: 删除 ${sessionCount ?? 0} 条`);
  } else {
    const { error: sessionErr, count: sessionCount } = await supabase
      .from('user_sessions')
      .delete({ count: 'exact' })
      .not('id', 'is', null);
    if (sessionErr) throw new Error(`删除全部会话失败: ${sessionErr.message}`);
    console.log(`  user_sessions: 删除 ${sessionCount ?? 0} 条`);
  }

  const { error: userErr, count: userDelCount } = await supabase
    .from('users')
    .delete({ count: 'exact' })
    .neq('role', 'admin')
    .neq('role', 'superadmin');

  if (userErr) throw new Error(`删除普通用户失败: ${userErr.message}`);

  console.log('\n保留的管理员账号:');
  (keepUsers || []).forEach((u) => console.log(`  - ${u.username} (${u.role})`));

  return { deleted: userDelCount ?? deleteCount, kept: keepIds.length };
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    console.error('缺少 SUPABASE_URL 或 SUPABASE_KEY，请检查 .env');
    process.exit(1);
  }

  console.log(DRY_RUN ? '=== 预览模式（不执行删除）===' : '=== 开始清空数据库 ===');
  console.log(`Supabase: ${process.env.SUPABASE_URL}\n`);

  console.log('当前各表记录数:');
  for (const table of [...TABLES_DELETE_ALL, 'users', 'user_sessions']) {
    const result = await countTable(table);
    if (result.error) {
      console.log(`  ${table}: (跳过/不存在) ${result.error}`);
    } else {
      console.log(`  ${table}: ${result.count}`);
    }
  }

  const { count: userCount } = await countTable('users');
  const { data: admins } = await supabase.from('users').select('id, username, role').in('role', ['admin', 'superadmin']);
  console.log(`\nusers 总计 ${userCount ?? 0}，将保留 admin/superadmin ${(admins || []).length} 个`);

  if (DRY_RUN) {
    const preview = await deleteNonAdminUsers();
    console.log(`\n预览: 将删除 ${preview.deleted} 个用户，保留 ${preview.kept} 个管理员`);
    console.log(`预览: 将清空 ${TABLES_DELETE_ALL.length} 张业务表`);
    return;
  }

  console.log('\n删除业务数据表...');
  for (const table of TABLES_DELETE_ALL) {
    try {
      const deleted = await deleteAllRows(table);
      console.log(`  ${table}: 删除 ${deleted} 条`);
    } catch (err) {
      console.log(`  ${table}: 失败 - ${err.message}`);
    }
  }

  console.log('\n删除非管理员用户...');
  const userResult = await deleteNonAdminUsers();
  console.log(`  users: 删除 ${userResult.deleted} 个，保留 ${userResult.kept} 个`);

  console.log('\n=== 清空完成 ===');
  console.log('注意: Supabase Storage 中的视频/图片文件需到控制台手动清理。');
}

main().catch((err) => {
  console.error('\n执行失败:', err.message);
  process.exit(1);
});
