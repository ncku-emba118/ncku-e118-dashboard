'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const POSE_CONFIG = {
  sit: { anchorX: 0.5, anchorY: 0.66, scale: 1, frameMs: 480 },
  hang: { anchorX: 0.5, anchorY: 0.05, scale: 1, swingDeg: 5, swingMs: 3200 },
  peek: { anchorX: 0, anchorY: 0.5, scale: 1.15, enterMs: 600, stayMinMs: 3000, stayMaxMs: 5000, gapMinMs: 8000, gapMaxMs: 14000 },
  wave: { anchorX: 0.30, anchorY: 0.45, scale: 1, frameMs: 420, minWidth: 1100, minSideSpace: 120 },
  nap: { anchorX: 0.5, anchorY: 0.66, scale: 1 },
  arms: { anchorX: 0.5, anchorY: 0.70, scale: 1 },
  shy: { anchorX: 0.5, anchorY: 0.62, scale: 1 },
  heart: { anchorX: 0.5, anchorY: 0.93, scale: 1 },
  cheer: { anchorX: 0.5, anchorY: 0.93, scale: 1 },
  boba: { anchorX: 0.5, anchorY: 0.66, scale: 1 },
  sign: { anchorX: 0.5, anchorY: 0.93, scale: 1 },
  thumb: { anchorX: 0.5, anchorY: 0.93, scale: 1 },
} as const;

type Pose = keyof typeof POSE_CONFIG;
type BBox = [number, number, number, number];   // 圖中人物實際範圍（左,上,右,下，0~1）
type Person = { slug: string; name: string; poses: Partial<Record<Pose, string[]>>; box: Partial<Record<Pose, BBox>>; k: Partial<Record<Pose, number>> };
type Zone = 'hero' | 'tile' | 'header' | 'edge' | 'margin' | 'footer' | 'button';
type Box = { left: number; top: number; right: number; bottom: number };
type At = { x: number; y: number; right?: boolean; target?: HTMLElement };
type Mascot = { id: string; name: string; pose: Pose; zone: Zone; frames: string[]; box?: BBox; x: number; y: number; size: number; right?: boolean; target?: HTMLElement; peekDuration?: number; peekGap?: number };
const POSES: Pose[] = Object.keys(POSE_CONFIG) as Pose[];
const TILE_TOP_POSES: Pose[] = ['sit', 'nap', 'arms', 'shy', 'heart', 'cheer', 'boba', 'sign', 'thumb'];
// 每次載入用同一顆種子決定「誰、什麼動作、站哪裡」；同一次載入內切換版本或縮放都不會換人（按「換一批」才重抽）
let rnd: () => number = Math.random;
const seeded = (seed: number) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const random = (min: number, max: number) => min + rnd() * (max - min);
const pick = <T,>(items: T[]) => items[Math.floor(rnd() * items.length)];
// 每個動作的「接觸點」：用圖中人物實際範圍的比例表示（x,y）。例：坐姿＝屁股在人物高度 58% 處；站姿＝腳底；吊掛＝手
const CONTACT: Record<Pose, [number, number]> = {
  sit: [.5, .58], nap: [.5, .74], boba: [.5, .62], arms: [.5, 1], shy: [.5, 1], heart: [.5, 1], cheer: [.5, 1], sign: [.5, 1], thumb: [.5, 1], hang: [.5, 0], wave: [0, .35], peek: [0, .5],
};
const DEFAULT_BOX: BBox = [.1, .04, .9, .95];
function geom(pose: Pose, box: BBox | undefined, right?: boolean) {
  const [l, t, r, b] = box ?? DEFAULT_BOX;
  const bb: BBox = right ? [1 - r, t, 1 - l, b] : [l, t, r, b];
  const [cx, cy] = CONTACT[pose];
  const fx = right ? 1 - cx : cx;
  return { bb, ax: bb[0] + fx * (bb[2] - bb[0]), ay: bb[1] + cy * (bb[3] - bb[1]) };
}

