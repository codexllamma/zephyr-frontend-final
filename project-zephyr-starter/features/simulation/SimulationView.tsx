"use client";

import { useDemo } from "@/components/providers/DemoProvider";
import { DEMO_THINKING_STEPS, LIVE_THINKING_STEPS } from "@/lib/terminal-feeds";
import { AlertModal } from "@/features/alerts/AlertModal";
import { LiveTerminal } from "./LiveTerminal";
import { LiveAttackControls } from "./LiveAttackControls";
import { TopologyCanvas } from "./TopologyCanvas";
import { cn } from "@/lib/cn";

export function SimulationView() {
  const { state } = useDemo();
  const isThinking = state.drama.phase === "thinking";
  const isLive = state.mode === "live";
  const steps = isLive ? LIVE_THINKING_STEPS : DEMO_THINKING_STEPS;
  const thinkingText = steps[state.drama.thinkingStep] ?? steps[0];

  return (
    <div className="mx-auto flex h-[calc(100dvh-var(--nav-h))] min-h-0 w-full max-w-[1600px] flex-1 flex-col gap-3 overflow-hidden p-3 sm:p-4">
      <div className="flex shrink-0 items-center rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2">
        <LiveAttackControls />
      </div>

      <div className="grid h-full min-h-0 flex-1 grid-cols-2 grid-rows-[minmax(0,1fr)] gap-4 overflow-hidden">
        <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
          <TopologyCanvas />
        </div>
        <div className="flex h-full min-h-0 min-w-0 flex-col gap-2 overflow-hidden">
          {isThinking && (
            <div
              role="status"
              aria-live="polite"
              className={cn(
                "flex shrink-0 items-center justify-between rounded-md border px-3 py-2 font-mono text-xs transition-colors",
                isLive
                  ? "border-emerald-800/80 bg-emerald-950/40 text-emerald-300"
                  : "border-amber-800/80 bg-amber-950/40 text-amber-300",
              )}
            >
              <span className="flex items-center gap-2.5 truncate">
                <span
                  className={cn(
                    "inline-block size-2 shrink-0 animate-pulse rounded-full",
                    isLive ? "bg-emerald-400" : "bg-amber-400",
                  )}
                />
                <span className="truncate font-semibold">{thinkingText}</span>
              </span>
              <span className="ml-3 shrink-0 tabular text-[11px] text-zinc-400">
                STEP {state.drama.thinkingStep + 1}/{steps.length}
              </span>
            </div>
          )}

          <LiveTerminal />
        </div>
      </div>

      <AlertModal />
    </div>
  );
}
