"use client";

import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from "react";
import { SCENARIOS } from "@/data/scenarios";
import { useBackendSync } from "@/hooks/useBackendSync";
import { createInitialState, demoReducer, type DemoAction, type DemoState } from "@/lib/demo-state";
import { LLM_THINKING_DURATION_MS, LLM_THINKING_STEPS, LLM_THINKING_STEP_MS } from "@/lib/terminal-feeds";

/**
 * One provider, mounted in the root layout, so the simulation, alerts,
 * training records and architecture trace all read the same state and it
 * survives client-side navigation between tabs.
 */

interface DemoContextValue {
  state: DemoState;
  dispatch: (action: DemoAction) => void;
}

const DemoContext = createContext<DemoContextValue | null>(null);

const PIPELINE_STEP_MS = 1500;
const PIPELINE_STAGES = new Set(["validating", "approved", "executing"]);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(demoReducer, undefined, createInitialState);

  // Live mode: mirror the FastAPI backend (no-op in demo mode).
  useBackendSync(dispatch);

  // 14-Second "LLM Thinking" state machine: advances status message every 3s across 5 steps.
  const { phase: dramaPhase, attackEpoch } = state.drama;
  useEffect(() => {
    if (dramaPhase !== "thinking") return;

    const stepTimers: number[] = [];
    for (let step = 1; step < LLM_THINKING_STEPS.length; step++) {
      stepTimers.push(
        window.setTimeout(() => {
          dispatch({ type: "drama_thinking_step", step });
        }, step * LLM_THINKING_STEP_MS),
      );
    }

    const doneTimer = window.setTimeout(() => {
      dispatch({ type: "drama_thinking_complete" });
    }, LLM_THINKING_DURATION_MS);

    return () => {
      stepTimers.forEach((id) => window.clearTimeout(id));
      window.clearTimeout(doneTimer);
    };
  }, [dramaPhase, attackEpoch]);

  // Scenario runner: applies the next step after its delay while "running".
  const { run, stepIndex, selected } = state.scenario;
  useEffect(() => {
    if (run !== "running") return;
    const step = SCENARIOS[selected].steps[stepIndex];
    if (!step) return;
    const id = window.setTimeout(() => dispatch({ type: "scenario_step" }), step.delayMs);
    return () => window.clearTimeout(id);
  }, [run, stepIndex, selected]);

  // Review pipeline: approved cases move through validate -> execute on a timer.
  const pipelineKey = state.cases
    .filter((c) => PIPELINE_STAGES.has(c.stage))
    .map((c) => `${c.id}:${c.stage}`)
    .join("|");
  useEffect(() => {
    if (!pipelineKey) return;
    const ids = pipelineKey.split("|").map((k) => k.split(":")[0]);
    const timers = ids.map((caseId) => window.setTimeout(() => dispatch({ type: "pipeline_advance", caseId }), PIPELINE_STEP_MS));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [pipelineKey]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo(): DemoContextValue {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error("useDemo must be used inside <DemoProvider>");
  return ctx;
}
