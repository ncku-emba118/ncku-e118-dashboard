'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import SignaturePad from 'signature_pad';
import {
  META,
  INCOME,
  SUMMARY,
  TOTAL_EXPENSE,
  NECESSARY_PER_PERSON,
  SURPLUS,
  SURPLUS_PER_PERSON,
  fmt,
} from '@/lib/budget/data';

// 9 位簽核幹部
const SIGNERS = [
  '班代',
  '執行部班代',
  '秘書長',
  '財務長',
  '活動長',
  '公關長',
  '學務長',
  '醫務長',
  '文宣長',
];

// Supabase（report upload project，跟 reports 站共用、reuse CLASS_PASSWORD secret）
const SUPABASE_URL = 'https://lboncdddkkvkvdbozltj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_RNX1aMIoO8GYVwqfRk9CSA_vTN5FZ8j';
const POLL_INTERVAL_MS = 5000;

type Signature = { dataUrl: string; signedAt: string };
type Signatures = Record<string, Signature | undefined>;

export default function SignoffPage() {
  const [signatures, setSignatures] = useState<Signatures>({});
  const [modalRole, setModalRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);

  // 從 Supabase 載入所有簽名
  const fetchSignatures = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/budget_signoffs?version=eq.${META.version}&select=role,signature_b64,signed_at`,
        {
          headers: {
            apikey: SUPABASE_KEY,
            authorization: `Bearer ${SUPABASE_KEY}`,
          },
        },
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const rows: Array<{ role: string; signature_b64: string; signed_at: string }> = await r.json();
      const map: Signatures = {};
      for (const row of rows) {
        map[row.role] = { dataUrl: row.signature_b64, signedAt: row.signed_at };
      }
      setSignatures(map);
      setLastSyncAt(new Date());
    } catch (e) {
      console.error('fetch signatures failed:', e);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // 初次載入
  useEffect(() => {
    fetchSignatures(false);
  }, [fetchSignatures]);

  // 每 5 秒 poll（modal 開著時暫停、避免覆蓋使用者操作）
  useEffect(() => {
    if (modalRole) return;
    const t = setInterval(() => fetchSignatures(true), POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [fetchSignatures, modalRole]);

  const signedCount = Object.values(signatures).filter(Boolean).length;
  const allSigned = signedCount === SIGNERS.length;

  async function handleSave(role: string, dataUrl: string, password: string): Promise<string | null> {
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/budget-signoff`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${SUPABASE_KEY}`,
          apikey: SUPABASE_KEY,
        },
        body: JSON.stringify({
          action: 'sign',
          password,
          payload: { version: META.version, role, signature_b64: dataUrl },
        }),
      });
      const result = await r.json().catch(() => ({}));
      if (!r.ok) return result.error || `HTTP ${r.status}`;
      await fetchSignatures(true);
      return null;
    } catch (e: unknown) {
      return String((e as Error)?.message || e);
    }
  }

  async function handleClear(role: string) {
    const pw = window.prompt(`要清除「${role}」的簽名，請輸入班級密碼：`);
    if (!pw) return;
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/budget-signoff`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${SUPABASE_KEY}`,
          apikey: SUPABASE_KEY,
        },
        body: JSON.stringify({
          action: 'clear',
          password: pw,
          payload: { version: META.version, role },
        }),
      });
      const result = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(`清除失敗：${result.error || `HTTP ${r.status}`}`);
        return;
      }
      await fetchSignatures(true);
    } catch (e: unknown) {
      alert(`清除失敗：${String((e as Error)?.message || e)}`);
    }
  }

  async function handleClearAll() {
    const pw = window.prompt('要清除全部簽名重新開始，請輸入班級密碼：');
    if (!pw) return;
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/budget-signoff`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${SUPABASE_KEY}`,
          apikey: SUPABASE_KEY,
        },
        body: JSON.stringify({ action: 'clear_all', password: pw, payload: { version: META.version } }),
      });
      const result = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(`清除失敗：${result.error || `HTTP ${r.status}`}`);
        return;
      }
      await fetchSignatures(true);
    } catch (e: unknown) {
      alert(`清除失敗：${String((e as Error)?.message || e)}`);
    }
  }

  return (
    <>
      {/* 控制列 */}
      <div
        className="signoff-controls"
        style={{
          background: '#fff',
          border: '1px solid #E8DFD0',
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 18,
          display: 'flex',
          gap: 14,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 13, color: '#6B1622', fontWeight: 600, marginBottom: 4 }}>
            簽核進度　{loading ? '…' : `${signedCount} / ${SIGNERS.length}`}
            {lastSyncAt && (
              <span style={{ fontSize: 11, color: '#8A7F73', fontWeight: 400, marginLeft: 8 }}>
                · 最後同步 {lastSyncAt.toLocaleTimeString()}（每 5 秒自動更新）
              </span>
            )}
          </div>
          <div style={{ height: 6, background: '#F4EFE6', borderRadius: 3, overflow: 'hidden' }}>
            <div
              style={{
                width: `${(signedCount / SIGNERS.length) * 100}%`,
                height: '100%',
                background: allSigned ? '#2D5F4E' : '#C9A961',
                transition: 'width 0.3s',
              }}
            />
          </div>
          {allSigned && (
            <div style={{ fontSize: 12, color: '#2D5F4E', marginTop: 6, fontWeight: 600 }}>
              ✓ 全部簽核完成，可下載 PDF
            </div>
          )}
        </div>
        <button
          onClick={handleClearAll}
          disabled={signedCount === 0}
          style={{
            padding: '8px 14px',
            background: '#fff',
            color: signedCount === 0 ? '#ccc' : '#8A7F73',
            border: '1px solid #E8DFD0',
            borderRadius: 6,
            fontSize: 12.5,
            cursor: signedCount === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          🗑 全部清除
        </button>
        <button
          onClick={() => window.print()}
          style={{
            padding: '10px 18px',
            background: '#C9A961',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontSize: 13.5,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          📄 下載 / 存 PDF
        </button>
      </div>

      {/* 列印區 */}
      <div className="signoff-sheet">
        <EmbaSheet
          signatures={signatures}
          onCellClick={(role) => setModalRole(role)}
          onClearOne={handleClear}
        />
      </div>

      {modalRole && (
        <SignatureModal
          role={modalRole}
          existing={signatures[modalRole]?.dataUrl}
          onClose={() => setModalRole(null)}
          onSave={(dataUrl, password) => handleSave(modalRole, dataUrl, password)}
        />
      )}

      <style
        dangerouslySetInnerHTML={{
          __html: `
.signoff-sheet {
  max-width: 210mm;
  margin: 0 auto;
  background: #fff;
  box-shadow: 0 4px 24px rgba(0,0,0,0.08);
  padding: 18mm 16mm;
  min-height: 290mm;
  box-sizing: border-box;
}

@media print {
  /* 隱藏導覽、控制列、modal */
  .signoff-controls, .bdg-breadcrumb, .bdg-header, .bdg-footer, .sig-modal { display: none !important; }
  .bdg-main { padding: 0 !important; max-width: none !important; }

  /* 紙張外圍：A4 直式、無印表機預設邊界 */
  @page { size: A4 portrait; margin: 0; }
  html, body { margin: 0 !important; padding: 0 !important; }

  /* 強制單頁：整張預算書 fit 一張 A4，所有元素禁止分頁 */
  .signoff-sheet {
    box-shadow: none !important;
    margin: 0 !important;
    padding: 9mm 11mm !important;
    min-height: auto !important;
    max-height: 297mm !important;
    height: 297mm !important;
    overflow: hidden !important;
    page-break-inside: avoid !important;
    break-inside: avoid !important;
    font-size: 9.5px !important;
    line-height: 1.4 !important;
  }
  .signoff-sheet * { page-break-inside: avoid !important; break-inside: avoid !important; }
  .signoff-sheet table, .signoff-sheet tr, .signoff-sheet td, .signoff-sheet th {
    page-break-inside: avoid !important;
    break-inside: avoid !important;
  }

  /* 標題縮小 */
  .signoff-sheet h1 { font-size: 16px !important; margin: 3px 0 2px !important; line-height: 1.25 !important; }
  .signoff-sheet h2, .signoff-sheet h3 { font-size: 11px !important; margin: 4px 0 !important; }

  /* Header 區 padding 縮小 */
  .signoff-sheet > div:first-child { padding-bottom: 6px !important; margin-bottom: 6px !important; }

  /* KeyBox 三大數字壓縮 */
  .signoff-sheet [style*="grid-template-columns: repeat(3, 1fr)"] {
    margin-bottom: 6px !important;
    gap: 6px !important;
  }
  .signoff-sheet [style*="Cormorant Garamond"] { font-size: 17px !important; }

  /* 表格 row 縮小 */
  .signoff-sheet table { font-size: 9.5px !important; margin-bottom: 5px !important; }
  .signoff-sheet table td, .signoff-sheet table th {
    padding: 3px 6px !important;
    line-height: 1.25 !important;
  }
  .signoff-sheet table td > div { font-size: 8.5px !important; margin-top: 1px !important; }

  /* 說明區 padding 縮小 */
  .signoff-sheet [style*="border-left: 3px solid #C9A961"] {
    padding: 5px 8px !important;
    margin-bottom: 6px !important;
    font-size: 9px !important;
    line-height: 1.45 !important;
  }

  /* 簽名圖縮小、不再撐高 row */
  .signoff-sheet img[alt$="簽名"] {
    max-height: 26px !important;
    max-width: 140px !important;
    display: block !important;
  }

  /* 空白簽名格在 print 時隱藏虛線提示、改成細灰底線 */
  .sig-cell-empty {
    border: none !important;
    border-bottom: 1px solid #999 !important;
    border-radius: 0 !important;
    background: transparent !important;
    height: 24px !important;
    color: transparent !important;
  }
  .sig-cell-empty .sig-hint { display: none !important; }

  /* 清除按鈕 / 互動元素隱藏 */
  .sig-clear-btn { display: none !important; }

  /* Footer 縮小 */
  .signoff-sheet > div:last-of-type {
    padding-top: 5px !important;
    margin-top: 6px !important;
    font-size: 8.5px !important;
  }
}
`,
        }}
      />
    </>
  );
}

// ════════════════════════════════════════════════════════════════════
// EMBA 風格 sheet
// ════════════════════════════════════════════════════════════════════
function EmbaSheet({
  signatures,
  onCellClick,
  onClearOne,
}: {
  signatures: Signatures;
  onCellClick: (role: string) => void;
  onClearOne: (role: string) => void;
}) {
  const TC = "'Noto Serif TC', 'PingFang TC', serif";
  const DISPLAY = "'Cormorant Garamond', Georgia, serif";

  return (
    <div style={{ fontFamily: TC, color: '#1A1612', fontSize: 11.5, lineHeight: 1.55 }}>
      <div style={{ borderBottom: '2px solid #6B1622', paddingBottom: 12, marginBottom: 14 }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 11, color: '#C9A961', letterSpacing: 2, textTransform: 'uppercase' }}>
          NCKU EMBA · Class of 2028 · South Cohort · Budget Approval
        </div>
        <h1 style={{ fontFamily: TC, fontSize: 22, color: '#6B1622', margin: '6px 0 4px', fontWeight: 600 }}>
          國立成功大學 EMBA E118 南班　班費預算簽核書
        </h1>
        <div style={{ fontSize: 11, color: '#8A7F73', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <span>適用期間：2026 – 2028（全期三年）</span>
          <span>·</span>
          <span>繳費基準：南班 {META.southMembers} 人</span>
          <span>·</span>
          <span>版本 <strong style={{ color: '#6B1622' }}>{META.version}</strong> ／ {META.updatedAt}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
        <KeyBox label="每人收費" value={fmt(META.feePerPerson)} unit="元" accent="#6B1622" />
        <KeyBox label="必要支出/人" value={fmt(NECESSARY_PER_PERSON)} unit="元" accent="#1A1612" />
        <KeyBox label="預備金/人" value={fmt(SURPLUS_PER_PERSON)} unit="元" accent="#C9A961" note="班費安全水位" />
      </div>

      <SectionTitle text="收支總表（保守編列）" />
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 12 }}>
        <thead>
          <tr style={{ background: '#F4EFE6' }}>
            <th style={th()}>項目</th>
            <th style={{ ...th(), textAlign: 'right', width: '32%' }}>金額（NT$）</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={td()}>
              <strong style={{ color: '#6B1622' }}>A　合辦項目分攤（{META.southMembers}/99）</strong>
              <div style={{ fontSize: 9.5, color: '#8A7F73', marginTop: 2 }}>班服 · 聖誕 · 116 畢業午宴 · 119 新生報到 · 119 新生營 · 117 畢業相關 · 校友會費 · 教師節禮品</div>
            </td>
            <td style={{ ...td(), textAlign: 'right' }}>{fmt(SUMMARY.coHosted.total)}</td>
          </tr>
          <tr>
            <td style={td()}>
              <strong style={{ color: '#6B1622' }}>B　南班自辦</strong>
              <div style={{ fontSize: 9.5, color: '#8A7F73', marginTop: 2 }}>119 迎新晚會 · 聖誕晚會（南班自辦）</div>
            </td>
            <td style={{ ...td(), textAlign: 'right' }}>{fmt(SUMMARY.southOnly.total)}</td>
          </tr>
          <tr>
            <td style={td()}>
              <strong style={{ color: '#6B1622' }}>C　南班自理預備金</strong>
              <div style={{ fontSize: 9.5, color: '#8A7F73', marginTop: 2 }}>聯誼機動金 · 緊急預備金 · 婚喪喜慶 · 南班參與北班補助</div>
            </td>
            <td style={{ ...td(), textAlign: 'right' }}>{fmt(SUMMARY.reserves.total)}</td>
          </tr>
          <tr style={{ background: '#FAF7F2' }}>
            <td style={{ ...td(), fontWeight: 700 }}>支出合計（A＋B＋C）</td>
            <td style={{ ...td(), textAlign: 'right', fontWeight: 700 }}>{fmt(TOTAL_EXPENSE)}</td>
          </tr>
          <tr>
            <td style={td()}>班費收入（{META.southMembers} 人 × {fmt(META.feePerPerson)}）</td>
            <td style={{ ...td(), textAlign: 'right' }}>{fmt(INCOME.total)}</td>
          </tr>
          <tr style={{ background: '#FFF8E7' }}>
            <td style={{ ...td(), fontWeight: 700, color: '#6B1622' }}>D　班費預備金（安全水位）</td>
            <td style={{ ...td(), textAlign: 'right', fontWeight: 700, color: '#6B1622' }}>{fmt(SURPLUS)}</td>
          </tr>
        </tbody>
      </table>

      <div style={{ fontSize: 10.5, color: '#4A413A', lineHeight: 1.8, background: '#F4EFE6', borderLeft: '3px solid #C9A961', padding: '8px 12px', marginBottom: 14 }}>
        <strong style={{ color: '#6B1622' }}>說明：</strong>所有費用為預估，實際以活動接近時或實際支出調整。班費預備金作為班費安全水位，應對活動超支、匯率變動、突發狀況等不確定因素。
      </div>

      <SectionTitle text="幹部簽核" />
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #6B1622' }}>
            <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: '#6B1622', fontSize: 10, width: '20%' }}>職稱</th>
            <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: '#6B1622', fontSize: 10 }}>簽名</th>
            <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: '#6B1622', fontSize: 10, width: '24%' }}>日期</th>
          </tr>
        </thead>
        <tbody>
          {SIGNERS.map((role) => {
            const sig = signatures[role];
            return (
              <tr key={role} style={{ borderBottom: '1px dashed #E8DFD0' }}>
                <td style={{ padding: '6px 8px', fontWeight: 500, verticalAlign: 'middle' }}>{role}</td>
                <td style={{ padding: '4px 8px', verticalAlign: 'middle' }}>
                  {sig ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={sig.dataUrl}
                        alt={`${role} 簽名`}
                        style={{ maxHeight: 42, maxWidth: 180, cursor: 'pointer' }}
                        onClick={() => onCellClick(role)}
                        title="點擊重簽"
                      />
                      <button
                        onClick={() => onClearOne(role)}
                        className="sig-clear-btn"
                        style={{
                          fontSize: 10,
                          color: '#8A7F73',
                          background: 'none',
                          border: '1px solid #E8DFD0',
                          borderRadius: 3,
                          padding: '2px 6px',
                          cursor: 'pointer',
                        }}
                      >
                        清除
                      </button>
                    </div>
                  ) : (
                    <div
                      className="sig-cell-empty"
                      onClick={() => onCellClick(role)}
                      style={{
                        height: 42,
                        border: '1.5px dashed #C9A961',
                        borderRadius: 4,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        color: '#C9A961',
                        fontSize: 11,
                        background: '#FFFCF3',
                      }}
                    >
                      <span className="sig-hint">✍️ 點此簽名</span>
                    </div>
                  )}
                </td>
                <td style={{ padding: '6px 8px', fontSize: 10.5, color: sig ? '#4A413A' : 'transparent', verticalAlign: 'middle' }}>
                  {sig ? formatDate(sig.signedAt) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid #E8DFD0', fontSize: 10, color: '#8A7F73', display: 'flex', justifyContent: 'space-between' }}>
        <span>E118 南班秘書處 · {META.updatedAt} 製表</span>
        <span>完整明細 emba.aqualux.dev/budget</span>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// 簽名 Modal（含密碼輸入）
// ════════════════════════════════════════════════════════════════════
function SignatureModal({
  role,
  existing,
  onClose,
  onSave,
}: {
  role: string;
  existing?: string;
  onClose: () => void;
  onSave: (dataUrl: string, password: string) => Promise<string | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext('2d')?.scale(ratio, ratio);

    const pad = new SignaturePad(canvas, {
      penColor: '#1A1612',
      backgroundColor: 'rgba(255,255,255,1)',
      minWidth: 1,
      maxWidth: 2.5,
    });
    padRef.current = pad;

    return () => {
      pad.off();
      padRef.current = null;
    };
  }, []);

  async function save() {
    const pad = padRef.current;
    if (!pad || pad.isEmpty()) {
      setErr('請先簽名');
      return;
    }
    if (!password.trim()) {
      setErr('請輸入班級密碼');
      return;
    }
    setErr(null);
    setSubmitting(true);
    const dataUrl = pad.toDataURL('image/png');
    const errorMsg = await onSave(dataUrl, password.trim());
    setSubmitting(false);
    if (errorMsg) {
      setErr(errorMsg.includes('wrong password') ? '密碼錯誤' : `儲存失敗：${errorMsg}`);
      return;
    }
    onClose();
  }

  return (
    <div
      className="sig-modal"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(26, 22, 18, 0.55)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: 24,
          width: '100%',
          maxWidth: 560,
          boxShadow: '0 16px 60px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h2 style={{ fontFamily: "'Noto Serif TC', serif", fontSize: 18, color: '#6B1622', margin: 0 }}>
            {role}　簽名
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#8A7F73' }}>×</button>
        </div>
        <p style={{ fontSize: 12, color: '#8A7F73', marginTop: 0, marginBottom: 14 }}>
          使用滑鼠 / 觸控板 / 觸控筆在下方框內簽名{existing && '（已有簽名、按確認會覆蓋）'}
        </p>

        <canvas
          ref={canvasRef}
          style={{
            width: '100%',
            height: 200,
            border: '1.5px dashed #C9A961',
            borderRadius: 6,
            background: '#FFFCF3',
            display: 'block',
            touchAction: 'none',
          }}
        />

        <div style={{ marginTop: 14 }}>
          <label style={{ fontSize: 12, color: '#6B1622', fontWeight: 600, display: 'block', marginBottom: 6 }}>
            班級密碼
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="輸入班級密碼以確認簽核"
            disabled={submitting}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #E8DFD0',
              borderRadius: 6,
              fontSize: 13,
              boxSizing: 'border-box',
            }}
          />
        </div>

        {err && (
          <div style={{ marginTop: 10, fontSize: 12, color: '#B00', background: '#FDF2F2', border: '1px solid #F6C7C7', padding: '6px 10px', borderRadius: 4 }}>
            {err}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
          <button
            onClick={() => padRef.current?.clear()}
            disabled={submitting}
            style={{
              padding: '8px 14px',
              background: '#fff',
              color: '#8A7F73',
              border: '1px solid #E8DFD0',
              borderRadius: 6,
              fontSize: 13,
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            清除重畫
          </button>
          <button
            onClick={onClose}
            disabled={submitting}
            style={{
              padding: '8px 14px',
              background: '#fff',
              color: '#1A1612',
              border: '1px solid #E8DFD0',
              borderRadius: 6,
              fontSize: 13,
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            取消
          </button>
          <button
            onClick={save}
            disabled={submitting}
            style={{
              padding: '8px 18px',
              background: '#6B1622',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? '上傳中…' : '確認簽名'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// 小元件
// ════════════════════════════════════════════════════════════════════
function SectionTitle({ text }: { text: string }) {
  return (
    <div style={{ fontSize: 12, color: '#6B1622', fontWeight: 600, borderLeft: '3px solid #C9A961', paddingLeft: 8, marginBottom: 8 }}>
      {text}
    </div>
  );
}

function KeyBox({ label, value, unit, accent, note }: { label: string; value: string; unit: string; accent: string; note?: string }) {
  return (
    <div style={{ border: '1px solid #E8DFD0', borderTop: `3px solid ${accent}`, padding: '8px 12px', borderRadius: 4 }}>
      <div style={{ fontSize: 10, color: '#8A7F73', marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 24, fontWeight: 600, color: accent }}>
        {value} <span style={{ fontSize: 11, color: '#8A7F73', fontWeight: 400 }}>{unit}</span>
      </div>
      {note && <div style={{ fontSize: 9.5, color: '#8A7F73', marginTop: 2 }}>{note}</div>}
    </div>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}`;
}

const th = () => ({ padding: '8px 10px', textAlign: 'left' as const, color: '#6B1622', fontWeight: 600, fontSize: 11, borderBottom: '1px solid #E8DFD0' });
const td = () => ({ padding: '8px 10px', borderBottom: '1px solid #F4EFE6', color: '#1A1612' });
