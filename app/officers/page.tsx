'use client';

/**
 * 班級幹部組織圖頁 — 南班 / 北班 切換 + 點圖全螢幕放大 + 下載大圖。
 *
 * 圖分兩種尺寸，別再把原始檔直接掛上頁面：
 *   SRC  = 1600px JPEG（約 200KB）→ 頁面內嵌用，實際只顯示約 1050px 寬
 *   FULL = 6000px WebP（約 650KB）→ 只在打開全螢幕或按下載時才抓
 *
 * FULL 用 6000px 是為了「放大看得清楚人臉」：副班代那排小頭像在 3000px 版
 * 只有 150px，手機捏放大就糊掉；6000px 版有 300px，五官與衣服細節都清楚。
 * 改用 WebP 才付得起這個解析度 —— 同樣 6000px，JPEG 要 1.4MB、WebP 只要 650KB。
 * FULL_FB 是 3000px JPEG，僅在極少數不支援 WebP 的環境當退路。
 *
 * 2026-08-09 之前這裡直接掛 10670x7118／12247x8165 的原始檔（6.6MB／7.3MB，
 * 一億像素等級），光解碼就要數百 MB 記憶體，切換南北班會明顯卡頓。
 * 原始檔不放網站上（使用者自行留存），需要時從 git 歷史 49106a3 取回。
 */
import { useState, useEffect } from 'react';
import Breadcrumb from '@/components/Breadcrumb';

const SRC = { south: '/assets/officers/south.jpeg', north: '/assets/officers/north.jpeg' } as const;
const FULL = { south: '/assets/officers/south-full.webp', north: '/assets/officers/north-full.webp' } as const;
const FULL_FB = { south: '/assets/officers/south-full.jpeg', north: '/assets/officers/north-full.jpeg' } as const;
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
  // 先把另一班的內嵌圖抓進快取，切換分頁時就不必等下載
  useEffect(() => {
    const other = tab === 'south' ? 'north' : 'south';
    const img = new Image();
    img.src = SRC[other];
  }, [tab]);

  return (
    <>
    <Breadcrumb items={[{ label: '班級面板', href: '/' }, { label: '班級幹部' }]} />
    <div style={{ minHeight: '100vh', background: '#EDE6D8', color: '#1A1612' }}>
      <header style={{ background: '#8B1F2F', color: '#fff', borderBottom: '3px solid #C9A961' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <a href="/" style={{ fontFamily: '"Cormorant Garamond",serif', fontSize: 24, fontWeight: 700, color: '#fff', textDecoration: 'none' }}>
            E118<span style={{ fontFamily: '"Noto Serif TC",serif', fontSize: 13, color: '#E0C896', marginLeft: 8 }}>班級幹部</span>
          </a>
          <a href="/leads" style={{ fontFamily: '"Noto Serif TC",serif', fontSize: 12.5, color: '#E0C896', textDecoration: 'none', letterSpacing: '.08em' }}>
            各活動總召 →
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
            <a href={FULL[tab]} download={`E118${NAME[tab]}幹部組織圖.webp`} style={btn}>下載大圖</a>
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
            {/* 全螢幕才載 6000px 版。點一下放到 3000 CSS px，等於只用一半解析度，
                手機再捏放大到 2 倍仍是原生畫質，臉不會糊。 */}
            <img src={FULL[tab]} alt="幹部組織圖放大" onClick={() => setZoomed((z) => !z)}
              onError={(e) => { const el = e.currentTarget; if (!el.dataset.fb) { el.dataset.fb = '1'; el.src = FULL_FB[tab]; } }}
              style={zoomed
                ? { width: 3000, maxWidth: 'none', cursor: 'zoom-out', borderRadius: 6 }
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
