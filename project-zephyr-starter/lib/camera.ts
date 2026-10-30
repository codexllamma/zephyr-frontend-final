/**
 * Pure camera-path maths for the scroll-driven canvases.
 *
 * A path is an ordered list of stops (flow-space centre + zoom) at normalised
 * timeline positions `t` in [0, 1]. The camera is a pure function of the
 * progress `p`, so scrolling backwards re-traces the exact same track.
 */

export interface CameraStop {
  /** Timeline position, 0..1, ascending. */
  t: number;
  /** Flow-space point to centre on. */
  x: number;
  y: number;
  zoom: number;
  label: string;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const easeInOutCubic = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

/** Zoom that fits `bounds` inside a `w`×`h` viewport with padding. */
export function fitZoom(bounds: Bounds, w: number, h: number, pad = 28): number {
  const z = Math.min((w - pad * 2) / bounds.width, (h - pad * 2) / bounds.height);
  return clamp(z, 0.15, 1.5);
}

/** Stops including the implicit wide-angle overview at t = 0. */
export function withOverview(stops: CameraStop[], bounds: Bounds, w: number, h: number): CameraStop[] {
  return [
    {
      t: 0,
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
      zoom: fitZoom(bounds, w, h),
      label: "Overview",
    },
    ...stops,
  ];
}

/** Cubic Bézier point; control points come from Catmull-Rom tangents so the path is smooth through every stop. */
function bezier(p0: number, c1: number, c2: number, p3: number, u: number): number {
  const m = 1 - u;
  return m * m * m * p0 + 3 * m * m * u * c1 + 3 * m * u * u * c2 + u * u * u * p3;
}

export function evaluateCamera(stops: CameraStop[], bounds: Bounds, progress: number, w: number, h: number): Camera {
  const all = withOverview(stops, bounds, w, h);
  const p = clamp(progress, 0, 1);
  let i = 0;
  while (i < all.length - 2 && p > all[i + 1].t) i++;
  const a = all[i];
  const b = all[i + 1] ?? a;
  const span = b.t - a.t || 1;
  const u = clamp((p - a.t) / span, 0, 1);
  const e = easeInOutCubic(u); // ease out of one node, into the next

  const prev = all[i - 1] ?? a;
  const next = all[i + 2] ?? b;
  const x = bezier(a.x, a.x + (b.x - prev.x) / 6, b.x - (next.x - a.x) / 6, b.x, e);
  const y = bezier(a.y, a.y + (b.y - prev.y) / 6, b.y - (next.y - a.y) / 6, b.y, e);

  // Zoom interpolates in log space (even perceived speed); long fly-overs between
  // two focus shots pull back slightly mid-flight for a cinematic swoop.
  const lz = Math.log(a.zoom) + (Math.log(b.zoom) - Math.log(a.zoom)) * e;
  const swoop = i >= 1 ? 1 - 0.22 * Math.sin(Math.PI * e) : 1;
  return { x, y, zoom: Math.exp(lz) * swoop };
}

/** Label of the stop nearest to the current progress. */
export function nearestLabel(stops: CameraStop[], bounds: Bounds, progress: number): string {
  const all = withOverview(stops, bounds, 1000, 600);
  return all.reduce((best, s) => (Math.abs(s.t - progress) < Math.abs(best.t - progress) ? s : best)).label;
}
