"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useReactFlow } from "@xyflow/react";
import { evaluateCamera, nearestLabel, type Bounds, type CameraStop } from "@/lib/camera";

/**
 * Auto-playing, scroll-steerable camera for a React Flow canvas.
 *
 * - By default the camera plays by itself: it zooms into the first node, glides
 *   slowly to each next node (dwelling on every one), then rewinds and repeats.
 * - A click on the canvas pauses it on the current node (click again to resume).
 * - Scrolling over the canvas also stops autoplay and steers the camera
 *   manually to other nodes. Autoplay never restarts on its own after that.
 *
 * - The wheel / touch scroll distance over the canvas is intercepted and
 *   accumulated into a normalised timeline target in [0, 1].
 * - A critically-damped spring chases the target, so camera speed follows
 *   scroll speed (fast flick = fast flight, slow scroll = slow glide).
 * - The camera is a pure function of the smoothed progress (see lib/camera.ts),
 *   so reversing the scroll retraces the same track with no rubber-banding.
 * - Once the timeline is at either end, scroll passes through to the page.
 *
 * It only calls `setViewport`; nodes, edges and live data are untouched.
 */

const SENSITIVITY = 1 / 2200; // timeline units per wheel pixel
const TOUCH_SENSITIVITY = 1 / 700;
const SCROLL_STIFFNESS = 70; // snappy: follows scroll speed
const AUTO_STIFFNESS = 3; // slow, cinematic glide between nodes
const DWELL_MS = 1000; // wait on each node during autoplay
/** Window event: pull the camera back to the full overview and pause autoplay. */
export const CAMERA_OVERVIEW_EVENT = "zephyr:camera-overview";
const DRAG_SENSITIVITY = 1 / 700; // timeline units per dragged pixel (paused only)
const START_DELAY_MS = 500;
const damping = (k: number) => 2 * Math.sqrt(k) * 0.95;

interface Params {
  containerRef: RefObject<HTMLElement | null>;
  stops: CameraStop[];
  bounds: Bounds;
  /** If true, the canvas obeys CAMERA_OVERVIEW_EVENT (used by the topology). */
  listenForOverview?: boolean;
}

