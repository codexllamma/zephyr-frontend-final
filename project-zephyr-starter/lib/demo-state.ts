import { LIVE_CASE_BUILDERS } from "@/data/live-cases";
import { BASELINE_FLOWS, NODE_IP, REVIEWER, SIM_EPOCH_MS, initialDeviceRuntime } from "@/data/devices";
import { SCENARIOS } from "@/data/scenarios";
import { buildSeedCases, makeAttempt } from "@/data/seed-cases";
import { criticPassed, runCritic } from "@/lib/critic";
import { fmtTime, isoFromMs, shortId } from "@/lib/format";
import { terminalBanner, type TerminalOutputLine } from "@/lib/terminal";
import { currentAttempt } from "@/lib/selectors";
import { LIVE } from "@/lib/config";
import { mapNetworkStatus, pendingToCase, pendingToFlows } from "@/lib/live-map";
import type { BackendPendingItem, BackendSnapshot, VariantMode } from "@/types/backend";
import { DEVICE_IDS, EXT_NODE_IDS } from "@/types";
import type {
  AlertCase,
  DeviceId,
  DeviceRuntime,
  DramaState,
  EventSeverity,
  ExtNodeId,
  LifecycleStage,
  NetworkFlow,
  NodeId,
  PostmortemCard,
  Protocol,
  ReviewDecision,
  ScenarioEffect,
  ScenarioId,
  ScenarioRunState,
  TerminalLine,
  Toast,
  ToastTone,
} from "@/types";

export const LIVE_NODE_IPS: Record<NodeId, string> = {
  "pc-1": "172.28.0.12",
  "pc-2": "172.28.0.13",
  "pc-3": "172.28.0.14",
  "pc-4": "172.28.0.15",
  "pc-5": "172.28.0.16",
  "ext-net": "172.28.0.100",
  "traffic-gen": "172.28.0.101",
};

export interface DemoState {
  clockMs: number;
  seq: number;
  devices: Record<DeviceId, DeviceRuntime>;
  flows: NetworkFlow[];
  selectedDeviceId: DeviceId;
  scenario: {
    selected: ScenarioId;
    run: ScenarioRunState;
    stepIndex: number;
    completed: ScenarioId[];
  };
  cases: AlertCase[];
  liveCaseIds: Record<string, string>;
  selectedAlertId: string | null;
  terminals: Record<DeviceId, TerminalLine[]>;
  acknowledged: string[];
  toasts: Toast[];
  mode: "demo" | "live";
  isLiveMode?: boolean;
  backend: BackendState;
  extNodes: Record<ExtNodeId, DeviceRuntime>;
  drama: DramaState;
}

export interface BackendState {
  link: "connecting" | "online" | "error";
  error?: string;
  lastSyncAt?: string;
  executedCount: number;
}

export type DemoAction =
  | { type: "set_mode"; mode: "demo" | "live" }
  | { type: "set_live_mode"; isLive: boolean }
  | { type: "toggle_live_mode" }
  | { type: "select_device"; id: DeviceId }
  | { type: "select_alert"; id: string | null }
  | { type: "select_scenario"; id: ScenarioId }
  | { type: "scenario_start" }
  | { type: "scenario_pause" }
  | { type: "scenario_step" }
  | { type: "reset" }
  | { type: "review"; caseId: string; decision: ReviewDecision; note?: string }
  | { type: "return_to_queue"; caseId: string }
  | { type: "pipeline_advance"; caseId: string }
  | { type: "rerun_critic"; caseId: string }
  | { type: "terminal_result"; deviceId: DeviceId; command: string; lines: TerminalOutputLine[]; clear?: boolean }
  | { type: "terminal_clear"; deviceId: DeviceId }
  | { type: "ack_alerts"; ids: string[] }
  | { type: "live_sync"; snapshot: BackendSnapshot; nowMs: number }
  | { type: "live_error"; message: string; nowMs: number }
  | { type: "live_resolved"; alertId: string; approved: boolean; status: string; cmd?: string; postmortem?: PostmortemCard; nowMs: number }
  | { type: "live_attack"; message: string; nowMs: number }
  | { type: "live_envelope_received"; item: BackendPendingItem; nowMs: number }
  | {
      type: "drama_attack_start";
      sourceNode: NodeId;
      targetNode: DeviceId;
      targetPort?: number;
      protocol?: Protocol;
      threatSignature?: string;
      nowMs: number;
    }
  | { type: "drama_thinking_step"; step: number }
  | { type: "drama_thinking_complete" }
  | {
      type: "drama_offline_fallback";
      sourceNode: NodeId;
      targetNode: DeviceId;
      variant: VariantMode;
      threatSignature: string;
      targetPort: number;
      protocol: Protocol;
      nowMs: number;
    }
  | { type: "toast_push"; tone: ToastTone; title: string; message?: string }
  | { type: "toast_dismiss"; id: string };

export function createInitialDrama(attackEpoch = 0, mitigationEpoch = 0): DramaState {
  return {
    phase: "idle",
    attackEpoch,
    mitigationEpoch,
    startedAtMs: null,
    thinkingStep: 0,
    sourceNode: "ext-net",
    targetNode: "pc-4",
    sourceIp: LIVE_NODE_IPS["ext-net"],
    targetIp: LIVE_NODE_IPS["pc-4"],
    targetPort: 80,
    protocol: "TCP",
    threatSignature: "TCP_SYN_VOLUMETRIC",
  };
}

