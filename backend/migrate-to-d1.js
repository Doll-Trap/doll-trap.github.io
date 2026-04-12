/**
 * Neon → Cloudflare D1 数据迁移脚本
 * 用法：cd backend && node migrate-to-d1.js
 * 生成 migration-data.sql，然后执行：
 *   npx wrangler d1 execute dolltrap-db --file=migration-data.sql
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

// Tables in FK-safe order
const TABLES = [
  'users',
  'events',
  'photos',
  'videos',
  'members',
  'member_saved_events',
  'member_saved_photos',
  'member_checkins',
  'member_messages',
  'member_cheers',
  'game_users',
  'inventory',
];

function escape(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? '1' : '0';
  if (typeof val === 'number') return String(val);
  if (val instanceof Date) {
    return `'${val.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '')}'`;
  }
  return `'${String(val).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

async function run() {
  let sql = '-- Neon → D1 migration data\n-- Generated: ' + new Date().toISOString() + '\n\n';

  for (const table of TABLES) {
    let rows;
    try {
      const result = await pool.query(`SELECT * FROM ${table} ORDER BY 1`);
      rows = result.rows;
    } catch {
      console.log(`  Skipping ${table} (not found)`);
      continue;
    }

    if (rows.length === 0) {
      console.log(`  ${table}: 0 rows`);
      continue;
    }

    const cols = Object.keys(rows[0]).join(', ');
    for (const row of rows) {
      const vals = Object.values(row).map(escape).join(', ');
      sql += `INSERT INTO ${table} (${cols}) VALUES (${vals});\n`;
    }
    sql += '\n';
    console.log(`  ${table}: ${rows.length} rows`);
  }

  fs.writeFileSync('migration-data.sql', sql);
  console.log('\n✅  Saved to backend/migration-data.sql');
  console.log('Next: cd worker && npx wrangler d1 execute dolltrap-db --file=../backend/migration-data.sql');
  await pool.end();
}

run().catch(err => { console.error(err); process.exit(1); });
