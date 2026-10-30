"use client";

import { useEffect } from "react";
import { LIVE, POLL_MS } from "@/lib/config";
import { liveApi } from "@/lib/services/live";
import type { DemoAction } from "@/lib/demo-state";

/**
 * Polls GET /api/v1/pending_alerts and mirrors the result into the shared
 * state. Sequential (never overlapping), paused while the tab is hidden, and
 * backs off while the backend is unreachable.
 */

const SYNC_EVENT = "zephyr:sync-now";
const RESOLVED_TTL_MS = 15_000;
const resolved = new Map<string, number>();

/** Ask the poller to refresh immediately (after an execute or a simulated attack). */
export function requestSync() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SYNC_EVENT));
}

/** Hide an alert that was just executed/rejected even if an older poll response still lists it. */
export function markResolved(alertId: string) {
  resolved.set(alertId, Date.now());
}

export function useBackendSync(dispatch: (a: DemoAction) => void) {
  useEffect(() => {
    if (!LIVE) return;
    let stopped = false;
    let inFlight = false;

    const poll = async () => {
      if (stopped || document.hidden || inFlight) return;
      inFlight = true;
      try {
        const snapshot = await liveApi.getSnapshot();
        if (stopped) return;
        const now = Date.now();
        for (const [id, at] of resolved) if (now - at > RESOLVED_TTL_MS) resolved.delete(id);
        snapshot.pending = (snapshot.pending ?? []).filter((p) => !resolved.has(String(p.alert_id)));
        dispatch({ type: "live_sync", snapshot, nowMs: now });
      } catch (e) {
        if (stopped) return;
        dispatch({ type: "live_error", message: e instanceof Error ? e.message : "Unknown error", nowMs: Date.now() });
      } finally {
        inFlight = false;
      }
    };

    void poll();
    const intervalId = window.setInterval(() => void poll(), POLL_MS);

    const onNow = () => void poll();
    const onVisible = () => {
      if (!document.hidden) void poll();
    };
    window.addEventListener(SYNC_EVENT, onNow);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(intervalId);
      window.removeEventListener(SYNC_EVENT, onNow);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [dispatch]);
}
