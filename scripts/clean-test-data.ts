/**
 * 清掉 E2E + smoke test 留下的假資料
 *   • push_subscriptions endpoint 含 fake-test / test-endpoint
 *   • posts 標題含 [附件測試] [E2E
 *   • storage objects path 含 119e28 之類 test 上傳檔
 *
 * Run: npx tsx scripts/clean-test-data.ts
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from 'pg';
import { createClient } from '@supabase/supabase-js';

// Load .env.local manually (script runs outside Next.js)
function loadEnvLocal(): void {
  try {
    const env = fs.readFileSync(
      path.join(__dirname, '../.env.local'),
      'utf8',
    );
    for (const line of env.split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    /* OK if missing */
  }
}

async function main() {
  loadEnvLocal();
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

  // Supabase JS client for Storage API (direct SQL DELETE on storage.objects 被 trigger 擋)
  const supa = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // 1) Delete test push subscriptions
  const subs = await c.query(
    "DELETE FROM push_subscriptions WHERE endpoint LIKE '%fake-test%' OR endpoint LIKE '%test-endpoint%' OR endpoint LIKE '%DO-NOT-DELIVER%' RETURNING id",
  );
  console.log('  push_subscriptions deleted:', subs.rowCount);

  // 2) Find test posts to clean (storage objects 連動清)
  const postIds = await c.query(
    "SELECT id, attachments FROM posts WHERE title LIKE '%[附件測試]%' OR title LIKE '%[E2E%' OR title LIKE '%push 驗證%' OR title LIKE '%全班推播驗證%' OR title LIKE '%smoke test%'",
  );
  console.log('  test posts found:', postIds.rowCount);

  // 3) Collect supabase storage paths from test posts
  const pathsToDelete: string[] = [];
  for (const row of postIds.rows) {
    const atts = Array.isArray(row.attachments) ? row.attachments : [];
    for (const a of atts) {
      if (a?.source === 'supabase' && typeof a?.storage_path === 'string') {
        pathsToDelete.push(a.storage_path);
      }
    }
  }
  if (pathsToDelete.length > 0) {
    console.log('  storage paths to delete:', pathsToDelete.length);
    const { error } = await supa.storage
      .from('board-attachments')
      .remove(pathsToDelete);
    if (error) console.warn('  storage delete error:', error.message);
    else console.log('  storage objects deleted:', pathsToDelete.length);
  }

  // 4) Also clean orphan supabase storage objects (recent 24h) — list 然後 remove
  const { data: orphanList } = await supa.storage
    .from('board-attachments')
    .list('secretary/202605', { limit: 100 });
  if (orphanList && orphanList.length > 0) {
    const orphanPaths = orphanList.map((o) => `secretary/202605/${o.name}`);
    const { error: rmErr } = await supa.storage
      .from('board-attachments')
      .remove(orphanPaths);
    if (rmErr) console.warn('  orphan delete error:', rmErr.message);
    else console.log('  orphan objects deleted:', orphanPaths.length);
  }

  // 5) push_log
  await c.query(
    "DELETE FROM push_log WHERE post_id IN (SELECT id FROM posts WHERE title LIKE '%[附件測試]%' OR title LIKE '%[E2E%' OR title LIKE '%push 驗證%' OR title LIKE '%全班推播驗證%' OR title LIKE '%smoke test%')",
  );

  // 6) Delete test posts (cascade comments/jobs/deliveries)
  const posts = await c.query(
    "DELETE FROM posts WHERE title LIKE '%[附件測試]%' OR title LIKE '%[E2E%' OR title LIKE '%push 驗證%' OR title LIKE '%全班推播驗證%' OR title LIKE '%smoke test%' RETURNING id",
  );
  console.log('  posts deleted:', posts.rowCount);

  // Final counts
  const fin = await c.query(`SELECT
    (SELECT count(*) FROM push_subscriptions) AS subs,
    (SELECT count(*) FROM posts) AS posts,
    (SELECT count(*) FROM push_jobs) AS jobs,
    (SELECT count(*) FROM push_deliveries) AS dels,
    (SELECT count(*) FROM storage.objects WHERE bucket_id='board-attachments') AS storage
  `);
  console.log('  final state:', fin.rows[0]);

  await c.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
