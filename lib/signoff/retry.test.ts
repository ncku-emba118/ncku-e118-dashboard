import { describe, it, expect, vi } from 'vitest';
import { retryResult, isTransientStorageError } from './retry';

describe('retryResult', () => {
  it('成功就回傳、不重試、不 sleep', async () => {
    const run = vi.fn(async () => ({ error: null as string | null }));
    const sleep = vi.fn(async () => {});
    const r = await retryResult(run, {
      maxAttempts: 3,
      shouldRetry: (x) => !!x.error,
      delayMs: () => 100,
      sleep,
    });
    expect(r).toEqual({ error: null });
    expect(run).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('可重試錯誤 → 重試後成功（sleep 用 delayMs(下一次)）', async () => {
    const results = [{ error: 'aborted' }, { error: null as string | null }];
    let i = 0;
    const run = vi.fn(async () => results[i++]);
    const sleep = vi.fn(async () => {});
    const r = await retryResult(run, {
      maxAttempts: 3,
      shouldRetry: (x) => !!x.error,
      delayMs: (n) => 500 * (n - 1),
      sleep,
    });
    expect(r).toEqual({ error: null });
    expect(run).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(500); // delayMs(2)
  });

  it('一直失敗 → 跑滿 maxAttempts，回最後一個結果', async () => {
    const run = vi.fn(async () => ({ error: 'aborted' }));
    const sleep = vi.fn(async () => {});
    const r = await retryResult(run, {
      maxAttempts: 3,
      shouldRetry: (x) => !!x.error,
      delayMs: () => 1,
      sleep,
    });
    expect(r).toEqual({ error: 'aborted' });
    expect(run).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('不可重試的錯誤 → 不重試', async () => {
    const run = vi.fn(async () => ({ error: 'Duplicate object' }));
    const sleep = vi.fn(async () => {});
    const r = await retryResult(run, {
      maxAttempts: 3,
      shouldRetry: () => false,
      delayMs: () => 1,
      sleep,
    });
    expect(r).toEqual({ error: 'Duplicate object' });
    expect(run).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('每次 run 收到遞增的 attempt 序號', async () => {
    const seen: number[] = [];
    const run = vi.fn(async (attempt: number) => {
      seen.push(attempt);
      return { error: 'aborted' };
    });
    await retryResult(run, {
      maxAttempts: 3,
      shouldRetry: (x) => !!x.error,
      delayMs: () => 0,
      sleep: async () => {},
    });
    expect(seen).toEqual([1, 2, 3]);
  });
});

describe('isTransientStorageError', () => {
  it('abort / 網路 / 5xx / 429 視為可重試', () => {
    for (const m of [
      'This operation was aborted',
      'fetch failed',
      'network timeout',
      'ECONNRESET',
      'terminated',
      'Internal Server Error 500',
      'Too Many Requests 429',
      'Bad Gateway 502',
      'Service Unavailable 503',
      'Gateway Timeout 504',
    ]) {
      expect(isTransientStorageError(m)).toBe(true);
    }
  });

  it('永久性錯誤不重試', () => {
    expect(isTransientStorageError(null)).toBe(false);
    expect(isTransientStorageError('Duplicate object')).toBe(false);
    expect(isTransientStorageError('Invalid bucket')).toBe(false);
    expect(isTransientStorageError('new row violates row-level security policy')).toBe(false);
  });
});
