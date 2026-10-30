import { LIVE_CASE_BUILDERS } from "@/data/live-cases";
import { BASELINE_FLOWS, REVIEWER, SIM_EPOCH_MS, initialDeviceRuntime } from "@/data/devices";
import { SCENARIOS } from "@/data/scenarios";
import { buildSeedCases, makeAttempt } from "@/data/seed-cases";
import { criticPassed, runCritic } from "@/lib/critic";
import { fmtTime, isoFromMs, shortId } from "@/lib/format";
import { terminalBanner, type TerminalOutputLine } from "@/lib/terminal";
import { currentAttempt } from "@/lib/selectors";
import { LIVE } from "@/lib/config";
import { mapNetworkStatus, pendingToCase, pendingToFlows } from "@/lib/live-map";
import type { BackendSnapshot } from "@/types/backend";
import { DEVICE_IDS, EXT_NODE_IDS } from "@/types";
import type {
  AlertCase,
  DeviceId,
  DeviceRuntime,
  EventSeverity,
  ExtNodeId,
  PostmortemCard,
  LifecycleStage,
  NetworkFlow,
  ReviewDecision,
  ScenarioEffect,
  ScenarioId,
  ScenarioRunState,
  TerminalLine,
  Toast,
  ToastTone,
  ZephyrEvent,
} from "@/types";

/**
 * Shared demo state. One reducer drives every tab, so the simulation, the
 * alert queue, the decision history, the training pairs and the architecture
 * trace are all views of the same underlying story.
 *
 * The reducer is pure and deterministic: time comes from a simulated clock
 * that only moves when events happen, never from `Date.now()`.
 */

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
  events: ZephyrEvent[];
  cases: AlertCase[];
  /** scenario case key -> alert id, so later steps can find the case they created. */
  liveCaseIds: Record<string, string>;
  selectedAlertId: string | null;
  terminals: Record<DeviceId, TerminalLine[]>;
  /** Live critical alerts the reviewer has already seen (stops the blinking indicator). */
  acknowledged: string[];
  toasts: Toast[];
  /** "live" = state mirrors the FastAPI backend; "demo" = local simulation. */
  mode: "demo" | "live";
  backend: BackendState;
  /** Live only: ext-net and traffic-gen runtime state from network_status. */
  extNodes: Record<ExtNodeId, DeviceRuntime>;
}

export interface BackendState {
  link: "connecting" | "online" | "error";
  error?: string;
  /** ISO time of the last successful poll. */
  lastSyncAt?: string;
  executedCount: number;
}

export type DemoAction =
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
  | { type: "toast_push"; tone: ToastTone; title: string; message?: string }
  | { type: "toast_dismiss"; id: string };

/* ------------------------------------------------------------------ */
/* Initial state                                                        */
/* ------------------------------------------------------------------ */

function bannerLines(deviceId: DeviceId, startSeq: number): TerminalLine[] {
  return terminalBanner(deviceId).map((l, i) => ({ id: `t-${startSeq}-${deviceId}-${i}`, ...l }));
}

