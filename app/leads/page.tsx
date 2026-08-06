/**
 * 各活動總召公告頁 — 依時間序列出每場活動的總召。
 * 資料來源 lib/leads/data.ts（單一來源，新增活動加一筆即可）。
 * 版型：編輯式跨頁，樣式在 ./leads.css。
 */
import type { Metadata } from 'next';
import Breadcrumb from '@/components/Breadcrumb';
import { getLeads, isUpcoming, PRINCIPALS } from '@/lib/leads/data';
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
        <header className="lead-mast">
          <div className="lead-wrap">
            <a href="/" className="lead-id">
              E118<span>各活動總召</span>
            </a>
            <a href="/officers" className="lead-side">
              班級幹部組織圖 →
            </a>
          </div>
        </header>

        <main>
          <section className="lead-hero">
            <div className="lead-wrap">
              <div className="lead-eyebrow">NCKU EMBA · E118 South</div>
              <h1>各活動總召</h1>
              <p>
                本班決議每場活動設置總召，依活動性質指派合適幹部，不必固定由活動長擔任；活動長全力協助。以下依時間序排列。
              </p>
            </div>
          </section>

          {/* 常設角色：不綁單一場次，整學年都在 */}
          <section className="lead-band">
            <div className="lead-wrap">
              {PRINCIPALS.map((p) => (
                <div key={p.role} className="lead-fig">
                  <div className="lead-fig-photo">
                    {p.photo ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={`/assets/leads/${p.photo}`} alt={p.name} loading="lazy" />
                    ) : (
                      <span>
                        照片
                        <br />
                        待提供
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="lead-role">{p.role}</span>
                    <h2>
                      {p.name}
                      <span className="e">{p.nameEn}</span>
                    </h2>
                    <div className="lead-org">
                      <span className="org">{p.org}</span>
                      <span className="sep">·</span>
                      {p.title}
                    </div>
                    <div className="lead-note">{p.note}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="lead-rows lead-wrap">
            {leads.map((l, i) => (
              <article
                key={l.sortKey}
                className={`lead-row${i % 2 === 1 ? ' is-flip' : ''}${
                  isUpcoming(l) ? '' : ' is-past'
                }`}
              >
                <div className="lead-txt">
                  <div className="lead-yr">{l.year}</div>
                  <div className="lead-mo">{l.when}</div>
                  <h2>{l.activity}</h2>
                  <div className="en">{l.activityEn}</div>
                  <p className="desc">{l.desc}</p>
                  <div className="lead-rule" />
                  <div className="lead-who">
                    <span className="k">總召</span>
                    <span className="n">{l.name}</span>
                    <span className="e">{l.nameEn}</span>
                  </div>
                  <div className="lead-org">
                    <span className="org">{l.org}</span>
                    <span className="sep">·</span>
                    {l.title}
                  </div>
                </div>

                <div className="lead-img">
                  {l.photo ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={`/assets/leads/${l.photo}`} alt={l.name} loading="lazy" />
                  ) : (
                    <span>
                      照片
                      <br />
                      待提供
                    </span>
                  )}
                </div>
              </article>
            ))}

            <div className="lead-slot">
              <span>後續活動預留 — 新增一筆資料即可，版面自動延長</span>
              <i />
            </div>
          </div>

          <div className="lead-foot lead-wrap">
            NCKU EMBA · E118 南班 · 秘書處維護　　資料以幹部會議紀錄與班級通訊錄為準
          </div>
        </main>
      </div>
    </>
  );
}
