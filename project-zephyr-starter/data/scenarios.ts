import { BASELINE_FLOWS } from "@/data/devices";
import type { NetworkFlow, ScenarioDefinition, ScenarioId } from "@/types";

/**
 * DEMO DATA — deterministic scenario scripts. Each step applies a list of
 * effects to the shared demo state; nothing here is real traffic.
 */

const NORMAL_EXTRA_FLOWS: NetworkFlow[] = [
  { id: "flow-norm-a", from: "pc-1", to: "pc-3", port: 80, protocol: "HTTP", pps: 35, pattern: "routine" },
  { id: "flow-norm-b", from: "pc-2", to: "pc-1", port: 445, protocol: "TCP", pps: 18, pattern: "routine" },
];

const FLASH_FLOW: NetworkFlow = {
  id: "flow-flash",
  from: "pc-5",
  to: "pc-3",
  port: 443,
  protocol: "TCP",
  pps: 1381,
  pattern: "surge",
};

const SUSPICIOUS_FLOW: NetworkFlow = {
  id: "flow-suspicious",
  from: "pc-5",
  to: "pc-3",
  port: 80,
  protocol: "TCP",
  pps: 2710,
  pattern: "suspicious",
};

export const SCENARIOS: Record<ScenarioId, ScenarioDefinition> = {
  normal: {
    id: "normal",
    label: "Normal Traffic",
    summary: "Routine activity across the five containers. Nothing suspicious: the NIDS stays quiet.",
    takeaway: "A quiet network produces no alerts and requires no action.",
    steps: [
      {
        id: "start",
        delayMs: 400,
        advanceSec: 0,
        effects: [
          { type: "event", kind: "scenario", actor: "system", severity: "info", message: "Scenario started: Normal Traffic (demo simulation)" },
          { type: "toast", tone: "info", title: "Scenario started", message: "Normal Traffic · demo simulation" },
        ],
      },
      {
        id: "routine",
        delayMs: 1200,
        advanceSec: 4,
        effects: [
          { type: "set_flows", flows: [...BASELINE_FLOWS, ...NORMAL_EXTRA_FLOWS] },
          { type: "event", kind: "traffic", actor: "system", severity: "info", message: "Routine traffic across br-zephyr: 5 containers, 6 active flows" },
        ],
      },
      {
        id: "window-1",
        delayMs: 1400,
        advanceSec: 2,
        effects: [{ type: "event", kind: "alert", actor: "nids", severity: "success", message: "NIDS window 1 analysed (2s): no anomalies detected" }],
      },
      {
        id: "window-2",
        delayMs: 1400,
        advanceSec: 2,
        effects: [{ type: "event", kind: "alert", actor: "nids", severity: "success", message: "NIDS window 2 analysed (2s): no anomalies detected" }],
      },
      {
        id: "window-3",
        delayMs: 1400,
        advanceSec: 2,
        effects: [{ type: "event", kind: "alert", actor: "nids", severity: "success", message: "NIDS window 3 analysed (2s): no anomalies detected" }],
      },
      {
        id: "done",
        delayMs: 900,
        advanceSec: 1,
        effects: [{ type: "event", kind: "scenario", actor: "system", severity: "success", message: "Scenario complete: no suspicious action required" }],
      },
    ],
  },

  flash_sale: {
    id: "flash_sale",
    label: "Flash-Sale Surge",
    summary: "A legitimate burst of shoppers hits the storefront. Volume spikes, but nothing is malicious.",
    takeaway: "High traffic alone does not prove an attack. Zephyr proposes NO_OP and explains why blocking would hurt customers.",
    steps: [
      {
        id: "start",
        delayMs: 400,
        advanceSec: 0,
        effects: [
          { type: "event", kind: "scenario", actor: "system", severity: "info", message: "Scenario started: Flash-Sale Surge (demo simulation)" },
          { type: "toast", tone: "info", title: "Scenario started", message: "Flash-Sale Surge · demo simulation" },
        ],
      },
      {
        id: "surge",
        delayMs: 1500,
        advanceSec: 6,
        effects: [
          { type: "set_flows", flows: [FLASH_FLOW] },
          { type: "event", kind: "traffic", actor: "system", severity: "warning", message: "Traffic to pc-3:443 rose from ~140 to ~1,380 packets/s (source pc-5)", deviceId: "pc-3" },
        ],
      },
      {
        id: "alert",
        delayMs: 1700,
        advanceSec: 4,
        effects: [
          { type: "create_case", caseKey: "flash_sale" },
          { type: "set_device", deviceId: "pc-3", patch: { status: "under_review" } },
        ],
      },
      {
        id: "proposal",
        delayMs: 1700,
        advanceSec: 5,
        effects: [{ type: "reveal_attempt", caseKey: "flash_sale", attemptIndex: 1 }],
      },
      {
        id: "done",
        delayMs: 900,
        advanceSec: 2,
        effects: [{ type: "event", kind: "scenario", actor: "system", severity: "info", message: "Scenario complete: awaiting human review in Alerts & Review", deviceId: "pc-3" }],
      },
    ],
  },

  suspicious: {
    id: "suspicious",
    label: "Suspicious Traffic",
    summary: "pc-5 floods the storefront with connection-start packets. Zephyr proposes a response and the Critic checks it before a human decides.",
    takeaway: "Unsafe proposals are rejected by deterministic code and corrected. Only a validated action reaches human review.",
    steps: [
      {
        id: "start",
        delayMs: 400,
        advanceSec: 0,
        effects: [
          { type: "event", kind: "scenario", actor: "system", severity: "info", message: "Scenario started: Suspicious Traffic (demo simulation)" },
          { type: "toast", tone: "info", title: "Scenario started", message: "Suspicious Traffic · demo simulation" },
        ],
      },
      {
        id: "burst",
        delayMs: 1500,
        advanceSec: 6,
        effects: [
          { type: "set_flows", flows: [SUSPICIOUS_FLOW] },
          { type: "set_device", deviceId: "pc-5", patch: { status: "suspicious" } },
          { type: "event", kind: "traffic", actor: "system", severity: "critical", message: "Unusual burst: pc-5 → pc-3:80 at ~2,710 packets/s, nearly all SYN", deviceId: "pc-5" },
        ],
      },
      {
        id: "alert",
        delayMs: 1700,
        advanceSec: 4,
        effects: [
          { type: "create_case", caseKey: "suspicious_syn" },
          { type: "set_device", deviceId: "pc-3", patch: { status: "under_review" } },
        ],
      },
      {
        id: "attempt-1",
        delayMs: 1800,
        advanceSec: 5,
        effects: [{ type: "reveal_attempt", caseKey: "suspicious_syn", attemptIndex: 1 }],
      },
      {
        id: "attempt-2",
        delayMs: 1800,
        advanceSec: 6,
        effects: [{ type: "reveal_attempt", caseKey: "suspicious_syn", attemptIndex: 2 }],
      },
      {
        id: "done",
        delayMs: 900,
        advanceSec: 2,
        effects: [{ type: "event", kind: "scenario", actor: "system", severity: "info", message: "Scenario complete: awaiting human review in Alerts & Review", deviceId: "pc-3" }],
      },
    ],
  },
};

export const SCENARIO_ORDER: ScenarioId[] = ["normal", "flash_sale", "suspicious"];