function resolveNodeIp(s: DemoState, id: NodeId): string {
  if ((DEVICE_IDS as readonly string[]).includes(id)) {
    return s.devices[id as DeviceId]?.ip ?? LIVE_NODE_IPS[id] ?? NODE_IP[id as DeviceId] ?? "172.28.0.15";
  }
  return s.extNodes[id as ExtNodeId]?.ip ?? LIVE_NODE_IPS[id] ?? "172.28.0.100";
}

function bannerLines(deviceId: DeviceId, startSeq: number): TerminalLine[] {
  return terminalBanner(deviceId).map((l, i) => ({
    id: `t-${startSeq}-${deviceId}-${i}`,
    ...l,
    time: "10:30:00",
    tag: "ACCEPT",
    tone: "success",
  }));
}

function createLiveState(): DemoState {
  const base = createDemoState();
  const devices = Object.fromEntries(
    DEVICE_IDS.map((d) => [d, { status: "healthy", ip: LIVE_NODE_IPS[d] } as DeviceRuntime]),
  ) as Record<DeviceId, DeviceRuntime>;
  return {
    ...base,
    mode: "live",
    isLiveMode: true,
    devices,
    flows: [],
    cases: [],
    selectedDeviceId: "pc-4",
    backend: { link: "connecting", executedCount: 0 },
    extNodes: {
      "ext-net": { status: "healthy", ip: LIVE_NODE_IPS["ext-net"] },
      "traffic-gen": { status: "healthy", ip: LIVE_NODE_IPS["traffic-gen"] },
    },
    drama: createInitialDrama(),
  };
}

export function createInitialState(): DemoState {
  return LIVE ? createLiveState() : createDemoState();
}

function createDemoState(): DemoState {
  const terminals = Object.fromEntries(DEVICE_IDS.map((d) => [d, bannerLines(d, 0)])) as Record<DeviceId, TerminalLine[]>;
  return {
    clockMs: SIM_EPOCH_MS,
    seq: 1,
    devices: initialDeviceRuntime(),
    flows: BASELINE_FLOWS.map((f) => ({ ...f })),
    selectedDeviceId: "pc-3",
    scenario: { selected: "suspicious", run: "idle", stepIndex: 0, completed: [] },
    cases: buildSeedCases(),
    liveCaseIds: {},
    selectedAlertId: null,
    terminals,
    acknowledged: [],
    toasts: [],
    mode: "demo",
    isLiveMode: false,
    backend: { link: "online", executedCount: 0 },
    extNodes: {
      "ext-net": { status: "healthy", ip: LIVE_NODE_IPS["ext-net"] },
      "traffic-gen": { status: "healthy", ip: LIVE_NODE_IPS["traffic-gen"] },
    },
    drama: createInitialDrama(),
  };
}

const nowIso = (s: DemoState) => isoFromMs(s.clockMs);

function tick(s: DemoState, sec: number): DemoState {
  return sec ? { ...s, clockMs: s.clockMs + sec * 1000 } : s;
}

function addToast(s: DemoState, tone: ToastTone, title: string, message?: string): DemoState {
  const toast: Toast = { id: `toast-${s.seq}`, tone, title, message };
  return { ...s, seq: s.seq + 1, toasts: [...s.toasts, toast].slice(-3) };
}

function appendPacketOutcome(
  s: DemoState,
  action: "ACCEPT" | "DROP",
  detail: string,
): DemoState {
  const tone: EventSeverity = action === "DROP" ? "critical" : "success";
  const logLine: TerminalLine = {
    id: `pkt-${s.seq}`,
    kind: "log",
    text: `[${action}] ${detail}`,
    time: fmtTime(nowIso(s)),
    tag: action,
    tone,
  };
  const terminals = Object.fromEntries(
    DEVICE_IDS.map((d) => [d, [...s.terminals[d], logLine].slice(-300)]),
  ) as Record<DeviceId, TerminalLine[]>;
  return { ...s, seq: s.seq + 1, terminals };
}

function updateCase(s: DemoState, id: string, fn: (c: AlertCase) => AlertCase): DemoState {
  return { ...s, cases: s.cases.map((c) => (c.id === id ? fn(c) : c)) };
}

function setDevice(s: DemoState, id: DeviceId, patch: Partial<DeviceRuntime>): DemoState {
  return { ...s, devices: { ...s.devices, [id]: { ...s.devices[id], ...patch } } };
}

function matchesFlow(f: NetworkFlow, c: AlertCase): boolean {
  return f.from === c.alert.source_node && f.to === c.alert.target_node && f.port === c.alert.dest_port;
}

