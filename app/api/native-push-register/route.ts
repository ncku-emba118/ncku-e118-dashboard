/**
 * POST /api/native-push-register — Capacitor App 註冊／關閉原生推播 token
 *
 * 身分機制（與既有 /api/board/subscribe 對齊，另加班級閘門）：
 *   • 班級共用密碼 cookie（verifyClassToken）：App 殼載入的是 ncku-emba-e118.aqualux.dev，
 *     此路徑不在 /api/board 之下 → middleware 在 App 網址已強制 cookie；這裡再驗一次（fail-closed）
 *   • management_token：裝置端 localStorage 隨機 token，後端只存 bcrypt 雜湊（與 push_subscriptions 同）
 *   • 同源檢查（Origin/Referer）、body 大小上限 8KB、同 IP 10 次/小時 rate limit
 * 行為：
 *   • register：以 (app, token) upsert；已存在且 management_token 相符 → 更新並重新啟用；
 *     已存在但不符 → 通過班級閘門者視同同一台裝置（device token 本身就是裝置機密；
 *     例如重裝後 localStorage 遺失）→ 換成新的 hash 並重新啟用
 *   • disable：management_token 相符才可把 token 標 disabled_at（App 內「關閉通知」）
 * 不 log token／management_token。
 */
import { NextResponse, type NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { getServerClient } from '@/lib/supabase/server';
import { resolveClientIp } from '@/lib/ip-resolve';
import { CLASS_COOKIE_NAME, verifyClassToken } from '@/lib/auth/class-gate';
import { isSameOrigin } from '@/lib/signoff/http';
import { BUNDLE_TO_APP, nativeRegisterSchema } from '@/lib/push/native/register-schema';

const MAX_BODY_BYTES = 8192;
const RL_MAX = 10;
const RL_WINDOW_MS = 60 * 60 * 1000;
const ipBuckets = new Map<string, { count: number; resetAt: number }>();

function checkIpLimit(ip: string): boolean {
  const now = Date.now();
  const rec = ipBuckets.get(ip);
  if (!rec || now > rec.resetAt) {
    ipBuckets.set(ip, { count: 1, resetAt: now + RL_WINDOW_MS });
    return true;
  }
  if (rec.count >= RL_MAX) return false;
  rec.count++;
  return true;
}

export async function POST(req: NextRequest) {
  const traceId = crypto.randomUUID();
  const h = { 'x-trace-id': traceId, 'Cache-Control': 'no-store' };
  const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers: h });

  if (!isSameOrigin(req)) return fail('來源驗證失敗', 403);
  if (!(await verifyClassToken(req.cookies.get(CLASS_COOKIE_NAME)?.value))) {
    return fail('請先輸入班級密碼', 401);
  }
  if (Number(req.headers.get('content-length') || 0) > MAX_BODY_BYTES) return fail('請求過大', 413);

  const ip = resolveClientIp(req);
  if (!ip) return fail('系統無法識別來源，請稍後再試', 503);
  if (!checkIpLimit(ip)) return fail('操作過於頻繁，請稍後再試', 429);

  const raw = await req.text().catch(() => '');
  if (raw.length > MAX_BODY_BYTES) return fail('請求過大', 413);
  let json: unknown = null;
  try {
    json = JSON.parse(raw);
  } catch {
    /* 下面 safeParse 會擋 */
  }
  const parsed = nativeRegisterSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: '欄位格式錯誤', detail: parsed.error.flatten().fieldErrors },
      { status: 400, headers: h },
    );
  }
  const input = parsed.data;
  const app = BUNDLE_TO_APP[input.app];
  const supabase = getServerClient();

  const { data: existing, error: lookupErr } = await supabase
    .from('native_push_tokens')
    .select('id, management_token_hash')
    .eq('app', app)
    .eq('token', input.token)
    .maybeSingle();
  if (lookupErr) {
    console.error('[native_push.register.lookup_failed]', { traceId, error: lookupErr.message });
    return fail('系統暫時無法處理', 503);
  }

  if (input.action === 'disable') {
    if (!existing) return NextResponse.json({ ok: true, mode: 'noop' }, { headers: h });
    const ok = await bcrypt.compare(input.management_token, existing.management_token_hash as string);
    if (!ok) return fail('management token 不符', 403);
    const { error } = await supabase
      .from('native_push_tokens')
      .update({ disabled_at: new Date().toISOString() })
      .eq('id', existing.id);
    if (error) {
      console.error('[native_push.register.disable_failed]', { traceId, error: error.message });
      return fail('關閉失敗', 503);
    }
    return NextResponse.json({ ok: true, mode: 'disabled' }, { headers: h });
  }

  const tokenHash = await bcrypt.hash(input.management_token, 10);
  const nowIso = new Date().toISOString();

  if (existing) {
    const same = await bcrypt.compare(input.management_token, existing.management_token_hash as string);
    if (!same) console.warn('[native_push.register.hash_replaced]', { traceId, id: existing.id });
    const { error } = await supabase
      .from('native_push_tokens')
      .update({
        platform: input.platform,
        app_version: input.app_version ?? null,
        management_token_hash: same ? existing.management_token_hash : tokenHash,
        last_seen_at: nowIso,
        failure_count: 0,
        disabled_at: null,
      })
      .eq('id', existing.id);
    if (error) {
      console.error('[native_push.register.update_failed]', { traceId, error: error.message });
      return fail('更新失敗', 503);
    }
    return NextResponse.json({ ok: true, mode: 'update' }, { headers: h });
  }

  const { error: insertErr } = await supabase.from('native_push_tokens').insert({
    app,
    platform: input.platform,
    token: input.token,
    app_version: input.app_version ?? null,
    management_token_hash: tokenHash,
  });
  if (insertErr) {
    console.error('[native_push.register.insert_failed]', { traceId, error: insertErr.message });
    return fail('註冊失敗', 503);
  }
  return NextResponse.json({ ok: true, mode: 'create' }, { status: 201, headers: h });
}
