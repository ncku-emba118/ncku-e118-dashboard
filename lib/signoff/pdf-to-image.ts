/**
 * 把最終 PDF 的「簽核表頁」在瀏覽器端轉成 PNG（2026-08-14）。
 *
 * 為什麼需要這支：LINE 的分享入口**不接受 PDF 檔案**，只收連結、文字、圖片
 * （使用者實測：分享帶 url 時 LINE 出現、只帶 PDF files 時 LINE 消失）。因此
 * 想要「按一下就把簽核單丟進 LINE 對話」，唯一可行的形式是圖片。
 *
 * 只轉簽核表本身那幾頁（呼叫端用 assignments 的 slot_page 算出頁數），不轉後面
 * 夾帶的憑證附件——那些可能有好幾頁，全部轉成圖片會又慢又洗版。
 *
 * ⚠ 只能在瀏覽器執行（用到 document/canvas），故一律以動態 import 從 client
 *   component 呼叫，不要在 server component 或 route handler 引用。
 */

/** 轉出的圖片解析度倍率：2 ≈ 144dpi，手機上看得清楚，檔案又不會太大。 */
const RENDER_SCALE = 2;

export async function renderSheetPagesToPng(
  pdfBlob: Blob,
  sheetPageCount: number,
  baseName: string,
): Promise<File[]> {
  const pdfjs = await import('pdfjs-dist');
  // 用 bundler 解析 worker 位置（webpack 5 asset module 語法）。worker 與頁面
  // 同源，符合 CSP 的 default-src 'self'，不需要放寬政策。
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();

  const data = await pdfBlob.arrayBuffer();
  const doc = await pdfjs.getDocument({ data }).promise;
  const pages = Math.max(1, Math.min(sheetPageCount, doc.numPages));

  const files: File[] = [];
  for (let i = 1; i <= pages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: RENDER_SCALE });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('無法建立 canvas context');
    // PDF 頁面本身是透明背景，直接轉 PNG 在 LINE 深色模式下會看不見字，先鋪白底。
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png'),
    );
    if (!blob) throw new Error('無法將頁面轉成圖片');
    const suffix = pages > 1 ? `_第${i}頁` : '';
    files.push(new File([blob], `${baseName}${suffix}.png`, { type: 'image/png' }));
    canvas.width = 0; // 儘早釋放記憶體（手機上一頁可能好幾 MB）
    canvas.height = 0;
  }
  await doc.destroy();
  return files;
}
