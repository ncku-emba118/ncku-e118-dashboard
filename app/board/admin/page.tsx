/**
 * /board/admin — 管理後台首頁
 *
 * 顯示「我能管理的公告列表」+「+ 寫新公告」按鈕。
 * super 看全部 7 部門公告；dept 只看自己部門公告。
 */
import { redirect } from 'next/navigation';
import { readSession, deptInfo } from '@/lib/auth/session';
import { getServerClient } from '@/lib/supabase/server';
import AdminPostsTable from '@/components/AdminPostsTable';
import AdminLineRouting from '@/components/AdminLineRouting';
import { getPostViewCounts } from '@/lib/board/view_logger';
import Breadcrumb from '@/components/Breadcrumb';

type AdminPost = {
  id: string;
  department_id: string;
  title: string;
  pinned: boolean;
  published: boolean;
  created_at: string;
  accounts: { username: string } | null;
};

type RecentDelivery = {
  postTitle: string;
  jobCreatedAt: string;
  sent: number;
  failed: number;
  pending: number;
  total: number;
};

type FailingSub = {
  uaShort: string;
  failureCount: number;
  lastSeenAt: string;
  createdAt: string;
};

type PushStats = {
  totalSubs: number;
  subs24h: number;
  subs7d: number;
  lastJob: {
    postTitle: string;
    sent: number;
    failed: number;
    pending: number;
    sentAt: string | null;
  } | null;
  deviceMix: { ios: number; android: number; mac: number; windows: number; other: number };
  failingSubs: FailingSub[];
  trend30d: { day: string; count: number }[];
  recent: RecentDelivery[];
};

/** 從 user_agent 字串猜裝置類型 */
function classifyUA(ua: string | null): keyof PushStats['deviceMix'] {
  if (!ua) return 'other';
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  if (/Macintosh|Mac OS X/.test(ua) && !/iPhone/.test(ua)) return 'mac';
  if (/Windows/.test(ua)) return 'windows';
  return 'other';
}

function shortenUA(ua: string | null): string {
  if (!ua) return '未知裝置';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) {
    const m = ua.match(/Android [\d.]+/);
    return m ? m[0] : 'Android';
  }
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  return ua.slice(0, 30);
}

