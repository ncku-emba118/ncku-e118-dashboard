import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '申請規則｜E118 南班班費預算說明書',
  description: '婚喪喜慶申請標準、聯誼活動補助、南班參與北班活動補助 — 完整流程與條件。',
};

const WINE = '#8B1F2F';
const WINE_DEEP = '#6B1622';
const GOLD = '#C9A961';
const PAPER = '#F4EFE6';
const INK = '#1A1612';
const MUTE = '#8A7F73';
const LINE = '#E8DFD0';
const OK = '#2D5F4E';
const TC = "'Noto Serif TC', 'PingFang TC', 'Songti TC', serif";

export default function RulesPage() {
  return (
    <>
      <div style={{ marginBottom: 20 }}>
        <Link href="/budget" style={{ fontSize: 13, color: MUTE, textDecoration: 'none' }}>← 回總覽</Link>
        <h1 style={{ fontFamily: TC, fontSize: 28, color: WINE_DEEP, fontWeight: 600, margin: '12px 0 6px' }}>申請規則</h1>
        <p style={{ fontSize: 14, color: '#4A413A', lineHeight: 1.8, maxWidth: 800 }}>
          班級事務由秘書處統一處理，原則以「從簡」為主、不增加申請成本；
          下列為三項涉及金錢動用的標準與流程，作為動用依據與事後核銷的對照。
        </p>
      </div>

      {/* ── 婚喪喜慶 ─────────────────────────────────────────────────── */}
      <RuleSection id="condolence" title="一、婚喪喜慶（年度估列 36,000）" subtitle="同學人生大事的祝賀與致意，全班共同的人情往來">
        <h3 style={h3}>金額表</h3>
        <div className="bdg-table-wrap">
          <table className="bdg-table">
            <caption>婚喪喜慶慰問金（金額單位：新台幣元）</caption>
            <thead>
              <tr>
                <th scope="col">事由</th>
                <th scope="col" className="num">金額</th>
                <th scope="col">數字理由</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>同學本人 / 配偶結婚</td><td className="num strong">6,000</td><td className="mute">雙數（吉利）</td></tr>
              <tr><td>同學本人 / 配偶生子</td><td className="num strong">3,600</td><td className="mute">雙數（含「順」音）</td></tr>
              <tr><td>同學本人直系親屬喪事</td><td className="num strong">5,000</td><td className="mute">單數（白事禮）</td></tr>
            </tbody>
          </table>
        </div>
        <h3 style={h3}>適用範圍</h3>
        <ul style={ul}>
          <li><strong>直系親屬</strong>：父母、配偶、子女、本人；岳父母 / 公婆視同直系（婚配後同住）</li>
          <li><strong>旁系</strong>（兄弟姐妹、祖父母、叔伯姑舅等）原則不列；如人情濃厚，可由秘書處個案簽核 1,000 – 3,000 元致意金</li>
        </ul>

        <h3 style={h3}>申請流程</h3>
        <Steps
          steps={[
            { t: '事件發生', d: '同學本人或同學身邊朋友通知秘書處（LINE 群組 / 私訊秘書長皆可）' },
            { t: '秘書處查核', d: '48 小時內核對身份、事由、金額表' },
            { t: '秘書長 + 財務長雙簽', d: '任一人均可發起、另一人覆核' },
            { t: '執行', d: '喜事 7 日內、喪事當週內。喜事：紅包/匯款 + 群組或私訊祝賀；喪事：白包 + 致電/到場（地理近）或代表致意' },
            { t: '入帳留底', d: '財務記錄日期、事由、收件人、金額、雙簽人；季度公告至幹部群組（細節去識別化）' },
          ]}
        />

        <h3 style={h3}>預算控管</h3>
        <ul style={ul}>
          <li>三年總額預估：36,000（約 10 次事件 × 平均 3,600）</li>
          <li>超支時：由「緊急預備金」150,000 支應，超支事件需秘書長 + 班代 + 財務長三方確認</li>
          <li>結餘：期末按比例退回班費公帳</li>
        </ul>
      </RuleSection>

      {/* ── 聯誼活動補助 ─────────────────────────────────────────────── */}
      <RuleSection id="leisure" title="二、聯誼活動補助（年度估列 150,000）" subtitle="班級聯誼活動的補助池，採補助制、非全額買單">
        <h3 style={h3}>補助原則</h3>
        <ul style={ul}>
          <li><strong>性質</strong>：補助制，不是全額買單。班級補助餐費 / 場地的一部分，參加者自付剩餘差額</li>
          <li><strong>適用</strong>：班遊、班級聚餐、年節聚會、家庭日、跨年小聚等南班內部凝聚感情的活動</li>
          <li><strong>不適用</strong>：個人慶生、單一小團體活動、私人聚會</li>
        </ul>

        <h3 style={h3}>補助強度（建議）</h3>
        <div className="bdg-table-wrap">
          <table className="bdg-table">
            <caption>聯誼活動補助參考額度</caption>
            <thead>
              <tr><th scope="col">活動類型</th><th scope="col">建議補助</th><th scope="col">說明</th></tr>
            </thead>
            <tbody>
              <tr><td>春季班遊（兩天一夜）</td><td>每人 1,500 元</td><td>住宿 / 交通部分補助，餐食自付</td></tr>
              <tr><td>期末聚餐</td><td>桌費 50%</td><td>飲料 / 加菜自付</td></tr>
              <tr><td>跨年 / 年節小聚</td><td>場地 + 餐費上限 10,000</td><td>視出席人數彈性調整</td></tr>
              <tr><td>家庭日 / 雙年慶</td><td>場地 + 主視覺上限 20,000</td><td>餐食按人頭計算、補助上限 1,000 / 人</td></tr>
            </tbody>
          </table>
        </div>

        <h3 style={h3}>申請流程（從簡）</h3>
        <Steps
          steps={[
            { t: '活動長提案', d: 'LINE 群組或會議中提出活動構想（日期、地點、預估費用、補助金額需求）' },
            { t: '財務長核', d: '對照預算池餘額確認，無正式書面申請' },
            { t: '撥款執行', d: '活動前預撥場地訂金 / 餐廳訂金，活動後實報實銷' },
            { t: '結餘退回', d: '實際支出 < 補助金額，差額退回班費公帳' },
          ]}
        />
      </RuleSection>

      {/* ── 南班參與北班活動補助 ────────────────────────────────────────── */}
      <RuleSection id="north-participation" title="三、南班參與北班活動補助（年度估列 50,000）" subtitle="鼓勵南班同學上去參加北班的事務、促進南北班交流">
        <h3 style={h3}>性質說明</h3>
        <div
          style={{
            background: '#FFF8E7',
            border: `1px solid ${GOLD}`,
            borderLeft: `4px solid ${GOLD}`,
            padding: '12px 16px',
            borderRadius: 6,
            fontSize: 13.5,
            color: '#7a5c00',
            lineHeight: 1.8,
            margin: '0 0 16px',
          }}
        >
          <strong>這項補助的對象是「南班同學」，不是「北班」。</strong>
          錢不會匯給北班，是補助南班同學上去參加的車馬費與餐費。北班自己辦活動的開銷由北班自行處理。
        </div>

        <h3 style={h3}>適用活動</h3>
        <ul style={ul}>
          <li>北班招生說明會聚餐（2027 年 9 月）</li>
          <li>北班聖誕晚會（2026 年 12 月）</li>
        </ul>

        <h3 style={h3}>補助範圍與上限</h3>
        <div className="bdg-table-wrap">
          <table className="bdg-table">
            <caption>南班參與北班活動補助規則</caption>
            <thead>
              <tr><th scope="col">項目</th><th scope="col">內容</th></tr>
            </thead>
            <tbody>
              <tr><td className="strong">補助對象</td><td>南班同學（實際參加者）</td></tr>
              <tr><td className="strong">補助項目</td><td>高鐵 / 油資 / 停車 + 該場餐費</td></tr>
              <tr><td className="strong">單場上限</td><td>NT$ 25,000</td></tr>
              <tr><td className="strong">三年累計上限</td><td>NT$ 50,000（兩場合計，額滿即止、不滾存）</td></tr>
              <tr><td className="strong">超支處理</td><td>單場費用超過 25,000 元，多出來的部分由實際參加的南班同學自行攤付</td></tr>
            </tbody>
          </table>
        </div>

        <h3 style={h3}>動用流程（從簡）</h3>
        <Steps
          steps={[
            { t: '活動結束', d: '活動長 / 秘書長依實際出席的南班同學人數核算車馬費 + 餐費' },
            { t: '核算撥款', d: '無需正式申請；撥入南班財務帳戶後再分發給參加者' },
            { t: '群組公告', d: '每場結束後在幹部群組公告（出席人數、補助總額、平均每人補助多少）' },
            { t: '結餘退回', d: '兩場活動均完成後，剩餘額度不再開放申請；未動用部分按 84 人比例退回班費公帳' },
          ]}
        />
      </RuleSection>
    </>
  );
}

