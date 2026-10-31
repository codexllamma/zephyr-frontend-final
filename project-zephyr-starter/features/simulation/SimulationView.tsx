"use client";

import { useDemo } from "@/components/providers/DemoProvider";
import { LLM_THINKING_STEPS } from "@/lib/terminal-feeds";
import { AlertModal } from "@/features/alerts/AlertModal";
import { LiveTerminal } from "./LiveTerminal";
import { LiveAttackControls } from "./LiveAttackControls";
import { TopologyCanvas } from "./TopologyCanvas";

export function SimulationView() {
  const { state } = useDemo();
  const isThinking = state.drama.phase === "thinking";
  const thinkingText = LLM_THINKING_STEPS[state.drama.thinkingStep] ?? LLM_THINKING_STEPS[0];

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
              className="flex shrink-0 items-center justify-between rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-200"
            >
              <span className="flex items-center gap-2.5 truncate">
                <span className="inline-block size-2 shrink-0 animate-pulse rounded-xs bg-amber-500" />
                <span className="truncate">{thinkingText}</span>
              </span>
              <span className="ml-3 shrink-0 tabular text-[11px] text-zinc-500">
                STEP {state.drama.thinkingStep + 1}/{LLM_THINKING_STEPS.length}
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
