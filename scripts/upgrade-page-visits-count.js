/**
 * 为 page_visits 增加 visit_count / first_visited_at
 * 请在 Supabase SQL Editor 执行 scripts/upgrade-page-visits-count.sql
 */
const fs = require('fs');
const path = require('path');

const sqlPath = path.join(__dirname, 'upgrade-page-visits-count.sql');
console.log('请在 Supabase SQL Editor 中执行以下脚本：\n');
console.log(fs.readFileSync(sqlPath, 'utf8'));
