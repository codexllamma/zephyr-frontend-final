/**
 * Shared domain types for Project Zephyr.
 *
 * Contract A (`NIDSAlert`) and Contract B (`MitigationEnvelope`) mirror the
 * schemas used by the Zephyr backend, so real API responses can replace demo
 * fixtures without reshaping the UI.
 */

/* ------------------------------------------------------------------ */
/* Provenance — what is real, what is simulated                         */
/* ------------------------------------------------------------------ */

/** Where a record came from. In this frontend-only build everything is "demo". */
export type DataProvenance = "demo" | "backend";

export type Theme = "dark" | "light";

/* ------------------------------------------------------------------ */
/* Network                                                              */
/* ------------------------------------------------------------------ */

export const DEVICE_IDS = ["pc-1", "pc-2", "pc-3", "pc-4", "pc-5"] as const;
export type DeviceId = (typeof DEVICE_IDS)[number];

/** Extra backend-only nodes (not part of the five-container demo topology). */
export const EXT_NODE_IDS = ["ext-net", "traffic-gen"] as const;
export type ExtNodeId = (typeof EXT_NODE_IDS)[number];
/** Any node that can appear as an attacker/source: the five containers plus ext-net and traffic-gen. */
export type NodeId = DeviceId | ExtNodeId;

export type DeviceStatus =
  | "healthy"
  | "suspicious"
  | "under_review"
  | "isolated"
  | "unknown"
  /** Live backend statuses */
  | "attacking"
  | "under_attack"
  | "mitigated"
  | "blocked";

export interface NetworkDevice {
  id: DeviceId;
  /** Container name (same as id). */
  name: DeviceId;
  /** Illustrative private IP on the br-zephyr bridge (demo value). */
  ip: string;
  role: string;
  services: string[];
}

export type TrafficPattern = "routine" | "surge" | "suspicious" | "blocked";

export interface NetworkFlow {
  id: string;
  from: NodeId;
  to: DeviceId;
  port: number;
  protocol: Protocol;
  /** Packets per second (illustrative). */
  pps: number;
  pattern: TrafficPattern;
}

export interface DeviceRuntime {
  status: DeviceStatus;
  note?: string;
  /** Live backend only: IP and role reported by `network_status` (override the fixture values). */
  ip?: string;
  role?: string;
}

/* ------------------------------------------------------------------ */
/* Contract A — NIDSAlert                                               */
/* ------------------------------------------------------------------ */

export type Protocol = "TCP" | "UDP" | "ICMP" | "HTTP";
export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface FlowMetrics {
  packet_count_2s: number;
  byte_count_2s: number;
  syn_ratio: number;
  unique_dest_ports: number[];
  payload_sample: string;
}

export interface NIDSAssessment {
  attack_signature: string;
  /** Optional: the live backend does not report these, and the UI never invents them. */
  mitre_tactic?: string;
  mitre_technique_id?: string;
  confidence_score?: number;
  severity: Severity;
  raw_telemetry_summary?: string;
}

export interface NIDSAlert {
  alert_id: string;
  timestamp: string;
  source_node: NodeId;
  source_ip: string;
  target_node: DeviceId;
  target_ip: string;
  dest_port: number;
  /** Optional: absent when the backend does not report it. */
  protocol?: Protocol;
  /** Optional: the live backend's pending list carries no packet telemetry. */
  flow_metrics?: FlowMetrics;
  nids_llm_assessment: NIDSAssessment;
}

/* ------------------------------------------------------------------ */
/* Contract B — MitigationEnvelope                                      */
/* ------------------------------------------------------------------ */

export type KnownThreatClass =
  | "SYN_FLOOD"
  | "RCE_ATTEMPT"
  | "SQL_INJECTION"
  | "SSH_BRUTE_FORCE"
  | "PORT_SCAN"
  | "BENIGN";

export type KnownActionType =
  | "BLOCK_SOURCE_IP"
  | "RATE_LIMIT_SYN"
  | "DROP_PORT_TRAFFIC"
  | "ISOLATE_NODE"
  | "NO_OP";

export type KnownCollateralImpact = "ZERO" | "LOW" | "MODERATE" | "HIGH";

/**
 * The live backend can return values beyond the demo's known set (for example
 * `ICMP_C2_EXFILTRATION`, `RESTRICT_OVERSIZED_ICMP`, `NONE`), so these are open
 * strings. Use `threatLabel` / `actionLabel` / `impactLabel` to display them.
 */
export type ThreatClass = string;
export type ActionType = string;
export type CollateralImpact = string;

export interface ActionPayload {
  action_type: ActionType;
  target_container: DeviceId;
  source_ip: string;
  dest_port: number;
  iptables_cmd: string;
  estimated_collateral_impact: CollateralImpact;
}

export interface GRPORewardBreakdown {
  /** [-2.0, 2.0] */
  schema_compliance_score: number;
  /** [-3.0, 3.0] */
  entity_grounding_score: number;
  /** [-3.0, 3.0] */
  surgical_precision_score: number;
  /** [-8.0, 8.0] */
  total_reward: number;
}

