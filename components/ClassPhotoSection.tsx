'use client';

/**
 * 班級大合照彩蛋（C 款書脊詩行 + B 款漸進發現）
 *
 * 平常 footer 右下只有「啟程」一行。看完並關閉之後，才長出「同行」；
 * 再看完，浮出尚未解鎖的「抵達」。解鎖進度存 localStorage，跨 session 保留。
 *
 * 里程碑資料在 lib/dashboard/milestones.ts（與 logo 連點彩蛋共用），
 * 要新增活動照片改那裡就好，這支元件不用動。
 */
import { useCallback, useEffect, useState } from 'react';
import { LOCKED, STAGES, UNLOCK_KEY as KEY, readUnlocked } from '@/lib/dashboard/milestones';

export default function ClassPhotoEasterEgg() {
  /** 已解鎖到第幾站（0 = 只有啟程；等於 STAGES.length 時連 LOCKED 也浮出） */
  const [unlocked, setUnlocked] = useState(0);
  /** 只有「本次 session 剛解鎖的那一行」才播淡入，回訪不重播 */
  const [justRevealed, setJustRevealed] = useState(-1);
  const [openAt, setOpenAt] = useState<number | null>(null);
  const [i, setI] = useState(0);
  const [x0, setX0] = useState<number | null>(null);

  useEffect(() => {
    setUnlocked(readUnlocked());
  }, []);

  const close = useCallback(() => {
    if (openAt !== null && unlocked < openAt + 1) {
      const next = openAt + 1;
      setUnlocked(next);
      setJustRevealed(next);
      window.localStorage.setItem(KEY, String(next));
    }
    setOpenAt(null);
  }, [openAt, unlocked]);

  const stage = openAt === null ? null : STAGES[openAt];
  const photos = stage?.photos ?? [];
  const multi = photos.length > 1;

  useEffect(() => {
    document.body.style.overflow = openAt !== null ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [openAt]);

  useEffect(() => {
    if (openAt === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (!multi) return;
      if (e.key === 'ArrowRight') setI((v) => Math.min(v + 1, photos.length - 1));
      if (e.key === 'ArrowLeft') setI((v) => Math.max(v - 1, 0));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openAt, close, multi, photos.length]);

  const openStage = (idx: number) => {
    setI(0);
    setOpenAt(idx);
  };

  const p = photos[i];

  return (
    <>
      <div className="qicheng-col">
        {STAGES.slice(0, unlocked + 1).map((s, idx) => (
          <button
            key={s.id}
            className={`qicheng-egg${justRevealed === idx ? ' qicheng-reveal' : ''}`}
            onClick={() => openStage(idx)}
            aria-label={`${s.zh.replace(/\s/g, '')} — ${s.photos[0].title}（點開全螢幕）`}
          >
            <span className="line" aria-hidden="true" />
            <span className="stack">
              <span className="en">{s.en}</span>
              <span className="zh">{s.zh}</span>
            </span>
          </button>
        ))}

        {unlocked >= STAGES.length && (
          <div
            className={`qicheng-egg is-locked${justRevealed === STAGES.length ? ' qicheng-reveal' : ''}`}
            aria-label="抵達 — 尚未到來"
            title="還沒到呢"
          >
            <span className="line" aria-hidden="true" />
            <span className="stack">
              <span className="en">{LOCKED.en}</span>
              <span className="zh">{LOCKED.zh}</span>
            </span>
          </div>
        )}
      </div>

      {stage && p && (
        <div className="qcv" onClick={close} role="dialog" aria-modal="true" aria-label={stage.photos[0].title}>
          <span className="qcv-x" onClick={close} role="button" aria-label="關閉">
            ✕
          </span>

          {multi && (
            <>
              <button
                className="qcv-nav qcv-prev"
                disabled={i === 0}
                onClick={(e) => {
                  e.stopPropagation();
                  setI((v) => Math.max(v - 1, 0));
                }}
                aria-label="上一張"
              >
                ‹
              </button>
              <button
                className="qcv-nav qcv-next"
                disabled={i === photos.length - 1}
                onClick={(e) => {
                  e.stopPropagation();
                  setI((v) => Math.min(v + 1, photos.length - 1));
                }}
                aria-label="下一張"
              >
                ›
              </button>
            </>
          )}

          <figure
            className="qcv-figure"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => setX0(e.touches[0].clientX)}
            onTouchEnd={(e) => {
              if (x0 === null || !multi) return;
              const dx = e.changedTouches[0].clientX - x0;
              if (Math.abs(dx) > 45) {
                setI((v) =>
                  dx < 0 ? Math.min(v + 1, photos.length - 1) : Math.max(v - 1, 0)
                );
              }
              setX0(null);
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img key={p.src} className="qcv-photo" src={p.src} alt={p.alt} />
            <figcaption className="qcv-cap">
              <span className="qcv-date">{p.date}</span>
              <span className="qcv-title">{p.title}</span>
              <span className="qcv-line">{p.line}</span>
            </figcaption>
          </figure>

          {multi && (
            <div className="qcv-dots" onClick={(e) => e.stopPropagation()}>
              {photos.map((ph, idx) => (
                <button
                  key={ph.src}
                  className={`qcv-dot${idx === i ? ' on' : ''}`}
                  onClick={() => setI(idx)}
                  aria-label={ph.title}
                />
              ))}
            </div>
          )}

          <div className="qcv-hint">
            {openAt !== null && unlocked < openAt + 1 ? (
              '關閉之後，下面會多長出一行 …'
            ) : (
              <>
                <span className="qcv-h-d">{multi ? '← → 切換 · Esc 關閉' : '點空白處或 ✕ 關閉 · Esc 也可'}</span>
                <span className="qcv-h-m">{multi ? '左右滑動切換 · 點空白關閉' : '點空白處或 ✕ 關閉'}</span>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
