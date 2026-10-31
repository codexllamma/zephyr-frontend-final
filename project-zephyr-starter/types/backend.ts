/**
 * Wire types for the live Zephyr FastAPI backend (v4.0).
 * `lib/live-map.ts` converts these to the UI's own types.
 */
import type { PostmortemCard, TelemetryVector } from "@/types";

export interface BackendMitigation {
  action_type: string;
  /** Backend defaults to pc-4 when the model omits it. */
  target_container?: string;
  source_ip?: string;
  dest_port?: number;
  iptables_cmd?: string;
  fallback_cmd?: string;
  intercepted_flawed_cmd?: string;
  estimated_collateral_impact?: string;
  q_score?: number;
  variant_id?: string;
}

export interface BackendRejectedAlternative extends BackendMitigation {
  rejection_reason?: string;
}

export interface BackendPendingItem {
  alert_id: string;
  category_id?: number;
  threat_family?: string;
  scenario_id?: string;
  attacker_node?: string;
  target_container?: string;
  source_ip?: string;
  destination_ip?: string;
  timestamp?: string;
  threat_classification?: string;
  severity?: string;
  model_name?: string;
  telemetry_vector?: TelemetryVector;
  selected_variant?: string;
  variant_label?: string;
  q_score?: number;
  circuit_breaker_triggered?: boolean;
  circuit_breaker_banner?: string;
  circuit_breaker_reason?: string;
  violated_gates?: string[];
  reasoning_trace?: string;
  chosen_mitigation?: BackendMitigation;
  rejected_alternative?: BackendRejectedAlternative;
  rejection_reason?: string;
  postmortem_card?: PostmortemCard;
  execution_mode?: "demo" | "live";
  latency_sec?: number;
  inference_source?: string;
}

export interface BackendNetworkNode {
  ip?: string;
  role?: string;
  /** normal | attacking | under_attack | mitigated | blocked */
  status?: string;
}

export interface ExecutedHistoryRecord {
  alert_id: string;
  resolved_at?: string;
  target_container?: string;
  injected_cmd?: string;
  simulated?: boolean;
  envelope?: BackendPendingItem;
}

export interface BackendSnapshot {
  count?: number;
  pending: BackendPendingItem[];
  executed_history?: ExecutedHistoryRecord[];
  /** pc-1..pc-5, ext-net, traffic-gen */
  network_status?: Record<string, BackendNetworkNode>;
}

export interface ExecuteResponse {
  status: string;
  simulated?: boolean;
  alert_id?: string;
  target?: string;
  injected_cmd?: string;
  postmortem_card?: PostmortemCard;
}

/** POST /api/v1/simulate_nlp_attack */
export type VariantMode = "RANDOM" | "A" | "B" | "C" | "D" | "CYCLE";
export interface NlpAttackRequest {
  source: string;
  target: string;
  prompt: string;
  force_variant: VariantMode;
  auto_inject_alert: boolean;
}
export interface NlpAttackResponse {
  status?: string;
  router_tier?: string;
  category_id?: number;
  scenario_id?: string;
  threat_classification?: string;
  selected_variant_mode?: string;
  alert_id?: string;
  attacker?: string;
  target?: string;
  command?: string;
  mitigation_envelope?: BackendPendingItem | null;
}

/** Normalised GET /api/v1/catalog (see lib/catalog.ts). */
export interface CatalogThreat {
  id: string;
  scenarioKey: string;
  threatClassification: string;
  threatFamily: string;
  label: string;
  /** Text sent as the NLP prompt when this entry is chosen. */
  prompt: string;
  categoryId?: number;
  severity?: string;
  protocol?: string;
  targetPort?: number;
  description?: string;
}
export interface Catalog {
  sources: string[];
  targets: string[];
  threats: CatalogThreat[];
}

/** GET /api/v1/terminal/health */
export interface SlaHealth {
  node?: string;
  source_ip?: string;
  target_node?: string;
  target_ip?: string;
  status?: string;
  healthy?: boolean;
  http_code?: number;
  latency_ms?: number;
  timestamp?: string;
  recent_logs?: string;
}

/** GET /api/v1/terminal/logs */
export interface BackendLogEntry {
  id: string | number;
  timestamp?: string;
  level?: string;
  text: string;
}
export interface BackendLogs {
  logs: BackendLogEntry[];
  network_status?: Record<string, BackendNetworkNode>;
}
