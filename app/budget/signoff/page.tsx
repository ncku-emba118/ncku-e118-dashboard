'use client';

import { useEffect, useRef, useState } from 'react';
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

const STORAGE_KEY = `budget-signoff-${META.version}`;

type Signatures = Record<string, { dataUrl: string; signedAt: string } | undefined>;

export default function SignoffPage() {
  const [signatures, setSignatures] = useState<Signatures>({});
  const [modalRole, setModalRole] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // 從 localStorage 載入
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSignatures(JSON.parse(raw));
    } catch {}
    setHydrated(true);
  }, []);

  // 任何變動寫回 localStorage
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(signatures));
    } catch {}
  }, [signatures, hydrated]);

  const signedCount = Object.values(signatures).filter(Boolean).length;
  const allSigned = signedCount === SIGNERS.length;

  function handleSave(role: string, dataUrl: string) {
    setSignatures((prev) => ({
      ...prev,
      [role]: { dataUrl, signedAt: new Date().toISOString() },
    }));
    setModalRole(null);
  }

  function handleClear(role: string) {
    if (!confirm(`確定要清除「${role}」的簽名？`)) return;
    setSignatures((prev) => {
      const next = { ...prev };
      delete next[role];
      return next;
    });
  }

  function handleClearAll() {
    if (!confirm('確定要清除所有簽名重新開始？')) return;
    setSignatures({});
  }

  return (
    <>
      {/* 控制列（列印時隱藏） */}
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
            簽核進度　{signedCount} / {SIGNERS.length}
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

      {/* 列印區（C 風格固定） */}
      <div className="signoff-sheet">
        <EmbaSheet
          signatures={signatures}
          onCellClick={(role) => setModalRole(role)}
          onClearOne={handleClear}
        />
      </div>

      {/* 簽名 modal */}
      {modalRole && (
        <SignatureModal
          role={modalRole}
          existing={signatures[modalRole]?.dataUrl}
          onClose={() => setModalRole(null)}
          onSave={(dataUrl) => handleSave(modalRole, dataUrl)}
        />
      )}

      {/* 列印 CSS */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
@media print {
  .signoff-controls, .bdg-breadcrumb, .bdg-header, .bdg-footer, .sig-modal { display: none !important; }
  .bdg-main { padding: 0 !important; max-width: none !important; }
  .signoff-sheet { box-shadow: none !important; margin: 0 !important; padding: 14mm 12mm !important; }
  .sig-cell-empty { border: 1px solid #ccc !important; color: transparent !important; }
  .sig-cell-empty .sig-hint { display: none !important; }
  .sig-clear-btn { display: none !important; }
  @page { size: A4 portrait; margin: 0; }
}
.signoff-sheet {
  max-width: 210mm;
  margin: 0 auto;
  background: #fff;
  box-shadow: 0 4px 24px rgba(0,0,0,0.08);
  padding: 18mm 16mm;
  min-height: 290mm;
  box-sizing: border-box;
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
// 簽名 Modal
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
  onSave: (dataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const padRef = useRef<SignaturePad | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // HiDPI 處理
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

  function save() {
    const pad = padRef.current;
    if (!pad || pad.isEmpty()) {
      alert('請先簽名');
      return;
    }
    onSave(pad.toDataURL('image/png'));
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

        <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
          <button
            onClick={() => padRef.current?.clear()}
            style={{
              padding: '8px 14px',
              background: '#fff',
              color: '#8A7F73',
              border: '1px solid #E8DFD0',
              borderRadius: 6,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            清除重畫
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '8px 14px',
              background: '#fff',
              color: '#1A1612',
              border: '1px solid #E8DFD0',
              borderRadius: 6,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            取消
          </button>
          <button
            onClick={save}
            style={{
              padding: '8px 18px',
              background: '#6B1622',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            確認簽名
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// 小元件 / 工具
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
