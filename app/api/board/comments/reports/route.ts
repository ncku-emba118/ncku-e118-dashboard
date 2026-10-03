import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerClient } from '@/lib/supabase/server';
import { isSameOrigin } from '@/lib/signoff/http';
import { readLimitedText, parseJsonOrNull } from '@/lib/read-limited-body';
import { resolveClientIp } from '@/lib/ip-resolve';
import { hashIp } from '@/lib/ip-hash';

const schema = z.object({
  comment_id: z.string().uuid(), reporter_id: z.string().uuid(),
  reason: z.enum(['inappropriate', 'spam', 'harassment', 'other']),
  details: z.string().trim().max(500).default(''),
});

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: '來源驗證失敗' }, { status: 403 });
  const body = await readLimitedText(req, 4096);
  if (!body.ok) return NextResponse.json({ error: '請求內容無效或過大' }, { status: body.reason === 'too_large' ? 413 : 400 });
  const parsed = schema.safeParse(parseJsonOrNull(body.text));
  if (!parsed.success) return NextResponse.json({ error: '請選擇原因，說明最多 500 字' }, { status: 400 });
  const ip = resolveClientIp(req);
  if (!ip) return NextResponse.json({ error: '無法識別來源，請稍後再試' }, { status: 503 });
  const input = parsed.data;
  const { data, error } = await getServerClient().rpc('report_comment', {
    p_comment_id: input.comment_id, p_reporter_id: input.reporter_id,
    p_reason: input.reason, p_details: input.details,
    p_ip_hash: hashIp(ip).hash,
  });
  if (error) return NextResponse.json({ error: '檢舉未送達，請稍後重試' }, { status: 503 });
  if (data === 'not_found') return NextResponse.json({ error: '留言已移除或無法檢舉' }, { status: 404 });
  if (data === 'rate_limited') return NextResponse.json({ error: '檢舉太頻繁，請一小時後再試' }, { status: 429 });
  if (data !== 'ok' && data !== 'duplicate') return NextResponse.json({ error: '檢舉未送達，請稍後重試' }, { status: 503 });
  return NextResponse.json({ ok: true });
}