function validPeople(data: unknown): Person[] {
  if (!data || typeof data !== 'object' || !('people' in data) || !Array.isArray(data.people)) return [];
  return data.people.flatMap((p: unknown) => {
    if (!p || typeof p !== 'object' || !('slug' in p) || !('name' in p) || !('poses' in p) ||
        typeof p.slug !== 'string' || !/^[a-z0-9-]+$/.test(p.slug) || typeof p.name !== 'string' ||
        !p.poses || typeof p.poses !== 'object') return [];
    const poses: Person['poses'] = {};
    for (const pose of POSES) {
      const files = (p.poses as Record<string, unknown>)[pose];
      if (Array.isArray(files)) {
        const safe = files.filter((file): file is string => typeof file === 'string' && /^[a-zA-Z0-9_-]+\.webp$/.test(file));
        if (safe.length) poses[pose] = safe.map((file) => `/chibi/${p.slug}/${file}`);
      }
    }
    const box: Person['box'] = {};
    const rawBox = ('box' in p && p.box && typeof p.box === 'object') ? p.box as Record<string, unknown> : {};
    for (const pose of POSES) {
      const v = rawBox[pose];
      if (Array.isArray(v) && v.length === 4 && v.every((n) => typeof n === 'number' && n >= 0 && n <= 1) && v[0] < v[2] && v[1] < v[3]) box[pose] = v as BBox;
    }
    const k: Person['k'] = {};
    const rawK = ('k' in p && p.k && typeof p.k === 'object') ? p.k as Record<string, unknown> : {};
    for (const pose of POSES) { const v = rawK[pose]; if (typeof v === 'number' && v >= .3 && v <= 2) k[pose] = v; }
    return [{ slug: p.slug, name: p.name, poses, box, k }];
  });
}

