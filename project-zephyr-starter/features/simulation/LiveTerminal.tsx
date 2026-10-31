"use client";

import { useMemo, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { useDemo } from "@/components/providers/DemoProvider";
import { requestSync } from "@/hooks/useBackendSync";
import { usePoll } from "@/hooks/usePoll";
import { fmtTime } from "@/lib/format";
import { liveApi } from "@/lib/services/live";
import type { TerminalLine } from "@/types";
import type { BackendLogEntry } from "@/types/backend";
import { TerminalPanel } from "./TerminalPanel";

const MAX_LINES = 200;

function toMinimalOutcomeLine(e: BackendLogEntry): TerminalLine | null {
  const raw = (e.text ?? "").trim();
  if (!raw) return null;
  const lvl = (e.level ?? "").toUpperCase();

  // Ignore verbose routing, system startup, and ASCII banners
  if (/^(Chain\s|target\s+prot|===|---|\[SYSTEM\]|Router\s+tier|Initializing)/i.test(raw)) {
    return null;
  }

  const isDrop =
    lvl === "ALERT" ||
    lvl === "CRITICAL" ||
    lvl === "ERROR" ||
    lvl === "WARN" ||
    lvl === "WARNING" ||
    /\b(DROP|REJECT|BLOCK|SYN_FLOOD|FLOOD|ATTACK|DENIED)\b/i.test(raw);

  const isAccept =
    !isDrop &&
    (lvl === "SUCCESS" ||
      lvl === "OK" ||
      /\b(ACCEPT|200\s*OK|HTTP\s*200|SLA\s*INTACT|BENIGN)\b/i.test(raw));

  if (!isDrop && !isAccept) return null;

  const ts = e.timestamp ?? "";
  const time = /^\d{4}-\d{2}-\d{2}T/.test(ts) ? fmtTime(ts) : ts;
  const tag = isDrop ? "DROP" : "ACCEPT";
  const cleaned = raw
    .replace(/^\[(DROP|ACCEPT|ALERT|SUCCESS|WARN|WARNING|INFO|CMD|LOG|CRITICAL|ERROR)\]\s*/i, "")
    .slice(0, 120);

  return {
    id: `be-${e.id}`,
    kind: "log",
    text: `[${tag}] ${cleaned}`,
    time,
    tag,
    tone: isDrop ? "critical" : "success",
  };
}

export function LiveTerminal() {
  const { state, dispatch } = useDemo();
  const [backendLines, setBackendLines] = useState<TerminalLine[]>([]);
  const [busy, setBusy] = useState(false);
  const cleared = useRef(new Set<string>());

  const { refresh } = usePoll(
    (signal) => liveApi.getLogs(signal),
    (d) => {
      const parsed = (d.logs ?? [])
        .map(toMinimalOutcomeLine)
        .filter((l): l is TerminalLine => l !== null && !cleared.current.has(l.id))
        .slice(-MAX_LINES);
      setBackendLines(parsed);
    },
    { intervalMs: 1000, enabled: state.mode === "live" },
  );

  const localLines = state.terminals[state.selectedDeviceId] ?? [];
  const combinedLines = useMemo(() => {
    const merged = [...localLines.filter((l) => !cleared.current.has(l.id)), ...backendLines];
    return merged.slice(-MAX_LINES);
  }, [localLines, backendLines]);

  const reset = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await liveApi.resetEnvironment();
      refresh();
      requestSync();
    } catch {
      // ignore
    } finally {
      setBusy(false);
    }
  };

  const actions = (
    <button
      type="button"
      onClick={reset}
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
      lines={combinedLines}
      onSubmit={() => {}}
      onClear={() => {
        for (const l of combinedLines) cleared.current.add(l.id);
        setBackendLines([]);
        dispatch({ type: "terminal_clear", deviceId: state.selectedDeviceId });
      }}
      actions={actions}
    />
  );
}