export interface MitigationEnvelope {
  threat_classification: ThreatClass;
  severity: Severity;
  reasoning_trace: string;
  chosen_mitigation: ActionPayload;
  rejected_alternative: ActionPayload;
  rejection_reason: string;
  /** Optional: the live backend does not report GRPO reward breakdowns. */
  grpo_scoring_debug?: GRPORewardBreakdown;
}

/* ------------------------------------------------------------------ */
/* Deterministic Critic                                                 */
/* ------------------------------------------------------------------ */

export type CriticCheckId =
  | "schema"
  | "grounding"
  | "syntax"
  | "boundary"
  | "proportionality";

export type CriticStatus = "passed" | "failed" | "not_evaluated";

export interface CriticCheck {
  id: CriticCheckId;
  label: string;
  status: CriticStatus;
  /** One-line, plain-English summary of the outcome. */
  detail: string;
  /** Exact deterministic findings (fed back to the model on failure). */
  findings: string[];
}

export interface ProposalAttempt {
  /** 1-based attempt number within the correction loop. */
  index: number;
  source: "model" | "deterministic_fallback";
  envelope: MitigationEnvelope;
  checks: CriticCheck[];
  passed: boolean;
  /** "not_reported": the live backend sent no Critic result, so none is shown (never fabricated). */
  validation?: "evaluated" | "not_reported";
  createdAt: string;
  /** Error strings injected into the next prompt when this attempt failed. */
  correctionFeedback: string[];
}

/* ------------------------------------------------------------------ */
/* Review workflow                                                      */
/* ------------------------------------------------------------------ */

export type LifecycleStage =
  | "detected"
  | "awaiting_review"
  | "validating"
  | "approved"
  | "executing"
  | "executed"
  | "rejected"
  | "failed"
  | "revision_requested"
  | "marked_benign";

export type ReviewStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "revision_requested"
  | "marked_benign";

export type ReviewDecision = "approve" | "reject" | "request_revision" | "mark_benign";

export interface ReviewState {
  status: ReviewStatus;
  reviewer?: string;
  note?: string;
  decidedAt?: string;
}

export type ExecutionStatus =
  | "not_started"
  | "pending"
  | "confirmed"
  | "failed"
  | "not_applicable";

export interface ExecutionResult {
  status: ExecutionStatus;
  /** True whenever the action was only simulated by the frontend. */
  simulated: boolean;
  message?: string;
  finishedAt?: string;
  /** Command that was (simulatedly) applied inside the target container. */
  appliedCommand?: string;
}

export type EventKind =
  | "scenario"
  | "traffic"
  | "alert"
  | "proposal"
  | "validation"
  | "review"
  | "execution"
  | "record"
  | "system";

export type EventSeverity = "info" | "warning" | "critical" | "success";

export type EventActor = "system" | "nids" | "model" | "critic" | "reviewer" | "executor";

export interface ZephyrEvent {
  id: string;
  ts: string;
  kind: EventKind;
  actor: EventActor;
  severity: EventSeverity;
  message: string;
  deviceId?: DeviceId;
  alertId?: string;
}

export interface EvidenceItem {
  label: string;
  value: string;
  /** Marks evidence that points towards (or away from) malicious intent. */
  signal?: "suspicious" | "benign" | "neutral";
}

/** A NIDS alert together with its proposal, validation, review and outcome. */
export interface TelemetryVector {
  category_id?: number;
  scenario_key?: string;
  signature_name?: string;
  protocol?: string;
  dst_port?: number;
  packet_rate_pps?: number;
  byte_rate_bps?: number;
  syn_ack_ratio?: number;
  payload_entropy?: number;
  avg_packet_size?: number;
  active_socket_count?: number;
  anomaly_confidence?: number;
  l7_indicator?: string | null;
  mitre_tactic?: string;
  mitre_technique?: string;
  cve_reference?: string | null;
}

export interface PostmortemCard {
  postmortem_id?: string;
  trigger_signature?: string;
  target_tier?: string;
  textbook_sop?: string;
  learned_policy_override?: string;
  downstream_priority?: string;
}

export interface BackendMeta {
  categoryId?: number;
  threatFamily?: string;
  description?: string;
  mitigationSummary?: string;
  modelName: string;
  selectedVariant?: string;
  variantLabel?: string;
  qScore?: number;
  circuitBreaker: {
    triggered: boolean;
    banner?: string;
    reason?: string;
    violatedGates: string[];
    /** The flawed command the model produced (shown struck through). */
    interceptedCmd?: string;
    /** The Golden Fallback rule the safety gate substituted. */
    fallbackCmd?: string;
  };
  telemetry?: TelemetryVector;
  postmortem?: PostmortemCard;
}

