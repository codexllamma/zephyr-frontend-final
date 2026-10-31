"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import type { RawLogsApiResponse } from "@/app/api/raw-logs/route";
import { useDemo } from "@/components/providers/DemoProvider";
import { requestSync } from "@/hooks/useBackendSync";
import type { PreprocessedLogEntry } from "@/lib/raw-log-preprocessor";
import { liveApi } from "@/lib/services/live";
import {
  formatNowTime,
  MITIGATION_ENFORCED_BANNER,
  nextAttackFeedLine,
  nextBenignFeedLine,
  type FeedContext,
} from "@/lib/terminal-feeds";
import type { TerminalLine } from "@/types";
import { TerminalPanel } from "./TerminalPanel";

const MAX_LINES = 220;
const ATTACK_STREAM_MS = 115;
const RAW_LOG_STREAM_MS = 1000;
const PREFETCH_THRESHOLD = 15;

export function LiveTerminal() {
  const { state, dispatch } = useDemo();
  const [streamLines, setStreamLines] = useState<TerminalLine[]>([]);
  const [busy, setBusy] = useState(false);

  const seqRef = useRef(1);
  const mountedRef = useRef(false);
  const firstEmittedRef = useRef(false);
  const queueRef = useRef<PreprocessedLogEntry[]>([]);
  const nextFileIndexRef = useRef(0);
  const fetchingRef = useRef(false);
  const phaseRef = useRef(state.drama.phase);

  const feedCtxRef = useRef<FeedContext>({
    sourceNode: state.drama.sourceNode,
    targetNode: state.drama.targetNode,
    sourceIp: state.drama.sourceIp,
    targetIp: state.drama.targetIp,
    targetPort: state.drama.targetPort,
    protocol: state.drama.protocol,
    threatSignature: state.drama.threatSignature,
  });

  useEffect(() => {
    phaseRef.current = state.drama.phase;
  }, [state.drama.phase]);

  useEffect(() => {
    feedCtxRef.current = {
      sourceNode: state.drama.sourceNode,
      targetNode: state.drama.targetNode,
      sourceIp: state.drama.sourceIp,
      targetIp: state.drama.targetIp,
      targetPort: state.drama.targetPort,
      protocol: state.drama.protocol,
      threatSignature: state.drama.threatSignature,
    };
  }, [
    state.drama.sourceNode,
    state.drama.targetNode,
    state.drama.sourceIp,
    state.drama.targetIp,
    state.drama.targetPort,
    state.drama.protocol,
    state.drama.threatSignature,
  ]);

  const toRawTerminalLine = useCallback((entry: PreprocessedLogEntry): TerminalLine => {
    return {
      id: `raw-${seqRef.current++}`,
      kind: "log",
      text: entry.text,
      tone: entry.kind === "core" ? "critical" : "success",
      rawOnly: true,
    };
  }, []);

  const fetchNextRawLogBatch = useCallback(async (): Promise<void> => {
    if (fetchingRef.current || queueRef.current.length >= PREFETCH_THRESHOLD * 3) {
      return;
    }
    fetchingRef.current = true;
    try {
      const idx = nextFileIndexRef.current;
      const res = await fetch(`/api/raw-logs?index=${idx}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as RawLogsApiResponse;
      if (Array.isArray(data.logs) && data.logs.length > 0) {
        queueRef.current.push(...data.logs);
        nextFileIndexRef.current = data.nextIndex;
      }
    } catch {
      // Ignore transient read errors; subsequent 1s ticks will retry
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  // Prime preprocessed logs from data/raw_logs on mount and emit the initial entry immediately
  useEffect(() => {
    mountedRef.current = true;
    void fetchNextRawLogBatch().then(() => {
      if (!mountedRef.current || firstEmittedRef.current) return;
      if (phaseRef.current !== "idle") return;
      const first = queueRef.current.shift();
      if (!first) return;
      firstEmittedRef.current = true;
      setStreamLines((prev) => [...prev, toRawTerminalLine(first)].slice(-MAX_LINES));
    });
    return () => {
      mountedRef.current = false;
    };
  }, [fetchNextRawLogBatch, toRawTerminalLine]);

  // Baseline artificial terminal simulation: 1 preprocessed log from data/raw_logs every 1 second
  const isIdle = state.drama.phase === "idle";
  useEffect(() => {
    if (!isIdle) return;

    const tickRawLog = () => {
      if (queueRef.current.length < PREFETCH_THRESHOLD) {
        void fetchNextRawLogBatch();
      }
      const next = queueRef.current.shift();
      if (!next) return;
      firstEmittedRef.current = true;
      setStreamLines((prev) => [...prev, toRawTerminalLine(next)].slice(-MAX_LINES));
    };

    const interval = window.setInterval(tickRawLog, RAW_LOG_STREAM_MS);
    return () => {
      window.clearInterval(interval);
    };
  }, [isIdle, fetchNextRawLogBatch, toRawTerminalLine]);

  // Rapid red [CRITICAL] stream during the attack & 14s LLM thinking window
  const isAttackStreaming =
    state.drama.phase === "thinking" || state.drama.phase === "awaiting_decision";
  const attackEpoch = state.drama.attackEpoch;

  useEffect(() => {
    if (!isAttackStreaming) return;
    let tick = 0;

    const pushRedLine = () => {
      const id = `atk-${attackEpoch}-${seqRef.current++}`;
      const lineText = nextAttackFeedLine(feedCtxRef.current, tick++);
      setStreamLines((prev) =>
        [
          ...prev,
          {
            id,
            kind: "log" as const,
            text: lineText,
            time: formatNowTime(),
            tag: "CRITICAL",
            tone: "critical" as const,
          },
        ].slice(-MAX_LINES),
      );
    };

    const immediateTimer = window.setTimeout(pushRedLine, 0);
    const interval = window.setInterval(pushRedLine, ATTACK_STREAM_MS);
    return () => {
      window.clearTimeout(immediateTimer);
      window.clearInterval(interval);
    };
  }, [isAttackStreaming, attackEpoch]);

  // Mitigation enforced: freeze rapid red logs, inject bold banner, and resume 1-second green logs
  const isMitigated = state.drama.phase === "mitigated";
  const mitigationEpoch = state.drama.mitigationEpoch;

  useEffect(() => {
    if (!isMitigated || mitigationEpoch === 0) return;
    let fallbackTick = 0;

    const bannerTimer = window.setTimeout(() => {
      setStreamLines((prev) =>
        [
          ...prev,
          {
            id: `enforced-banner-${mitigationEpoch}-${seqRef.current++}`,
            kind: "log" as const,
            text: MITIGATION_ENFORCED_BANNER,
            tone: "success" as const,
            isBanner: true,
          },
        ].slice(-MAX_LINES),
      );
    }, 0);

    const pushGreenLine = () => {
      if (queueRef.current.length < PREFETCH_THRESHOLD) {
        void fetchNextRawLogBatch();
      }
      // Pull next benign [FILLER] entry from raw_logs queue so post-mitigation stays pure green
      let fillerEntry: PreprocessedLogEntry | undefined;
      while (queueRef.current.length > 0) {
        const candidate = queueRef.current.shift();
        if (candidate && candidate.kind === "filler") {
          fillerEntry = candidate;
          break;
        }
      }

      if (fillerEntry) {
        setStreamLines((prev) => [...prev, toRawTerminalLine(fillerEntry)].slice(-MAX_LINES));
        return;
      }

      const id = `ok-${mitigationEpoch}-${seqRef.current++}`;
      const lineText = nextBenignFeedLine(feedCtxRef.current, fallbackTick++);
      setStreamLines((prev) =>
        [
          ...prev,
          {
            id,
            kind: "log" as const,
            text: lineText,
            time: formatNowTime(),
            tag: "HTTP 200 OK",
            tone: "success" as const,
          },
        ].slice(-MAX_LINES),
      );
    };

    const interval = window.setInterval(pushGreenLine, RAW_LOG_STREAM_MS);
    return () => {
      window.clearTimeout(bannerTimer);
      window.clearInterval(interval);
    };
  }, [isMitigated, mitigationEpoch, fetchNextRawLogBatch, toRawTerminalLine]);

  const reset = async () => {
    if (busy) return;
    setBusy(true);
    setStreamLines([]);
    queueRef.current = [];
    nextFileIndexRef.current = 0;
    firstEmittedRef.current = false;
    void fetchNextRawLogBatch();
    try {
      await liveApi.resetEnvironment();
      requestSync();
    } catch {
      // ignore if offline
    } finally {
      dispatch({ type: "reset" });
      setBusy(false);
    }
  };

  const actions = (
    <button
      type="button"
      onClick={() => void reset()}
      disabled={busy}
      title="Reset environment"
      className="flex h-6 items-center gap-1 rounded px-1.5 font-mono text-[11px] text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 disabled:opacity-50"
    >
      <RotateCcw aria-hidden className="size-3" />
      {busy ? "..." : "reset"}
    </button>
  );

  return (
    <TerminalPanel
      live
      deviceId={state.selectedDeviceId}
      lines={streamLines}
      onSubmit={() => {}}
      onClear={() => {
        setStreamLines([]);
        dispatch({ type: "terminal_clear", deviceId: state.selectedDeviceId });
      }}
      actions={actions}
    />
  );
}
