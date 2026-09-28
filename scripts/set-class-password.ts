/**
 * scripts/set-class-password.ts — 直接寫入班級共用密碼 hash（第一次上線前用，或網頁後台壞掉時的備援）。
 *
 * 平常換密碼請用網頁：/board/admin/class-password（super 帳號登入後）。
 *
 * 用法（密碼從 stdin 讀，不放 argv → 不會留在 shell history / ps）：
 *   read -s "PW?新班級密碼: " && echo && printf '%s' "$PW" | npx tsx scripts/set-class-password.ts; unset PW
 *
 * 前提：0029_class_gate.sql 已套用。DB 連線方式比照 scripts/apply-migration.ts
 * （密碼從 _secrets/ 讀、不印）。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { Client } from 'pg';

const PROJECT_REF = 'ibuhmjqimvgjlcbagiyn';
const SETTING_KEY = 'class_gate_password_hash';
const BCRYPT_COST = 12;

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
}

async function main() {
  const pw = await readStdin();
  if (pw.length < 6 || pw.length > 64 || Buffer.byteLength(pw, 'utf8') > 72 || pw.trim() !== pw) {
    throw new Error('密碼需 6–64 字、頭尾不可有空白（規則同 lib/auth/class-gate-server.ts）');
  }
  const hash = await bcrypt.hash(pw, BCRYPT_COST);

  const dbPw = fs
    .readFileSync(path.join(os.homedir(), 'Documents/成大EMBA/e118-board/_secrets/supabase-db-password.txt'), 'utf8')
    .trim();
  const cs = `postgresql://postgres.${PROJECT_REF}:${encodeURIComponent(dbPw)}@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres`;
  const client = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(
      `insert into app_settings (key, value, updated_at, updated_by)
       values ($1, $2, now(), null)
       on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = null`,
      [SETTING_KEY, hash],
    );
    console.log('✓ 班級密碼已更新（只存 bcrypt hash）');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('❌ failed:', err.message);
  process.exit(1);
});
