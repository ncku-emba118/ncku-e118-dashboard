import type { Metadata } from 'next';
import Link from 'next/link';
import { META, fmt } from '@/lib/budget/data';

export const metadata: Metadata = {
  title: '結算機制｜E118 南班班費預算說明書',
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

const blankFill: React.CSSProperties = {
  display: 'inline-block',
  borderBottom: `1px solid ${INK}`,
  minWidth: 80,
  paddingBottom: 1,
};

const blankLine: React.CSSProperties = {
  display: 'block',
  borderBottom: `1px solid ${INK}`,
  height: 22,
};

const hr: React.CSSProperties = {
  margin: '10px 0',
  borderTop: `1px solid ${LINE}`,
};

export default function SettlementPage() {
  return (
    <>
      <div style={{ marginBottom: 20 }}>
        <Link href="/budget" style={{ fontSize: 13, color: MUTE, textDecoration: 'none' }}>← 回總覽</Link>
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
          欄位以底線「______」表示待填入；實際使用時可下載為 PDF 或截圖傳給北班財務長。
        </p>

        {/* ── 結算單視覺渲染 ────────────────────────────────────────── */}
        <div
          style={{
            background: '#fff',
            border: `2px solid ${WINE_DEEP}`,
            borderRadius: 8,
            padding: 0,
            maxWidth: 720,
            margin: '0 auto',
            fontFamily: "'Noto Serif TC', 'PingFang TC', serif",
            boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
          }}
        >
          {/* Receipt Header */}
          <div
            style={{
              background: WINE_DEEP,
              color: '#fff',
              padding: '18px 24px',
              borderBottom: `3px solid ${GOLD}`,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 11, color: '#E0C896', letterSpacing: 2, marginBottom: 4 }}>
              NCKU EMBA · E118 SOUTH
            </div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>活 動 結 算 單</div>
            <div style={{ fontSize: 11, color: '#E0C896', marginTop: 4 }}>STATEMENT OF ACTIVITY SETTLEMENT</div>
          </div>

          {/* 編號與日期 */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              padding: '14px 24px',
              borderBottom: `1px dashed ${LINE}`,
              fontSize: 12.5,
              color: '#4A413A',
            }}
          >
            <div>結算單編號 No. <span style={blankFill}>________</span></div>
            <div style={{ textAlign: 'right' }}>製表日期 <span style={blankFill}>____ / __ / __</span></div>
          </div>

          {/* 活動資訊 */}
          <Box title="活動資訊">
            <Row label="活動名稱" />
            <Row label="活動日期" />
            <Row label="活動地點" />
            <Row label="主辦人" />
          </Box>

          {/* 收支結算 */}
          <Box title="收支結算（實際發生）">
            <RowAmount label="① 總支出（實際）" tail="附憑證 ___ 筆（明細見附件 A）" />
            <RowAmount label="② 總收入（實際）" tail="附收據 ___ 筆（明細見附件 B）" />
            <div style={hr} />
            <RowAmount label="③ 班費淨負擔 = ① − ②" emphasis />
          </Box>

          {/* 南北分攤 */}
          <Box title={`南北分攤（按 ${META.southMembers}:${META.northMembers}）`}>
            <RowAmount label={`南班應付（${META.southMembers}/${META.totalMembers} ≈ 84.85%）`} />
            <RowAmount label={`北班應付（${META.northMembers}/${META.totalMembers} ≈ 15.15%）`} />
          </Box>

          {/* 撥款指示 */}
          <Box title="撥款指示">
            <RowAmount label="南班預收（從班費撥）" />
            <RowAmount label="北班需匯款金額" emphasis />
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${LINE}`, fontSize: 12.5, color: '#4A413A' }}>
              <Row label="匯款戶名 / 帳號" />
              <Row label="匯款期限" />
            </div>
          </Box>

          {/* 簽署 */}
          <div
            style={{
              padding: '16px 24px',
              borderTop: `1px solid ${LINE}`,
              background: PAPER,
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 20,
              fontSize: 12,
              color: '#4A413A',
            }}
          >
            <div>
              <div style={{ borderBottom: `1px solid ${INK}`, height: 28 }} />
              <div style={{ marginTop: 6, textAlign: 'center' }}>製表人（財務長）</div>
            </div>
            <div>
              <div style={{ borderBottom: `1px solid ${INK}`, height: 28 }} />
              <div style={{ marginTop: 6, textAlign: 'center' }}>覆核人（秘書長）</div>
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              padding: '10px 24px',
              borderTop: `1px solid ${LINE}`,
              background: '#fff',
              fontSize: 11,
              color: MUTE,
              textAlign: 'center',
              borderBottomLeftRadius: 6,
              borderBottomRightRadius: 6,
            }}
          >
            E118 南班秘書處製表　·　本結算單副本同步公告至南班幹部群組
          </div>
        </div>
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
                <td data-label="結算邏輯">由南班主辦人統一付廠商；活動結束後按 84:15 比例向北班請款</td>
              </tr>
              <tr>
                <td className="strong" data-label="費用類型">B 按人頭的固定費</td>
                <td data-label="範例">班服 / 校友會費</td>
                <td data-label="結算邏輯">按實際數量算（如班服按各人實際訂購、校友會費按人頭）</td>
              </tr>
              <tr>
                <td className="strong" data-label="費用類型">C 南班自辦活動</td>
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
              <li>南班預備金未動用 → 按 84 人比例退回南班同學</li>
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

// 結算單元件 ──────────────────────────────────────────────────────
function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '14px 24px', borderBottom: `1px dashed ${LINE}` }}>
      <div style={{ fontSize: 11, color: GOLD, letterSpacing: 1.5, marginBottom: 10, fontWeight: 600 }}>{title}</div>
      {children}
    </div>
  );
}

function Row({ label }: { label: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', alignItems: 'center', padding: '4px 0', fontSize: 13, color: '#4A413A' }}>
      <span style={{ color: WINE_DEEP, fontWeight: 500 }}>{label}</span>
      <span style={blankLine} />
    </div>
  );
}

function RowAmount({ label, tail, emphasis }: { label: string; tail?: string; emphasis?: boolean }) {
  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'baseline', gap: 12 }}>
        <span style={{ fontSize: 13, color: emphasis ? WINE : WINE_DEEP, fontWeight: emphasis ? 700 : 500 }}>{label}</span>
        <span
          style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: emphasis ? 18 : 15,
            fontWeight: 600,
            color: emphasis ? WINE : INK,
            minWidth: 180,
            textAlign: 'right',
            borderBottom: `1px solid ${INK}`,
            paddingBottom: 2,
            paddingRight: 8,
          }}
        >
          NT$ ____________
        </span>
      </div>
      {tail && <div style={{ fontSize: 11, color: MUTE, marginTop: 2, marginLeft: 0 }}>{tail}</div>}
    </div>
  );
}