export interface AlertCase {
  /** Same as `alert.alert_id`. */
  id: string;
  alert: NIDSAlert;
  scenario: ScenarioId | "history" | "backend";
  /** Live backend only: the `scenario_id` the backend reported (e.g. "SCENARIO_3"). */
  backendScenarioId?: string;
  /** Plain-English summary written for a mixed technical/non-technical audience. */
  summary: string;
  evidence: EvidenceItem[];
  /** Revealed proposal attempts, oldest first. The last one is current. */
  attempts: ProposalAttempt[];
  stage: LifecycleStage;
  review: ReviewState;
  execution: ExecutionResult;
  /** Chronological history of this alert. */
  timeline: ZephyrEvent[];
  provenance: DataProvenance;
  /** Live backend only: variant, Q-score, circuit breaker, telemetry vector, postmortem. */
  backendMeta?: BackendMeta;
  /** Created by running a scenario in this session (vs. seeded history). */
  isLive: boolean;
}

/* ------------------------------------------------------------------ */
/* Training & decisions                                                 */
/* ------------------------------------------------------------------ */

export interface TrainingPair {
  id: string;
  alertId: string;
  decisionId: string;
  timestamp: string;
  category: ThreatClass;
  inputSummary: string;
  chosen: ActionPayload;
  rejected: ActionPayload;
  rejectionReason: string;
  reward?: GRPORewardBreakdown;
  criticOutcome: "passed" | "failed" | "not_reported";
  modelVersion: string;
  reviewStatus: ReviewStatus;
  /** Whether this pair is usable as a preference example for GRPO training. */
  trainingEligible: boolean;
  eligibilityNote: string;
  provenance: DataProvenance;
}

export interface DecisionRecord {
  id: string;
  alertId: string;
  timestamp: string;
  threatClass: ThreatClass;
  proposedAction: ActionPayload;
  chosenAction: ActionPayload;
  rejectedAlternative: ActionPayload;
  criticResult: "passed" | "failed" | "not_reported";
  reviewerOutcome: ReviewStatus;
  executionStatus: ExecutionStatus;
  provenance: DataProvenance;
}

/* ------------------------------------------------------------------ */
/* Benchmarks                                                           */
/* ------------------------------------------------------------------ */

export interface BenchmarkMetric {
  id: string;
  label: string;
  /** Unit for display: percent values are 0–100. */
  unit: "percent" | "reward" | "seconds";
  /** Optional plain-English meaning of the metric. */
  description?: string;
  /** Values per evaluated configuration (same order as `configurations`). */
  values: (number | null)[];
  /** Optional secondary values (e.g. local GGUF latency). */
  secondaryValues?: (number | null)[];
  secondaryLabel?: string;
}

export interface BenchmarkConfiguration {
  id: string;
  label: string;
  description: string;
}

export interface BenchmarkSnapshot {
  id: string;
  title: string;
  datasetDescription: string;
  environment: string;
  caveat: string;
  configurations: BenchmarkConfiguration[];
  metrics: BenchmarkMetric[];
  provenance: "project_provided";
}

/* ------------------------------------------------------------------ */
/* Scenarios                                                            */
/* ------------------------------------------------------------------ */

export type ScenarioId = "normal" | "flash_sale" | "suspicious";
export type ScenarioRunState = "idle" | "running" | "paused" | "completed";

export type ScenarioEffect =
  | { type: "set_flows"; flows: NetworkFlow[] }
  | { type: "set_device"; deviceId: DeviceId; patch: Partial<DeviceRuntime> }
  | {
      type: "event";
      kind: EventKind;
      actor: EventActor;
      severity: EventSeverity;
      message: string;
      deviceId?: DeviceId;
      alertId?: string;
    }
  | { type: "create_case"; caseKey: string }
  | { type: "reveal_attempt"; caseKey: string; attemptIndex: number }
  | { type: "set_stage"; caseKey: string; stage: LifecycleStage }
  | { type: "toast"; tone: ToastTone; title: string; message?: string };

export interface ScenarioStep {
  id: string;
  /** Wall-clock delay (ms) before this step is applied while the runner is playing. */
  delayMs: number;
  /** Simulated seconds the demo clock moves forward when the step is applied. */
  advanceSec: number;
  effects: ScenarioEffect[];
}

export interface ScenarioDefinition {
  id: ScenarioId;
  label: string;
  summary: string;
  /** What the viewer should notice. */
  takeaway: string;
  steps: ScenarioStep[];
}

/* ------------------------------------------------------------------ */
/* Terminal                                                             */
/* ------------------------------------------------------------------ */

export type TerminalLineKind = "command" | "output" | "error" | "system" | "log";

export interface TerminalLine {
  id: string;
  kind: TerminalLineKind;
  text: string;
  /** Log lines only: simulated-clock time, source and severity (drives colours). */
  time?: string;
  tag?: string;
  tone?: EventSeverity;
}

/* ------------------------------------------------------------------ */
/* Toasts                                                               */
/* ------------------------------------------------------------------ */

export type ToastTone = "info" | "success" | "warning" | "danger";

export interface Toast {
  id: string;
  tone: ToastTone;
  title: string;
  message?: string;
}

/* ------------------------------------------------------------------ */
/* Architecture diagram                                                 */
/* ------------------------------------------------------------------ */

export type ImplementationStatus = "demo" | "simulated" | "planned";