const shuffle = <T,>(items: T[]) => { const a = [...items]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const BUTTON_SELECTOR = 'header.top .nav-links li a, .quick-links > a, .quick-links summary';
const zoneOf = (pose: Pose): Zone => pose === 'hang' ? 'header' : pose === 'peek' ? 'edge' : pose === 'wave' ? 'margin' : 'hero';
const contentSelector = '.bx-hero-eyebrow, .bx-hero-h1, .bx-hero-lede, header.top .brand, header.top .nav-links li, .bx-tile .bx-title, .bx-tile .bx-meta, .bx-tile .bx-h3, .bx-tile .bx-live, .bx-tile .bx-feedhead, .bx-tile .bx-feedlist, .bx-tile .bx-fitem, .bx-tile .bx-citem, .bx-tile .bx-feedfoot, .bx-tile .bx-ic, .quick-links a, .quick-links summary, .foot-inner .foot-mark, .foot-inner .foot-meta, .chibi-toggle';
const docRect = (r: DOMRect): Box => ({ left: r.left + scrollX, right: r.right + scrollX, top: r.top + scrollY, bottom: r.bottom + scrollY });
const intersects = (a: Box, b: Box) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
const elementRect = '.bx-ic, .bx-feedlist, .bx-feedfoot, .chibi-toggle, header.top .nav-links li, .quick-links a, .quick-links summary';
function lineRects(el: HTMLElement): DOMRect[] {
  const range = document.createRange();
  range.selectNodeContents(el);
  return [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
}
function contentRects(): { with: string; rect: Box }[] {
  return [...document.querySelectorAll<HTMLElement>(contentSelector)].flatMap((el) => {
    if (!el.getClientRects().length || getComputedStyle(el).visibility === 'hidden') return [];
    const rects = el.matches(elementRect) ? [el.getBoundingClientRect()] : lineRects(el);
    return rects.filter((r) => r.width > 0 && r.height > 0).map((r) => ({ with: el.className || el.tagName.toLowerCase(), rect: docRect(r) }));
  });
}
function collidesWithContent(box: Box, rects = contentRects()) {
  const inner = { left: box.left - 2, right: box.right + 2, top: box.top - 2, bottom: box.bottom + 2 };   // 多留 2px 呼吸空間
  return rects.filter(({ rect }) => intersects(inner, rect));
}
function visibleBox(at: Pick<Mascot, 'x' | 'y' | 'right'>, pose: Pose, size: number, boxFrac?: BBox): Box {
  if (pose === 'peek') {
    const width = size * .4;
    return { left: at.right ? scrollX + innerWidth - width : scrollX, right: at.right ? scrollX + innerWidth : scrollX + width, top: at.y + scrollY - size * .35, bottom: at.y + scrollY + size * .35 };
  }
  const g = geom(pose, boxFrac, at.right);
  const ox = at.x - g.ax * size, oy = at.y - g.ay * size;
  const box = { left: ox + g.bb[0] * size, right: ox + g.bb[2] * size, top: oy + g.bb[1] * size, bottom: oy + g.bb[3] * size };
  if (pose === 'nap') { box.top -= size * .5; box.right += size * .3; }      // 飄出來的 z
  if (pose === 'heart') box.top -= size * .4;                                // 飄出來的愛心
  return box;
}
const boxOf = (m: Mascot) => visibleBox(m, m.pose, m.size * POSE_CONFIG[m.pose].scale, m.box);
function separated(a: Box, b: Box, size: number) {
  // 多位同學可以同排，但彼此留一點空隙，不貼在一起
  const pad = size * .18;
  return !intersects({ left: a.left - pad, right: a.right + pad, top: a.top - pad, bottom: a.bottom + pad }, b);
}
const inView = (b: Box) => b.bottom > scrollY && b.top < scrollY + innerHeight && b.right > scrollX && b.left < scrollX + innerWidth;
function peekHasClearEdge(right: boolean | undefined, size: number) {
  if (innerWidth < 900) return false;
  const boundaries = [...document.querySelectorAll<HTMLElement>('.container, .bx-grid')]
    .map((el) => el.getBoundingClientRect()).filter((r) => r.width);
  return boundaries.length > 0 && Math.min(...boundaries.map((r) => right ? innerWidth - r.right : r.left)) >= size * .4 + 8;
}
function locate(pose: Pose, size: number, zone: Zone, others: Mascot[] = [], firstScreen = false, boxFrac?: BBox): At | null {
  const rects = contentRects();               // 每次配置只算一次
  const cap = innerWidth < 640 ? 3 : 5;      // 同一螢幕內最多同時看得到幾位
  const valid = (at: At) => {
    const box = visibleBox(at, pose, size, boxFrac);
    return (!firstScreen || box.top >= scrollY && box.bottom <= scrollY + innerHeight && box.left >= scrollX && box.right <= scrollX + innerWidth) &&
      !(inView(box) && others.filter((m) => inView(boxOf(m))).length >= cap) &&
      !collidesWithContent(box, rects).length && others.every((m) => separated(box, boxOf(m), Math.max(size, m.size)));
  };
  if (zone === 'edge') {
    if (pose !== 'peek' || innerWidth < 900) return null;
    const edges = ['left', 'right'].sort(() => rnd() - .5);
    for (const side of edges) {
      if (!peekHasClearEdge(side === 'right', size)) continue;
      for (let i = 0; i < 8; i++) {
        const at = { x: 0, y: random(.2, .8) * innerHeight, right: side === 'right' };
        if (valid(at)) return at;
      }
    }
    return null;
  }
  if (zone === 'button') {
    const els = [...document.querySelectorAll<HTMLElement>(BUTTON_SELECTOR)].filter((el) => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
    const hangs = pose === 'hang';
    const pool = hangs ? els.filter((el) => !el.matches('summary')) : els.filter((el) => el.closest('.quick-links'));
    if (!hangs && !TILE_TOP_POSES.includes(pose)) return null;
    for (const target of shuffle(pool)) {
      const r = target.getBoundingClientRect();
      if (!hangs && r.width < size * .5) continue;
      for (let i = 0; i < 5; i++) {
        const x = hangs ? r.left + r.width / 2 + random(-r.width * .15, r.width * .15) : random(r.left + size * .3, Math.max(r.left + size * .3, r.right - size * .3));
        const at = { x: x + scrollX, y: (hangs ? r.bottom : r.top) + scrollY, target };
        if (valid(at)) return at;
      }
    }
    return null;
  }
  if (zone === 'header') {
    if (pose !== 'hang') return null;
    const header = document.querySelector<HTMLElement>('header.top');
    const brand = header?.querySelector<HTMLElement>('.brand');
    const nav = header?.querySelector<HTMLElement>('.nav-links');
    if (!header || !brand) return null;
    const h = header.getBoundingClientRect();
    const b = brand.getBoundingClientRect();
    const n = nav?.getBoundingClientRect();
    const start = b.right + 18 + size / 2;
    const t = header.querySelector<HTMLElement>('.chibi-toggle')?.getBoundingClientRect();
    const end = (n && n.width ? n.left : t && t.width ? t.left : h.right) - 18 - size / 2;
    if (end < start) return null;
    for (let i = 0; i < 8; i++) { const at = { x: random(start, end) + scrollX, y: h.bottom + scrollY }; if (valid(at)) return at; }
    return null;
  }
  const tiles = [...document.querySelectorAll<HTMLElement>('.bx-tile')].filter((tile) => {
    const r = tile.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
  });
  if (zone === 'hero' || zone === 'tile' || zone === 'footer') {
    if (!TILE_TOP_POSES.includes(pose)) return null;
    if (zone === 'footer') {
      const foot = document.querySelector<HTMLElement>('footer.foot');
      const inner = foot?.querySelector<HTMLElement>('.foot-inner');
      if (!foot || !inner) return null;
      const f = foot.getBoundingClientRect(), l = foot.querySelector<HTMLElement>('.foot-left')?.getBoundingClientRect(), photo = foot.querySelector<HTMLElement>('.qicheng-col')?.getBoundingClientRect();
      const start = (l?.right ?? f.left) + size * .5 + 12, end = (photo?.left ?? f.right) - size * .5 - 12;
      if (end < start) return null;
      for (let i = 0; i < 8; i++) { const at = { x: random(start, end) + scrollX, y: f.top + scrollY }; if (valid(at)) return at; }
      return null;
    }
    const allTiles = [...document.querySelectorAll<HTMLElement>('.bx-tile')].filter((tile) => { const r = tile.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    if (!allTiles.length) return null;
    const firstTop = Math.min(...allTiles.map((tile) => tile.getBoundingClientRect().top));
    const candidates = (zone === 'hero' ? tiles : allTiles).filter((tile) => {
      const r = tile.getBoundingClientRect();
      return (zone === 'hero' ? Math.abs(r.top - firstTop) <= 4 : r.top > firstTop + 4) &&
        r.width >= size * 0.55 && r.top >= size * geom(pose, boxFrac).ay + 8;
    });
    if (!candidates.length) return null;
    const nearby = candidates.filter((tile) => { const top = tile.getBoundingClientRect().top; return top >= 0 && top <= innerHeight * 3; });
    const ordered = [...shuffle(nearby), ...shuffle(candidates.filter((tile) => !nearby.includes(tile)))];
    for (const tile of ordered) {
    const r = tile.getBoundingClientRect();
    let min = Math.max(zone === 'hero' ? r.left + r.width * 0.55 : r.left + size / 2, size / 2 + 4);
    // 避開上方標題文字：人物佔據的高度範圍內若有文字，x 要排到文字右端之後
    const figTop = r.top - size * geom(pose, boxFrac).ay;
    for (const el of document.querySelectorAll<HTMLElement>('.bx-hero-h1, .bx-hero-lede, .bx-hero-eyebrow')) {
      if (zone === 'hero') for (const t of lineRects(el)) {
        if (t.bottom > figTop && t.top < r.top) min = Math.max(min, t.right + 12 + size / 2);
      }
    }
    const max = Math.min(zone === 'hero' ? r.right - 8 : r.right - size / 2, window.innerWidth - size / 2 - 4);
    if (max < min) continue;
    for (let attempt = 0; attempt < 6; attempt++) {
      const at = { x: random(min, max) + scrollX, y: r.top + scrollY };
      if (valid(at)) return at;
    }
    }
    return null;
  }
  if (zone !== 'margin' || pose !== 'wave') return null;
  if (window.innerWidth < POSE_CONFIG.wave.minWidth) return null;
  // 只站在「最外側那排欄」的外緣空白處，避免站到相鄰卡片上蓋住文字
  const cr = document.querySelector<HTMLElement>('.bx-grid')?.getBoundingClientRect();
  const need = Math.max(POSE_CONFIG.wave.minSideSpace * 0.6, size * 0.75);
  const candidates = tiles.flatMap((tile) => {
    const r = tile.getBoundingClientRect();
    const left = !!cr && Math.abs(r.left - cr.left) <= 6 && r.left >= need;
    const right = !!cr && Math.abs(r.right - cr.right) <= 6 && window.innerWidth - r.right >= need;
    return [...(left ? [{ r, side: 'left' as const }] : []), ...(right ? [{ r, side: 'right' as const }] : [])];
  });
  if (!candidates.length) return null;
  for (let i = 0; i < 8; i++) {
  const { r, side } = pick(candidates);
  // 素材的扶牆手在畫面左側：站在卡片右外側＝原圖；站在卡片左外側＝水平翻轉（right:true）
  const at = { x: (side === 'right' ? r.right : r.left) + window.scrollX, y: r.top + Math.min(r.height * 0.5, 90) + window.scrollY, right: side === 'left' };
  if (valid(at)) return at;
  }
  return null;
}

function MascotView({ mascot, reduced, paused, hop }: { mascot: Mascot; reduced: boolean; paused: boolean; hop: boolean }) {
  const [frame, setFrame] = useState(0);
  const [bubble, setBubble] = useState(false);
  const [shyDelay] = useState(() => random(5000, 9000));   // 固定週期，不再每輪重抽
  const bubbleTimer = useRef<number | null>(null);
  useEffect(() => {
    if (reduced || paused || mascot.frames.length < 2 || (mascot.pose !== 'sit' && mascot.pose !== 'wave')) return;
    const interval = window.setInterval(() => setFrame((n) => (n + 1) % mascot.frames.length), POSE_CONFIG[mascot.pose].frameMs);
    return () => window.clearInterval(interval);
  }, [mascot, reduced, paused]);
  useEffect(() => () => { if (bubbleTimer.current !== null) window.clearTimeout(bubbleTimer.current); }, []);
  const config = POSE_CONFIG[mascot.pose];
  const g = geom(mascot.pose, mascot.box, mascot.right);
  const peek = mascot.pose === 'peek';
  const style = {
    left: peek ? (mascot.right ? 'auto' : 0) : mascot.x,
    right: peek && mascot.right ? 0 : 'auto',
    top: mascot.y,
    width: mascot.size * config.scale,
    height: mascot.size * config.scale,
    transform: peek ? `translate(${mascot.right ? '60%' : '-60%'}, -50%)` : `translate(${-g.ax * 100}%, ${-g.ay * 100}%)`,
    '--chibi-shy-duration': `${shyDelay}ms`,
  } as React.CSSProperties;
  return <div className={`chibi-place chibi-${mascot.pose}${mascot.right ? ' chibi-right' : ''}${reduced ? ' chibi-reduced' : ''}${paused ? ' chibi-paused' : ''}${hop ? ' chibi-hopping' : ''}`} style={style}>
    <div className="chibi-enter">
      <div className="chibi-motion" key={mascot.pose} style={{ transformOrigin: `${g.ax * 100}% ${g.ay * 100}%`, ...(peek ? { animation: 'none' } : {}) }}>
        <button type="button" className="chibi-person" tabIndex={-1} aria-label={`${mascot.name}，點擊打招呼`} onClick={() => {
          setBubble(true);
          if (bubbleTimer.current !== null) window.clearTimeout(bubbleTimer.current);
          bubbleTimer.current = window.setTimeout(() => setBubble(false), 2000);
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mascot.frames[reduced ? 0 : frame]} alt="" aria-hidden="true" loading="lazy" decoding="async" draggable={false} />
        </button>
        {mascot.pose === 'nap' && <span className="chibi-zs" aria-hidden="true"><span>z</span><span>z</span><span>z</span></span>}
        {mascot.pose === 'heart' && <span className="chibi-hearts" aria-hidden="true">❤</span>}
        {bubble && <span className="chibi-bubble">{mascot.name}</span>}
      </div>
    </div>
  </div>;
}

export default function ChibiMascots() {
  const [mounted, setMounted] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [people, setPeople] = useState<Person[]>([]);
  const [mascots, setMascots] = useState<Mascot[]>([]);
  const [reduced, setReduced] = useState(false);
  const [paused, setPaused] = useState(false);
  const debug = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('chibi');
  const chosen = useRef<{ person: Person; pose: Pose; size: number; zone: Zone }[]>([]);
  const mascotsRef = useRef<Mascot[]>([]);
  const placedRef = useRef<Mascot[]>([]);
  const seedRef = useRef(Math.floor(Math.random() * 2 ** 31));
  const [reroll, setReroll] = useState(0);
  const revealed = useRef(0);
  const [hopId, setHopId] = useState<string | null>(null);
  mascotsRef.current = mascots;


  useEffect(() => {
    setMounted(true);
    try { setEnabled(localStorage.getItem('e118-chibi') !== 'off'); } catch { setEnabled(true); }
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const motion = () => setReduced(media.matches);
    motion();
    media.addEventListener('change', motion);
    const visibility = () => setPaused(document.hidden);
    visibility();
    document.addEventListener('visibilitychange', visibility);
    let cancelled = false;
    const load = () => { void fetch('/chibi/manifest.json').then((res) => res.ok ? res.json() : null).then((data: unknown) => {
      if (!cancelled) setPeople(validPeople(data));
    }).catch(() => { /* A missing manifest simply hides the mascots. */ }); };
    let idle: number | undefined;
    let timeout: number | undefined;
    if (typeof window.requestIdleCallback === 'function') idle = window.requestIdleCallback(load);
    else timeout = window.setTimeout(load, 0);
    return () => {
      cancelled = true;
      media.removeEventListener('change', motion);
      document.removeEventListener('visibilitychange', visibility);
      if (idle !== undefined) window.cancelIdleCallback(idle);
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if ((!enabled && !debug) || !people.length) { chosen.current = []; setMascots([]); return; }
    rnd = seeded(seedRef.current);
    const make = (person: Person, pose: Pose, size: number, zone: Zone, placed: Mascot[], firstScreen = false) => {
      const at = locate(pose, size * POSE_CONFIG[pose].scale, zone, placed, firstScreen, person.box[pose]);
      return at ? { id: person.slug, name: person.name, pose, zone, frames: person.poses[pose]!, box: person.box[pose], size, ...at,
        peekDuration: random(POSE_CONFIG.peek.stayMinMs, POSE_CONFIG.peek.stayMaxMs),
        peekGap: random(POSE_CONFIG.peek.gapMinMs, POSE_CONFIG.peek.gapMaxMs) } satisfies Mascot : null;
    };
    const placed: Mascot[] = [];
    const selected: typeof chosen.current = [];
    if (debug) {
      const requested = (new URLSearchParams(window.location.search).get('chibi') ?? '').split(',').slice(0, 2);
      for (const entry of requested) {
        const [slug, rawPose, extra] = entry.split(':');
        const pose = rawPose as Pose;
        const person = people.find((p) => p.slug === slug);
        if (extra || !POSES.includes(pose) || !person?.poses[pose]?.length || selected.some((s) => s.person.slug === slug)) continue;
        const size = (innerWidth < 640 ? 80 : 112) * (person.k[pose] ?? 1);
        const zone = zoneOf(pose);
        const m = make(person, pose, size, zone, placed);
        if (m && !selected.some((s) => s.zone === zone)) { placed.push(m); selected.push({ person, pose, size, zone }); }
        else console.warn(`[chibi] ${slug}:${pose} has no collision-free, separated position in ${zone}`);
      }
    } else {
      const mobile = innerWidth < 640;
      const total = Math.min(people.length, mobile ? 4 : 5 + (rnd() < .5 ? 1 : 0));
      // 版位計畫：同排卡片上緣可多位、頁首/按鈕吊掛、側邊探頭/揮手、頁尾；footer 排最後（在首屏外）
      const base: Zone[] = mobile ? ['hero', 'tile', 'tile', 'header', 'button', 'button'] : ['hero', 'hero', 'tile', 'tile', 'header', 'button', 'button', 'edge', 'margin'];
      const plan: Zone[] = [...shuffle(base), 'footer', 'tile', 'hero', 'button', 'tile', 'hero', 'tile'];
      for (const zone of plan) {
        if (selected.length >= total) break;
        const firstScreen = selected.length < 3 && zone !== 'footer';
        const options = people.flatMap((person) => POSES.filter((pose) => person.poses[pose]?.length &&
          (zone === 'footer' || zone === 'tile' ? TILE_TOP_POSES.includes(pose) : zone === 'button' ? (pose === 'hang' || TILE_TOP_POSES.includes(pose)) : zoneOf(pose) === zone) &&
          selected.filter((s) => s.pose === pose).length < 2)
          .map((pose) => ({ person, pose }))).filter(({ person }) => !selected.some((s) => s.person.slug === person.slug));
        for (const { person, pose } of shuffle(options).slice(0, 40)) {
          const size = (mobile ? 80 : 112) * (person.k[pose] ?? 1);   // 所有人所有動作的『頭』一樣大
          const m = make(person, pose, size, zone, placed, firstScreen);
          if (m) { placed.push(m); selected.push({ person, pose, size, zone }); break; }
        }
      }
    }
    chosen.current = selected;
    placedRef.current = placed;
    revealed.current = Math.min(1, placed.length);
    setMascots(placed.slice(0, revealed.current));
    const timers: number[] = [];
    for (let k = 1; k < placed.length; k++) timers.push(window.setTimeout(() => {
      revealed.current = k + 1;
      setMascots(placedRef.current.slice(0, k + 1));
    }, debug ? 0 : 900 * k));
    return () => timers.forEach((t) => clearTimeout(t));
  }, [enabled, people, debug, reroll]);

  useEffect(() => {
    if ((!enabled && !debug) || !chosen.current.length) return;
    let timer: number | undefined;
    const update = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = window.setTimeout(() => {
        const placed: Mascot[] = [];
        for (const item of chosen.current) {
          const old = placedRef.current.find((m) => m.id === item.person.slug);
          const size = item.size * POSE_CONFIG[item.pose].scale;
          let keep = false;
          if (old) {
            const box = visibleBox(old, old.pose, size, old.box);
            const tr = old.target?.getBoundingClientRect();
            // 掛在按鈕上的：按鈕不在了、或位置移動了（換行/縮放），就要重新貼合；其他的只要沒撞到內容就原地不動
            const anchored = !old.target || (old.target.isConnected && !!tr && Math.abs((old.pose === 'hang' ? tr.bottom : tr.top) + scrollY - old.y) < 3 && old.x >= tr.left + scrollX - 2 && old.x <= tr.right + scrollX + 2);
            keep = anchored && (old.pose !== 'peek' || peekHasClearEdge(old.right, size)) && !collidesWithContent(box).length &&
              placed.every((m) => separated(box, boxOf(m), Math.max(size, m.size)));
          }
          if (old && keep) { placed.push(old); continue; }              // 沒變就沿用同一個物件，不重繪、不重置動畫
          const at = locate(item.pose, size, item.zone, placed, false, item.person.box[item.pose]);
          if (at) placed.push({ id: item.person.slug, name: item.person.name, pose: item.pose, zone: item.zone,
            frames: item.person.poses[item.pose]!, box: item.person.box[item.pose], size: item.size, ...at,
            peekDuration: old?.peekDuration, peekGap: old?.peekGap });
          else if (debug) console.warn(`[chibi] ${item.person.slug}:${item.pose} has no collision-free position after resize`);
        }
        placedRef.current = placed;
        setMascots(placed.slice(0, revealed.current));
      }, 150);
    };
    let alive = true;
    window.addEventListener('resize', update);
    window.addEventListener('load', update);
    document.fonts.ready.then(() => { if (alive) update(); }).catch(() => {});
    return () => { alive = false; window.removeEventListener('resize', update); window.removeEventListener('load', update); if (timer !== undefined) clearTimeout(timer); };
  }, [enabled, people, debug, reroll]);

  useEffect(() => {
    // 按鈕上的同學：游標移到（或手機按下）該按鈕時，跳一下回應
    const cleanups: (() => void)[] = [];
    for (const m of mascots) {
      const target = m.target;
      if (!target) continue;
      const on = () => { setHopId(m.id); window.setTimeout(() => setHopId((id) => id === m.id ? null : id), 600); };
      target.addEventListener('pointerenter', on);
      target.addEventListener('focus', on);
      cleanups.push(() => { target.removeEventListener('pointerenter', on); target.removeEventListener('focus', on); });
    }
    return () => cleanups.forEach((fn) => fn());
  }, [mascots]);

  useEffect(() => {
    if (!debug && !new URLSearchParams(window.location.search).has('chibi-audit')) return;
    const target = window as typeof window & { __chibiAudit?: () => unknown };
    target.__chibiAudit = () => {
      const boxes = placedRef.current.map((m) => ({ name: m.name, pose: m.pose, zone: m.zone, rect: boxOf(m) }));
      return { boxes, overlaps: boxes.flatMap(({ name, pose, rect }) => collidesWithContent(rect).map(({ with: label }) => ({ name, pose, with: label }))) };
    };
    return () => { delete target.__chibiAudit; };
  }, [debug]);

  if (!mounted) return null;
  const slot = document.getElementById('chibi-slot');
  return <>{createPortal(<>
    <style>{`
      .chibi-layer{position:absolute;inset:0;z-index:55;pointer-events:none}
      .chibi-place{position:absolute;pointer-events:none}
      .chibi-peek{position:fixed;z-index:41}
      .chibi-enter{width:100%;height:100%;animation:chibi-pop .3s cubic-bezier(.2,1.5,.4,1) both}
      .chibi-motion{width:100%;height:100%}
      .chibi-sit .chibi-motion{animation:chibi-bob 3s ease-in-out infinite}
      .chibi-nap .chibi-motion{animation:chibi-nap 4s ease-in-out infinite}
      .chibi-arms .chibi-motion{animation:chibi-arms 3.5s ease-in-out infinite}
      .chibi-shy .chibi-motion{animation:chibi-shy var(--chibi-shy-duration) ease-in-out infinite}
      .chibi-heart .chibi-motion{animation:chibi-heart 1.2s ease-in-out infinite}
      .chibi-cheer .chibi-motion{animation:chibi-cheer 1.3s ease-out infinite}
      .chibi-boba .chibi-motion{animation:chibi-boba 2.4s ease-in-out infinite}
      .chibi-sign .chibi-motion{animation:chibi-sign 2.2s ease-in-out infinite}
      .chibi-thumb .chibi-motion{animation:chibi-thumb 3s ease-out infinite}
      .chibi-wave .chibi-motion{animation:chibi-sway 2.8s ease-in-out infinite}
      .chibi-hang .chibi-motion{animation:chibi-swing ${POSE_CONFIG.hang.swingMs}ms ease-in-out infinite}
      .chibi-person{display:block;width:100%;height:100%;padding:0;border:0;background:none;cursor:pointer;pointer-events:auto;animation:chibi-none 1s}
      .chibi-person:active{animation:chibi-hop .5s ease-out}
      .chibi-person img{width:100%;height:100%;object-fit:contain;display:block}
      .chibi-right .chibi-person img{transform:scaleX(-1)}
      .chibi-zs,.chibi-hearts{position:absolute;left:54%;top:14%;pointer-events:none;color:#8B1F2F}
      .chibi-zs span{position:absolute;font-weight:bold;animation:chibi-float 3s linear infinite;opacity:0}
      .chibi-zs span:nth-child(1){font-size:13px;animation-delay:0s}.chibi-zs span:nth-child(2){font-size:18px;animation-delay:1s}.chibi-zs span:nth-child(3){font-size:23px;animation-delay:2s}
      .chibi-hearts{font-size:22px;animation:chibi-heart-float 1.6s ease-out infinite}
      .chibi-bubble{position:absolute;left:50%;top:-22px;transform:translateX(-50%);white-space:nowrap;background:#fffaf1;color:#8B1F2F;border:1px solid #E0C896;border-radius:999px;padding:5px 10px;font-size:13px;box-shadow:0 3px 12px #0002;animation:chibi-bubble 2s both;pointer-events:none}
      .chibi-toggle{position:relative;z-index:60;display:flex;flex:none;padding:3px;gap:2px;border-radius:999px;border:1px solid #E0C896;background:#fffaf1;box-shadow:0 3px 12px #0002}
      .chibi-toggle-float{position:fixed;right:16px;bottom:16px}
      .chibi-toggle button{border:0;background:transparent;color:#8B1F2F;border-radius:999px;padding:6px 12px;font-size:13px;line-height:1.2;cursor:pointer;white-space:nowrap}
      .chibi-toggle button[aria-pressed=true]{background:#8B1F2F;color:#fffaf1}
      .chibi-toggle .chibi-reroll{border:1px solid #E0C896;margin-left:2px}
      .chibi-toggle .chibi-reroll:disabled{opacity:.4;cursor:default}
      @media(max-width:720px){.chibi-toggle button{padding:5px 7px;font-size:12px}.chibi-toggle .chibi-reroll-text{display:none}}
      .chibi-toggle button:focus-visible,.chibi-person:focus-visible{outline:3px solid #8B1F2F;outline-offset:2px}
      @keyframes chibi-pop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:scale(1)}}
      @keyframes chibi-bob{50%{transform:translateY(-5px)}}
      @keyframes chibi-sway{50%{transform:rotate(3deg)}}
      @keyframes chibi-swing{0%,100%{transform:rotate(-${POSE_CONFIG.hang.swingDeg}deg)}50%{transform:rotate(${POSE_CONFIG.hang.swingDeg}deg)}}
      @keyframes chibi-nap{0%,100%{transform:rotate(-3deg)}50%{transform:rotate(3deg)}}
      @keyframes chibi-arms{0%,100%{transform:translateY(0) rotate(-2deg)}50%{transform:translateY(-2px) rotate(2deg)}}
      @keyframes chibi-shy{0%,80%{transform:translateY(0)}84%{transform:translateY(18px)}89%{transform:translateY(18px)}94%{transform:translateY(-3px)}100%{transform:translateY(0)}}
      @keyframes chibi-heart{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
      @keyframes chibi-cheer{0%,69.23%,100%{transform:translateY(0)}34.62%{transform:translateY(-22px)}}
      @keyframes chibi-boba{0%,100%{transform:translateY(0) rotate(-2deg)}50%{transform:translateY(-2px) rotate(2deg)}}
      @keyframes chibi-sign{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(4deg)}}
      @keyframes chibi-thumb{0%,23.33%,100%{transform:translateY(0)}11.67%{transform:translateY(-6px)}}
      @keyframes chibi-float{0%{transform:translate(0,0);opacity:0}20%{opacity:1}100%{transform:translate(30px,-55px);opacity:0}}
      @keyframes chibi-heart-float{0%{transform:translateY(0);opacity:0}20%{opacity:1}100%{transform:translateY(-45px);opacity:0}}
      @keyframes chibi-hop{50%{transform:translateY(-18px)}100%{transform:translateY(0)}}
      @keyframes chibi-bubble{0%{opacity:0;transform:translate(-50%,7px)}15%,75%{opacity:1;transform:translate(-50%,0)}100%{opacity:0;transform:translate(-50%,-6px)}}
      @keyframes chibi-none{to{transform:none}}
      .chibi-hopping .chibi-person{animation:chibi-hop .5s ease-out}
      .chibi-paused .chibi-enter,.chibi-paused .chibi-motion,.chibi-paused .chibi-person,.chibi-paused .chibi-zs span,.chibi-paused .chibi-hearts{animation-play-state:paused!important}
      @media(prefers-reduced-motion:reduce){.chibi-enter,.chibi-motion,.chibi-person,.chibi-bubble,.chibi-zs span,.chibi-hearts{animation:none!important}.chibi-peek .chibi-motion{transform:none;opacity:1}}
    `}</style>
    {(enabled || debug) && <div className="chibi-layer">{mascots.map((m) => <MascotView key={m.id} mascot={m} reduced={reduced} paused={paused} hop={hopId === m.id} />)}</div>}
  </>, document.body)}
  {createPortal(
    <div className={slot ? 'chibi-toggle' : 'chibi-toggle chibi-toggle-float'} role="group" aria-label="首頁版本">
      {([['on', '同學版', true], ['off', '原始版', false]] as const).map(([key, label, value]) => (
        <button key={key} type="button" aria-pressed={enabled === value} onClick={() => {
          setEnabled(value); try { localStorage.setItem('e118-chibi', key); } catch {}
        }}>{label}</button>
      ))}
      <button type="button" className="chibi-reroll" disabled={!enabled} aria-label="換一批同學" title="換一批" onClick={() => { seedRef.current = Math.floor(Math.random() * 2 ** 31); setReroll((n) => n + 1); }}>↻<span className="chibi-reroll-text"> 換一批</span></button>
    </div>
  , slot ?? document.body)}
  </>;
}
