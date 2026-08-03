/**
 * 各活動總召公告頁 — 依時間序列出每場活動的總召。
 * 資料來源 lib/leads/data.ts（單一來源，新增活動加一筆即可）。
 * 版型：縱線時間軸，樣式在 ./leads.css。
 */
import type { Metadata } from 'next';
import Breadcrumb from '@/components/Breadcrumb';
import { getLeads, isUpcoming } from '@/lib/leads/data';
import './leads.css';

export const metadata: Metadata = {
  title: '各活動總召 · E118 南班',
  description: 'E118 南班各場活動總召名單，依時間序排列。',
};

export const revalidate = 3600;

export default function LeadsPage() {
  const leads = getLeads();

  return (
    <>
      <Breadcrumb items={[{ label: '班級面板', href: '/' }, { label: '各活動總召' }]} />
      <div className="lead-page">
        <header style={{ background: '#8B1F2F', color: '#fff', borderBottom: '3px solid #C9A961' }}>
          <div style={{ maxWidth: 860, margin: '0 auto', padding: '14px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <a href="/" style={{ fontFamily: '"Cormorant Garamond",serif', fontSize: 24, fontWeight: 700, color: '#fff', textDecoration: 'none' }}>
              E118<span style={{ fontFamily: '"Noto Serif TC",serif', fontSize: 13, color: '#E0C896', marginLeft: 8 }}>各活動總召</span>
            </a>
            <a href="/officers" style={{ fontFamily: '"Noto Serif TC",serif', fontSize: 12.5, color: '#E0C896', textDecoration: 'none', letterSpacing: '.08em' }}>
              班級幹部組織圖 →
            </a>
          </div>
        </header>

        <main className="lead-main">
          <section className="lead-intro">
            <div className="lead-eyebrow">NCKU EMBA · E118 South</div>
            <h1>各活動總召</h1>
            <p>本班決議每場活動設置總召，依活動性質指派合適幹部，不必固定由活動長擔任；活動長全力協助。以下依時間序排列。</p>
          </section>

          <div className="lead-tl">
            {leads.map((l) => (
              <article key={l.sortKey} className={`lead-item${isUpcoming(l) ? ' is-upcoming' : ''}`}>
                <div className="lead-date">
                  <div className="y">{l.year}</div>
                  <div className="m">{l.when}</div>
                </div>

                <div className="lead-photo">
                  {l.photo ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={`/assets/leads/${l.photo}`} alt={l.name} loading="lazy" />
                  ) : (
                    <span>照片<br />待提供</span>
                  )}
                </div>

                <div className="lead-txt">
                  <h2>{l.activity}</h2>
                  <div className="en">{l.activityEn}</div>
                  <p className="desc">{l.desc}</p>
                  <div className="lead-who">
                    <span className="k">總召</span>
                    <div className="line">
                      <span className="n">{l.name}</span>
                      <span className="e">{l.nameEn}</span>
                    </div>
                    <div className="t">
                      <span className="org">{l.org}</span>
                      <span className="sep">·</span>
                      {l.title}
                    </div>
                  </div>
                </div>
              </article>
            ))}

            <div className="lead-slot">後續活動預留 — 新增一個節點即可，時間軸自動延長</div>
          </div>

          <div className="lead-foot">
            NCKU EMBA · E118 南班 · 秘書處維護
            <br />
            資料以幹部會議紀錄為準
          </div>
        </main>
      </div>
    </>
  );
}
