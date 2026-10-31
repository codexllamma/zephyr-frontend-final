"use client";

import { useEffect } from "react";
import { useDemo } from "@/components/providers/DemoProvider";
import { Segmented } from "@/components/ui/Segmented";
import { CAMERA_OVERVIEW_EVENT } from "@/hooks/useScrollCamera";
import { SCENARIOS, SCENARIO_ORDER } from "@/data/scenarios";
import { cn } from "@/lib/cn";

export function ScenarioControls() {
  const { state, dispatch } = useDemo();
  const sc = state.scenario;
  const isRunning = sc.run === "running";

  const toggleSimulation = () => {
    if (isRunning) {
      dispatch({ type: "scenario_pause" });
    } else {
      dispatch({ type: "scenario_start" });
      window.dispatchEvent(new Event(CAMERA_OVERVIEW_EVENT));
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || !e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.key.toLowerCase() !== "r") return;
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || t.closest("[data-terminal]") || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      e.preventDefault();
      toggleSimulation();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="flex w-full flex-wrap items-center gap-3">
      <Segmented
        label="Scenario"
        value={sc.selected}
        disabled={isRunning}
        onChange={(id) => dispatch({ type: "select_scenario", id })}
        options={SCENARIO_ORDER.map((id) => ({ value: id, label: SCENARIOS[id].label }))}
      />

      <div className="ml-auto flex items-center justify-end gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={isRunning}
          onClick={toggleSimulation}
          className="inline-flex items-center gap-2.5 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-100 transition-colors hover:border-zinc-500"
        >
          <span>Simulation</span>
          <span
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
              isRunning ? "bg-green-600" : "bg-zinc-700",
            )}
          >
            <span
              className={cn(
                "inline-block size-3.5 transform rounded-full bg-white transition-transform",
                isRunning ? "translate-x-4" : "translate-x-1",
              )}
            />
          </span>
          <span className={cn("font-mono text-[11px]", isRunning ? "text-green-400" : "text-zinc-400")}>
            {isRunning ? "ON" : "OFF"}
          </span>
        </button>
      </div>
    </div>
  );
}
