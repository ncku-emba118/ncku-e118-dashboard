import type { Activity } from '@/lib/budget/data';
import { META, fmt } from '@/lib/budget/data';

const WINE = '#8B1F2F';
const WINE_DEEP = '#6B1622';
const GOLD = '#C9A961';
const PAPER = '#F4EFE6';
const INK = '#1A1612';
const MUTE = '#8A7F73';
const LINE = '#E8DFD0';
const TC = "'Noto Serif TC', 'PingFang TC', 'Songti TC', serif";
const NUM = "'Cormorant Garamond', Georgia, serif";

/** 未填值時顯示的底線佔位 */
const BLANK = '____________';

/**
 * 活動結算單。
 * 不帶 activity → 空白範本（結算機制頁使用）；
 * 帶 activity 且含 settlement → 依實際結算資料填妥（/budget/settlement/[slug] 使用）。
 * 兩者共用同一份版面，避免範本改了而實際單沒跟上。
 */
export default function SettlementDoc({ activity }: { activity?: Activity }) {
  const s = activity?.settlement;
  const split = activity?.actualSplit;

  // 金額推導：帳單 → 扣個人自費 → 班費實際支出 → 扣收入 → 班費淨負擔
  const invoice = s?.invoiceTotal;
  const selfPaid = s?.selfPaid ?? 0;
  const fundExpense = invoice !== undefined ? invoice - selfPaid : undefined;
  const income = s?.actualIncome ?? 0;
  const netBurden = fundExpense !== undefined ? fundExpense - income : undefined;

  const budget = activity?.expense.total;
  const invoiceVsBudget = invoice !== undefined && budget !== undefined ? invoice - budget : undefined;
  const netVsBudget = netBurden !== undefined && budget !== undefined ? netBurden - budget : undefined;

  const money = (n?: number) => (n === undefined ? BLANK : `NT$ ${fmt(n)}`);
  const signed = (n?: number) => (n === undefined ? BLANK : `${n >= 0 ? '+' : '−'}NT$ ${fmt(Math.abs(n))}`);

  return (
    <div className="settlement-doc" style={docStyle}>
      {/* 抬頭 */}
      <div style={headerStyle}>
        <div style={{ fontSize: 11, color: '#E0C896', letterSpacing: 2, marginBottom: 4 }}>NCKU EMBA · E118 SOUTH</div>
        <div style={{ fontSize: 18, fontWeight: 600 }}>活 動 結 算 單</div>
        <div style={{ fontSize: 11, color: '#E0C896', marginTop: 4 }}>STATEMENT OF ACTIVITY SETTLEMENT</div>
      </div>

      {/* 編號 / 版次 / 日期 */}
      <div style={metaBarStyle}>
        <div>結算單編號 No. <Fill v={s?.no} w={110} /></div>
        <div style={{ textAlign: 'center' }}>
          版次 <Fill v={s ? `第 ${s.revision} 版` : undefined} w={60} />
        </div>
        <div style={{ textAlign: 'right' }}>製表日期 <Fill v={s?.issuedAt} w={90} /></div>
      </div>

      {/* 更正說明 — 只在有更正時出現，讓收件人知道哪張才算數 */}
      {s && s.revision > 1 && s.revisionNote && (
        <div style={revisionStyle}>
          <strong style={{ color: WINE_DEEP }}>※ 本版更正說明：</strong>
          {s.revisionNote}
        </div>
      )}

      <Box title="活動資訊">
        <Row label="活動名稱" v={activity?.name} />
        <Row label="活動日期" v={activity?.date} />
        <Row label="活動地點" v={activity?.location === '—' ? undefined : activity?.location} />
        <Row label="主辦" v={activity?.organizer} />
        <Row label="廠商 / 供應商" v={s?.vendor} />
      </Box>

      {/* 收支結算 — 帳單與班費負擔分開，避免把個人自費算進分攤基數 */}
      <Box title="收支結算（實際發生）">
        <Amount label="① 廠商帳單總額" v={money(invoice)} tail={s?.lineItems ? `品項明細見附件 A（${s.lineItems.length} 項）` : '附憑證 ___ 筆'} />
        <Amount label="② 減：個人自費 / 代收代付" v={selfPaid ? `− NT$ ${fmt(selfPaid)}` : s ? 'NT$ 0' : BLANK} tail={s?.selfPaidNote} />
        <div style={hrStyle} />
        <Amount label="③ 班費實際支出 = ① − ②" v={money(fundExpense)} />
        <Amount label="④ 實際收入" v={s ? `NT$ ${fmt(income)}` : BLANK} tail={income ? undefined : s ? '本項無收入' : '附收據 ___ 筆'} />
        <div style={hrStyle} />
        <Amount label="⑤ 班費淨負擔 = ③ − ④" v={money(netBurden)} emphasis />
      </Box>

      {/* 預算對照 — 這欄是為了讓收件人不必再問「為什麼跟預算不一樣」 */}
      <Box title="預算對照與差異說明">
        <Amount label="預算編列數" v={money(budget)} />
        <Amount label="廠商帳單總額" v={money(invoice)} tail={`較預算 ${signed(invoiceVsBudget)}`} />
        <Amount label="班費實際負擔" v={money(netBurden)} tail={`較預算 ${signed(netVsBudget)}`} emphasis />
        {s?.variances && s.variances.length > 0 ? (
          <table style={varTableStyle}>
            <thead>
              <tr>
                <th style={varThStyle}>差異類型</th>
                <th style={varThStyle}>說明</th>
                <th style={{ ...varThStyle, textAlign: 'right' }}>金額</th>
              </tr>
            </thead>
            <tbody>
              {s.variances.map((v, i) => (
                <tr key={i}>
                  <td style={varTdStyle}>
                    <span style={kindTagStyle}>{v.kind}</span>
                  </td>
                  <td style={varTdStyle}>{v.text}</td>
                  <td style={{ ...varTdStyle, textAlign: 'right', fontFamily: NUM, fontSize: 14 }}>
                    {v.amount >= 0 ? '+' : '−'}
                    {fmt(Math.abs(v.amount))}
                  </td>
                </tr>
              ))}
              <tr>
                <td style={{ ...varTdStyle, fontWeight: 600 }} colSpan={2}>
                  合計（帳單 − 預算）
                </td>
                <td style={{ ...varTdStyle, textAlign: 'right', fontFamily: NUM, fontSize: 15, fontWeight: 700, color: WINE }}>
                  {signed(invoiceVsBudget).replace('NT$ ', '')}
                </td>
              </tr>
            </tbody>
          </table>
        ) : (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 11.5, color: MUTE, marginBottom: 4 }}>
              差異原因（請按類型分述：數量變動 / 單價變動 / 項目增減 / 出席人數 / 其他）
            </div>
            <div style={blankLineStyle} />
            <div style={blankLineStyle} />
          </div>
        )}
      </Box>

      {/* 南北分攤 — 明寫分攤基準，這是最容易算錯的一步 */}
      <Box title="南北分攤">
        <div style={basisStyle}>
          <strong style={{ color: WINE_DEEP }}>分攤基準：</strong>
          {split
            ? `全班 ${split.members} 人（南班 ${split.south.count} ／ 北班 ${split.north.count}），按 ${META.southMembers}:${META.northMembers} 攤分，不因個人是否參加或領取而異。`
            : `全班 ${META.totalMembers} 人（南班 ${META.southMembers} ／ 北班 ${META.northMembers}），按 ${META.southMembers}:${META.northMembers} 攤分，不因個人是否參加或領取而異。若本場採其他基準，請於此註明：______`}
        </div>
        <Amount
          label={`南班應付（${META.southMembers}/${META.totalMembers} ≈ 83.84%）`}
          v={money(split?.south.amount)}
          tail={split ? `平均每人 NT$ ${fmt(split.perPerson)}` : undefined}
        />
        <Amount
          label={`北班應付（${META.northMembers}/${META.totalMembers} ≈ 16.16%）`}
          v={money(split?.north.amount)}
          tail={split ? `平均每人 NT$ ${fmt(split.perPerson)}` : undefined}
        />
        {split && (
          <div style={{ fontSize: 11, color: MUTE, marginTop: 6, lineHeight: 1.6 }}>
            南北金額依未取整的每人金額計算後四捨五入，與「每人 × 人數」會有數元進位差；兩者合計等於班費淨負擔。
          </div>
        )}
      </Box>

      {/* 撥款指示 */}
      <Box title="撥款指示">
        <Amount label="北班需匯款金額" v={money(split?.north.amount)} emphasis />
        {/* 填妥版未填期限時整列隱藏；空白範本仍顯示待填欄 */}
        {(!s || s.paymentDue) && <Row label="匯款期限" v={s?.paymentDue} />}
        <div style={{ marginTop: 8, fontSize: 11.5, color: MUTE, lineHeight: 1.7 }}>
          匯款戶名與帳號由南班財務長另行私訊提供，不列於本單與網站公開頁面。
        </div>
      </Box>

      {/* 附件 A */}
      {s?.lineItems && s.lineItems.length > 0 && (
        <Box title="附件 A — 品項明細">
          <table style={varTableStyle}>
            <thead>
              <tr>
                <th style={varThStyle}>品項</th>
                <th style={{ ...varThStyle, textAlign: 'right' }}>單價</th>
                <th style={{ ...varThStyle, textAlign: 'right' }}>數量</th>
                <th style={{ ...varThStyle, textAlign: 'right' }}>金額</th>
              </tr>
            </thead>
            <tbody>
              {s.lineItems.map((it, i) => (
                <tr key={i}>
                  <td style={varTdStyle}>
                    {it.name}
                    {it.note && <div style={{ fontSize: 10.5, color: MUTE, marginTop: 2 }}>{it.note}</div>}
                  </td>
                  <td style={{ ...varTdStyle, textAlign: 'right', fontFamily: NUM, fontSize: 14 }}>{fmt(it.unitPrice)}</td>
                  <td style={{ ...varTdStyle, textAlign: 'right', fontFamily: NUM, fontSize: 14 }}>{fmt(it.qty)}</td>
                  <td style={{ ...varTdStyle, textAlign: 'right', fontFamily: NUM, fontSize: 14 }}>{fmt(it.amount)}</td>
                </tr>
              ))}
              <tr>
                <td style={{ ...varTdStyle, fontWeight: 600 }}>合計</td>
                <td style={varTdStyle} />
                <td style={{ ...varTdStyle, textAlign: 'right', fontFamily: NUM, fontSize: 14, fontWeight: 700 }}>
                  {fmt(s.lineItems.reduce((n, it) => n + it.qty, 0))}
                </td>
                <td style={{ ...varTdStyle, textAlign: 'right', fontFamily: NUM, fontSize: 15, fontWeight: 700, color: WINE }}>
                  {fmt(s.lineItems.reduce((n, it) => n + it.amount, 0))}
                </td>
              </tr>
            </tbody>
          </table>
        </Box>
      )}

      {/* 簽署 */}
      <div style={signStyle}>
        <div>
          <div style={{ borderBottom: `1px solid ${INK}`, height: 28 }} />
          <div style={{ marginTop: 6, textAlign: 'center' }}>製表人（財務長）</div>
        </div>
        <div>
          <div style={{ borderBottom: `1px solid ${INK}`, height: 28 }} />
          <div style={{ marginTop: 6, textAlign: 'center' }}>覆核人（秘書長）</div>
        </div>
      </div>

      <div style={footerStyle}>E118 南班秘書處製表　·　本結算單副本同步公告至南班幹部群組</div>
    </div>
  );
}