function applyEffect(s: DemoState, fx: ScenarioEffect): DemoState {
  switch (fx.type) {
    case "set_flows": {
      const byId = new Map(s.flows.map((f) => [f.id, f]));
      for (const f of fx.flows) byId.set(f.id, { ...f });
      let next: DemoState = { ...s, flows: [...byId.values()] };
      for (const f of fx.flows) {
        const srcIp = NODE_IP[f.from as DeviceId] ?? "172.28.0.100";
        const dstIp = NODE_IP[f.to] ?? "172.28.0.14";
        const isDrop = f.pattern === "suspicious" || f.pattern === "blocked";
        next = appendPacketOutcome(next, isDrop ? "DROP" : "ACCEPT", `${srcIp} -> ${dstIp}:${f.port} PROTO=${f.protocol}`);
      }
      return next;
    }
    case "set_device":
      return setDevice(s, fx.deviceId, fx.patch);
    case "event": {
      if (fx.kind === "alert" && fx.severity === "success") {
        return appendPacketOutcome(s, "ACCEPT", "172.28.0.11 -> 172.28.0.13:80 PROTO=TCP");
      }
      return s;
    }
    case "toast":
      return addToast(s, fx.tone, fx.title, fx.message);
    case "set_stage": {
      const id = s.liveCaseIds[fx.caseKey];
      return id ? updateCase(s, id, (c) => ({ ...c, stage: fx.stage })) : s;
    }
    case "create_case": {
      const build = LIVE_CASE_BUILDERS[fx.caseKey];
      if (!build || s.liveCaseIds[fx.caseKey]) return s;
      const tpl = build(nowIso(s));
      const c: AlertCase = {
        id: tpl.alert.alert_id,
        alert: tpl.alert,
        scenario: tpl.scenario,
        summary: tpl.summary,
        evidence: tpl.evidence,
        attempts: [],
        stage: "detected",
        review: { status: "pending" },
        execution: { status: "not_started", simulated: true },
        provenance: "demo",
        isLive: true,
      };
      let next: DemoState = {
        ...s,
        cases: [...s.cases, c],
        liveCaseIds: { ...s.liveCaseIds, [fx.caseKey]: c.id },
        selectedAlertId: c.id,
      };
      const isBenign = tpl.alert.nids_llm_assessment.severity === "LOW";
      next = appendPacketOutcome(
        next,
        isBenign ? "ACCEPT" : "DROP",
        `${tpl.alert.source_ip} -> ${tpl.alert.target_ip}:${tpl.alert.dest_port} PROTO=${tpl.alert.protocol ?? "TCP"}`,
      );
      return next;
    }
    case "reveal_attempt": {
      const id = s.liveCaseIds[fx.caseKey];
      const tpl = LIVE_CASE_BUILDERS[fx.caseKey];
      const existing = s.cases.find((c) => c.id === id);
      if (!id || !tpl || !existing) return s;
      if (existing.attempts.some((a) => a.index === fx.attemptIndex)) return s;
      const built = tpl(existing.alert.timestamp);
      const envelope = built.envelopes[fx.attemptIndex - 1];
      if (!envelope) return s;
      const attempt = makeAttempt(fx.attemptIndex, existing.alert, envelope, nowIso(s));
      let next = updateCase(s, id, (c) => ({
        ...c,
        attempts: [...c.attempts, attempt],
        stage: attempt.passed ? "awaiting_review" : c.stage,
      }));
      next = tick(next, 1);
      return next;
    }
    default:
      return s;
  }
}

type Outcome = "blocked" | "limited" | "accepted" | "benign";

function applyNetworkOutcome(s: DemoState, c: AlertCase, outcome: Outcome): DemoState {
  if (!c.isLive) return s;
  const { source_node: src, target_node: dst, source_ip: srcIp, target_ip: dstIp, dest_port: port, protocol } = c.alert;
  const proto = protocol ?? "TCP";
  let next: DemoState = { ...s };
  switch (outcome) {
    case "blocked":
      next.flows = s.flows.map((f) => (matchesFlow(f, c) ? { ...f, pattern: "blocked", pps: 0 } : f));
      next = setDevice(next, dst, { status: "mitigated" });
      next = appendPacketOutcome(next, "DROP", `${srcIp} -> ${dstIp}:${port} PROTO=${proto}`);
      break;
    case "limited":
      next.flows = s.flows.map((f) => (matchesFlow(f, c) ? { ...f, pattern: "routine", pps: 20 } : f));
      next = setDevice(next, dst, { status: "mitigated" });
      next = appendPacketOutcome(next, "DROP", `${srcIp} -> ${dstIp}:${port} PROTO=${proto}`);
      break;
    case "accepted":
      next = setDevice(next, dst, { status: "healthy" });
      next = appendPacketOutcome(next, "ACCEPT", `${srcIp} -> ${dstIp}:${port} PROTO=${proto}`);
      break;
    case "benign":
      next.flows = s.flows.map((f) => (matchesFlow(f, c) ? { ...f, pattern: "routine" } : f));
      next = setDevice(next, dst, { status: "healthy" });
      if ((DEVICE_IDS as readonly string[]).includes(src)) {
        next = setDevice(next, src as DeviceId, { status: "healthy" });
      }
      next = appendPacketOutcome(next, "ACCEPT", `${srcIp} -> ${dstIp}:${port} PROTO=${proto}`);
      break;
  }
  return next;
}

