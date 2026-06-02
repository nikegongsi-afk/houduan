/**
 * 升级 trades1.size 为两位小数类型
 *
 * 方式 1（推荐）：Supabase Dashboard -> SQL Editor，执行 upgrade-trades1-size-decimal.sql
 *
 * 方式 2：设置数据库直连后运行本脚本
 *   SUPABASE_DB_PASSWORD=你的数据库密码 node scripts/upgrade-trades1-size-decimal.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const sqlPath = path.join(__dirname, 'upgrade-trades1-size-decimal.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

function getDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const supabaseUrl = process.env.SUPABASE_URL || '';
  const match = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
  const projectRef = match ? match[1] : '';
  const password = process.env.SUPABASE_DB_PASSWORD;

  if (!projectRef || !password) {
    return null;
  }

  const host = process.env.SUPABASE_DB_HOST || `aws-0-us-west-1.pooler.supabase.com`;
  return `postgresql://postgres.${projectRef}:${encodeURIComponent(password)}@${host}:6543/postgres`;
}

async function verifyWithSupabase() {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  const { data } = await supabase.from('trades1').select('id').limit(1);
  if (!data?.length) {
    console.log('trades1 暂无数据，跳过小数写入验证');
    return;
  }

  const id = data[0].id;
  const { data: current } = await supabase.from('trades1').select('size').eq('id', id).single();
  const original = current?.size;
  const testVal = 12345.67;

  const { error } = await supabase.from('trades1').update({ size: testVal }).eq('id', id);
  if (error) {
    throw new Error(`验证失败: ${error.message}`);
  }

  await supabase.from('trades1').update({ size: original }).eq('id', id);
  console.log('验证通过：trades1.size 已支持小数');
}

async function main() {
  const databaseUrl = getDatabaseUrl();

  if (!databaseUrl) {
    console.log('未配置 DATABASE_URL 或 SUPABASE_DB_PASSWORD，请手动执行 SQL：');
    console.log('---');
    console.log(sql);
    console.log('---');
    process.exit(1);
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    await client.query(sql);
    console.log('数据库迁移完成');
  } finally {
    await client.end();
  }

  if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
    await verifyWithSupabase();
  }
}

main().catch((error) => {
  console.error('迁移失败:', error.message);
  process.exit(1);
});
