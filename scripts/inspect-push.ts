/**
 * 查最近的 push_job + push_deliveries + push_log 來看 E2E push 真實狀態
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from 'pg';

async function main() {
  const pw = fs.readFileSync(
    path.join(os.homedir(), 'Documents/成大EMBA/e118-board/_secrets/supabase-db-password.txt'),
    'utf8',
  ).trim();
  const c = new Client({
    connectionString: `postgresql://postgres.ibuhmjqimvgjlcbagiyn:${encodeURIComponent(pw)}@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres`,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  console.log('━━ push_subscriptions ━━');
  const subs = await c.query(`SELECT id, endpoint, dept_filter, failure_count, created_at FROM push_subscriptions ORDER BY created_at DESC LIMIT 3`);
  subs.rows.forEach(r => console.log(`  ${r.id} | ${r.endpoint.slice(0,60)}... | dept=${r.dept_filter} | fail=${r.failure_count}`));

  console.log('\n━━ push_jobs (latest 3) ━━');
  const jobs = await c.query(`SELECT id, post_id, event_type, status, attempt_count, last_error, started_at, finished_at FROM push_jobs ORDER BY created_at DESC LIMIT 3`);
  jobs.rows.forEach(r => console.log(`  ${r.id.slice(0,8)} post=${r.post_id.slice(0,8)} status=${r.status} attempts=${r.attempt_count} err=${(r.last_error||'').slice(0,80)}`));

  console.log('\n━━ push_deliveries (latest 5) ━━');
  const dels = await c.query(`SELECT id, job_id, status, http_status, error_class, duration_ms, attempt FROM push_deliveries ORDER BY created_at DESC LIMIT 5`);
  dels.rows.forEach(r => console.log(`  ${r.id.slice(0,8)} job=${r.job_id.slice(0,8)} status=${r.status} http=${r.http_status} err=${r.error_class} dur=${r.duration_ms}ms attempt=${r.attempt}`));

  console.log('\n━━ push_log (latest 3) ━━');
  const logs = await c.query(`SELECT job_id, post_id, total_subscribers, sent_count, failed_count, gone_count, sent_at FROM push_log ORDER BY sent_at DESC LIMIT 3`);
  logs.rows.forEach(r => console.log(`  job=${r.job_id?.slice(0,8)} total=${r.total_subscribers} sent=${r.sent_count} failed=${r.failed_count} gone=${r.gone_count} at=${r.sent_at?.toISOString?.()}`));

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
