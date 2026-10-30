import {
  buildAlert,
  buildBadEnvelope,
  buildEnvelope,
  type AlertSpec,
  type BadKind,
} from "@/data/builders";
import { REVIEWER } from "@/data/devices";
import { correctionFeedback, criticPassed, runCritic } from "@/lib/critic";
import { fakeUuid, isoFromMs, shortId } from "@/lib/format";
import type {
  ActionType,
  AlertCase,
  EventActor,
  EventKind,
  EventSeverity,
  ExecutionResult,
  GRPORewardBreakdown,
  LifecycleStage,
  MitigationEnvelope,
  NIDSAlert,
  ProposalAttempt,
  ReviewState,
  ZephyrEvent,
} from "@/types";

/**
 * DEMO DATA — historical alerts "from earlier today", so the review queue,
 * decision history and training tables are populated before any scenario runs.
 * Every record carries provenance: "demo".
 */

const DAY = "2026-10-28";
export const addSec = (iso: string, sec: number) => isoFromMs(Date.parse(iso) + sec * 1000);

export function rewardOf(total: number): GRPORewardBreakdown {
  return {
    schema_compliance_score: 2.0,
    entity_grounding_score: 3.0,
    surgical_precision_score: Math.round((total - 5) * 100) / 100,
    total_reward: total,
  };
}

export function makeAttempt(
  index: number,
  alert: NIDSAlert,
  envelope: MitigationEnvelope,
  createdAt: string,
): ProposalAttempt {
  const checks = runCritic(envelope, alert);
  const passed = criticPassed(checks);
  return {
    index,
    source: "model",
    envelope,
    checks,
    passed,
    createdAt,
    correctionFeedback: passed ? [] : correctionFeedback(checks),
  };
}

type Outcome = "executed" | "failed" | "benign" | "noop_approved" | "revision" | "rejected";

interface SeedSpec extends Omit<AlertSpec, "ts"> {
  at: string;
  outcome: Outcome;
  chosen?: ActionType;
  firstAttempt?: BadKind;
  /** Seconds between detection and the human decision. */
  decideAfter?: number;
  note?: string;
  total?: number;
}

function ev(
  alertId: string,
  n: number,
  ts: string,
  kind: EventKind,
  actor: EventActor,
  severity: EventSeverity,
  message: string,
  deviceId?: NIDSAlert["target_node"],
): ZephyrEvent {
  return { id: `${shortId(alertId)}-e${n}`, ts, kind, actor, severity, message, alertId, deviceId };
}

