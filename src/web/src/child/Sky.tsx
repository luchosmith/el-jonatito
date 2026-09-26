// The main screen's background: the earth turning at the bottom, the sun and moon travelling
// around it, the sky following the time of day, the weather and the season.
// One canvas, drawn by drawSky(time, ...). The things he taps are DOM on top of it.
// Budget: <= 30 fps (10 fps after 2 min without a touch), paused while hidden; reduced motion
// redraws once a minute (sun and moon still follow the clock, clouds stop).
import { useEffect, useRef, type MutableRefObject } from 'react';
import type { Season } from '../../../shared/time.ts';

/** How high the earth rises from the bottom of the orbit (px); the places compass is drawn on it. */
export const EARTH_RISE = 150;

export type Weather = 'clear' | 'partly' | 'cloudy' | 'rain' | 'snow';

/** Open-Meteo weather code -> what the sky shows. */
export function weatherOf(code: number | null | undefined): Weather {
  if (code == null) return 'partly';
  if (code === 0) return 'clear';
  if (code <= 2) return 'partly';
  if (code <= 48) return 'cloudy';
  if (code >= 71 && code <= 77) return 'snow';
  if (code === 85 || code === 86) return 'snow';
  return 'rain';
}

const DAY = 86_400_000;
type RGB = [number, number, number];
const PAL: Record<'day' | 'dusk' | 'night', [RGB, RGB]> = {
  day: [[142, 201, 245], [233, 246, 255]],
  dusk: [[255, 176, 124], [255, 230, 204]],
  night: [[22, 33, 62], [58, 77, 119]],
};
const LAND: Record<Season, [RGB, RGB]> = {
  spring: [[126, 205, 120], [236, 170, 200]],
  summer: [[96, 180, 92], [70, 150, 70]],
  autumn: [[110, 170, 90], [212, 150, 70]],
  winter: [[232, 238, 245], [150, 190, 150]],
};
const mix = (a: RGB, b: RGB, k: number): RGB => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * k)) as RGB;
const rgb = (c: RGB, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
function rng(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

const STRIP_W = 2400;
const landCache = new Map<Season, HTMLCanvasElement>();
/** The earth's surface as a wide strip of small continents: drawn once per season, then slid sideways. */
function landStrip(season: Season): HTMLCanvasElement {
  const hit = landCache.get(season);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = STRIP_W;
  c.height = 90;
  const g = c.getContext('2d')!;
  const r = rng(7);
  const [a, b] = LAND[season];
  const blob = (x: number, y: number, w: number, h: number) => {
    for (const dx of [0, -STRIP_W, STRIP_W]) {
      g.beginPath();
      g.ellipse(x + dx, y, w, h, 0, 0, Math.PI * 2);
      g.fill();
    }
  };
  for (let i = 0; i < 9; i++) {
    const x = r() * STRIP_W, y = 18 + r() * 50, w = 50 + r() * 90;
    g.fillStyle = rgb(a);
    for (let k = 0; k < 4; k++) blob(x + (r() - 0.5) * w * 1.4, y + (r() - 0.5) * 18, w * (0.4 + r() * 0.5), 7 + r() * 9);
    g.fillStyle = rgb(b, 0.9);
    blob(x + (r() - 0.5) * w, y + (r() - 0.5) * 8, w * 0.3, 5 + r() * 4);
  }
  landCache.set(season, c);
  return c;
}

/** Draws the whole scene for `t` (ms). `idle` is a free-running clock (ms) for drifting clouds. */
export function drawSky(g: CanvasRenderingContext2D, W: number, H: number, t: number, weather: Weather, season: Season, idle: number) {
  const d = new Date(t);
  const hrs = d.getHours() + d.getMinutes() / 60;
  const th = ((hrs - 12) / 24) * Math.PI * 2;
  const alt = Math.cos(th); // 1 at noon, -1 at midnight

  let top: RGB, bot: RGB;
  if (alt > 0.3) [top, bot] = PAL.day;
  else if (alt > 0.05) { const k = (alt - 0.05) / 0.25; top = mix(PAL.dusk[0], PAL.day[0], k); bot = mix(PAL.dusk[1], PAL.day[1], k); }
  else if (alt > -0.2) { const k = (alt + 0.2) / 0.25; top = mix(PAL.night[0], PAL.dusk[0], k); bot = mix(PAL.night[1], PAL.dusk[1], k); }
  else [top, bot] = PAL.night;
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, rgb(top));
  sky.addColorStop(1, rgb(bot));
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  if (weather === 'cloudy' || weather === 'rain' || weather === 'snow') {
    g.fillStyle = 'rgba(120,130,145,.22)';
    g.fillRect(0, 0, W, H);
  }

  if (alt < 0.05) {
    const r = rng(3), a = Math.min(1, (0.05 - alt) * 4);
    for (let i = 0; i < 40; i++) {
      const x = r() * W, y = r() * H * 0.7, tw = 0.6 + 0.4 * Math.sin(idle / 700 + i);
      g.fillStyle = `rgba(255,255,240,${a * tw * 0.8})`;
      g.fillRect(x, y, 2, 2);
    }
  }

  // Sun and moon travel an ellipse around the earth: east at 6, overhead at noon, west at 6.
  const EH = EARTH_RISE, hy = H - EH, cx = W / 2, rx = W * 0.47, ry = hy - 36;
  const pos = (a: number): [number, number] => [cx + rx * Math.sin(a), hy - ry * Math.cos(a)];
  const [sx, sy] = pos(th);
  const glow = g.createRadialGradient(sx, sy, 4, sx, sy, 70);
  glow.addColorStop(0, 'rgba(255,214,102,.55)');
  glow.addColorStop(1, 'rgba(255,214,102,0)');
  g.fillStyle = glow;
  g.beginPath(); g.arc(sx, sy, 70, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffd166';
  g.beginPath(); g.arc(sx, sy, 24, 0, Math.PI * 2); g.fill();
  const [mx, my] = pos(th + Math.PI);
  g.fillStyle = '#f4f1e6';
  g.beginPath(); g.arc(mx, my, 18, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(180,176,160,.5)';
  g.beginPath(); g.arc(mx - 5, my - 4, 4, 0, 7); g.arc(mx + 6, my + 5, 3, 0, 7); g.fill();

  const nC = { clear: 1, partly: 3, cloudy: 6, rain: 6, snow: 5 }[weather], rc = rng(11);
  for (let i = 0; i < nC; i++) {
    const base = rc() * W, y = 24 + rc() * 120, sp = 6 + rc() * 8, s = 0.7 + rc() * 0.6;
    const x = ((base + (idle / 1000) * sp) % (W + 260)) - 130;
    g.fillStyle = alt > 0 ? (weather === 'rain' ? 'rgba(190,198,210,.9)' : 'rgba(255,255,255,.85)') : 'rgba(150,164,192,.35)';
    g.beginPath();
    g.ellipse(x, y, 46 * s, 16 * s, 0, 0, 7);
    g.ellipse(x + 30 * s, y - 10 * s, 30 * s, 16 * s, 0, 0, 7);
    g.ellipse(x - 28 * s, y - 4 * s, 24 * s, 12 * s, 0, 0, 7);
    g.fill();
  }
  if (weather === 'rain') {
    const r = rng(5);
    g.strokeStyle = 'rgba(110,150,205,.5)';
    g.lineWidth = 1.5;
    g.beginPath();
    for (let i = 0; i < 70; i++) { const x = r() * W, y = (r() * H + idle * 0.35) % H; g.moveTo(x, y); g.lineTo(x - 3, y + 10); }
    g.stroke();
  }
  if (weather === 'snow') {
    const r = rng(9);
    g.fillStyle = 'rgba(255,255,255,.9)';
    for (let i = 0; i < 60; i++) { const x = (r() * W + Math.sin(idle / 900 + i) * 10 + W) % W, y = (r() * H + idle * 0.05) % H; g.beginPath(); g.arc(x, y, 2.2, 0, 7); g.fill(); }
  }
  if (season === 'autumn' && weather !== 'snow') {
    const r = rng(13);
    g.fillStyle = 'rgba(214,120,40,.7)';
    for (let i = 0; i < 6; i++) { const x = (r() * W - idle * 0.02 + W * 3) % W, y = (r() * H + idle * 0.03) % hy; g.beginPath(); g.ellipse(x, y, 5, 3, idle / 600 + i, 0, 7); g.fill(); }
  }

  // The earth: a huge sphere peeking at the bottom; it turns once per day (+ a slow drift).
  const ER = W * 0.82, ecy = H + ER - EH; // a bigger, rounder globe (v0.8): the places compass sits on it
  const atm = g.createRadialGradient(cx, ecy, ER - 6, cx, ecy, ER + 26);
  atm.addColorStop(0, alt > 0 ? 'rgba(170,215,255,.75)' : 'rgba(110,140,210,.45)');
  atm.addColorStop(1, 'rgba(170,215,255,0)');
  g.fillStyle = atm;
  g.beginPath(); g.arc(cx, ecy, ER + 26, 0, Math.PI * 2); g.fill();
  g.save();
  g.beginPath(); g.arc(cx, ecy, ER, 0, Math.PI * 2); g.clip();
  const sea = g.createLinearGradient(0, hy, 0, H);
  sea.addColorStop(0, alt > 0 ? '#6fb0e6' : '#35507e');
  sea.addColorStop(1, alt > 0 ? '#3f7fc4' : '#22345a');
  g.fillStyle = sea;
  g.fillRect(0, hy - 10, W, EH + 10);
  const strip = landStrip(season);
  const off = ((((t % DAY) + DAY) % DAY) / DAY * STRIP_W + idle * 0.004) % STRIP_W;
  g.globalAlpha = alt > 0 ? 1 : 0.55;
  g.drawImage(strip, -off, hy - 2);
  g.drawImage(strip, STRIP_W - off, hy - 2);
  g.globalAlpha = 1;
  g.restore();
}

const reducedMotion = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

/** The canvas. `timeRef` holds the (possibly scrubbed) time, so dragging never re-renders React per frame. */
export function Sky({ timeRef, weather, season }: { timeRef: MutableRefObject<number>; weather: Weather; season: Season }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const opts = useRef({ weather, season });
  opts.current = { weather, season };

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const g = cv.getContext('2d');
    if (!g) return;
    let raf = 0;
    let last = 0;
    let lastTouch = performance.now();
    let lastT = NaN;
    const still = reducedMotion();
    const touch = () => (lastTouch = performance.now());
    window.addEventListener('pointerdown', touch);

    const frame = (ts: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden) return;
      const fps = still ? 0 : ts - lastTouch > 120_000 ? 10 : 30;
      const t = timeRef.current;
      const moved = Math.abs(t - lastT) >= 30_000; // the (scrubbed) time moved noticeably
      if (fps === 0 ? !moved && ts - last < 60_000 : ts - last < 1000 / fps && !moved) return;
      last = ts;
      lastT = t;
      const W = cv.clientWidth, H = cv.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
      if (!W || !H) return;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
        cv.width = Math.round(W * dpr);
        cv.height = Math.round(H * dpr);
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawSky(g, W, H, t, opts.current.weather, opts.current.season, still ? 0 : ts);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointerdown', touch);
    };
  }, [timeRef]);

  return <canvas ref={canvas} className="sky" data-testid="sky" aria-hidden />;
}
