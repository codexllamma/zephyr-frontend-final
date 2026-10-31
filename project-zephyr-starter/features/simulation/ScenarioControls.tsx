"use client";

import { useEffect } from "react";
import { Crosshair } from "lucide-react";
import { useDemo } from "@/components/providers/DemoProvider";
import { Segmented } from "@/components/ui/Segmented";
import { CAMERA_OVERVIEW_EVENT } from "@/hooks/useScrollCamera";
import { SCENARIOS, SCENARIO_ORDER } from "@/data/scenarios";
import { LLM_THINKING_DURATION_MS } from "@/lib/terminal-feeds";

export function ScenarioControls() {
  const { state, dispatch } = useDemo();
  const sc = state.scenario;
  const isThinking = state.drama.phase === "thinking";
  const isRunning = sc.run === "running" || isThinking;

  const launchThreat = () => {
    if (isThinking) return;
    const now = Date.now();
    dispatch({
      type: "drama_attack_start",
      sourceNode: "ext-net",
      targetNode: "pc-4",
      targetPort: 80,
      protocol: "TCP",
      threatSignature: "TCP_SYN_VOLUMETRIC",
      nowMs: now,
    });
    window.dispatchEvent(new Event(CAMERA_OVERVIEW_EVENT));
    window.setTimeout(() => {
      dispatch({
        type: "drama_offline_fallback",
        sourceNode: "ext-net",
        targetNode: "pc-4",
        variant: "A",
        threatSignature: "TCP_SYN_VOLUMETRIC",
        targetPort: 80,
        protocol: "TCP",
        nowMs: Date.now(),
      });
    }, LLM_THINKING_DURATION_MS);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || !e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.key.toLowerCase() !== "r") return;
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || t.closest("[data-terminal]") || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      e.preventDefault();
      launchThreat();
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
          disabled={isThinking}
          onClick={launchThreat}
          className="inline-flex h-8 items-center gap-2 rounded-md border border-red-800 bg-red-700 px-3.5 text-xs font-bold tracking-wide text-zinc-100 transition-colors hover:bg-red-600 active:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Crosshair aria-hidden className="size-3.5" />
          <span>{isThinking ? "Threat Active..." : "Launch Threat"}</span>
        </button>
      </div>
    </div>
  );
}
