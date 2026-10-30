"use client";

import { useDemo } from "@/components/providers/DemoProvider";

/** IDs of live CRITICAL alerts that still need attention and have not been viewed yet. */
export function useCriticalAlerts(): string[] {
  const { state } = useDemo();
  return state.cases
    .filter(
      (c) =>
        c.isLive &&
        c.alert.nids_llm_assessment.severity === "CRITICAL" &&
        !state.acknowledged.includes(c.id),
    )
    .map((c) => c.id);
}
