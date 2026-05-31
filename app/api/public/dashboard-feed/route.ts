/**
 * GET /api/public/dashboard-feed — 公開 CORS JSON：最新公告 + 近期活動。
 * 給 slc 共學群（跨網域靜態站）的兩個即時看板用。無敏感欄位、唯讀、可快取。
 * 非 /api/board/* → 不受 middleware 登入閘口管制（公開）。
 */
import { NextResponse } from 'next/server';
import { getLatestPosts, getUpcomingEvents } from '@/lib/dashboard/feeds';

export const revalidate = 300;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'public, max-age=300, s-maxage=300',
};

export async function GET() {
  const [posts, events] = await Promise.all([getLatestPosts(5), getUpcomingEvents(3)]);
  // id 給跨域 site（SLC）用來組 /board/post/{id} 連結。
  // 風險面：/board/post/{id} 本身已有 published=true 過濾、UUID 不可列舉，洩漏面 ≈ 0。
  return NextResponse.json({ posts, events }, { headers: CORS });
}

export async function OPTIONS() {
  return new NextResponse(null, { headers: CORS });
}
