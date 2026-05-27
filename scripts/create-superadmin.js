/**
 * 创建超级管理员账号
 * 用法: node scripts/create-superadmin.js
 */
require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const { createClient } = require('@supabase/supabase-js');

const USERNAME = process.env.SUPERADMIN_USERNAME || 'admin';
const PASSWORD = process.env.SUPERADMIN_PASSWORD || 'Admin2026!';
const EMAIL = process.env.SUPERADMIN_EMAIL || 'admin@jack-ablin.com';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_KEY || ''
);

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    console.error('缺少 SUPABASE_URL 或 SUPABASE_KEY');
    process.exit(1);
  }

  const { data: existing } = await supabase
    .from('users')
    .select('id, username, role')
    .eq('username', USERNAME);

  if (existing && existing.length > 0) {
    console.log(`用户 "${USERNAME}" 已存在，跳过创建。`);
    console.log(`账号: ${USERNAME}`);
    console.log(`密码: （请使用已有密码，或手动在数据库重置）`);
    return;
  }

  const now = new Date().toISOString();
  const newUser = {
    id: uuidv4(),
    username: USERNAME,
    email: EMAIL,
    password_hash: PASSWORD,
    role: 'superadmin',
    status: 'active',
    isdel: false,
    realname: 'Super Admin',
    phonenumber: '',
    avatar_url: '',
    membership_level: '',
    membership_points: 0,
    initial_asset: 0,
    total_asset: 0,
    signing: false,
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await supabase.from('users').insert(newUser).select('id, username, role, email');
  if (error) {
    console.error('创建失败:', error.message);
    process.exit(1);
  }

  console.log('超级管理员创建成功！\n');
  console.log('登录地址: http://localhost:5173/login');
  console.log(`账号: ${USERNAME}`);
  console.log(`密码: ${PASSWORD}`);
  console.log(`角色: superadmin`);
  console.log(`邮箱: ${EMAIL}`);
  console.log('\n请登录后立即修改密码。');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
