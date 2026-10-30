"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Fragment, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Eraser, SquareTerminal } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import type { DeviceId, EventSeverity, TerminalLine, TerminalLineKind } from "@/types";

const KIND: Record<TerminalLineKind, string> = {
  command: "text-terminal-fg font-medium",
  output: "text-terminal-fg",
  error: "text-term-red",
  system: "text-term-yellow",
  log: "text-terminal-fg",
};

/** Tailwind text color class for log lines by tag (CMD = cyan, ALERT = red, SUCCESS = green, WARN = amber). */
function logLevelClass(tag: string | undefined, tone: EventSeverity | undefined): string {
  switch ((tag ?? "").toUpperCase()) {
    case "CMD":
      return "text-cyan-400";
    case "ALERT":
      return "text-red-400";
    case "SUCCESS":
      return "text-emerald-400";
    case "WARN":
      return "text-amber-400";
    case "RAW":
      return "text-terminal-fg";
    default:
      return tone === "critical"
        ? "text-red-400"
        : tone === "warning"
          ? "text-amber-400"
          : tone === "success"
            ? "text-emerald-400"
            : "text-terminal-fg";
  }
}

/** ANSI-style highlighting for command output (IPs, states, simulated markers). */
const TOKEN = /(\[(?:simulated|illustrative)[^\]]*\]|\b\d{1,3}(?:\.\d{1,3}){3}(?:\/\d+)?|\b(?:ACCEPT|UP|Up|LOWER_UP)\b|\b(?:DROP|REJECT|DOWN)\b|\b(?:eth0|lo|br-zephyr)\b|dpt:\d+|\b(?:pc-\d|ext-net|traffic-gen)\b)/g;
function tokenClass(t: string): string {
  if (t.startsWith("[")) return "text-term-yellow";
  if (/^\d/.test(t)) return "text-term-cyan";
  if (/^(ACCEPT|UP|Up|LOWER_UP)$/.test(t)) return "text-term-green";
  if (/^(DROP|REJECT|DOWN)$/.test(t)) return "text-term-red";
  return "text-term-magenta";
}
function colorize(text: string): ReactNode {
  return text.split(TOKEN).map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className={tokenClass(part)}>{part}</span>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

/**
 * Presentational terminal. It only renders lines and reports submitted input;
 * it never interprets or executes anything. The parent decides what a command
 * means (see lib/terminal.ts and lib/services).
 */
export function TerminalPanel({
  deviceId,
  lines,
  onSubmit,
  onClear,
  collapsed,
  onToggle,
  live,
  actions,
}: {
  deviceId: DeviceId;
  lines: TerminalLine[];
  onSubmit: (input: string) => void;
  onClear: () => void;
  collapsed: boolean;
  onToggle: () => void;
  /** Live backend log stream: input is disabled and the badge says LIVE. */
  live?: boolean;
  /** Extra header buttons (live mode). */
  actions?: ReactNode;
}) {
  const [value, setValue] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomAnchorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, collapsed]);

  const submit = () => {
    const input = value.trim();
    if (!input) return;
    setHistory((h) => (h[h.length - 1] === input ? h : [...h, input].slice(-50)));
    setCursor(null);
    setValue("");
    onSubmit(input);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "ArrowUp" && history.length) {
      e.preventDefault();
      const next = cursor === null ? history.length - 1 : Math.max(0, cursor - 1);
      setCursor(next);
      setValue(history[next]);
    } else if (e.key === "ArrowDown" && cursor !== null) {
      e.preventDefault();
      const next = cursor + 1;
      if (next >= history.length) {
        setCursor(null);
        setValue("");
      } else {
        setCursor(next);
        setValue(history[next]);
      }
    } else if (e.key === "l" && e.ctrlKey) {
      e.preventDefault();
      onClear();
    }
  };

  return (
    <section id="sim-terminal" data-terminal aria-label={`Terminal for ${deviceId}`} className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-terminal-bg">
      <header className="flex min-h-10 shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b border-border bg-surface px-3 py-1">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold text-fg-strong">
          <SquareTerminal aria-hidden className="size-4 text-muted" />
          Terminal
          <span className="font-mono text-xs font-normal text-muted">{deviceId}</span>
        </h2>
        <div className="flex flex-wrap items-center gap-1.5">
          {actions}
          {live ? (
            <Badge tone="success" title="Streaming the backend log (GET /api/v1/terminal/logs).">LIVE</Badge>
          ) : (
            <Badge tone="warning" title="Commands are looked up in a predefined table. Nothing runs in a real container.">SIMULATED</Badge>
          )}
          <button type="button" onClick={onClear} aria-label="Clear terminal" title="Clear terminal" className="grid h-7 w-7 place-items-center rounded text-muted hover:bg-hover hover:text-fg">
            <Eraser aria-hidden className="size-3.5" />
          </button>
          <button type="button" onClick={onToggle} aria-expanded={!collapsed} aria-label={collapsed ? "Expand terminal" : "Collapse terminal"} className="grid h-7 w-7 place-items-center rounded text-muted hover:bg-hover hover:text-fg">
            {collapsed ? <ChevronUp aria-hidden className="size-4" /> : <ChevronDown aria-hidden className="size-4" />}
          </button>
        </div>
      </header>
      {!collapsed && (
        <div
          className="flex h-64 min-h-0 flex-col font-mono text-xs"
          onClick={() => {
            if (!window.getSelection()?.toString()) inputRef.current?.focus();
          }}
        >
          <div ref={scrollRef} role="log" aria-live="polite" aria-label="Terminal output" className="min-h-0 flex-1 overflow-auto px-3 py-2">
            {lines.map((l) => (
              <div key={l.id} className={cn("whitespace-pre-wrap break-words leading-5", KIND[l.kind])}>
                {l.kind === "command" ? (
                  <>
                    <Prompt deviceId={deviceId} /> {l.text}
                  </>
                ) : l.kind === "log" ? (
                  <>
                    <span className="text-term-dim">{l.time}</span>{" "}
                    <span className={cn("font-semibold", logLevelClass(l.tag, l.tone))}>[{l.tag}]</span>{" "}
                    <span className={logLevelClass(l.tag, l.tone)}>{l.text}</span>
                  </>
                ) : (
                  colorize(l.text)
                )}
              </div>
            ))}
            <div ref={bottomAnchorRef} />
          </div>
          <label className="flex shrink-0 items-center gap-2 border-t border-border px-3 py-2">
            <span className="shrink-0"><Prompt deviceId={deviceId} /></span>
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={onKeyDown}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              aria-label={`Command input for ${deviceId}`}
              disabled={live}
              placeholder={live ? "live backend log: use the buttons above" : "type help"}
              className="min-w-0 flex-1 bg-transparent text-terminal-fg placeholder:text-term-dim focus:outline-none"
            />
          </label>
        </div>
      )}
    </section>
  );
}

/** Coloured prompt: user@host in green, path in blue, like a real shell. */
function Prompt({ deviceId }: { deviceId: DeviceId }) {
  return (
    <span>
      <span className="font-semibold text-term-green">root@{deviceId}</span>
      <span className="text-terminal-fg">:</span>
      <span className="font-semibold text-term-blue">/</span>
      <span className="text-terminal-fg">#</span>
    </span>
  );
}