function reviewCase(s: DemoState, caseId: string, decision: ReviewDecision, note?: string): DemoState {
  const c = s.cases.find((x) => x.id === caseId);
  if (!c || c.stage !== "awaiting_review") return s;
  const attempt = currentAttempt(c);
  if (!attempt) return s;
  if (decision === "approve" && !attempt.passed) return s;

  let next = tick(s, 12);
  const decidedAt = nowIso(next);
  const id = shortId(c.id);

  const map: Record<ReviewDecision, { status: AlertCase["review"]["status"]; stage: LifecycleStage; verb: string }> = {
    approve: { status: "approved", stage: "validating", verb: "approved the proposal" },
    reject: { status: "rejected", stage: "rejected", verb: "rejected the proposal" },
    request_revision: { status: "revision_requested", stage: "revision_requested", verb: "requested a revision" },
    mark_benign: { status: "marked_benign", stage: "marked_benign", verb: "marked the traffic as benign" },
  };
  const m = map[decision];
  const noAction = decision !== "approve";

  next = updateCase(next, caseId, (x) => ({
    ...x,
    stage: m.stage,
    review: { status: m.status, reviewer: REVIEWER, note: note?.trim() || undefined, decidedAt },
    execution: noAction
      ? {
          status: decision === "request_revision" ? "not_started" : "not_applicable",
          simulated: true,
          message:
            decision === "request_revision"
              ? "Revision requested: nothing has been applied."
              : decision === "mark_benign"
                ? "Marked benign: no action applied."
                : "Proposal rejected by reviewer: no action applied.",
        }
      : { status: "pending", simulated: true, message: "Awaiting final validation and execution (simulated)." },
  }));
  next = tick(next, 1);

  if (decision === "approve") {
    const isNoOp = attempt.envelope.chosen_mitigation.action_type === "NO_OP";
    next = appendPacketOutcome(
      next,
      isNoOp ? "ACCEPT" : "DROP",
      `${c.alert.source_ip} -> ${c.alert.target_ip}:${c.alert.dest_port} PROTO=${c.alert.protocol ?? "TCP"}`,
    );
    const targetNode = c.alert.target_node;
    next = setDevice(next, targetNode, { status: "mitigated" });
    next = {
      ...next,
      flows: [
        {
          id: "flow-sla-routine",
          from: "traffic-gen",
          to: targetNode,
          port: 80,
          protocol: "HTTP",
          pps: 120,
          pattern: "routine",
        },
      ],
      extNodes: {
        ...next.extNodes,
        "ext-net": { ...next.extNodes["ext-net"], status: "healthy" },
        "traffic-gen": { ...next.extNodes["traffic-gen"], status: "healthy" },
      },
      drama: {
        ...next.drama,
        phase: "mitigated",
        mitigationEpoch: next.drama.mitigationEpoch + 1,
      },
    };
  } else if (decision === "reject" || decision === "mark_benign") {
    next = appendPacketOutcome(
      next,
      "ACCEPT",
      `${c.alert.source_ip} -> ${c.alert.target_ip}:${c.alert.dest_port} PROTO=${c.alert.protocol ?? "TCP"}`,
    );
    next = {
      ...next,
      flows: next.flows.filter((f) => f.pattern !== "suspicious"),
      drama: { ...next.drama, phase: "idle" },
    };
  }

  next = addToast(next, decision === "approve" || decision === "mark_benign" ? "success" : "info", "Review decision recorded", `${REVIEWER} ${m.verb} (${id})`);

  if (decision === "mark_benign") next = applyNetworkOutcome(next, c, "benign");
  return next;
}

function advancePipeline(s: DemoState, caseId: string): DemoState {
  const c = s.cases.find((x) => x.id === caseId);
  if (!c) return s;
  const attempt = currentAttempt(c);
  if (!attempt) return s;
  const action = attempt.envelope.chosen_mitigation;
  const isNoOp = action.action_type === "NO_OP";

  if (c.stage === "validating") {
    let next = tick(s, 2);
    const checks = runCritic(attempt.envelope, c.alert);
    if (!criticPassed(checks)) {
      next = updateCase(next, caseId, (x) => ({ ...x, stage: "rejected", execution: { status: "not_applicable", simulated: true, message: "Final validation failed: nothing applied." } }));
      return addToast(next, "danger", "Validation check failed", "Final Critic re-validation blocked execution.");
    }
    return updateCase(next, caseId, (x) => ({ ...x, stage: "approved" }));
  }

  if (c.stage === "approved") {
    let next = tick(s, 2);
    if (isNoOp) {
      next = updateCase(next, caseId, (x) => ({
        ...x,
        stage: "executed",
        execution: { status: "not_applicable", simulated: true, finishedAt: nowIso(next), message: "NO_OP approved: monitoring continues, no firewall change applied." },
      }));
      return applyNetworkOutcome(next, c, "accepted");
    }
    return updateCase(next, caseId, (x) => ({ ...x, stage: "executing" }));
  }

  if (c.stage === "executing") {
    let next = tick(s, 3);
    next = updateCase(next, caseId, (x) => ({
      ...x,
      stage: "executed",
      execution: {
        status: "confirmed",
        simulated: true,
        appliedCommand: action.iptables_cmd,
        finishedAt: nowIso(next),
        message: `Rule applied in ${action.target_container} namespace (simulated).`,
      },
    }));
    return applyNetworkOutcome(next, c, action.action_type === "RATE_LIMIT_SYN" ? "limited" : "blocked");
  }
  return s;
}

