/**
 * 初始化 page_visits 表
 * 用法: node scripts/create-page-visits-table.js
 *
 * 若 Supabase 尚未建表，请把 scripts/create-page-visits-table.sql
 * 复制到 Supabase Dashboard -> SQL Editor 执行。
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    console.error('缺少 SUPABASE_URL 或 SUPABASE_KEY');
    process.exit(1);
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  const sqlPath = path.join(__dirname, 'create-page-visits-table.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('请先在 Supabase SQL Editor 中执行以下脚本:');
  console.log('---');
  console.log(sql);
  console.log('---');

  const { error } = await supabase.from('page_visits').select('id').limit(1);
  if (error) {
    console.error('page_visits 表尚未就绪:', error.message);
    process.exit(1);
  }

  console.log('page_visits 表已存在，可以开始使用访问地图功能。');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
