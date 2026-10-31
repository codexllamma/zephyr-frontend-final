"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Sequential poller: waits for each request to finish before scheduling the
 * next, pauses while the tab is hidden, and backs off after failures.
 * `refresh()` (returned) triggers an immediate poll.
 */
export function usePoll<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  onData: (data: T) => void,
  opts: { intervalMs: number; enabled: boolean; onError?: (e: unknown) => void },
) {
  const fetchRef = useRef(fetcher);
  const dataRef = useRef(onData);
  const errRef = useRef(opts.onError);
  const nowRef = useRef<() => void>(() => {});
  useEffect(() => {
    fetchRef.current = fetcher;
    dataRef.current = onData;
    errRef.current = opts.onError;
  });

  const { intervalMs, enabled } = opts;
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let failures = 0;
    let timer: number | undefined;
    let ctrl: AbortController | undefined;
    const schedule = (ms: number) => {
      window.clearTimeout(timer);
      if (!stopped) timer = window.setTimeout(tick, ms);
    };
    async function tick() {
      if (stopped) return;
      if (document.hidden) return schedule(intervalMs);
      ctrl = new AbortController();
      try {
        const data = await fetchRef.current(ctrl.signal);
        if (stopped) return;
        failures = 0;
        dataRef.current(data);
        schedule(intervalMs);
      } catch (e: unknown) {
        if (stopped) return;
        const isAbort = (e instanceof Error && e.name === "AbortError") || (e as { message?: string })?.message === "Request cancelled";
        if (isAbort) return;
        failures += 1;
        errRef.current?.(e);
        schedule(Math.min(intervalMs * 2 ** Math.min(failures, 2), 12_000));
      }
    }
    nowRef.current = () => {
      ctrl?.abort();
      schedule(0);
    };
    const onVisible = () => {
      if (!document.hidden) nowRef.current();
    };
    document.addEventListener("visibilitychange", onVisible);
    tick();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      ctrl?.abort();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, intervalMs]);

  const refresh = useCallback(() => nowRef.current(), []);
  return { refresh };
}