function buildOfflineFallbackPendingItem(a: Extract<DemoAction, { type: "drama_offline_fallback" }>, s: DemoState): BackendPendingItem {
  const srcIp = resolveNodeIp(s, a.sourceNode);
  const dstIp = resolveNodeIp(s, a.targetNode);
  const port = a.targetPort || 80;
  const protoLower = (a.protocol || "TCP").toLowerCase() === "http" ? "tcp" : (a.protocol || "TCP").toLowerCase();
  const goldenCmd = `iptables -A INPUT -s ${srcIp} -p ${protoLower} --dport ${port} -m limit ! --limit 15/s --limit-burst 30 -j DROP`;

  const pickedVariant =
    a.variant === "B"
      ? "B"
      : a.variant === "C"
        ? "C"
        : a.variant === "D"
          ? "D"
          : "A";

  const isB = pickedVariant === "B";
  const isC = pickedVariant === "C";
  const cbTriggered = isB || isC;
  const qScore = isB ? 0.45 : isC ? 0.24 : pickedVariant === "D" ? 0.84 : 0.96;
  const flawedCmd = isB
    ? `iptables -A INPUT -s 172.28.0.0/16 -p ${protoLower} --dport ${port} -j DROP`
    : isC
      ? `iptables -A INPUT -s ${srcIp} -p ${protoLower} --syn-flood-kill`
      : undefined;
  const cbReason = isB
    ? "BLAST_RADIUS_GATE: Rule drops entire /16 subnet, severing benign SLA traffic. | Q_SCORE_GATE: Confidence Q=0.45 below minimum autonomous threshold (0.75)."
    : isC
      ? "GRAMMAR_GATE: Unrecognized netfilter flag or invalid iptables syntax. | Q_SCORE_GATE: Confidence Q=0.24 below minimum autonomous threshold (0.75)."
      : undefined;

  return {
    alert_id: `evt-${a.nowMs % 1_000_000_000}`,
    category_id: 1,
    threat_family: "Volumetric & Protocol Exhaustion",
    scenario_id: "SCENARIO_1",
    attacker_node: a.sourceNode,
    target_container: a.targetNode,
    source_ip: srcIp,
    destination_ip: dstIp,
    timestamp: isoFromMs(a.nowMs),
    threat_classification: a.threatSignature || "TCP_SYN_VOLUMETRIC",
    severity: "CRITICAL",
    selected_variant: pickedVariant,
    variant_label: isB ? "BLANKET_DROP" : isC ? "SYNTAX_ERROR" : "GOLDEN_PLAYBOOK",
    q_score: qScore,
    circuit_breaker_triggered: cbTriggered,
    circuit_breaker_reason: cbReason,
    violated_gates: cbTriggered ? [cbReason!] : [],
    telemetry_vector: {
      packet_rate_pps: 14500,
      byte_rate_bps: 870000,
      syn_ack_ratio: 0.99,
      payload_entropy: 2.15,
      avg_packet_size: 60,
      active_socket_count: 4096,
      mitre_tactic: "TA0040 Impact",
      mitre_technique: "T1498.001",
    },
    chosen_mitigation: {
      action_type: cbTriggered ? "FALLBACK_GOLDEN_PLAYBOOK" : "GOLDEN_PLAYBOOK",
      target_container: a.targetNode,
      source_ip: srcIp,
      dest_port: port,
      iptables_cmd: goldenCmd,
      fallback_cmd: `iptables -A INPUT -s ${srcIp} -p ${protoLower} --dport ${port} -j DROP`,
      intercepted_flawed_cmd: flawedCmd,
      q_score: qScore,
      variant_id: pickedVariant,
    },
  };
}

