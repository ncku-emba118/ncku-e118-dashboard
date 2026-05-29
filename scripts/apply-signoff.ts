/**
 * scripts/apply-signoff.ts — 套用 0007_signoff（簽核系統）到 e118-board Supabase。
 *
 * 安全：
 * - DB 密碼從 _secrets/supabase-db-password.txt 讀（gitignored、不印出）
 * - 整份 0007 包在單一 transaction：任何語法/邏輯錯 → ROLLBACK，不留半套
 * - 已存在（signoff_documents 在）→ 直接跳過（0007 用 CREATE TABLE 無 IF NOT EXISTS）
 *
 * Run: npx tsx scripts/apply-signoff.ts
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from 'pg';

const PROJECT_REF = 'ibuhmjqimvgjlcbagiyn';
const DB_PASSWORD_FILE = path.join(
  os.homedir(),
  'Documents/成大EMBA/e118-board/_secrets/supabase-db-password.txt',
);
const MIGRATION_FILE = path.join(__dirname, '../supabase/migrations/0007_signoff.sql');

async function main() {
  const pw = fs.readFileSync(DB_PASSWORD_FILE, 'utf8').trim();
  if (!pw) throw new Error('empty DB password');
  const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');

  const connectionString = `postgresql://postgres.${PROJECT_REF}:${encodeURIComponent(pw)}@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres`;
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('✓ connected to', PROJECT_REF);

  try {
    const exists = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='signoff_documents' LIMIT 1`,
    );
    if (exists.rows.length > 0) {
      console.log('✓ signoff_documents already exists — skip (already applied)');
    } else {
      console.log('── applying 0007_signoff.sql in a transaction ──');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('COMMIT');
        console.log('✓ migration committed');
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      }
    }

    // verify
    const tables = await client.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema='public' AND table_name LIKE 'signoff_%' ORDER BY table_name`,
    );
    console.log('tables:', tables.rows.map((r) => r.table_name).join(', '));

    const fns = await client.query(
      `SELECT proname FROM pg_proc WHERE proname LIKE 'signoff_%' ORDER BY proname`,
    );
    console.log('functions:', fns.rows.map((r) => r.proname).join(', '));

    const bucket = await client.query(
      `SELECT id, public, file_size_limit FROM storage.buckets WHERE id='signoff-documents'`,
    );
    if (bucket.rows.length) {
      const b = bucket.rows[0];
      console.log(`bucket: ${b.id} (public=${b.public}, limit=${Math.round(b.file_size_limit / 1024 / 1024)}MiB)`);
    } else {
      console.warn('⚠ bucket signoff-documents not found');
    }
    console.log('\n✅ done');
  } finally {
    await client.end();
  }
}
main().catch((err) => {
  console.error('\n❌ apply failed:', err.message);
  if (err.code) console.error('   PG code:', err.code);
  if (err.detail) console.error('   detail:', err.detail);
  if (err.where) console.error('   where:', err.where);
  process.exit(1);
});