function createLiveState(): DemoState {
  const base = createDemoState();
  const devices = Object.fromEntries(DEVICE_IDS.map((d) => [d, { status: "unknown" } as DeviceRuntime])) as Record<DeviceId, DeviceRuntime>;
  return {
    ...base,
    mode: "live",
    devices,
    flows: [],
    cases: [],
    selectedDeviceId: "pc-4",
    events: [],
    backend: { link: "connecting", executedCount: 0 },
    extNodes: { "ext-net": { status: "unknown" }, "traffic-gen": { status: "unknown" } },
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
    scenario: { selected: "normal", run: "idle", stepIndex: 0, completed: [] },
    events: [
      {
        id: "evt-0",
        ts: isoFromMs(SIM_EPOCH_MS),
        kind: "system",
        actor: "system",
        severity: "info",
        message: "Demo environment ready: 5 containers on br-zephyr (simulated)",
      },
    ],
    cases: buildSeedCases(),
    liveCaseIds: {},
    selectedAlertId: null,
    terminals,
    acknowledged: [],
    toasts: [],
    mode: "demo",
    backend: { link: "online", executedCount: 0 },
    extNodes: { "ext-net": { status: "unknown" }, "traffic-gen": { status: "unknown" } },
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

const nowIso = (s: DemoState) => isoFromMs(s.clockMs);

function tick(s: DemoState, sec: number): DemoState {
  return sec ? { ...s, clockMs: s.clockMs + sec * 1000 } : s;
}

function addToast(s: DemoState, tone: ToastTone, title: string, message?: string): DemoState {
  const toast: Toast = { id: `toast-${s.seq}`, tone, title, message };
  return { ...s, seq: s.seq + 1, toasts: [...s.toasts, toast].slice(-3) };
}

type NewEvent = Omit<ZephyrEvent, "id" | "ts">;

function addEvent(s: DemoState, e: NewEvent): DemoState {
  const event: ZephyrEvent = { ...e, id: `evt-${s.seq}`, ts: nowIso(s) };
  const cases = e.alertId
    ? s.cases.map((c) => (c.id === e.alertId ? { ...c, timeline: [...c.timeline, event] } : c))
    : s.cases;
  // Stream every event into all terminals as a coloured log line.
  const logLine: TerminalLine = {
    id: `log-${event.id}`,
    kind: "log",
    text: event.message,
    time: fmtTime(event.ts),
    tag: event.actor.toUpperCase(),
    tone: event.severity,
  };
  const terminals = Object.fromEntries(
    DEVICE_IDS.map((d) => [d, [...s.terminals[d], logLine].slice(-300)]),
  ) as Record<DeviceId, TerminalLine[]>;
  return { ...s, seq: s.seq + 1, events: [...s.events, event].slice(-300), cases, terminals };
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

const sevToEvent = (sev: string): EventSeverity => (sev === "CRITICAL" ? "critical" : sev === "LOW" ? "info" : "warning");

/* ------------------------------------------------------------------ */
/* Scenario effects                                                     */
/* ------------------------------------------------------------------ */

function applyEffect(s: DemoState, fx: ScenarioEffect): DemoState {
  switch (fx.type) {
    case "set_flows": {
      const byId = new Map(s.flows.map((f) => [f.id, f]));
      for (const f of fx.flows) byId.set(f.id, { ...f });
      return { ...s, flows: [...byId.values()] };
    }
    case "set_device":
      return setDevice(s, fx.deviceId, fx.patch);
    case "event":
      return addEvent(s, {
        kind: fx.kind,
        actor: fx.actor,
        severity: fx.severity,
        message: fx.message,
        deviceId: fx.deviceId,
        alertId: fx.alertId,
      });
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
        timeline: [],
        provenance: "demo",
        isLive: true,
      };
      let next: DemoState = {
        ...s,
        cases: [...s.cases, c],
        liveCaseIds: { ...s.liveCaseIds, [fx.caseKey]: c.id },
        selectedAlertId: c.id,
      };
      const a = tpl.alert.nids_llm_assessment;
      next = addEvent(next, {
        kind: "alert",
        actor: "nids",
        severity: sevToEvent(a.severity),
        message: `NIDS alert ${shortId(c.id)} detected: ${a.attack_signature}`,
        deviceId: tpl.alert.target_node,
        alertId: c.id,
      });
      return addToast(next, a.severity === "LOW" ? "info" : "warning", "New alert generated", `${a.attack_signature} · ${tpl.alert.source_node} → ${tpl.alert.target_node}`);
    }
    case "reveal_attempt": {
      const id = s.liveCaseIds[fx.caseKey];
      const tpl = LIVE_CASE_BUILDERS[fx.caseKey];
      const existing = s.cases.find((c) => c.id === id);
      if (!id || !tpl || !existing) return s;
      if (existing.attempts.some((a) => a.index === fx.attemptIndex)) return s;
      // Rebuild the template at the alert's own timestamp so envelopes stay grounded.
      const built = tpl(existing.alert.timestamp);
      const envelope = built.envelopes[fx.attemptIndex - 1];
      if (!envelope) return s;
      const attempt = makeAttempt(fx.attemptIndex, existing.alert, envelope, nowIso(s));
      const action = envelope.chosen_mitigation.action_type;
      let next = updateCase(s, id, (c) => ({
        ...c,
        attempts: [...c.attempts, attempt],
        stage: attempt.passed ? "awaiting_review" : c.stage,
      }));
      next = addEvent(next, {
        kind: "proposal",
        actor: "model",
        severity: "info",
        message: `Model proposal created${fx.attemptIndex > 1 ? ` (attempt ${fx.attemptIndex})` : ""}: ${action} on ${envelope.chosen_mitigation.target_container}`,
        alertId: id,
      });
      next = tick(next, 1);
      if (attempt.passed) {
        next = addEvent(next, {
          kind: "validation",
          actor: "critic",
          severity: "success",
          message: `Critic validation passed${fx.attemptIndex > 1 ? ` (attempt ${fx.attemptIndex})` : ""}: all 5 checks`,
          alertId: id,
        });
        return addToast(next, "info", "Proposal validated", "Awaiting human review in Alerts & Review");
      }
      const failed = attempt.checks.filter((k) => k.status === "failed");
      next = addEvent(next, {
        kind: "validation",
        actor: "critic",
        severity: "critical",
        message: `Critic rejected attempt ${fx.attemptIndex}: ${failed.length} check(s) failed (${failed.map((k) => k.id).join(", ")})`,
        alertId: id,
      });
      next = addEvent(next, {
        kind: "validation",
        actor: "critic",
        severity: "warning",
        message: `Correction loop: ${attempt.correctionFeedback.length} deterministic error(s) sent back to the model for a retry`,
        alertId: id,
      });
      return addToast(next, "danger", "Validation check failed", `Critic blocked attempt ${fx.attemptIndex}; the model is retrying.`);
    }
    default:
      return s;
  }
}

/* ------------------------------------------------------------------ */
/* Review + execution pipeline                                          */
/* ------------------------------------------------------------------ */

type Outcome = "blocked" | "limited" | "accepted" | "benign";

function applyNetworkOutcome(s: DemoState, c: AlertCase, outcome: Outcome): DemoState {
  if (!c.isLive) return s;
  const { source_node: src, target_node: dst, dest_port: port } = c.alert;
  let next: DemoState = { ...s };
  switch (outcome) {
    case "blocked":
      next.flows = s.flows.map((f) => (matchesFlow(f, c) ? { ...f, pattern: "blocked", pps: 0 } : f));
      next = setDevice(next, dst, { status: "healthy" });
      next = addEvent(next, { kind: "traffic", actor: "executor", severity: "success", message: `${src} → ${dst}:${port} blocked inside ${dst} (simulated). ${dst} is healthy again; ${src} stays flagged.`, deviceId: dst, alertId: c.id });
      break;
    case "limited":
      next.flows = s.flows.map((f) => (matchesFlow(f, c) ? { ...f, pattern: "routine", pps: 20 } : f));
      next = setDevice(next, dst, { status: "healthy" });
      next = addEvent(next, { kind: "traffic", actor: "executor", severity: "success", message: `${src} → ${dst}:${port} rate-limited to 20 SYN/s inside ${dst} (simulated)`, deviceId: dst, alertId: c.id });
      break;
    case "accepted":
      next = setDevice(next, dst, { status: "healthy" });
      next = addEvent(next, { kind: "traffic", actor: "system", severity: "success", message: `${dst} back to healthy: the surge was accepted as legitimate traffic and left untouched`, deviceId: dst, alertId: c.id });
      break;
    case "benign":
      next.flows = s.flows.map((f) => (matchesFlow(f, c) ? { ...f, pattern: "routine" } : f));
      next = setDevice(next, dst, { status: "healthy" });
      next = setDevice(next, src as DeviceId, { status: "healthy" });
      next = addEvent(next, { kind: "traffic", actor: "system", severity: "success", message: `${src} and ${dst} returned to healthy: traffic labelled benign by the reviewer`, deviceId: dst, alertId: c.id });
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

  const map: Record<ReviewDecision, { status: AlertCase["review"]["status"]; stage: LifecycleStage; verb: string; sev: EventSeverity }> = {
    approve: { status: "approved", stage: "validating", verb: "approved the proposal", sev: "success" },
    reject: { status: "rejected", stage: "rejected", verb: "rejected the proposal", sev: "warning" },
    request_revision: { status: "revision_requested", stage: "revision_requested", verb: "requested a revision", sev: "warning" },
    mark_benign: { status: "marked_benign", stage: "marked_benign", verb: "marked the traffic as benign", sev: "success" },
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
  next = addEvent(next, { kind: "review", actor: "reviewer", severity: m.sev, message: `${REVIEWER} ${m.verb}${note?.trim() ? ` — "${note.trim()}"` : ""}`, alertId: caseId });
  next = tick(next, 1);
  next = addEvent(next, {
    kind: "record",
    actor: "system",
    severity: "info",
    message:
      decision === "approve" || decision === "mark_benign"
        ? "Decision saved; chosen/rejected pair recorded for GRPO training"
        : "Decision saved; pair excluded from training until a usable label exists",
    alertId: caseId,
  });
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
      next = addEvent(next, { kind: "validation", actor: "critic", severity: "critical", message: "Final Critic re-validation failed: execution blocked", alertId: caseId });
      return addToast(next, "danger", "Validation check failed", "Final Critic re-validation blocked execution.");
    }
    next = updateCase(next, caseId, (x) => ({ ...x, stage: "approved" }));
    return addEvent(next, { kind: "validation", actor: "critic", severity: "success", message: "Final Critic re-validation passed: approved for execution", alertId: caseId });
  }

  if (c.stage === "approved") {
    let next = tick(s, 2);
    if (isNoOp) {
      next = updateCase(next, caseId, (x) => ({
        ...x,
        stage: "executed",
        execution: { status: "not_applicable", simulated: true, finishedAt: nowIso(next), message: "NO_OP approved: monitoring continues, no firewall change applied." },
      }));
      next = addEvent(next, { kind: "execution", actor: "executor", severity: "info", message: "NO_OP recorded: no firewall change applied", alertId: caseId });
      next = addToast(next, "success", "Simulated action completed", "NO_OP recorded; no firewall change was needed.");
      return applyNetworkOutcome(next, c, "accepted");
    }
    next = updateCase(next, caseId, (x) => ({ ...x, stage: "executing" }));
    return addEvent(next, { kind: "execution", actor: "executor", severity: "info", message: `Executing inside ${action.target_container} namespace (simulated): ${action.iptables_cmd}`, deviceId: action.target_container, alertId: caseId });
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
    next = addEvent(next, { kind: "execution", actor: "executor", severity: "success", message: `Execution confirmed (simulated): rule applied in ${action.target_container}`, deviceId: action.target_container, alertId: caseId });
    next = addToast(next, "success", "Simulated action completed", `Rule applied in ${action.target_container} (simulated, not a real container).`);
    return applyNetworkOutcome(next, c, action.action_type === "RATE_LIMIT_SYN" ? "limited" : "blocked");
  }
  return s;
}

/* ------------------------------------------------------------------ */
/* Reducer                                                              */
/* ------------------------------------------------------------------ */

export function demoReducer(s: DemoState, a: DemoAction): DemoState {
  switch (a.type) {
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
      if (sc.completed.includes(sc.selected)) return s;
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
      const fresh = createInitialState();
      return addToast(fresh, "info", "Demo reset", "Scenario state, decisions and history restored to the initial fixtures.");
    }

    case "review":
      return reviewCase(s, a.caseId, a.decision, a.note);
    case "return_to_queue": {
      const c = s.cases.find((x) => x.id === a.caseId);
      if (!c || c.stage !== "revision_requested") return s;
      let next = updateCase(s, a.caseId, (x) => ({
        ...x,
        stage: "awaiting_review",
        review: { status: "pending" },
        execution: { status: "not_started", simulated: true },
      }));
      next = addEvent(tick(next, 5), { kind: "review", actor: "reviewer", severity: "info", message: `${REVIEWER} returned the alert to the review queue`, alertId: a.caseId });
      return next;
    }
    case "pipeline_advance":
      return advancePipeline(s, a.caseId);
    case "rerun_critic": {
      const c = s.cases.find((x) => x.id === a.caseId);
      const attempt = c && currentAttempt(c);
      if (!c || !attempt) return s;
      const checks = runCritic(attempt.envelope, c.alert);
      const passed = criticPassed(checks);
      let next = updateCase(s, a.caseId, (x) => ({
        ...x,
        attempts: x.attempts.map((t) => (t.index === attempt.index ? { ...t, checks, passed } : t)),
      }));
      next = addEvent(tick(next, 1), {
        kind: "validation",
        actor: "critic",
        severity: passed ? "success" : "critical",
        message: `Critic re-run on attempt ${attempt.index}: ${passed ? "all 5 checks passed" : "checks failed"} (deterministic: same input, same verdict)`,
        alertId: a.caseId,
      });
      return next;
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
      // Keep any locally-resolved cases from this session that aren't in historyRecords yet
      const localResolved = s.cases.filter(
        (c) =>
          c.stage !== "awaiting_review" &&
          !pendingCases.some((p) => p.id === c.id) &&
          !historyCases.some((h) => h.id === c.id),
      );
      const cases = [...pendingCases, ...historyCases, ...localResolved];
      const devices = { ...s.devices };
      for (const id of DEVICE_IDS) devices[id] = net[id] ? { ...net[id]! } : { ...devices[id], status: "unknown" };
      const extNodes = { ...s.extNodes };
      for (const id of EXT_NODE_IDS) extNodes[id] = net[id] ? { ...net[id]! } : { ...extNodes[id], status: "unknown" };
      const selectedAlertId = cases.some((c) => c.id === s.selectedAlertId)
        ? s.selectedAlertId
        : pendingCases.length > 0
          ? pendingCases[pendingCases.length - 1].id
          : cases.length > 0
            ? cases[cases.length - 1].id
            : null;
      let next: DemoState = {
        ...s,
        clockMs: a.nowMs,
        cases,
        devices,
        extNodes,
        flows: pendingToFlows(pending),
        selectedAlertId,
        backend: { link: "online", lastSyncAt: iso, executedCount: historyRecords.length || s.backend.executedCount },
      };
      for (const c of pendingCases) {
        if (known.has(c.id)) continue;
        next = addEvent(next, {
          kind: "alert",
          actor: "nids",
          severity: sevToEvent(c.alert.nids_llm_assessment.severity),
          message: `New backend alert ${shortId(c.id)}: ${c.alert.nids_llm_assessment.attack_signature} (${c.alert.source_node} to ${c.alert.target_node})`,
          alertId: c.id,
        });
      }
      return next;
    }
    case "live_error": {
      const was = s.backend.link;
      let next: DemoState = { ...s, clockMs: a.nowMs, backend: { ...s.backend, link: "error", error: a.message } };
      if (was !== "error") next = addToast(next, "danger", "Backend unreachable", a.message);
      return next;
    }
    case "live_resolved": {
      const iso = isoFromMs(a.nowMs);
      const updatedCases = s.cases.map((c) => {
        if (c.id !== a.alertId) return c;
        const chosenCmd = a.cmd ?? c.attempts[0]?.envelope.chosen_mitigation.iptables_cmd ?? "";
        const targetNode = c.alert.target_node;
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
      let next: DemoState = {
        ...s,
        clockMs: a.nowMs,
        cases: updatedCases,
        selectedAlertId: s.selectedAlertId ?? a.alertId,
        backend: { ...s.backend, executedCount: s.backend.executedCount + (a.approved ? 1 : 0) },
      };
      next = addEvent(next, {
        kind: "review",
        actor: "reviewer",
        severity: a.approved ? "success" : "info",
        message: a.approved
          ? `${REVIEWER} approved & executed ${shortId(a.alertId)}: ${a.cmd ?? a.status}`
          : `${REVIEWER} rejected ${shortId(a.alertId)}; no firewall change applied`,
        alertId: a.alertId,
      });
      return next;
    }
    case "live_attack":
      return addEvent({ ...s, clockMs: a.nowMs }, { kind: "scenario", actor: "system", severity: "warning", message: a.message });
    case "toast_push":
      return addToast(s, a.tone, a.title, a.message);
    case "toast_dismiss":
      return { ...s, toasts: s.toasts.filter((t) => t.id !== a.id) };
    default:
      return s;
  }
}