export function useScrollCamera({ containerRef, stops, bounds, listenForOverview = false }: Params) {
  const { setViewport } = useReactFlow();
  const motion = useRef({ p: 0, v: 0, target: 0, k: AUTO_STIFFNESS, playing: true, seq: 0 });
  const applyRef = useRef<() => void>(() => {});
  const [hud, setHud] = useState({ progress: 0, label: "Overview", playing: true });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const m = motion.current;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let last = 0;
    let shown = -1;
    let timer = 0;
    // Autoplay visits every stop in order, then rewinds to the overview and repeats.
    const order = [...stops.map((x) => x.t), 0];
    if (reduced) m.playing = false; // no self-moving camera for reduced-motion users

    const apply = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h) return;
      const cam = evaluateCamera(stops, bounds, m.p, w, h);
      void setViewport({ x: w / 2 - cam.x * cam.zoom, y: h / 2 - cam.y * cam.zoom, zoom: cam.zoom });
      const rounded = Math.round(m.p * 100);
      const key = rounded * 2 + (m.playing ? 1 : 0);
      if (key !== shown) {
        shown = key;
        setHud({ progress: m.p, label: nearestLabel(stops, bounds, m.p), playing: m.playing });
      }
    };
    applyRef.current = apply;

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      // Spring towards the scroll-driven target.
      m.v += (m.k * (m.target - m.p) - damping(m.k) * m.v) * dt;
      m.p = Math.min(1, Math.max(0, m.p + m.v * dt));
      apply();
      // Start the wait as soon as the camera visibly arrives at the node.
      if (m.playing && !timer && Math.abs(m.target - m.p) < 0.003) timer = window.setTimeout(advance, DWELL_MS);
      if (Math.abs(m.target - m.p) < 1e-4 && Math.abs(m.v) < 1e-3) {
        m.p = m.target;
        m.v = 0;
        apply();
        raf = 0;
        if (m.playing && !timer) timer = window.setTimeout(advance, DWELL_MS);
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    function advance() {
      timer = 0;
      if (!m.playing) return;
      m.seq = (m.seq + 1) % order.length;
      m.target = order[m.seq];
      m.k = AUTO_STIFFNESS;
      run();
    }

    /** Stop autoplay where the camera is (used by click-to-pause and by scrolling). */
    const stopAutoplay = () => {
      window.clearTimeout(timer);
      if (m.playing) {
        m.playing = false;
        m.target = m.p; // hold the current view; nothing is left to glide towards
        m.v = 0;
        shown = -1;
        apply();
      }
    };

    const startAutoplay = () => {
      window.clearTimeout(timer);
      m.playing = true;
      // Continue towards the next node ahead of the camera (or rewind after the last one).
      const ahead = order.findIndex((t, i) => i < order.length - 1 && t > m.p + 0.005);
      m.seq = ahead === -1 ? order.length - 1 : ahead;
      m.target = order[m.seq];
      m.k = AUTO_STIFFNESS;
      shown = -1;
      run();
    };

    function run() {
      if (reduced) {
        m.p = m.target;
        apply();
      } else if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    }

    /** Returns true if the canvas consumed the scroll (page must not scroll). */
    const nudge = (delta: number): boolean => {
      if (m.playing) stopAutoplay(); // the user took over
      const canMove = (delta > 0 && m.target < 1) || (delta < 0 && m.target > 0);
      if (!canMove) return false;
      m.k = SCROLL_STIFFNESS;
      m.target = Math.min(1, Math.max(0, m.target + delta));
      run();
      return true;
    };

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return; // leave browser pinch-zoom alone
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 800 : 1;
      if (nudge(e.deltaY * unit * SENSITIVITY)) e.preventDefault();
    };

    let touchY: number | null = null;
    const onTouchStart = (e: TouchEvent) => {
      touchY = e.touches[0]?.clientY ?? null;
    };
    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY;
      if (touchY === null || y === undefined) return;
      const consumed = nudge((touchY - y) * TOUCH_SENSITIVITY);
      touchY = y;
      if (consumed && e.cancelable) e.preventDefault();
    };
    const onTouchEnd = () => {
      touchY = null;
    };

    // Manual navigation is disabled: block arrow keys / space from moving the view or page.
    const onKeyDown = (e: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    // Click toggles pause/resume of the automatic flight (a drag is not a click).
    let dragged = false;
    const onClick = () => {
      if (dragged) {
        dragged = false;
        return;
      }
      if (m.playing) stopAutoplay();
      else if (!reduced) startAutoplay();
    };

    // While paused, dragging steers the camera to other nodes.
    const onPointerDown = (e: PointerEvent) => {
      if (m.playing || e.button !== 0) return;
      let lastX = e.clientX;
      dragged = false;
      const move = (ev: PointerEvent) => {
        const dx = ev.clientX - lastX;
        if (Math.abs(ev.clientX - e.clientX) > 4) dragged = true;
        if (!dragged) return;
        lastX = ev.clientX;
        m.k = SCROLL_STIFFNESS;
        m.target = Math.min(1, Math.max(0, m.target - dx * DRAG_SENSITIVITY));
        run();
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    };

    const onOverview = () => {
      stopAutoplay();
      m.target = 0;
      m.v = 0;
      m.k = 14;
      shown = -1;
      run();
    };
    if (listenForOverview) window.addEventListener(CAMERA_OVERVIEW_EVENT, onOverview);
    el.addEventListener("pointerdown", onPointerDown);

    el.addEventListener("click", onClick);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("keydown", onKeyDown, true);
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    apply();
    // Autoplay: after a short beat, fly in to the first node.
    if (m.playing) {
      m.seq = Math.max(0, order.findIndex((t) => t > m.p + 0.005));
      timer = window.setTimeout(() => {
        timer = 0;
        m.target = order[m.seq];
        m.k = AUTO_STIFFNESS;
        run();
      }, START_DELAY_MS);
    }

    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
      el.removeEventListener("click", onClick);
      el.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener(CAMERA_OVERVIEW_EVENT, onOverview);
      ro.disconnect();
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("keydown", onKeyDown, true);
      applyRef.current = () => {};
    };
  }, [containerRef, stops, bounds, setViewport, listenForOverview]);

  /** Pass to <ReactFlow onInit>: places the camera once React Flow is ready. */
  const onInit = useCallback(() => applyRef.current(), []);
  return { onInit, hud };
}

/** React Flow props that switch off every manual navigation gesture. */
export const LOCKED_CAMERA_PROPS = {
  panOnDrag: false,
  panOnScroll: false,
  zoomOnScroll: false,
  zoomOnPinch: false,
  zoomOnDoubleClick: false,
  preventScrolling: false,
  panActivationKeyCode: null,
  selectionKeyCode: null,
  multiSelectionKeyCode: null,
  deleteKeyCode: null,
  zoomActivationKeyCode: null,
  disableKeyboardA11y: true,
  autoPanOnNodeFocus: false,
  nodesDraggable: false,
  nodesConnectable: false,
  nodesFocusable: false,
  edgesFocusable: false,
} as const;
