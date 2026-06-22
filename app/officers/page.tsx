'use client';

/**
 * 班級幹部組織圖頁 — 南班 / 北班 切換 + 點圖全螢幕放大 + 下載原圖。
 * 圖在 public/assets/officers/{south,north}.jpeg（1280px；放大看細節稍軟，有高清原檔再換）。
 */
import { useState, useEffect } from 'react';
import Breadcrumb from '@/components/Breadcrumb';

const SRC = { south: '/assets/officers/south.jpeg', north: '/assets/officers/north.jpeg' } as const;
const NAME = { south: '南班', north: '北班' } as const;
type Cls = keyof typeof SRC;

export default function OfficersPage() {
  const [tab, setTab] = useState<Cls>('south');
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
    <>
    <Breadcrumb items={[{ label: '班級面板', href: '/' }, { label: '班級幹部' }]} />
    <div style={{ minHeight: '100vh', background: '#EDE6D8', color: '#1A1612' }}>
      <header style={{ background: '#8B1F2F', color: '#fff', borderBottom: '3px solid #C9A961' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <a href="/" style={{ fontFamily: '"Cormorant Garamond",serif', fontSize: 24, fontWeight: 700, color: '#fff', textDecoration: 'none' }}>
            E118<span style={{ fontFamily: '"Noto Serif TC",serif', fontSize: 13, color: '#E0C896', marginLeft: 8 }}>班級幹部</span>
          </a>
        </div>
      </header>

      <main style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 20px 50px' }}>
        <h1 style={{ fontFamily: '"Noto Serif TC",serif', fontSize: 22, color: '#8B1F2F', margin: 0 }}>班級幹部組織圖</h1>
        <p style={{ color: '#8A7F73', fontSize: 13, margin: '6px 0 18px' }}>南班 / 北班 幹部與職掌。點圖可全螢幕放大、手機可雙指縮放或點圖切換原始大小。</p>

        <div style={{ display: 'inline-flex', background: '#fff', border: '1px solid #E8DFD0', borderRadius: 99, padding: 4, gap: 4, marginBottom: 18 }}>
          {(['south', 'north'] as Cls[]).map((c) => (
            <button key={c} onClick={() => setTab(c)} style={{
              border: 0, background: tab === c ? '#8B1F2F' : 'transparent', color: tab === c ? '#fff' : '#8A7F73',
              fontFamily: '"Noto Serif TC",serif', fontSize: 15, fontWeight: 600, padding: '9px 26px', borderRadius: 99, cursor: 'pointer',
            }}>{NAME[c]}</button>
          ))}
        </div>

        <div style={{ background: '#fff', border: '1px solid #E8DFD0', borderRadius: 14, padding: 14 }}>
          <button onClick={() => { setOpen(true); setZoomed(false); }}
            style={{ display: 'block', width: '100%', border: '1px solid #E8DFD0', borderRadius: 10, overflow: 'hidden', cursor: 'zoom-in', padding: 0, background: '#faf8f4', position: 'relative' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={SRC[tab]} alt={`E118 ${NAME[tab]} 幹部組織圖`} style={{ width: '100%', height: 'auto', display: 'block' }} />
            <span style={{ position: 'absolute', right: 12, bottom: 12, background: 'rgba(26,22,18,.8)', color: '#fff', fontSize: 12, padding: '6px 12px', borderRadius: 99 }}>🔍 點圖放大</span>
          </button>
          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            <button onClick={() => { setOpen(true); setZoomed(false); }} style={btnPri}>全螢幕看大圖</button>
            <a href={SRC[tab]} download={`E118${NAME[tab]}幹部組織圖.jpeg`} style={btn}>下載原圖</a>
          </div>
          <div style={{ fontSize: 12, color: '#8A7F73', marginTop: 12 }}>
            點圖或「全螢幕看大圖」→ 黑底全螢幕；再點圖切換原始大小、可捲動看清每位幹部與職掌（手機亦可雙指縮放）。
          </div>
        </div>
      </main>

      {open && (
        <div onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(18,11,13,.95)', zIndex: 50 }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            position: 'absolute', inset: 0, overflow: 'auto', WebkitOverflowScrolling: 'touch',
            display: 'flex', alignItems: zoomed ? 'flex-start' : 'center', justifyContent: zoomed ? 'flex-start' : 'center', padding: 20,
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={SRC[tab]} alt="幹部組織圖放大" onClick={() => setZoomed((z) => !z)}
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
    </div>
    </>
  );
}

const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 14, fontWeight: 600, borderRadius: 8, padding: '10px 16px', cursor: 'pointer', border: '1px solid #E8DFD0', background: '#fff', color: '#1A1612', textDecoration: 'none' };
const btnPri: React.CSSProperties = { ...btn, background: '#8B1F2F', color: '#fff', borderColor: '#6B1622' };
