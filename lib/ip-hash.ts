/**
 * IP HMAC-SHA256 — 留言不存原始 IP，只存 hash 防 spam
 *
 * 對應 ARCHITECTURE.md v3 第 4 章 comments.ip_hash + Codex Sec F9：
 *   • HMAC（不是純 SHA256）— 加 secret 防離線 rainbow table
 *   • secret 從 IP_HASH_SECRET env var
 *   • version 從 IP_HASH_VERSION，支援 secret rotation（舊 hash 標 v1、新 hash v2）
 *   • secret rotation 期間 spam detection 暫時失效是預期 trade-off
 */
import 'server-only';
import crypto from 'node:crypto';
import { getEnv } from './env';

export function hashIp(ip: string): { hash: string; version: number } {
  const env = getEnv();
  const h = crypto.createHmac('sha256', env.IP_HASH_SECRET);
  h.update(ip);
  return { hash: h.digest('hex'), version: env.IP_HASH_VERSION };
}
