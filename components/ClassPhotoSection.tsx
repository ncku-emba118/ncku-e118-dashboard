'use client';

/**
 * 班級大合照區（位置 B：便當盒下方、安裝 App 上方）。
 * 點圖開全螢幕、再點圖切換原始大小可捲動看清每位同學；手機可雙指縮放。
 */
import { useEffect, useState } from 'react';

const SRC = '/assets/class.jpeg';

export default function ClassPhotoSection() {
  const [open, setOpen] = useState(false);
  const [zoomed, setZoomed] = useState(false);

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
    <section className="bx-class-photo">
      <div className="bxp-eyebrow">CLASS OF E118 · TOGETHER WE GO FURTHER</div>
      <h2 className="bxp-h2">E118 · 我們一起出發</h2>
      <div className="bxp-sub">點圖放大、手機可雙指縮放</div>
      <button className="bxp-frame" onClick={() => { setOpen(true); setZoomed(false); }} aria-label="班級大合照（點開全螢幕）">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={SRC} alt="E118 班級大合照" />
        <span className="bxp-hint">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3M11 8v6M8 11h6"/></svg>
          點圖放大
        </span>
      </button>

      {open && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(18,11,13,.95)', zIndex: 50 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', inset: 0, overflow: 'auto', WebkitOverflowScrolling: 'touch', display: 'flex', alignItems: zoomed ? 'flex-start' : 'center', justifyContent: zoomed ? 'flex-start' : 'center', padding: 20 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={SRC} alt="班級大合照放大" onClick={() => setZoomed((z) => !z)}
              style={zoomed
                ? { width: 1280, maxWidth: 'none', cursor: 'zoom-out', borderRadius: 6 }
                : { maxWidth: '100%', maxHeight: '90vh', objectFit: 'contain', cursor: 'zoom-in', borderRadius: 6 }} />
          </div>
          <span onClick={() => setOpen(false)} style={{ position: 'fixed', top: 14, right: 18, color: '#fff', fontSize: 30, cursor: 'pointer', zIndex: 2 }}>✕</span>
          <div style={{ position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)', color: 'rgba(255,255,255,.82)', fontSize: 12, background: 'rgba(0,0,0,.35)', padding: '6px 14px', borderRadius: 99, zIndex: 2 }}>
            點圖切換原始大小 · 點 ✕ 或按 Esc 關閉
          </div>
        </div>
      )}
    </section>
  );
}