async function loadPushStats(): Promise<PushStats> {
  const supabase = getServerClient();
  const now = new Date();
  const d1 = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // 並行：3 個 count、所有訂閱明細（裝置/趨勢/警示用）、最近 5 則 push_jobs
  const [
    { count: totalSubs },
    { count: subs24h },
    { count: subs7d },
    { data: allSubs },
    { data: jobs },
  ] = await Promise.all([
    supabase.from('push_subscriptions').select('id', { count: 'exact', head: true }),
    supabase.from('push_subscriptions').select('id', { count: 'exact', head: true }).gte('created_at', d1),
    supabase.from('push_subscriptions').select('id', { count: 'exact', head: true }).gte('created_at', d7),
    supabase.from('push_subscriptions').select('id, user_agent, failure_count, created_at, last_seen_at'),
    supabase
      .from('push_jobs')
      .select('id, post_id, finished_at, created_at, posts(title)')
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  // ─── deviceMix
  const deviceMix = { ios: 0, android: 0, mac: 0, windows: 0, other: 0 };
  for (const s of allSubs || []) {
    deviceMix[classifyUA(s.user_agent as string | null)]++;
  }

  // ─── failingSubs：failure_count >= 3 排第一、降冪
  const failingSubs: FailingSub[] = (allSubs || [])
    .filter((s) => (s.failure_count as number) >= 3)
    .sort((a, b) => (b.failure_count as number) - (a.failure_count as number))
    .slice(0, 10)
    .map((s) => ({
      uaShort: shortenUA(s.user_agent as string | null),
      failureCount: s.failure_count as number,
      lastSeenAt: s.last_seen_at as string,
      createdAt: s.created_at as string,
    }));

  // ─── trend30d：依日期 bucket
  const trendMap = new Map<string, number>();
  for (let i = 0; i < 30; i++) {
    const d = new Date(now.getTime() - (29 - i) * 24 * 60 * 60 * 1000);
    trendMap.set(d.toISOString().slice(0, 10), 0);
  }
  for (const s of allSubs || []) {
    const ymd = (s.created_at as string).slice(0, 10);
    if (trendMap.has(ymd)) trendMap.set(ymd, (trendMap.get(ymd) || 0) + 1);
  }
  const trend30d = [...trendMap.entries()].map(([day, count]) => ({ day, count }));

  // ─── recent 5 jobs：每個 job 撈 deliveries 統計
  const recent: RecentDelivery[] = [];
  let lastJob: PushStats['lastJob'] = null;
  for (const j of jobs || []) {
    const jobId = j.id as string;
    const { data: deliveries } = await supabase
      .from('push_deliveries')
      .select('status')
      .eq('job_id', jobId);
    const rows = deliveries || [];
    const sent = rows.filter((d) => d.status === 'sent').length;
    const failed = rows.filter((d) => d.status === 'failed' || d.status === 'gone').length;
    const pending = rows.filter((d) => d.status === 'pending' || d.status === 'timeout_retryable').length;
    const title = ((j as unknown as { posts: { title: string } | null }).posts?.title) ?? '(已刪除)';
    recent.push({
      postTitle: title,
      jobCreatedAt: j.created_at as string,
      sent,
      failed,
      pending,
      total: sent + failed + pending,
    });
    if (lastJob === null) {
      lastJob = {
        postTitle: title,
        sent,
        failed,
        pending,
        sentAt: (j as unknown as { finished_at: string | null }).finished_at,
      };
    }
  }

  return {
    totalSubs: totalSubs ?? 0,
    subs24h: subs24h ?? 0,
    subs7d: subs7d ?? 0,
    lastJob,
    deviceMix,
    failingSubs,
    trend30d,
    recent,
  };
}

async function loadManageablePosts(
  role: 'super' | 'dept',
  homeDeptId: string | null,
): Promise<AdminPost[]> {
  const supabase = getServerClient();
  let query = supabase
    .from('posts')
    .select(
      'id, department_id, title, pinned, published, created_at, accounts(username)',
    )
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100);

  if (role === 'dept' && homeDeptId) {
    query = query.eq('department_id', homeDeptId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[admin.posts.list.failed]', { error: error.message });
    return [];
  }
  return (data || []) as unknown as AdminPost[];
}

import { formatDateTW as formatDate } from '@/lib/format';

/** 小型 KPI 卡 — 訂閱統計用 */
function StatCard({ label, value, hint, accent }: { label: string; value: number | string; hint?: string; accent?: boolean }) {
  return (
    <div style={{
      background: accent ? 'rgba(139,31,47,0.06)' : '#fff',
      border: `1px solid ${accent ? 'rgba(139,31,47,0.25)' : '#D9CDB8'}`,
      borderRadius: 6,
      padding: '14px 16px',
      minHeight: 78,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
    }}>
      <div style={{ fontSize: 11, color: '#8A7F73', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 28, fontWeight: 600, color: accent ? '#8B1F2F' : '#1A1612', lineHeight: 1.1, marginTop: 4 }}>{value}</div>
      {hint && <div style={{ fontSize: 10.5, color: '#8A7F73', marginTop: 4, lineHeight: 1.4 }}>{hint}</div>}
    </div>
  );
}

/** 裝置類型分佈 — 水平比例條 */
function DeviceMixCard({ mix }: { mix: PushStats['deviceMix'] }) {
  const total = mix.ios + mix.android + mix.mac + mix.windows + mix.other;
  if (total === 0) return null;
  const items = [
    { key: 'ios', label: 'iPhone / iPad', color: '#8B1F2F', n: mix.ios },
    { key: 'android', label: 'Android', color: '#2D5F4E', n: mix.android },
    { key: 'mac', label: 'Mac', color: '#C9742E', n: mix.mac },
    { key: 'windows', label: 'Windows', color: '#1F3F5C', n: mix.windows },
    { key: 'other', label: '其他', color: '#8A7F73', n: mix.other },
  ].filter((i) => i.n > 0);
  return (
    <div style={{ background: '#fff', border: '1px solid #D9CDB8', borderRadius: 6, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, color: '#8A7F73', letterSpacing: '0.05em', marginBottom: 10 }}>裝置類型分佈</div>
      <div style={{ display: 'flex', height: 12, borderRadius: 99, overflow: 'hidden', marginBottom: 8 }}>
        {items.map((i) => (
          <div key={i.key} style={{ width: `${(i.n / total) * 100}%`, background: i.color }} />
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: 11, color: '#1A1612' }}>
        {items.map((i) => (
          <span key={i.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: i.color }} />
            {i.label} <strong style={{ color: i.color }}>{i.n}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

/** 30 天訂閱新增折線圖 — 純 SVG 不依賴 chart lib */
function SubsTrendChart({ trend }: { trend: { day: string; count: number }[] }) {
  const W = 720, H = 100, PAD_L = 24, PAD_R = 10, PAD_T = 8, PAD_B = 18;
  const innerW = W - PAD_L - PAD_R, innerH = H - PAD_T - PAD_B;
  const maxY = Math.max(1, ...trend.map((d) => d.count));
  const step = innerW / Math.max(1, trend.length - 1);
  const pts = trend.map((d, i) => ({
    x: PAD_L + i * step,
    y: PAD_T + innerH - (d.count / maxY) * innerH,
    count: d.count,
    day: d.day,
  }));
  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${pts[pts.length - 1].x.toFixed(1)} ${PAD_T + innerH} L ${pts[0].x.toFixed(1)} ${PAD_T + innerH} Z`;
  const firstDay = trend[0]?.day.slice(5) || '';
  const lastDay = trend[trend.length - 1]?.day.slice(5) || '';
  const total30 = trend.reduce((s, d) => s + d.count, 0);
  return (
    <div style={{ background: '#fff', border: '1px solid #D9CDB8', borderRadius: 6, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: '#8A7F73', letterSpacing: '0.05em' }}>30 天訂閱新增趨勢</div>
        <div style={{ fontSize: 12, color: '#1A1612' }}>共 <strong style={{ color: '#8B1F2F' }}>{total30}</strong> 個新增</div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
        <path d={areaPath} fill="rgba(139,31,47,0.10)" />
        <path d={linePath} fill="none" stroke="#8B1F2F" strokeWidth={1.5} />
        {pts.map((p) => p.count > 0 && (
          <circle key={p.day} cx={p.x} cy={p.y} r={2.5} fill="#8B1F2F">
            <title>{p.day}：{p.count} 個</title>
          </circle>
        ))}
        <text x={PAD_L} y={H - 4} fontSize={9} fill="#8A7F73">{firstDay}</text>
        <text x={W - PAD_R} y={H - 4} fontSize={9} fill="#8A7F73" textAnchor="end">{lastDay}</text>
        <text x={PAD_L - 4} y={PAD_T + 8} fontSize={9} fill="#8A7F73" textAnchor="end">{maxY}</text>
        <text x={PAD_L - 4} y={PAD_T + innerH} fontSize={9} fill="#8A7F73" textAnchor="end">0</text>
      </svg>
    </div>
  );
}

/** 即將被清掉的問題訂閱（failure_count >= 3）*/
function FailingSubsCard({ subs }: { subs: FailingSub[] }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #D9CDB8', borderRadius: 6, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, color: '#8A7F73', letterSpacing: '0.05em', marginBottom: 10 }}>
        失敗訂閱（連 5 次失敗自動清除）
      </div>
      {subs.length === 0 ? (
        <div style={{ fontSize: 12.5, color: '#2D5F4E', padding: '8px 0' }}>✓ 沒有問題訂閱</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {subs.map((s, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '4px 0', borderBottom: i < subs.length - 1 ? '1px dashed #E8DFD0' : 'none' }}>
              <span style={{ color: '#1A1612' }}>{s.uaShort}</span>
              <span style={{ display: 'inline-flex', gap: 8, alignItems: 'baseline' }}>
                <span style={{ color: '#8A7F73', fontSize: 10.5 }}>last seen {s.lastSeenAt.slice(0, 10)}</span>
                <span style={{ color: s.failureCount >= 4 ? '#8B1F2F' : '#B26B1F', fontWeight: 600, fontSize: 11.5 }}>{s.failureCount}/5 失敗</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** 最近 5 則公告的推播 delivery 統計 */
function RecentDeliveriesTable({ recent }: { recent: RecentDelivery[] }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #D9CDB8', borderRadius: 6, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, color: '#8A7F73', letterSpacing: '0.05em', marginBottom: 10 }}>
        最近 5 則公告推播統計
      </div>
      {recent.length === 0 ? (
        <div style={{ fontSize: 12.5, color: '#8A7F73', padding: '8px 0' }}>尚無推播紀錄</div>
      ) : (
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: '#8A7F73', textAlign: 'left', borderBottom: '1px solid #E8DFD0' }}>
              <th style={{ padding: '6px 4px', fontWeight: 500 }}>公告</th>
              <th style={{ padding: '6px 4px', fontWeight: 500, width: 90 }}>時間</th>
              <th style={{ padding: '6px 4px', fontWeight: 500, width: 60, textAlign: 'right' }}>成功</th>
              <th style={{ padding: '6px 4px', fontWeight: 500, width: 60, textAlign: 'right' }}>失敗</th>
              <th style={{ padding: '6px 4px', fontWeight: 500, width: 60, textAlign: 'right' }}>送達率</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((r, i) => {
              const rate = r.total > 0 ? Math.round((r.sent / r.total) * 100) : 0;
              const rateColor = rate >= 90 ? '#2D5F4E' : rate >= 70 ? '#B26B1F' : '#8B1F2F';
              return (
                <tr key={i} style={{ borderBottom: i < recent.length - 1 ? '1px solid #F4EFE6' : 'none' }}>
                  <td style={{ padding: '8px 4px', color: '#1A1612', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.postTitle}</td>
                  <td style={{ padding: '8px 4px', color: '#8A7F73', fontSize: 11 }}>{r.jobCreatedAt.slice(5, 16).replace('T', ' ')}</td>
                  <td style={{ padding: '8px 4px', color: '#2D5F4E', fontWeight: 600, textAlign: 'right' }}>{r.sent}</td>
                  <td style={{ padding: '8px 4px', color: r.failed > 0 ? '#8B1F2F' : '#8A7F73', textAlign: 'right' }}>{r.failed}</td>
                  <td style={{ padding: '8px 4px', color: rateColor, fontWeight: 600, textAlign: 'right' }}>{rate}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default async function AdminHome() {
  const session = await readSession();
  if (!session) redirect('/board/login?next=/board/admin');

  const posts = await loadManageablePosts(session.role, session.home_dept_id);
  const isSuper = session.role === 'super';
  // 只有 super（秘書長）看推播統計
  const pushStats = isSuper ? await loadPushStats() : null;
  // 撈 view counts（fail-soft；DB 沒這個表會回空 Map → 顯示 0）
  const viewCounts = await getPostViewCounts(posts.map((p) => p.id));
  const deptLabel = isSuper
    ? '全部 7 部門'
    : deptInfo(session.home_dept_id).name;

  return (
    <>
    <Breadcrumb items={[{ label: '班級面板', href: '/' }, { label: '班級公告欄', href: '/board' }, { label: '後台管理' }]} />
    <main
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #FAF7F2 0%, #F4EFE6 100%)',
        padding: '32px 24px 80px',
        fontFamily:
          "-apple-system, BlinkMacSystemFont, system-ui, 'PingFang TC', sans-serif",
      }}
    >
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        {/* Top bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            paddingBottom: 16,
            borderBottom: '1px solid rgba(26, 22, 18, 0.10)',
            marginBottom: 24,
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <p
              style={{
                fontSize: 11,
                letterSpacing: '0.24em',
                textTransform: 'uppercase',
                color: '#8B1F2F',
                margin: '0 0 6px',
              }}
            >
              — board admin
            </p>
            <h1
              style={{
                fontFamily: "'Cormorant Garamond', Georgia, serif",
                fontSize: 36,
                fontWeight: 300,
                color: '#1A1612',
                margin: 0,
              }}
            >
              Administration
            </h1>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <a
              href="/board"
              style={{
                color: '#8A7F73',
                fontSize: 12,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                textDecoration: 'none',
              }}
            >
              ← 回公告欄
            </a>
            <a
              href="/board/admin/new"
              style={{
                padding: '8px 16px',
                background: '#8B1F2F',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: '0.05em',
                borderRadius: 4,
                textDecoration: 'none',
              }}
            >
              + 寫新公告
            </a>
          </div>
        </div>

        {/* User info card */}
        <div
          style={{
            background: '#fff',
            border: '1px solid #D9CDB8',
            borderRadius: 6,
            padding: '18px 22px',
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              padding: '2px 10px',
              background: isSuper
                ? 'rgba(139, 31, 47, 0.12)'
                : 'rgba(45, 95, 78, 0.12)',
              color: isSuper ? '#8B1F2F' : '#2D5F4E',
              fontWeight: 600,
              fontSize: 11,
              letterSpacing: '0.1em',
              borderRadius: 3,
            }}
          >
            {isSuper ? 'SUPER' : 'DEPT'}
          </span>
          <span
            style={{ fontFamily: "'Noto Serif TC', serif", fontSize: 16 }}
          >
            {session.username}
          </span>
          <span style={{ fontSize: 13, color: '#8A7F73' }}>
            · 可管 {deptLabel}
          </span>
        </div>

        {/* Push stats（只給 super 看）*/}
        {pushStats && (
          <section style={{ marginBottom: 20 }}>
            <h2 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 22, fontWeight: 400, color: '#1A1612', margin: '24px 0 12px' }}>
              Push Subscribers
            </h2>
            {/* 第 1 列 — 4 個 KPI 卡（auto-fit：手機自動換行成 2x2）*/}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 10 }}>
              <StatCard label="目前訂閱裝置" value={pushStats.totalSubs} hint="device 計，一人多裝置算多筆" />
              <StatCard label="近 24 小時新增" value={pushStats.subs24h} accent={pushStats.subs24h > 0} />
              <StatCard label="近 7 天新增" value={pushStats.subs7d} accent={pushStats.subs7d > 0} />
              <StatCard
                label="最近一則送達"
                value={pushStats.lastJob ? `${pushStats.lastJob.sent}/${pushStats.lastJob.sent + pushStats.lastJob.failed + pushStats.lastJob.pending}` : '—'}
                hint={pushStats.lastJob ? pushStats.lastJob.postTitle.slice(0, 14) + (pushStats.lastJob.postTitle.length > 14 ? '…' : '') : '尚無推播'}
              />
            </div>
            {/* 第 2 列 — 裝置分佈 + 失敗訂閱（auto-fit 手機堆疊）*/}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10, marginBottom: 10 }}>
              <DeviceMixCard mix={pushStats.deviceMix} />
              <FailingSubsCard subs={pushStats.failingSubs} />
            </div>
            {/* 第 3 列 — 30 天趨勢全寬 */}
            <div style={{ marginBottom: 10 }}>
              <SubsTrendChart trend={pushStats.trend30d} />
            </div>
            {/* 第 4 列 — 最近推播 delivery 表 */}
            <RecentDeliveriesTable recent={pushStats.recent} />
          </section>
        )}

        {/* LINE Broadcast Routing — super only（component 內含自己的 fetch + UI）*/}
        {isSuper && <AdminLineRouting />}

        {/* Posts list — client component, 內含搜尋框 + 手機 responsive + 閱讀數 */}
        <AdminPostsTable posts={posts} viewCounts={Object.fromEntries(viewCounts)} />
      </div>
    </main>
    </>
  );
}