export function demoReducer(s: DemoState, a: DemoAction): DemoState {
  switch (a.type) {
    case "set_mode":
      return a.mode === s.mode
        ? s
        : a.mode === "live"
          ? { ...createLiveState(), isLiveMode: true }
          : { ...createDemoState(), isLiveMode: false };
    case "set_live_mode":
      return a.isLive === (s.mode === "live")
        ? s
        : a.isLive
          ? { ...createLiveState(), isLiveMode: true }
          : { ...createDemoState(), isLiveMode: false };
    case "toggle_live_mode": {
      const willBeLive = s.mode !== "live";
      return willBeLive
        ? { ...createLiveState(), isLiveMode: true }
        : { ...createDemoState(), isLiveMode: false };
    }
    case "select_device":
      return { ...s, selectedDeviceId: a.id };
    case "select_alert":
      return { ...s, selectedAlertId: a.id };
    case "select_scenario":
      if (s.scenario.run === "running") return s;
      return { ...s, scenario: { ...s.scenario, selected: a.id, run: "idle", stepIndex: 0 } };

    case "scenario_start": {
      const sc = s.scenario;
      if (sc.run === "running") return s;
      if (sc.run === "paused") return { ...s, scenario: { ...sc, run: "running" } };
      if (sc.completed.includes(sc.selected)) {
        return {
          ...s,
          liveCaseIds: {},
          scenario: { ...sc, run: "running", stepIndex: 0, completed: sc.completed.filter((id) => id !== sc.selected) },
        };
      }
      return { ...s, scenario: { ...sc, run: "running", stepIndex: 0 } };
    }
    case "scenario_pause":
      return s.scenario.run === "running" ? { ...s, scenario: { ...s.scenario, run: "paused" } } : s;
    case "scenario_step": {
      const sc = s.scenario;
      if (sc.run !== "running") return s;
      const def = SCENARIOS[sc.selected];
      const step = def.steps[sc.stepIndex];
      if (!step) return { ...s, scenario: { ...sc, run: "completed" } };
      let next = tick(s, step.advanceSec);
      for (const fx of step.effects) next = applyEffect(next, fx);
      const stepIndex = sc.stepIndex + 1;
      const done = stepIndex >= def.steps.length;
      return {
        ...next,
        scenario: {
          ...next.scenario,
          stepIndex,
          run: done ? "completed" : "running",
          completed: done ? [...next.scenario.completed, sc.selected] : next.scenario.completed,
        },
      };
    }
    case "reset": {
      return s.mode === "live" ? createLiveState() : createDemoState();
    }

    case "drama_attack_start": {
      const srcIp = resolveNodeIp(s, a.sourceNode);
      const dstIp = resolveNodeIp(s, a.targetNode);
      const port = a.targetPort ?? 80;
      const proto = a.protocol ?? "TCP";
      const sig = a.threatSignature ?? "TCP_SYN_VOLUMETRIC";

      const devices = { ...s.devices };
      if ((DEVICE_IDS as readonly string[]).includes(a.sourceNode)) {
        devices[a.sourceNode as DeviceId] = { ...devices[a.sourceNode as DeviceId], status: "attacking" };
      }
      devices[a.targetNode] = { ...devices[a.targetNode], status: "under_attack" };

      const extNodes = { ...s.extNodes };
      if ((EXT_NODE_IDS as readonly string[]).includes(a.sourceNode)) {
        extNodes[a.sourceNode as ExtNodeId] = { ...extNodes[a.sourceNode as ExtNodeId], status: "attacking" };
      }

      // Dismiss any unreviewed stale cases locally so only the incoming threat prompts after 14s
      const cleanedCases = s.cases.map((c) =>
        c.stage === "awaiting_review" ? { ...c, stage: "rejected" as LifecycleStage } : c,
      );

      return {
        ...s,
        clockMs: a.nowMs,
        cases: cleanedCases,
        devices,
        extNodes,
        flows: [
          {
            id: "flow-drama-active",
            from: a.sourceNode,
            to: a.targetNode,
            port,
            protocol: proto,
            pps: 14500,
            pattern: "suspicious",
          },
        ],
        drama: {
          phase: "thinking",
          attackEpoch: s.drama.attackEpoch + 1,
          mitigationEpoch: s.drama.mitigationEpoch,
          startedAtMs: a.nowMs,
          thinkingStep: 0,
          sourceNode: a.sourceNode,
          targetNode: a.targetNode,
          sourceIp: srcIp,
          targetIp: dstIp,
          targetPort: port,
          protocol: proto,
          threatSignature: sig,
        },
      };
    }

    case "drama_thinking_step": {
      if (s.drama.phase !== "thinking") return s;
      const clamped = Math.max(0, Math.min(4, a.step));
      return clamped === s.drama.thinkingStep
        ? s
        : { ...s, drama: { ...s.drama, thinkingStep: clamped } };
    }

    case "drama_thinking_complete": {
      if (s.drama.phase !== "thinking") return s;
      return {
        ...s,
        drama: {
          ...s.drama,
          phase: "awaiting_decision",
          thinkingStep: 4,
        },
      };
    }

    case "live_envelope_received": {
      const iso = isoFromMs(a.nowMs);
      const net: Partial<Record<NodeId, DeviceRuntime>> = {
        ...s.devices,
        ...s.extNodes,
      };
      const newCase = pendingToCase(a.item, net, iso);
      const exists = s.cases.some((c) => c.id === newCase.id);
      const cases = exists
        ? s.cases.map((c) => (c.id === newCase.id ? newCase : c))
        : [...s.cases, newCase];

      return {
        ...s,
        clockMs: a.nowMs,
        cases,
        selectedAlertId: newCase.id,
        flows: pendingToFlows([a.item]),
        drama: {
          ...s.drama,
          phase: s.drama.phase === "thinking" ? "thinking" : "awaiting_decision",
          sourceNode: newCase.alert.source_node,
          targetNode: newCase.alert.target_node,
          sourceIp: newCase.alert.source_ip,
          targetIp: newCase.alert.target_ip,
          targetPort: newCase.alert.dest_port,
          protocol: newCase.alert.protocol ?? s.drama.protocol,
          threatSignature: a.item.threat_classification ?? s.drama.threatSignature,
        },
      };
    }

    case "drama_offline_fallback": {
      const item = buildOfflineFallbackPendingItem(a, s);
      const iso = isoFromMs(a.nowMs);
      const net: Partial<Record<NodeId, DeviceRuntime>> = {
        ...s.devices,
        ...s.extNodes,
      };
      const fallbackCase: AlertCase = {
        ...pendingToCase(item, net, iso),
        provenance: "demo",
      };
      return {
        ...s,
        clockMs: a.nowMs,
        cases: [...s.cases, fallbackCase],
        selectedAlertId: fallbackCase.id,
        flows: pendingToFlows([item]),
        drama: {
          ...s.drama,
          phase: "awaiting_decision",
          thinkingStep: 4,
        },
      };
    }

    case "review":
      return reviewCase(s, a.caseId, a.decision, a.note);
    case "return_to_queue": {
      const c = s.cases.find((x) => x.id === a.caseId);
      if (!c || c.stage !== "revision_requested") return s;
      return updateCase(s, a.caseId, (x) => ({
        ...x,
        stage: "awaiting_review",
        review: { status: "pending" },
        execution: { status: "not_started", simulated: true },
      }));
    }
    case "pipeline_advance":
      return advancePipeline(s, a.caseId);
    case "rerun_critic": {
      const c = s.cases.find((x) => x.id === a.caseId);
      const attempt = c && currentAttempt(c);
      if (!c || !attempt) return s;
      const checks = runCritic(attempt.envelope, c.alert);
      const passed = criticPassed(checks);
      return updateCase(s, a.caseId, (x) => ({
        ...x,
        attempts: x.attempts.map((t) => (t.index === attempt.index ? { ...t, checks, passed } : t)),
      }));
    }

    case "terminal_result": {
      const seq = s.seq;
      const prev = a.clear ? [] : s.terminals[a.deviceId];
      const lines: TerminalLine[] = a.clear
        ? []
        : [
            { id: `t-${seq}-cmd`, kind: "command", text: a.command },
            ...a.lines.map((l, i) => ({ id: `t-${seq}-${i}`, ...l })),
          ];
      return { ...s, seq: seq + 1, terminals: { ...s.terminals, [a.deviceId]: [...prev, ...lines] } };
    }
    case "terminal_clear":
      return { ...s, terminals: { ...s.terminals, [a.deviceId]: [] } };

    case "ack_alerts": {
      const fresh = a.ids.filter((id) => !s.acknowledged.includes(id));
      return fresh.length ? { ...s, acknowledged: [...s.acknowledged, ...fresh] } : s;
    }
    case "live_sync": {
      if (s.mode !== "live") return s;
      const net = mapNetworkStatus(a.snapshot.network_status);
      const iso = isoFromMs(a.nowMs);
      const known = new Map(s.cases.map((c) => [c.id, c]));
      const pending = a.snapshot.pending ?? [];
      const pendingCases = pending.map((p) => {
        const existing = known.get(String(p.alert_id));
        if (existing && existing.stage === "awaiting_review") return existing;
        return pendingToCase(p, net, iso);
      });
      const historyRecords = a.snapshot.executed_history ?? [];
      const historyCases = historyRecords
        .filter((h) => h.envelope && !pending.some((p) => String(p.alert_id) === String(h.alert_id)))
        .map((h) => {
          const existing = known.get(String(h.alert_id));
          if (existing && existing.stage !== "awaiting_review") return existing;
          const base = pendingToCase(h.envelope!, net, iso);
          return {
            ...base,
            stage: "executed" as const,
            review: { status: "approved" as const, reviewer: REVIEWER, decidedAt: h.resolved_at ? `${iso.slice(0, 11)}${h.resolved_at}Z` : iso },
            execution: {
              status: "confirmed" as const,
              simulated: false,
              appliedCommand: h.injected_cmd,
              finishedAt: h.resolved_at ? `${iso.slice(0, 11)}${h.resolved_at}Z` : iso,
              message: `Executed in container ${h.target_container ?? base.alert.target_node}: ${h.injected_cmd ?? base.attempts[0]?.envelope.chosen_mitigation.iptables_cmd ?? ""}`,
            },
          };
        });
      const localResolved = s.cases.filter(
        (c) =>
          c.stage !== "awaiting_review" &&
          !pendingCases.some((p) => p.id === c.id) &&
          !historyCases.some((h) => h.id === c.id),
      );
      const cases = [...pendingCases, ...historyCases, ...localResolved];

      const devices = { ...s.devices };
      for (const id of DEVICE_IDS) {
        devices[id] = net[id] ? { ...net[id]! } : { ...devices[id], status: devices[id]?.status ?? "healthy" };
      }
      const extNodes = { ...s.extNodes };
      for (const id of EXT_NODE_IDS) {
        extNodes[id] = net[id] ? { ...net[id]! } : { ...extNodes[id], status: extNodes[id]?.status ?? "healthy" };
      }

      // Preserve active attack topology state while the 14s LLM thinking phase is running
      let flows = pendingToFlows(pending);
      if (s.drama.phase === "thinking" || s.drama.phase === "awaiting_decision") {
        devices[s.drama.targetNode] = { ...devices[s.drama.targetNode], status: "under_attack" };
        if ((DEVICE_IDS as readonly string[]).includes(s.drama.sourceNode)) {
          const sid = s.drama.sourceNode as DeviceId;
          devices[sid] = { ...devices[sid], status: "attacking" };
        } else {
          const eid = s.drama.sourceNode as ExtNodeId;
          extNodes[eid] = { ...extNodes[eid], status: "attacking" };
        }
        if (flows.length === 0) {
          flows = [
            {
              id: "flow-drama-active",
              from: s.drama.sourceNode,
              to: s.drama.targetNode,
              port: s.drama.targetPort,
              protocol: s.drama.protocol,
              pps: 14500,
              pattern: "suspicious",
            },
          ];
        }
      } else if (s.drama.phase === "mitigated") {
        devices[s.drama.targetNode] = { ...devices[s.drama.targetNode], status: "mitigated" };
        if ((DEVICE_IDS as readonly string[]).includes(s.drama.sourceNode)) {
          const sid = s.drama.sourceNode as DeviceId;
          if (sid !== s.drama.targetNode) {
            devices[sid] = { ...devices[sid], status: "blocked" };
          }
        } else {
          const eid = s.drama.sourceNode as ExtNodeId;
          extNodes[eid] = { ...extNodes[eid], status: "blocked" };
        }
        extNodes["traffic-gen"] = { ...extNodes["traffic-gen"], status: "healthy" };
        if (flows.length === 0) {
          flows = [
            {
              id: "flow-sla-routine",
              from: "traffic-gen",
              to: s.drama.targetNode,
              port: 80,
              protocol: "HTTP",
              pps: 120,
              pattern: "routine",
            },
          ];
        }
      }

      const selectedAlertId =
        pendingCases.length > 0
          ? pendingCases[pendingCases.length - 1].id
          : cases.some((c) => c.id === s.selectedAlertId)
            ? s.selectedAlertId
            : cases.length > 0
              ? cases[cases.length - 1].id
              : null;

      return {
        ...s,
        clockMs: a.nowMs,
        cases,
        devices,
        extNodes,
        flows,
        selectedAlertId,
        backend: { link: "online", lastSyncAt: iso, executedCount: historyRecords.length || s.backend.executedCount },
      };
    }
    case "live_error": {
      if (s.mode !== "live") return s;
      return { ...s, clockMs: a.nowMs, backend: { ...s.backend, link: "error", error: a.message } };
    }
    case "live_resolved": {
      const iso = isoFromMs(a.nowMs);
      const targetCase = s.cases.find((c) => c.id === a.alertId);
      const targetNode = targetCase?.alert.target_node ?? s.drama.targetNode;
      const updatedCases = s.cases.map((c) => {
        if (c.id !== a.alertId) return c;
        const chosenCmd = a.cmd ?? c.attempts[0]?.envelope.chosen_mitigation.iptables_cmd ?? "";
        return {
          ...c,
          stage: (a.approved ? "executed" : "rejected") as LifecycleStage,
          review: {
            status: (a.approved ? "approved" : "rejected") as AlertCase["review"]["status"],
            reviewer: REVIEWER,
            decidedAt: iso,
          },
          execution: a.approved
            ? {
                status: "confirmed" as const,
                simulated: false,
                appliedCommand: chosenCmd,
                finishedAt: iso,
                message: `Executed in container ${targetNode}: ${chosenCmd}`,
              }
            : {
                status: "not_applicable" as const,
                simulated: false,
                finishedAt: iso,
                message: "Rejected by Blue Team operator — no firewall rule applied.",
              },
        };
      });

      const devices = { ...s.devices };
      devices[targetNode] = {
        ...devices[targetNode],
        status: a.approved ? "mitigated" : "healthy",
      };
      const extNodes = {
        ...s.extNodes,
        "ext-net": { ...s.extNodes["ext-net"], status: (a.approved ? "blocked" : "healthy") as DeviceRuntime["status"] },
        "traffic-gen": { ...s.extNodes["traffic-gen"], status: "healthy" as const },
      };

      const flows: NetworkFlow[] = a.approved
        ? [
            {
              id: "flow-sla-routine",
              from: "traffic-gen",
              to: targetNode,
              port: 80,
              protocol: "HTTP",
              pps: 120,
              pattern: "routine",
            },
          ]
        : [];

      let next: DemoState = {
        ...s,
        clockMs: a.nowMs,
        cases: updatedCases,
        devices,
        extNodes,
        flows,
        selectedAlertId: s.selectedAlertId ?? a.alertId,
        backend: { ...s.backend, executedCount: s.backend.executedCount + (a.approved ? 1 : 0) },
        drama: a.approved
          ? {
              ...s.drama,
              phase: "mitigated",
              mitigationEpoch: s.drama.mitigationEpoch + 1,
            }
          : {
              ...s.drama,
              phase: "idle",
            },
      };
      if (targetCase) {
        next = appendPacketOutcome(
          next,
          a.approved ? "DROP" : "ACCEPT",
          `${targetCase.alert.source_ip} -> ${targetCase.alert.target_ip}:${targetCase.alert.dest_port} PROTO=${targetCase.alert.protocol ?? "TCP"}`,
        );
      }
      return next;
    }
    case "live_attack":
      return { ...s, clockMs: a.nowMs };
    case "toast_push":
      return addToast(s, a.tone, a.title, a.message);
    case "toast_dismiss":
      return { ...s, toasts: s.toasts.filter((t) => t.id !== a.id) };
    default:
      return s;
  }
}
