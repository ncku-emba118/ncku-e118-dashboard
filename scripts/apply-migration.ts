/**
 * scripts/apply-migration.ts — 套用單一 migration 到 e118-board Supabase（transaction 包覆）。
 * 用法: npx tsx scripts/apply-migration.ts supabase/migrations/0008_finance.sql
 * 安全: DB 密碼從 _secrets/ 讀（不印）; 任何錯 → ROLLBACK。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from 'pg';

const PROJECT_REF = 'ibuhmjqimvgjlcbagiyn';
const rel = process.argv[2];
if (!rel) {
  console.error('usage: tsx scripts/apply-migration.ts <path-to-sql>');
  process.exit(1);
}

async function main() {
  const pw = fs
    .readFileSync(path.join(os.homedir(), 'Documents/成大EMBA/e118-board/_secrets/supabase-db-password.txt'), 'utf8')
    .trim();
  const sql = fs.readFileSync(path.resolve(rel), 'utf8');
  const cs = `postgresql://postgres.${PROJECT_REF}:${encodeURIComponent(pw)}@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres`;
  const client = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('✓ connected', PROJECT_REF, '· applying', rel);
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('✓ committed');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}
main().catch((err) => {
  console.error('\n❌ failed:', err.message);
  if (err.code) console.error('   PG code:', err.code);
  if (err.where) console.error('   where:', err.where);
  process.exit(1);
});
