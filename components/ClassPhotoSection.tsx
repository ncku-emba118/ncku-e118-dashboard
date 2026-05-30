'use client';

/**
 * 班級大合照彩蛋（C 款：書脊詩行 — 細金線 + 雙行 Cormorant 英 + 啟程）
 * 平常在 footer 右下只看到一行小字、點下去才會彈出全螢幕大合照。
 */
import { useEffect, useState } from 'react';

const SRC = '/assets/class.jpeg';

export default function ClassPhotoEasterEgg() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, []);

  return (
    <>
      <button className="qicheng-egg" onClick={() => setOpen(true)} aria-label="啟程 — 班級大合照（點開全螢幕）">
        <span className="line" aria-hidden="true" />
        <span className="stack">
          <span className="en">Embark, together.</span>
          <span className="zh">啟　程</span>
        </span>
      </button>

      {open && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(18,11,13,.95)', zIndex: 99, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={SRC} alt="E118 班級大合照" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '96vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 6 }} />
          <span onClick={() => setOpen(false)} style={{ position: 'absolute', top: 14, right: 18, color: '#fff', fontSize: 30, cursor: 'pointer', zIndex: 2 }}>✕</span>
          <div style={{ position: 'absolute', bottom: 18, left: '50%', transform: 'translateX(-50%)', color: 'rgba(255,255,255,.82)', fontSize: 12, background: 'rgba(0,0,0,.35)', padding: '6px 14px', borderRadius: 99 }}>
            點空白處或 ✕ 關閉 · Esc 也可
          </div>
        </div>
      )}
    </>
  );
}
