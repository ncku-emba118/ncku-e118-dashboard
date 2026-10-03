// Static migration contract only: never connects to or executes SQL on a database.
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
const report = readFileSync('supabase/migrations/0030_comment_reports.sql', 'utf8');
const tighten = readFileSync('supabase/migrations/0031_comments_tighten_access.sql', 'utf8');
const sqlOnly = (sql: string) => sql.replace(/--[^\n]*/g, '');
test('檢舉 RPC 不因數量變更 comments、不自動隱藏', () => {
  const rpc = report.split('CREATE FUNCTION public.report_comment(')[1].split('$$;')[0];
  expect(rpc).toContain('INSERT INTO public.comment_reports');
  expect(rpc).not.toMatch(/\b(?:UPDATE|DELETE\s+FROM|INSERT\s+INTO)\s+public\.comments\b/i);
  expect(rpc).not.toMatch(/pending_review|user_reports|source_count|report_count/);
});
test('0030 僅新增檢舉結案欄位、權限與驗證，不收舊 comments 權限', () => {
  const sql = sqlOnly(report);
  expect(sql).toContain('resolved_at timestamptz');
  expect(sql).toContain("resolution IN ('dismissed', 'deleted')");
  expect(sql).toContain('WHERE resolved_at IS NULL');
  expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
  expect(sql).toContain('GRANT SELECT, INSERT, UPDATE ON public.comment_reports TO service_role');
  expect(sql).toContain('has_function_privilege');
  expect(sql).not.toMatch(/ALTER\s+PUBLICATION|DROP\s+POLICY|REVOKE[^;]*ON\s+(?:TABLE\s+)?public\.comments\b/i);
});
test('0031 只包含三項收權限操作且明示新版部署與重載前提；兩份都在交易內', () => {
  expect(tighten).toContain('僅在新版網站已部署且舊頁面已重新載入後才套用');
  expect(sqlOnly(tighten).match(/;/g)).toHaveLength(5);
  expect(tighten).toContain('ALTER PUBLICATION supabase_realtime DROP TABLE public.comments;');
  expect(tighten).toContain('DROP POLICY "anon read visible comments" ON public.comments;');
  expect(tighten).toContain('REVOKE SELECT ON public.comments FROM PUBLIC, anon, authenticated;');
  for (const sql of [report, tighten]) {
    expect(sqlOnly(sql).trim()).toMatch(/^BEGIN;/);
    expect(sql.trim()).toMatch(/COMMIT;$/);
  }
});

test('0030 檢舉保留審查人與時間；comments 沿用既有欄位且不改其權限', () => {
  expect(report).toContain('reviewed_by uuid REFERENCES public.accounts(id)');
  expect(report).toContain('reviewed_at timestamptz');
  expect(sqlOnly(report)).not.toMatch(/ALTER\s+TABLE\s+(?:public\.)?comments\b|(?:CREATE|ALTER|DROP)\s+POLICY[^;]*\bcomments\b|(?:GRANT|REVOKE)[^;]*\bON\s+(?:TABLE\s+)?(?:public\.)?comments\b|ALTER\s+PUBLICATION/i);
});