// ── 子元件 ──────────────────────────────────────────────────────────
function Fill({ v, w }: { v?: string; w: number }) {
  return (
    <span
      style={{
        display: 'inline-block',
        minWidth: w,
        borderBottom: `1px solid ${v ? 'transparent' : INK}`,
        fontWeight: v ? 600 : 400,
        color: v ? INK : MUTE,
        paddingBottom: 1,
      }}
    >
      {v ?? ''}
    </span>
  );
}

function Row({ label, v }: { label: string; v?: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', alignItems: 'center', padding: '4px 0', fontSize: 13, color: '#4A413A' }}>
      <span style={{ color: WINE_DEEP, fontWeight: 500 }}>{label}</span>
      {v ? (
        <span style={{ fontWeight: 600, color: INK }}>{v}</span>
      ) : (
        <span style={{ display: 'block', borderBottom: `1px solid ${INK}`, height: 22 }} />
      )}
    </div>
  );
}

function Amount({ label, v, tail, emphasis }: { label: string; v: string; tail?: string; emphasis?: boolean }) {
  const filled = v !== BLANK;
  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'baseline', gap: 12 }}>
        <span style={{ fontSize: 13, color: emphasis ? WINE : WINE_DEEP, fontWeight: emphasis ? 700 : 500 }}>{label}</span>
        <span
          style={{
            fontFamily: NUM,
            fontSize: emphasis ? 18 : 15,
            fontWeight: 600,
            color: emphasis ? WINE : INK,
            minWidth: 180,
            textAlign: 'right',
            borderBottom: `1px solid ${filled ? 'transparent' : INK}`,
            paddingBottom: 2,
            paddingRight: 8,
          }}
        >
          {filled ? v : `NT$ ${BLANK}`}
        </span>
      </div>
      {tail && <div style={{ fontSize: 11, color: MUTE, marginTop: 2 }}>{tail}</div>}
    </div>
  );
}

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '14px 24px', borderBottom: `1px dashed ${LINE}` }}>
      <div style={{ fontSize: 11, color: GOLD, letterSpacing: 1.5, marginBottom: 10, fontWeight: 600 }}>{title}</div>
      {children}
    </div>
  );
}

