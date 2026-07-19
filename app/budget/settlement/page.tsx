import type { Metadata } from 'next';
import Link from 'next/link';
import { ACTIVITIES, META, fmt } from '@/lib/budget/data';
import SettlementDoc from '@/components/budget/SettlementDoc';

export const metadata: Metadata = {
  title: '結算機制｜E118 南班班費執行與結算',
  description: '預算 vs 實際的結算機制 — 每場活動結算單、跟北班的請款方式、三年期末總對帳。',
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

const SETTLED = ACTIVITIES.filter((a) => a.settlement);

export default function SettlementPage() {
  return (
    <>
      <div style={{ marginBottom: 20 }}>
        <Link href="/budget/tracking" style={{ fontSize: 13, color: MUTE, textDecoration: 'none' }}>← 回執行追蹤</Link>
        <h1 style={{ fontFamily: TC, fontSize: 28, color: WINE_DEEP, fontWeight: 600, margin: '12px 0 6px' }}>結算機制</h1>
        <p style={{ fontSize: 14, color: '#4A413A', lineHeight: 1.8, maxWidth: 800 }}>
          預算的目的是：訂單價、預收現金、跟北班同步預期；
          實際請款與對帳一律以「該場活動真實發生的數字」為準，不以預算估算為準。
        </p>
      </div>

      {/* ── 為什麼預算跟實際會不同 ─────────────────────────────────── */}
      <Section title="一、為什麼預算跟實際會不同" accent="ink">
        <div className="bdg-grid bdg-grid-2 bdg-grid-gap-sm">
          <Card title="預算（事前估算）" desc="活動前用學長姐實際決算 + 6% 漲幅 + 出席率保守估，目的是訂出班費單價、確保資金週轉、跟北班同步預期。" accent={GOLD} />
          <Card title="結算（事後實算）" desc="活動結束後依實際發生的支出與收入結算；跟北班的請款、退費機制都用此數字。" accent={OK} />
        </div>
        <div style={noteStyle}>
          <strong>差距是常態</strong>：實際出席率、廠商最終報價、現場加點、贊助金額都會跟預算有出入。
          差距越大、越需要結算公告與期末總對帳，避免預算數字被誤當成實際金額。
        </div>
      </Section>

      {/* ── 單一場活動的結算流程 ──────────────────────────────────── */}
      <Section title="二、單一場活動結算流程" accent="wine">
        <ol style={{ paddingLeft: 22, color: '#4A413A', lineHeight: 2, fontSize: 14 }}>
          <li><strong>活動結束 30 日內</strong>：南班財務長依實際發票 / 收據彙整支出，並整理現場收入</li>
          <li><strong>結算單製作</strong>：依下方格式填寫，秘書長覆核</li>
          <li><strong>送出結算單</strong>：email / LINE 給北班財務長，副本送南班幹部群組</li>
          <li><strong>北班匯款</strong>：依結算單金額匯入南班財務指定帳戶；南班財務長收到後回執</li>
          <li><strong>更新活動頁</strong>：本網站對應活動頁更新「結算狀態」欄位、顯示實際金額與預算的差異</li>
        </ol>
      </Section>

      {/* ── 結算單範本 ─────────────────────────────────────────────── */}
      <Section title="三、結算單範本" accent="gold">
        <p style={{ fontSize: 13.5, color: '#4A413A', lineHeight: 1.8, marginBottom: 16 }}>
          每場合辦活動結束後 30 日內，財務長使用以下格式製作結算單給北班財務長。
          欄位以底線表示待填入；活動資料建檔後，系統可直接產出填妥的結算單（見下方已結算清單）。
        </p>
        <div style={noteStyle}>
          <strong>三個最容易出錯的欄位</strong>：①「個人自費 / 代收代付」務必先扣除，否則會把個人款項算進南北分攤基數；
          ②「差異原因」要按類型分述（單價變動 vs 數量變動），這是收件人最常追問的一點；
          ③「分攤基準」要寫明人數與比例，同一項目前後兩次算法不同會造成請款爭議。
        </div>

        <SettlementDoc />

        {/* 已結算項目：直接連到系統產出的正式結算單 */}
        {SETTLED.length > 0 && (
          <div style={{ marginTop: 22 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: WINE_DEEP, marginBottom: 8 }}>已產出的結算單</div>
            <ul style={{ paddingLeft: 22, color: '#4A413A', lineHeight: 2, fontSize: 13.5, margin: 0 }}>
              {SETTLED.map((a) => (
                <li key={a.slug}>
                  <Link href={`/budget/settlement/${a.slug}`} style={{ color: WINE, fontWeight: 600 }}>
                    {a.name}
                  </Link>
                  <span style={{ color: MUTE, fontSize: 12.5 }}>
                    　{a.settlement!.no}（第 {a.settlement!.revision} 版）· 製表 {a.settlement!.issuedAt}
                    {a.actualSplit && ` · 北班應付 NT$ ${fmt(a.actualSplit.north.amount)}`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      {/* ── 跟北班的請款規則 ──────────────────────────────────────── */}
      <Section title="四、跟北班的請款規則" accent="wine">
        <div className="bdg-table-wrap">
          <table className="bdg-table">
            <caption>不同類型費用的請款邏輯</caption>
            <thead>
              <tr><th scope="col">費用類型</th><th scope="col">範例</th><th scope="col">結算邏輯</th></tr>
            </thead>
            <tbody>
              <tr>
                <td className="strong" data-label="費用類型">A 統一辦的活動</td>
                <td data-label="範例">聖誕晚會 / 新生報到 / 新生營 / 116 午宴 / 118 畢業晚會</td>
                <td data-label="結算邏輯">由南班主辦人統一付廠商；活動結束後按 83:16 比例向北班請款</td>
              </tr>
              <tr>
                <td className="strong" data-label="費用類型">B 班級共同購置</td>
                <td data-label="範例">班服（含師長致贈、備用庫存）</td>
                <td data-label="結算邏輯">
                  屬班級共同財產，<strong>按全班人數 83:16 分攤</strong>，不因個人是否領取而異；
                  個人自費加購另計、不列入班費
                </td>
              </tr>
              <tr>
                <td className="strong" data-label="費用類型">C 對人計費的固定費</td>
                <td data-label="範例">校友會費</td>
                <td data-label="結算邏輯">
                  費用本身對應到個人身分（每人一份會籍），<strong>按實際人頭計算</strong>；
                  人數有異動時以實際繳交名單為準
                </td>
              </tr>
              <tr>
                <td className="strong" data-label="費用類型">D 南班自辦活動</td>
                <td data-label="範例">119 迎新晚會（南班）</td>
                <td data-label="結算邏輯">南班獨自負擔、不向北班請款</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      {/* ── 三年期末總對帳 ────────────────────────────────────────── */}
      <Section title="五、三年期末總對帳" accent="gold">
        <p style={{ fontSize: 14, color: '#4A413A', lineHeight: 1.9, marginBottom: 12 }}>
          <strong>時間點</strong>：2028 年 8 月（118 畢業後一個月內）
        </p>
        <ol style={{ paddingLeft: 22, color: '#4A413A', lineHeight: 2, fontSize: 14 }}>
          <li>列出三年所有合辦活動的<strong>實際結算數字</strong>，對比預算估算</li>
          <li>列出南班自理項目（聯誼、緊急、婚喪、補助）的實際動用 vs 編列預算</li>
          <li>差額處理：
            <ul style={{ marginTop: 6, paddingLeft: 20 }}>
              <li>北班總多付 → 南班退錢給北班</li>
              <li>北班總少付 → 北班補匯</li>
              <li>南班預備金未動用 → 按 83 人比例退回南班同學</li>
            </ul>
          </li>
          <li>對外公告：完整三年收支對照表 + 退費明細，發送全班</li>
        </ol>
      </Section>

      {/* ── 退款計算範例 ────────────────────────────────────────── */}
      <Section title="六、南班同學退款金額試算範例" accent="ok">
        <p style={{ fontSize: 13.5, color: '#4A413A', lineHeight: 1.8, marginBottom: 12 }}>
          假設三年結算後南班的「未動用 + 多收」總額為 NT$ <strong>373,100</strong>（即預估的安全水位 4,442 / 人）：
        </p>
        <div className="bdg-grid bdg-grid-3 bdg-grid-gap-sm">
          <Card title="樂觀情境" desc={`若所有預備金 100% 未動用 + 活動沒有超支，每人退回約 NT$ ${fmt(Math.round(373100 / META.southMembers))}`} accent={OK} />
          <Card title="平均情境" desc="若預備金動用 50%、活動部分超支，每人退回約 NT$ 2,000 – 3,000" accent={GOLD} />
          <Card title="保守情境" desc="若預備金幾乎全用 + 活動全面超支，可能不退回；但因有 8.9 萬安全水位，不會額外追收" accent={WINE} />
        </div>
      </Section>
    </>
  );
}

function Section({ title, accent, children }: { title: string; accent: 'wine' | 'gold' | 'ink' | 'ok'; children: React.ReactNode }) {
  const c = accent === 'wine' ? WINE : accent === 'gold' ? GOLD : accent === 'ok' ? OK : INK;
  return (
    <section
      style={{
        background: '#fff',
        border: `1px solid ${LINE}`,
        borderTop: `4px solid ${c}`,
        borderRadius: 8,
        padding: '22px 26px',
        marginBottom: 22,
      }}
    >
      <h2 style={{ fontFamily: TC, fontSize: 20, color: WINE_DEEP, fontWeight: 600, margin: '0 0 14px' }}>{title}</h2>
      {children}
    </section>
  );
}

function Card({ title, desc, accent }: { title: string; desc: string; accent: string }) {
  return (
    <div style={{ background: PAPER, border: `1px solid ${LINE}`, borderLeft: `3px solid ${accent}`, borderRadius: 6, padding: '12px 16px' }}>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: WINE_DEEP, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, color: '#4A413A', lineHeight: 1.7 }}>{desc}</div>
    </div>
  );
}

const noteStyle: React.CSSProperties = {
  marginTop: 14,
  background: PAPER,
  border: `1px solid ${LINE}`,
  borderLeft: `3px solid ${GOLD}`,
  padding: '10px 14px',
  borderRadius: 4,
  fontSize: 13,
  color: '#4A413A',
  lineHeight: 1.8,
};
