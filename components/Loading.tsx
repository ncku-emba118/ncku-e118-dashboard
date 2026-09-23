import type { CSSProperties } from 'react';

/**
 * 載入動畫（共用資產 loading-ui 的 `Loading` 款）
 *
 * 來源：loading.dev / npm `loading-dev` v0.3.4，MIT © 2026 Jakub Krehel
 * 原版需要 React 19，此處為純 CSS + SVG 移植版，本專案 React 18 可用。
 * 樣式在 app/globals.css 的「載入動畫」區塊，正本在
 * ~/Documents/6_工具基建/_tools/loading-ui/
 *
 * ⚠️ 不要在這裡寫死 --ld-size 預設值。CSS 已有 var(--ld-size, 20px) fallback，
 * 寫成 inline style 會蓋過繼承，導致祖先元素設定尺寸失效。
 */

const SEGMENTS: ReadonlyArray<readonly [number, number]> = [
  [12, 6], [10, 10], [6, 12], [2, 10], [0, 6], [2, 2], [6, 0], [10, 2],
];
const SEGMENT_PATH = 'M0 0h1v1H0zM2 0h1v1H2zM0 2h1v1H0zM2 2h1v1H2z';

type LoadingProps = {
  /** 像素尺寸，建議 16–22；超過 32 會看到方塊感。省略則吃 CSS 預設 20px */
  size?: number;
  /** 一圈的毫秒數，省略則吃 CSS 預設 1000ms */
  duration?: number;
  className?: string;
  style?: CSSProperties;
};

/**
 * 動畫本體。`aria-hidden`＝純裝飾，螢幕閱讀器會略過，
 * 「載入中」的語意請用 <LoadingRow> 或自行加 role="status"。
 * 顏色走 currentColor，設父層 color 即可。
 */
export function Loading({ size, duration, className, style }: LoadingProps) {
  const vars: Record<string, string> = {};
  if (size !== undefined) vars['--ld-size'] = `${size}px`;
  if (duration !== undefined) vars['--ld-duration'] = `${duration}ms`;

  return (
    <svg
      aria-hidden="true"
      role="presentation"
      className={['ld-loading', className].filter(Boolean).join(' ')}
      fill="currentColor"
      viewBox="0 0 15 15"
      style={{ ...vars, ...style } as CSSProperties}
    >
      {SEGMENTS.map(([x, y], i) => (
        <path
          key={i}
          className="ld-loading-segment"
          d={SEGMENT_PATH}
          style={{ '--ld-step': i } as CSSProperties}
          transform={`translate(${x} ${y})`}
        />
      ))}
    </svg>
  );
}

type LoadingLabelProps = {
  /** 按鈕上的文字，例如「處理中…」 */
  text: string;
  /** 預設 14px，配一般按鈕字級 */
  size?: number;
};

/**
 * 按鈕「處理中」用的標籤：動畫 + 文字。
 * 顏色走 currentColor，所以會自動跟著按鈕文字色（深底白字按鈕上會是白的）。
 */
export function LoadingLabel({ text, size = 14 }: LoadingLabelProps) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <Loading size={size} />{text}
    </span>
  );
}

type LoadingRowProps = {
  /** 說明文字，同時是螢幕閱讀器播報的內容 */
  text: string;
  size?: number;
  /** 動畫顏色，預設 NCKU 酒紅 */
  color?: string;
  style?: CSSProperties;
};

/** 頁面等資料時的一行提示，已內建 role="status" aria-live="polite" */
export function LoadingRow({ text, size = 20, color = '#8B1F2F', style }: LoadingRowProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{ display: 'flex', alignItems: 'center', gap: 10, color, ...style }}
    >
      <Loading size={size} />
      <span style={{ color: '#8A7F73', fontSize: 13 }}>{text}</span>
    </div>
  );
}

export default Loading;