// ── 樣式 ────────────────────────────────────────────────────────────
const docStyle: React.CSSProperties = {
  background: '#fff',
  border: `2px solid ${WINE_DEEP}`,
  borderRadius: 8,
  maxWidth: 720,
  margin: '0 auto',
  fontFamily: TC,
  boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
};

const headerStyle: React.CSSProperties = {
  background: WINE_DEEP,
  color: '#fff',
  padding: '18px 24px',
  borderBottom: `3px solid ${GOLD}`,
  textAlign: 'center',
};

const metaBarStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr auto 1fr',
  gap: 12,
  padding: '14px 24px',
  borderBottom: `1px dashed ${LINE}`,
  fontSize: 12.5,
  color: '#4A413A',
};

const revisionStyle: React.CSSProperties = {
  margin: '0',
  padding: '12px 24px',
  background: '#FFF8E7',
  borderBottom: `1px dashed ${LINE}`,
  fontSize: 12.5,
  color: '#7a5c00',
  lineHeight: 1.8,
};

const basisStyle: React.CSSProperties = {
  background: PAPER,
  border: `1px solid ${LINE}`,
  borderRadius: 4,
  padding: '9px 12px',
  fontSize: 12,
  color: '#4A413A',
  lineHeight: 1.7,
  marginBottom: 10,
};

