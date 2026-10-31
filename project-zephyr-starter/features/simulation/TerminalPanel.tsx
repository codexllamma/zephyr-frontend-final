"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Eraser } from "lucide-react";
import { cn } from "@/lib/cn";
import type { DeviceId, TerminalLine } from "@/types";

function renderOutcomeLine(l: TerminalLine): ReactNode {
  const raw = l.text.trim();

  if (l.isBanner || /^={5,}.*={5,}$/.test(raw)) {
    return (
      <div
        key={l.id}
        className="my-1 whitespace-pre-wrap break-words font-mono text-xs font-bold leading-5 tracking-wider text-green-400"
      >
        {raw}
      </div>
    );
  }

  if (l.rawOnly) {
    return (
      <div
        key={l.id}
        className={cn(
          "whitespace-pre-wrap break-words font-mono text-xs leading-5",
          l.tone === "critical"
            ? "text-red-400"
            : l.tone === "success"
              ? "text-green-400"
              : "text-zinc-300",
        )}
      >
        {raw}
      </div>
    );
  }

  const isDrop =
    l.tone === "critical" ||
    l.tag === "DROP" ||
    l.tag === "CRITICAL" ||
    /\b(CRITICAL|DROP|REJECT|BLOCK|SYN_FLOOD|FLOOD|ATTACK|DENIED)\b/i.test(raw);

  const isAccept =
    !isDrop &&
    (l.tone === "success" ||
      l.tag === "ACCEPT" ||
      l.tag === "HTTP 200 OK" ||
      /\b(ACCEPT|200\s*OK|HTTP\s*200|ENFORCED|NOMINAL|OK)\b/i.test(raw));

  const hasLeadingBracketTag = /^\[[^\]]+\]/.test(raw);
  const formattedBody = hasLeadingBracketTag
    ? raw
    : `[${isDrop ? (l.tag ?? "CRITICAL") : isAccept ? (l.tag ?? "HTTP 200 OK") : (l.tag ?? "INFO")}] ${raw}`;
  const fullLine = l.time ? `${l.time} ${formattedBody}` : formattedBody;

  return (
    <div
      key={l.id}
      className={cn(
        "whitespace-pre-wrap break-words font-mono text-xs leading-5",
        isDrop ? "text-red-400" : isAccept ? "text-green-400" : "text-zinc-300",
      )}
    >
      {fullLine}
    </div>
  );
}

export function TerminalPanel({
  deviceId,
  lines,
  onSubmit,
  onClear,
  live,
  actions,
}: {
  deviceId: DeviceId;
  lines: TerminalLine[];
  onSubmit: (input: string) => void;
  onClear: () => void;
  collapsed?: boolean;
  onToggle?: () => void;
  live?: boolean;
  actions?: ReactNode;
}) {
  const [value, setValue] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const visibleLines = lines.filter((l) => l.kind !== "system");
  const lastVisibleId = visibleLines[visibleLines.length - 1]?.id;

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [visibleLines.length, lastVisibleId]);

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
    <section
      id="sim-terminal"
      data-terminal
      aria-label={`Terminal for ${deviceId}`}
      className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-zinc-800 bg-zinc-950 font-mono shadow-none"
    >
      <header className="flex h-9 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-950 px-3">
        <span className="font-mono text-xs text-zinc-400">tty · {deviceId}</span>
        <div className="flex items-center gap-1.5">
          {actions}
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear terminal"
            title="Clear terminal"
            className="grid h-6 w-6 place-items-center rounded text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
          >
            <Eraser aria-hidden className="size-3.5" />
          </button>
        </div>
      </header>
      <div
        className="flex h-full min-h-0 flex-1 flex-col font-mono text-xs"
        onClick={() => {
          if (!window.getSelection()?.toString()) inputRef.current?.focus();
        }}
      >
        <div
          ref={scrollRef}
          role="log"
          aria-live="polite"
          aria-label="Terminal output"
          className="min-h-0 flex-1 overflow-y-auto px-3 py-2"
        >
          {visibleLines.map((l) =>
            l.kind === "command" ? (
              <div key={l.id} className="whitespace-pre-wrap break-words leading-5 text-zinc-200">
                <Prompt deviceId={deviceId} /> {l.text}
              </div>
            ) : l.kind === "output" || l.kind === "error" ? (
              <div
                key={l.id}
                className={cn(
                  "whitespace-pre-wrap break-words leading-5",
                  l.kind === "error" ? "text-red-400" : "text-zinc-300",
                )}
              >
                {l.text}
              </div>
            ) : (
              renderOutcomeLine(l)
            ),
          )}
        </div>
        {!live && (
          <label className="flex shrink-0 items-center gap-2 border-t border-zinc-800 bg-zinc-950 px-3 py-1.5">
            <span className="shrink-0">
              <Prompt deviceId={deviceId} />
            </span>
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={onKeyDown}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              aria-label={`Command input for ${deviceId}`}
              placeholder="command"
              className="min-w-0 flex-1 bg-transparent font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
            />
          </label>
        )}
      </div>
    </section>
  );
}

function Prompt({ deviceId }: { deviceId: DeviceId }) {
  return <span className="text-zinc-400">root@{deviceId}:~#</span>;
}