function buildSeedCase(spec: SeedSpec): AlertCase {
  const ts = `${DAY}T${spec.at}Z`;
  const built = buildAlert({ ...spec, ts });
  const alert = built.alert;
  const id = alert.alert_id;

  const good = buildEnvelope(alert, spec.threat, {
    chosen: spec.chosen,
    reward: spec.total ? rewardOf(spec.total) : undefined,
  });
  const attempts: ProposalAttempt[] = [];
  const timeline: ZephyrEvent[] = [];
  let n = 1;
  let t = ts;

  timeline.push(ev(id, n++, t, "alert", "nids", spec.threat === "BENIGN" ? "info" : "warning", `NIDS alert detected: ${alert.nids_llm_assessment.attack_signature}`, alert.target_node));

  if (spec.firstAttempt) {
    t = addSec(ts, 3);
    const bad = makeAttempt(1, alert, buildBadEnvelope(alert, spec.threat, spec.firstAttempt), t);
    attempts.push(bad);
    timeline.push(ev(id, n++, t, "proposal", "model", "info", `Model proposal created (attempt 1): ${bad.envelope.chosen_mitigation.action_type}`));
    t = addSec(ts, 4);
    timeline.push(ev(id, n++, t, "validation", "critic", "critical", `Critic rejected attempt 1: ${bad.checks.filter((c) => c.status === "failed").length} check(s) failed`));
    t = addSec(ts, 7);
    const fixed = makeAttempt(2, alert, good, t);
    attempts.push(fixed);
    timeline.push(ev(id, n++, t, "proposal", "model", "info", `Model proposal created (attempt 2): ${good.chosen_mitigation.action_type}`));
    t = addSec(ts, 8);
    timeline.push(ev(id, n++, t, "validation", "critic", "success", "Critic validation passed (attempt 2)"));
  } else {
    t = addSec(ts, 3);
    attempts.push(makeAttempt(1, alert, good, t));
    timeline.push(ev(id, n++, t, "proposal", "model", "info", `Model proposal created: ${good.chosen_mitigation.action_type}`));
    t = addSec(ts, 4);
    timeline.push(ev(id, n++, t, "validation", "critic", "success", "Critic validation passed"));
  }

  const decidedAt = addSec(ts, spec.decideAfter ?? 55);
  let stage: LifecycleStage;
  let review: ReviewState;
  let execution: ExecutionResult;
  const cmd = good.chosen_mitigation.iptables_cmd;

  switch (spec.outcome) {
    case "executed":
    case "failed": {
      review = { status: "approved", reviewer: REVIEWER, note: spec.note, decidedAt };
      timeline.push(ev(id, n++, decidedAt, "review", "reviewer", "success", `${REVIEWER} approved the proposal`));
      timeline.push(ev(id, n++, addSec(decidedAt, 1), "record", "system", "info", "Decision saved; chosen/rejected pair recorded for GRPO training"));
      timeline.push(ev(id, n++, addSec(decidedAt, 3), "validation", "critic", "success", "Final Critic re-validation passed"));
      const doneAt = addSec(decidedAt, 6);
      if (spec.outcome === "executed") {
        stage = "executed";
        execution = { status: "confirmed", simulated: true, appliedCommand: cmd, finishedAt: doneAt, message: `Rule applied in ${alert.target_node} namespace (simulated).` };
        timeline.push(ev(id, n++, doneAt, "execution", "executor", "success", `Execution confirmed (simulated): rule applied in ${alert.target_node}`, alert.target_node));
      } else {
        stage = "failed";
        execution = { status: "failed", simulated: true, appliedCommand: cmd, finishedAt: doneAt, message: "docker exec returned a non-zero exit code: the container did not respond (simulated failure)." };
        timeline.push(ev(id, n++, doneAt, "execution", "executor", "critical", `Execution failed (simulated): ${alert.target_node} did not respond to docker exec`, alert.target_node));
      }
      break;
    }
    case "noop_approved":
      stage = "executed";
      review = { status: "approved", reviewer: REVIEWER, note: spec.note, decidedAt };
      execution = { status: "not_applicable", simulated: true, finishedAt: addSec(decidedAt, 4), message: "NO_OP approved: monitoring continues, no firewall change applied." };
      timeline.push(ev(id, n++, decidedAt, "review", "reviewer", "success", `${REVIEWER} approved NO_OP`));
      timeline.push(ev(id, n++, addSec(decidedAt, 1), "record", "system", "info", "Decision saved; chosen/rejected pair recorded for GRPO training"));
      timeline.push(ev(id, n++, addSec(decidedAt, 4), "execution", "executor", "info", "No firewall change applied (NO_OP)"));
      break;
    case "benign":
      stage = "marked_benign";
      review = { status: "marked_benign", reviewer: REVIEWER, note: spec.note, decidedAt };
      execution = { status: "not_applicable", simulated: true, message: "Marked benign: no action applied." };
      timeline.push(ev(id, n++, decidedAt, "review", "reviewer", "success", `${REVIEWER} marked the traffic as benign`));
      timeline.push(ev(id, n++, addSec(decidedAt, 1), "record", "system", "info", "Decision saved; chosen/rejected pair recorded for GRPO training"));
      break;
    case "revision":
      stage = "revision_requested";
      review = { status: "revision_requested", reviewer: REVIEWER, note: spec.note, decidedAt };
      execution = { status: "not_started", simulated: true };
      timeline.push(ev(id, n++, decidedAt, "review", "reviewer", "warning", `${REVIEWER} requested a revision`));
      timeline.push(ev(id, n++, addSec(decidedAt, 1), "record", "system", "info", "Decision saved; pair excluded from training until a revised proposal is approved"));
      break;
    case "rejected":
    default:
      stage = "rejected";
      review = { status: "rejected", reviewer: REVIEWER, note: spec.note, decidedAt };
      execution = { status: "not_applicable", simulated: true, message: "Proposal rejected by reviewer: no action applied." };
      timeline.push(ev(id, n++, decidedAt, "review", "reviewer", "warning", `${REVIEWER} rejected the proposal`));
      timeline.push(ev(id, n++, addSec(decidedAt, 1), "record", "system", "info", "Decision saved; pair excluded from training (reviewer rejected the proposal)"));
      break;
  }

  return {
    id,
    alert,
    scenario: "history",
    summary: built.summary,
    evidence: built.evidence,
    attempts,
    stage,
    review,
    execution,
    timeline,
    provenance: "demo",
    isLive: false,
  };
}