const hrStyle: React.CSSProperties = { margin: '8px 0', borderTop: `1px solid ${LINE}` };

const blankLineStyle: React.CSSProperties = { display: 'block', borderBottom: `1px solid ${INK}`, height: 22 };

const varTableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  marginTop: 10,
  fontSize: 12.5,
};

const varThStyle: React.CSSProperties = {
  background: PAPER,
  color: WINE_DEEP,
  padding: '6px 8px',
  textAlign: 'left',
  fontWeight: 600,
  fontSize: 11.5,
  borderBottom: `1px solid ${LINE}`,
};

const varTdStyle: React.CSSProperties = {
  padding: '6px 8px',
  borderBottom: `1px solid ${LINE}`,
  color: '#4A413A',
  verticalAlign: 'top',
};

const kindTagStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '1px 7px',
  borderRadius: 10,
  background: '#E8E0D0',
  color: WINE_DEEP,
  fontSize: 10.5,
  fontWeight: 600,
  whiteSpace: 'nowrap',
};

const signStyle: React.CSSProperties = {
  padding: '16px 24px',
  borderTop: `1px solid ${LINE}`,
  background: PAPER,
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 20,
  fontSize: 12,
  color: '#4A413A',
};

const footerStyle: React.CSSProperties = {
  padding: '10px 24px',
  borderTop: `1px solid ${LINE}`,
  background: '#fff',
  fontSize: 11,
  color: MUTE,
  textAlign: 'center',
  borderBottomLeftRadius: 6,
  borderBottomRightRadius: 6,
};
