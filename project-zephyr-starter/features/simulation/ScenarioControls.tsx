"use client";

import { useEffect } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { useDemo } from "@/components/providers/DemoProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Segmented";
import { CAMERA_OVERVIEW_EVENT } from "@/hooks/useScrollCamera";
import { SCENARIOS, SCENARIO_ORDER } from "@/data/scenarios";

function scrollToActivity() {
  const tl = document.getElementById("event-timeline");
  const term = document.getElementById("sim-terminal");
  if (!tl && !term) return;
  const top = Math.min(...[tl, term].filter((x): x is HTMLElement => !!x).map((x) => x.getBoundingClientRect().top)) + window.scrollY;
  const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: Math.max(0, top - 72), behavior: smooth ? "smooth" : "auto" });
}

const RUN_BADGE = { idle: "Idle", running: "Running", paused: "Paused", completed: "Completed" } as const;

export function ScenarioControls() {
  const { state, dispatch } = useDemo();
  const sc = state.scenario;
  const def = SCENARIOS[sc.selected];
  const done = sc.completed.includes(sc.selected) && sc.run !== "running" && sc.run !== "paused";
  const runLabel = sc.run === "paused" ? "Resume" : done ? "Completed" : "Run Scenario";
  const canRun = sc.run !== "running" && !done;

  /** Run: pull the graph camera back to the full view, then scroll down to the timeline and terminal. */
  const run = () => {
    dispatch({ type: "scenario_start" });
    window.dispatchEvent(new Event(CAMERA_OVERVIEW_EVENT));
    window.setTimeout(scrollToActivity, 900);
  };

  // Shift+R triggers the same Run button (ignored while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || !e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.key.toLowerCase() !== "r") return;
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || t.closest("[data-terminal]") || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      if (!canRun) return;
      e.preventDefault();
      run();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Scenario"
          value={sc.selected}
          disabled={sc.run === "running"}
          onChange={(id) => dispatch({ type: "select_scenario", id })}
          options={SCENARIO_ORDER.map((id) => ({ value: id, label: SCENARIOS[id].label }))}
        />
        <div className="flex items-center gap-1.5">
          <Button variant="primary" size="sm" onClick={run} disabled={!canRun} title="Shift + R">
            <Play aria-hidden className="size-3.5" /> {runLabel}
          </Button>
          <Button size="sm" onClick={() => dispatch({ type: "scenario_pause" })} disabled={sc.run !== "running"}>
            <Pause aria-hidden className="size-3.5" /> Pause
          </Button>
          <Button size="sm" onClick={() => dispatch({ type: "reset" })} aria-label="Reset demo">
            <RotateCcw aria-hidden className="size-3.5" /> Reset Demo
          </Button>
        </div>
        <Badge tone={sc.run === "running" ? "accent" : sc.run === "completed" ? "success" : "neutral"}>
          {RUN_BADGE[sc.run]}
          {sc.run !== "idle" && ` · step ${Math.min(sc.stepIndex, def.steps.length)}/${def.steps.length}`}
        </Badge>
      </div>
    </div>
  );
}
