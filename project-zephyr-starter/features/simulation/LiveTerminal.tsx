"use client";

import { useRef, useState } from "react";
import { RotateCcw, ShieldQuestion } from "lucide-react";
import { useDemo } from "@/components/providers/DemoProvider";
import { Button } from "@/components/ui/Button";
import { requestSync } from "@/hooks/useBackendSync";
import { usePoll } from "@/hooks/usePoll";
import { fmtTime } from "@/lib/format";
import { liveApi } from "@/lib/services/live";
import type { EventSeverity, TerminalLine } from "@/types";
import type { BackendLogEntry } from "@/types/backend";
import { TerminalPanel } from "./TerminalPanel";

const RULES_NODE = "pc-4";
const MAX_LINES = 300;

function toneOf(level: string | undefined): EventSeverity {
  switch ((level ?? "").toUpperCase()) {
    case "WARN":
    case "WARNING":
      return "warning";
    case "ALERT":
    case "ERROR":
    case "CRITICAL":
    case "FATAL":
      return "critical";
    case "SUCCESS":
    case "OK":
      return "success";
    case "CMD":
    default:
      return "info";
  }
}

function toLine(e: BackendLogEntry): TerminalLine {
  const ts = e.timestamp ?? "";
  return {
    id: `be-${e.id}`,
    kind: "log",
    text: e.text,
    time: /^\d{4}-\d{2}-\d{2}T/.test(ts) ? fmtTime(ts) : ts,
    tag: (e.level ?? "log").toUpperCase(),
    tone: toneOf(e.level),
  };
}

/** Live container terminal: streams GET /api/v1/terminal/logs, plus rules check and environment reset. */
export function LiveTerminal({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { state, dispatch } = useDemo();
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [busy, setBusy] = useState<"rules" | "reset" | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const cleared = useRef(new Set<string>());
  const confirmTimer = useRef<number | undefined>(undefined);

  const { refresh } = usePoll(
    (signal) => liveApi.getLogs(signal),
    (d) => setLines((d.logs ?? []).map(toLine).filter((l) => !cleared.current.has(l.id)).slice(-MAX_LINES)),
    { intervalMs: 1000, enabled: true },
  );

  const toast = (tone: "success" | "danger", title: string, message?: string) => dispatch({ type: "toast_push", tone, title, message });

  const verifyRules = async () => {
    if (busy) return;
    setBusy("rules");
    try {
      await liveApi.getRules(RULES_NODE);
      toast("success", `Firewall rules requested (${RULES_NODE})`, "The iptables output is streaming into the terminal.");
      refresh();
    } catch (e) {
      toast("danger", "Could not read firewall rules", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(null);
    }
  };

  const reset = async () => {
    if (busy) return;
    if (!confirmReset) {
      setConfirmReset(true);
      window.clearTimeout(confirmTimer.current);
      confirmTimer.current = window.setTimeout(() => setConfirmReset(false), 5000);
      return;
    }
    window.clearTimeout(confirmTimer.current);
    setConfirmReset(false);
    setBusy("reset");
    try {
      await liveApi.resetEnvironment();
      toast("success", "Environment reset", "Firewall rules flushed, attack processes stopped, state cleared.");
      refresh();
      requestSync();
    } catch (e) {
      toast("danger", "Reset failed", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(null);
    }
  };

  const actions = (
    <>
      <Button size="sm" onClick={verifyRules} disabled={!!busy} title={`GET /api/v1/terminal/rules?node=${RULES_NODE}`}>
        <ShieldQuestion aria-hidden className="size-3.5" /> <span className="hidden sm:inline">Verify Firewall Rules ({RULES_NODE})</span>
        <span className="sm:hidden">Rules</span>
      </Button>
      <Button
        size="sm"
        variant={confirmReset ? "danger" : "secondary"}
        onClick={reset}
        disabled={busy === "rules"}
        title="Flushes all container firewall rules, stops attack processes and resets backend state"
      >
        <RotateCcw aria-hidden className="size-3.5" />
        {busy === "reset" ? "Resetting…" : confirmReset ? "Confirm reset?" : <><span className="hidden sm:inline">Reset Environment</span><span className="sm:hidden">Reset</span></>}
      </Button>
    </>
  );

  return (
    <TerminalPanel
      live
      deviceId={state.selectedDeviceId}
      lines={lines}
      onSubmit={() => {}}
      onClear={() => {
        for (const l of lines) cleared.current.add(l.id);
        setLines([]);
      }}
      collapsed={collapsed}
      onToggle={onToggle}
      actions={actions}
    />
  );
}
