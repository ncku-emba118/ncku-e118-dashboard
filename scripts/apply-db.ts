/**
 * scripts/apply-db.ts
 *
 * One-shot DB setup for `e118-board` Supabase project:
 *   1. 套用 supabase/migrations/0001_initial.sql  (schema)
 *   2. 套用 supabase/seed/01-departments.sql       (7 部門)
 *   3. 讀 _secrets/passwords.txt + bcrypt → seed 9 accounts
 *   4. SELECT 驗證每張表 row count
 *
 * 安全注意：
 * - DB 密碼從 ~/Documents/成大EMBA/e118-board/_secrets/supabase-db-password.txt 讀
 * - 4 位數密碼從 ~/Documents/成大EMBA/e118-board/_secrets/passwords.txt 讀
 * - 兩個檔都在 gitignore 內、不會 push 到 git
 * - SSL 連 Supabase 必開（rejectUnauthorized: false 接受 Supabase 自簽憑證）
 *
 * Idempotent — 重複跑 OK（schema 用 IF NOT EXISTS 失敗、seed 用 ON CONFLICT DO NOTHING）
 *
 * Run: npx tsx scripts/apply-db.ts
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { Client } from 'pg';

// ────────────────────────────────────────────────────────────────
// Config — 邊界與常數
// ────────────────────────────────────────────────────────────────

const PROJECT_REF = 'ibuhmjqimvgjlcbagiyn';
const SECRETS_DIR = path.join(
  os.homedir(),
  'Documents/成大EMBA/e118-board/_secrets',
);
const DB_PASSWORD_FILE = path.join(SECRETS_DIR, 'supabase-db-password.txt');
const ACCOUNTS_PASSWORD_FILE = path.join(SECRETS_DIR, 'passwords.txt');

const SCHEMA_FILE = path.join(__dirname, '../supabase/migrations/0001_initial.sql');
const DEPT_SEED_FILE = path.join(__dirname, '../supabase/seed/01-departments.sql');

const BCRYPT_COST = 12;

// 9 個帳號角色對照（username → role/home_dept_id）
const ACCOUNT_MAP: Record<string, { role: 'super' | 'dept'; home_dept_id: string | null }> = {
  班代:   { role: 'super', home_dept_id: null },
  副班代: { role: 'super', home_dept_id: null },
  秘書:   { role: 'super', home_dept_id: 'secretary' },
  學務:   { role: 'dept',  home_dept_id: 'academic' },
  活動:   { role: 'dept',  home_dept_id: 'activity' },
  公關:   { role: 'dept',  home_dept_id: 'pr' },
  財務:   { role: 'dept',  home_dept_id: 'finance' },
  文宣:   { role: 'dept',  home_dept_id: 'media' },
  醫務:   { role: 'dept',  home_dept_id: 'medical' },
};

// ────────────────────────────────────────────────────────────────
// Read secrets
// ────────────────────────────────────────────────────────────────

function readDbPassword(): string {
  const pw = fs.readFileSync(DB_PASSWORD_FILE, 'utf8').trim();
  if (!pw) throw new Error(`Empty DB password in ${DB_PASSWORD_FILE}`);
  return pw;
}

function parsePasswordsFile(): Array<{ username: string; password: string }> {
  const text = fs.readFileSync(ACCOUNTS_PASSWORD_FILE, 'utf8');
  const lines = text.split('\n');
  const rows: Array<{ username: string; password: string }> = [];

  for (const line of lines) {
    // 範例 row: | 班代 | super | 全部 7 部門 | `1234` |
    const m = line.match(/^\|\s*([^\s|]+)\s*\|.*\|\s*`(\d{4})`\s*\|/);
    if (m) {
      rows.push({ username: m[1], password: m[2] });
    }
  }

  if (rows.length !== 9) {
    throw new Error(
      `Expected 9 accounts in ${ACCOUNTS_PASSWORD_FILE}, got ${rows.length}`,
    );
  }
  return rows;
}

// ────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('E118 公告欄 — Supabase DB setup');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // 1. Load secrets + SQL files
  const dbPassword = readDbPassword();
  const accounts = parsePasswordsFile();
  const schemaSql = fs.readFileSync(SCHEMA_FILE, 'utf8');
  const deptSeedSql = fs.readFileSync(DEPT_SEED_FILE, 'utf8');

  console.log(`✓ Loaded DB password (${dbPassword.length} chars)`);
  console.log(`✓ Parsed ${accounts.length} accounts`);
  console.log(`✓ Schema SQL: ${schemaSql.split('\n').length} lines`);
  console.log(`✓ Dept seed SQL: ${deptSeedSql.split('\n').length} lines`);

  // 2. Connect via Supabase Session Pooler (direct 5432 deprecated for IPv4-only networks)
  // Session pooler keeps psql session semantics、可以跑 DDL（transaction pooler 不行）
  // Region: ap-southeast-1 (Singapore)
  const POOLER_HOST = 'aws-1-ap-southeast-1.pooler.supabase.com';
  const POOLER_USER = `postgres.${PROJECT_REF}`;
  const connectionString = `postgresql://${POOLER_USER}:${encodeURIComponent(dbPassword)}@${POOLER_HOST}:5432/postgres`;
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  console.log(`\nConnecting to ${POOLER_HOST}:5432 (Session Pooler) ...`);
  await client.connect();
  console.log('✓ Connected');

  try {
    // 3. Apply schema
    console.log('\n── Step 1: Apply schema migration ──');
    await client.query(schemaSql);
    console.log('✓ Schema applied');

    // 4. Apply departments seed
    console.log('\n── Step 2: Seed 7 departments ──');
    await client.query(deptSeedSql);
    const deptRes = await client.query('SELECT id, name, sort_order FROM departments ORDER BY sort_order');
    console.log(`✓ ${deptRes.rows.length} departments in DB:`);
    deptRes.rows.forEach((d) => console.log(`    ${d.sort_order}. ${d.id.padEnd(10)} (${d.name})`));

    // 5. Seed 9 accounts with bcrypt
    console.log('\n── Step 3: Seed 9 accounts (bcrypt cost 12) ──');
    for (const acc of accounts) {
      const map = ACCOUNT_MAP[acc.username];
      if (!map) {
        throw new Error(`No role mapping for username "${acc.username}"`);
      }
      const hash = await bcrypt.hash(acc.password, BCRYPT_COST);
      await client.query(
        `INSERT INTO accounts (username, password_hash, role, home_dept_id, password_changed_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (username) DO NOTHING`,
        [acc.username, hash, map.role, map.home_dept_id],
      );
      const dept = map.home_dept_id || '—';
      console.log(`    ✓ ${acc.username.padEnd(6)} (${map.role.padEnd(5)}, dept=${dept})`);
    }

    const accRes = await client.query(
      'SELECT username, role, home_dept_id FROM accounts ORDER BY role DESC, username',
    );
    console.log(`✓ ${accRes.rows.length} accounts in DB`);

    // 6. Sanity check all tables
    console.log('\n── Step 4: Sanity check 所有 table ──');
    const tables = [
      'departments', 'accounts', 'posts', 'comments',
      'push_subscriptions', 'push_jobs', 'push_deliveries', 'push_log',
    ];
    for (const t of tables) {
      const r = await client.query(`SELECT count(*) AS c FROM ${t}`);
      console.log(`    ${t.padEnd(20)} ${r.rows[0].c} rows`);
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ DB setup complete');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('\n❌ DB setup failed:', err.message);
  if (err.code) console.error('   PG code:', err.code);
  if (err.detail) console.error('   detail:', err.detail);
  process.exit(1);
});