function RuleSection({ id, title, subtitle, children }: { id: string; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section
      id={id}
      style={{
        background: '#fff',
        border: `1px solid ${LINE}`,
        borderTop: `4px solid ${WINE}`,
        borderRadius: 8,
        padding: '22px 26px',
        marginBottom: 24,
      }}
    >
      <h2 style={{ fontFamily: TC, fontSize: 20, color: WINE_DEEP, fontWeight: 600, margin: '0 0 4px' }}>{title}</h2>
      {subtitle && <div style={{ fontSize: 13, color: MUTE, marginBottom: 14 }}>{subtitle}</div>}
      {children}
    </section>
  );
}

function Steps({ steps }: { steps: { t: string; d: string }[] }) {
  return (
    <ol style={{ listStyle: 'none', padding: 0, margin: '0 0 8px', counterReset: 'step' }}>
      {steps.map((s, i) => (
        <li
          key={i}
          style={{
            position: 'relative',
            paddingLeft: 44,
            paddingBottom: 14,
            borderLeft: i === steps.length - 1 ? '0' : `2px solid ${LINE}`,
            marginLeft: 14,
          }}
        >
          <span
            style={{
              position: 'absolute',
              left: -14,
              top: 0,
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: WINE,
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {i + 1}
          </span>
          <div style={{ fontSize: 14, color: INK, fontWeight: 600, marginBottom: 2 }}>{s.t}</div>
          <div style={{ fontSize: 13, color: '#4A413A', lineHeight: 1.7 }}>{s.d}</div>
        </li>
      ))}
    </ol>
  );
}

const h3: React.CSSProperties = { fontFamily: TC, fontSize: 15, color: WINE_DEEP, fontWeight: 600, margin: '16px 0 8px' };
const ul: React.CSSProperties = { paddingLeft: 22, color: '#4A413A', lineHeight: 1.9, fontSize: 13.5, marginBottom: 12 };
