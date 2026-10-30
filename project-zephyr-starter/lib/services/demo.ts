import { buildEnvelope } from "@/data/builders";
import { BENCHMARK_SNAPSHOT } from "@/data/benchmarks";
import { DEVICES, REVIEWER } from "@/data/devices";
import { SCENARIOS, SCENARIO_ORDER } from "@/data/scenarios";
import { buildSeedCases } from "@/data/seed-cases";
import { inferExpectedClass, runCritic } from "@/lib/critic";
import { runSimulatedCommand } from "@/lib/terminal";
import { selectDecisions, selectTrainingPairs } from "@/lib/selectors";
import type { ReviewState, ReviewStatus } from "@/types";
import type { ZephyrServices } from "./types";

/**
 * Demo provider: answers from local fixtures and simulation. Nothing here
 * talks to Docker, a GPU, a packet capture or a firewall.
 */

const STATUS_FOR_DECISION: Record<string, ReviewStatus> = {
  approve: "approved",
  reject: "rejected",
  request_revision: "revision_requested",
  mark_benign: "marked_benign",
};

export const demoServices: ZephyrServices = {
  mode: "demo",

  topology: {
    getDevices: async () => DEVICES,
  },
  scenarios: {
    list: async () => SCENARIO_ORDER.map((id) => SCENARIOS[id]),
  },
  alerts: {
    list: async () => buildSeedCases(),
    get: async (alertId) => buildSeedCases().find((c) => c.id === alertId) ?? null,
  },
  terminal: {
    run: async (deviceId, input, ctx) => runSimulatedCommand(deviceId, input, ctx),
  },
  mitigation: {
    // The demo "model" is a deterministic template, not real inference.
    propose: async (alert) => buildEnvelope(alert, inferExpectedClass(alert)),
  },
  critic: {
    validate: async (envelope, alert) => runCritic(envelope, alert),
  },
  review: {
    submit: async (_alertId, decision, note) =>
      ({
        status: STATUS_FOR_DECISION[decision],
        reviewer: REVIEWER,
        note,
      }) satisfies ReviewState,
  },
  execution: {
    execute: async () => ({
      status: "confirmed",
      simulated: true,
      message: "Simulated execution: no firewall rule was applied to a real container.",
    }),
  },
  training: {
    listPairs: async () => selectTrainingPairs(buildSeedCases()),
  },
  decisions: {
    list: async () => selectDecisions(buildSeedCases()),
  },
  evaluation: {
    getBenchmarkSnapshot: async () => BENCHMARK_SNAPSHOT,
  },
};
