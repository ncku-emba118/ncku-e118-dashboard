import { describe, expect, test } from 'vitest';
import { readLimitedText } from './read-limited-body';

function streamReq(stream: ReadableStream<Uint8Array>) {
  return new Request('http://localhost/x', {
    method: 'POST',
    body: stream,
    duplex: 'half',
  } as RequestInit);
}

describe('readLimitedText', () => {
  test('正常 body → ok + 文字', async () => {
    const req = new Request('http://localhost/x', { method: 'POST', body: '{"a":1}' });
    expect(await readLimitedText(req, 1024)).toEqual({ ok: true, text: '{"a":1}' });
  });

  test('body 已被 lock → read_error（不 throw）', async () => {
    const req = new Request('http://localhost/x', { method: 'POST', body: 'hello' });
    req.body!.getReader(); // 其他人先拿走 reader
    expect(await readLimitedText(req, 1024)).toEqual({ ok: false, reason: 'read_error' });
  });

  test('body 已被讀過 → read_error（不 throw）', async () => {
    const req = new Request('http://localhost/x', { method: 'POST', body: 'hello' });
    await req.text();
    expect(await readLimitedText(req, 1024)).toEqual({ ok: false, reason: 'read_error' });
  });

  test('讀到一半 stream 出錯 → read_error，且 reader 已釋放（body 不再 locked）', async () => {
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(ctrl) {
        if (sent++ === 0) ctrl.enqueue(new TextEncoder().encode('abc'));
        else throw new Error('connection reset');
      },
    });
    const req = streamReq(stream);
    expect(await readLimitedText(req, 1024)).toEqual({ ok: false, reason: 'read_error' });
    expect(req.body!.locked).toBe(false);
  });

  test('超過上限 → too_large，stream 被 cancel、reader 已釋放', async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(ctrl) {
        ctrl.enqueue(new TextEncoder().encode('x'.repeat(600)));
      },
      cancel() {
        cancelled = true;
      },
    });
    const req = streamReq(stream);
    expect(await readLimitedText(req, 1024)).toEqual({ ok: false, reason: 'too_large' });
    expect(cancelled).toBe(true);
    expect(req.body!.locked).toBe(false);
  });
});