const SEEDS: SeedSpec[] = [
  { key: "seed-ssh-1", at: "08:12:41", threat: "SSH_BRUTE_FORCE", src: "pc-4", dst: "pc-2", port: 22, outcome: "executed", decideAfter: 48, note: "Clear password-guessing pattern." },
  { key: "seed-scan-1", at: "08:27:09", threat: "PORT_SCAN", src: "pc-1", dst: "pc-4", port: 21, ports: [21, 22, 23, 25, 80, 443, 3306, 8080], outcome: "executed", decideAfter: 61 },
  {
    key: "seed-rsync",
    id: `89c5b31a${fakeUuid("seed-rsync").slice(8)}`,
    at: "08:41:55",
    threat: "BENIGN",
    benignKind: "rsync",
    src: "pc-2",
    dst: "pc-1",
    port: 22,
    outcome: "benign",
    decideAfter: 38,
    note: "Scheduled nightly backup window.",
  },
  { key: "seed-sqli-1", at: "08:58:30", threat: "SQL_INJECTION", src: "pc-5", dst: "pc-3", port: 80, outcome: "executed", decideAfter: 52, total: 7.5 },
  { key: "seed-syn-fail", at: "09:06:12", threat: "SYN_FLOOD", src: "pc-5", dst: "pc-3", port: 8080, pkts: 3980, outcome: "failed", decideAfter: 44 },
  {
    key: "seed-rce-rev",
    at: "09:19:47",
    threat: "RCE_ATTEMPT",
    src: "pc-5",
    dst: "pc-3",
    port: 80,
    firstAttempt: "prerouting",
    outcome: "revision",
    decideAfter: 70,
    note: "Please confirm the source is not an authorised scanner before blocking.",
  },
  { key: "seed-scan-rej", at: "09:33:20", threat: "PORT_SCAN", src: "pc-2", dst: "pc-5", port: 22, ports: [22, 80, 443, 445, 3306], severity: "LOW", outcome: "rejected", decideAfter: 66, note: "Scheduled internal vulnerability scan — do not block." },
  { key: "seed-ssh-2", at: "09:47:03", threat: "SSH_BRUTE_FORCE", src: "pc-5", dst: "pc-4", port: 22, outcome: "executed", decideAfter: 41, total: 8 },
  { key: "seed-health", at: "09:55:36", threat: "BENIGN", benignKind: "health_check", src: "pc-1", dst: "pc-3", port: 80, outcome: "noop_approved", decideAfter: 30 },
  { key: "seed-syn-rl", at: "10:04:18", threat: "SYN_FLOOD", src: "pc-4", dst: "pc-3", port: 80, pkts: 2640, chosen: "RATE_LIMIT_SYN", outcome: "executed", decideAfter: 57, total: 7.5 },
  { key: "seed-sqli-2", at: "10:12:52", threat: "SQL_INJECTION", src: "pc-1", dst: "pc-3", port: 80, outcome: "executed", decideAfter: 49 },
  { key: "seed-rce-ok", at: "10:21:29", threat: "RCE_ATTEMPT", src: "pc-4", dst: "pc-3", port: 8080, outcome: "executed", decideAfter: 36 },
];

/** Historical demo alerts, oldest first. */
export function buildSeedCases(): AlertCase[] {
  return SEEDS.map(buildSeedCase);
}
