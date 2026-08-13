import { describe, expect, test } from 'vitest';
import { resolveDownloadFinalError, SESSION_EXPIRED_MSG } from './download-error';

describe('resolveDownloadFinalError', () => {
  test('HTTP 401 → 登入過期文案（不管 body 內容是什麼）', () => {
    expect(resolveDownloadFinalError(401, false, {})).toBe(SESSION_EXPIRED_MSG);
    expect(resolveDownloadFinalError(401, false, { error: '其他錯誤' })).toBe(SESSION_EXPIRED_MSG);
  });

  test('非 2xx（非 401）→ 後端 error，沒有就給預設字', () => {
    expect(resolveDownloadFinalError(500, false, { error: '系統暫時無法取得' })).toBe('系統暫時無法取得');
    expect(resolveDownloadFinalError(500, false, {})).toBe('下載連結取得失敗，請重新整理頁面再試');
  });

  // ── 核心修復：public:true fail-open 不可被誤判成「PDF 尚未合成」──────────
  test('200 但 public:true（session 過期時已核准單的 fail-open 公開摘要）→ 登入過期文案，不是「尚未完成合成」', () => {
    expect(resolveDownloadFinalError(200, true, { public: true })).toBe(SESSION_EXPIRED_MSG);
    // 就算 public 摘要意外帶了 urls（不該發生，但函式邏輯不該依賴這個假設）
    expect(resolveDownloadFinalError(200, true, { public: true, urls: { final_download: null } })).toBe(
      SESSION_EXPIRED_MSG,
    );
  });

  test('200、非 public、真的沒有 final_download URL → 尚未完成合成', () => {
    expect(resolveDownloadFinalError(200, true, {})).toBe('目前沒有可下載的最終 PDF（可能尚未完成合成）');
    expect(resolveDownloadFinalError(200, true, { urls: { final_download: null } })).toBe(
      '目前沒有可下載的最終 PDF（可能尚未完成合成）',
    );
  });

  test('200、非 public、有 final_download URL → 放行（回傳 null）', () => {
    expect(
      resolveDownloadFinalError(200, true, { urls: { final_download: 'https://example.com/final.pdf' } }),
    ).toBeNull();
  });

  test('public 顯式為 false（一般登入使用者）不影響正常判斷', () => {
    expect(
      resolveDownloadFinalError(200, true, { public: false, urls: { final_download: 'https://x/y.pdf' } }),
    ).toBeNull();
    expect(resolveDownloadFinalError(200, true, { public: false })).toBe(
      '目前沒有可下載的最終 PDF（可能尚未完成合成）',
    );
  });
});
