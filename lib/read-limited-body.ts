/**
 * 受限讀取 request body（UTF-8 文字）。
 *
 * 只檢查 Content-Length header 不夠：chunked / 沒帶 header 的請求照樣能送大 body，
 * 直接 req.json() 會把整包讀進記憶體再 parse。這裡邊讀邊數「實際 byte 數」，
 * 一超過上限就停止讀取（cancel stream）並回 too_large。
 *
 * 回傳：
 *   • { ok: true, text }             讀完且 ≤ maxBytes
 *   • { ok: false, reason: 'too_large' }  超過上限（呼叫端回 413）
 *   • { ok: false, reason: 'read_error' } 讀取失敗（連線中斷等；呼叫端比照格式錯誤回 400）
 */
export type LimitedBodyResult =
  | { ok: true; text: string }
  | { ok: false; reason: 'too_large' | 'read_error' };

export async function readLimitedText(req: Request, maxBytes: number): Promise<LimitedBodyResult> {
  // 快速拒絕：有宣告且已超過
  const declared = Number(req.headers.get('content-length') || 0);
  if (declared > maxBytes) return { ok: false, reason: 'too_large' };

  if (!req.body) return { ok: true, text: '' };

  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    // body 已被讀過 / 已被 lock → getReader() 會 throw，當成讀取失敗（呼叫端回 400）
    reader = req.body.getReader();
  } catch {
    return { ok: false, reason: 'read_error' };
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return { ok: false, reason: 'too_large' };
      }
      chunks.push(value);
    }
  } catch {
    await reader.cancel().catch(() => {});
    return { ok: false, reason: 'read_error' };
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* 已釋放 */
    }
  }

  const buf = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    buf.set(c, offset);
    offset += c.byteLength;
  }
  return { ok: true, text: new TextDecoder().decode(buf) };
}

/** JSON.parse 失敗回 null（呼叫端沿用既有 400 行為） */
export function parseJsonOrNull(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
