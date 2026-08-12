import { describe, expect, test, beforeEach, vi } from 'vitest';

/**
 * 敵對審查修正4：recordFinalizeFailure 的 race guard。
 *
 * sign route 與 finalize route 都可能對同一份文件並發呼叫 composeAndStoreFinal；
 * 沒有 `WHERE final_pdf_object_path IS NULL` 這個守衛時，較慢那個請求的失敗
 * 留痕可能落在較快那個 setFinalPdf 成功之後才寫入，把「其實已經成功」的文件
 * 誤標成 finalize_failed_at 非 null（假警報）。
 *
 * 不連真實 Supabase：用最小假 query builder 攔截 dal.ts 實際下的
 * update().eq().is() 呼叫鏈，斷言守衛條件確實存在、且參數正確。
 */
vi.mock('server-only', () => ({}));

type Call = {
  table: string;
  payload?: unknown;
  eqCol?: string;
  eqVal?: unknown;
  isCol?: string;
  isVal?: unknown;
};

const state: { lastCall: Call | null } = { lastCall: null };

function makeBuilder(table: string) {
  const call: Call = { table };
  const builder = {
    update(payload: unknown) {
      call.payload = payload;
      return builder;
    },
    eq(col: string, val: unknown) {
      call.eqCol = col;
      call.eqVal = val;
      return builder;
    },
    is(col: string, val: unknown) {
      call.isCol = col;
      call.isVal = val;
      state.lastCall = call;
      return Promise.resolve({ error: null });
    },
  };
  return builder;
}

vi.mock('../supabase/server', () => ({
  getServerClient: () => ({
    from: (table: string) => makeBuilder(table),
  }),
}));

const { recordFinalizeFailure } = await import('./dal');

describe('recordFinalizeFailure — race guard（敵對審查修正4）', () => {
  beforeEach(() => {
    state.lastCall = null;
  });

  test('UPDATE 帶 eq(id, docId) + is(final_pdf_object_path, null) 守衛，缺一不可', async () => {
    const { error } = await recordFinalizeFailure('doc-1', '合成失敗：xxx');
    expect(error).toBeNull();
    expect(state.lastCall).not.toBeNull();
    const call = state.lastCall!;
    expect(call.table).toBe('signoff_documents');
    expect(call.eqCol).toBe('id');
    expect(call.eqVal).toBe('doc-1');
    // 這是修正4的核心斷言：guard 必須是 final_pdf_object_path IS NULL，
    // 少了這行，較慢請求就可能覆寫掉已成功文件的狀態（見檔頭說明）。
    expect(call.isCol).toBe('final_pdf_object_path');
    expect(call.isVal).toBeNull();
  });

  test('寫入的 payload 帶時間戳與截斷後的錯誤訊息（既有行為不變）', async () => {
    const long = 'x'.repeat(3000);
    await recordFinalizeFailure('doc-1', long);
    const payload = state.lastCall!.payload as { finalize_failed_at: string; finalize_last_error: string };
    expect(typeof payload.finalize_failed_at).toBe('string');
    expect(payload.finalize_last_error.length).toBe(2000);
  });
});
