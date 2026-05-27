/**
 * 清掉 E2E + smoke test 留下的假資料：
 *   • push_subscriptions endpoint 含 fake-test / test-endpoint
 *
 * Run: npx tsx scripts/clean-test-data.ts
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from 'pg';

async function main() {
  const pwFile = path.join(
    os.homedir(),
    'Documents/成大EMBA/e118-board/_secrets/supabase-db-password.txt',
  );
  const pw = fs.readFileSync(pwFile, 'utf8').trim();
  const c = new Client({
    connectionString: `postgresql://postgres.ibuhmjqimvgjlcbagiyn:${encodeURIComponent(pw)}@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres`,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const r = await c.query(
    "DELETE FROM push_subscriptions WHERE endpoint LIKE '%fake-test%' OR endpoint LIKE '%test-endpoint%' RETURNING id",
  );
  console.log('deleted', r.rowCount, 'fake subscription(s)');
  const cnt = await c.query('SELECT count(*) AS c FROM push_subscriptions');
  console.log('push_subscriptions now:', cnt.rows[0].c, 'rows');
  await c.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
