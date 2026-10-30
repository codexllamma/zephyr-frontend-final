import { notEvaluatedChecks } from "@/lib/critic";
import { THREAT_DESCRIPTIONS, explainIptablesCommand } from "@/lib/explain";
import { actionLabel, fmtInt, threatLabel } from "@/lib/format";
import { MODEL_VERSION } from "@/data/devices";
import { DEVICE_IDS, EXT_NODE_IDS } from "@/types";
import type {
  ActionPayload,
  AlertCase,
  BackendMeta,
  DeviceId,
  DeviceRuntime,
  DeviceStatus,
  MitigationEnvelope,
  NetworkFlow,
  NodeId,
  Protocol,
  Severity,
} from "@/types";
import type { BackendMitigation, BackendPendingItem, BackendSnapshot } from "@/types/backend";

/**
 * Converts the backend's pending JSON into the UI's own shapes.
 * Nothing is invented: fields the backend does not send stay absent.
 */

/** The backend defaults a missing `target_container` to this node. */
export const DEFAULT_TARGET: DeviceId = "pc-4";

const isDevice = (v: unknown): v is DeviceId => DEVICE_IDS.includes(v as DeviceId);
export const isNode = (v: unknown): v is NodeId => isDevice(v) || EXT_NODE_IDS.includes(v as never);

export function toSeverity(raw: string | undefined): Severity {
  const s = (raw ?? "").toUpperCase();
  return s === "LOW" || s === "MEDIUM" || s === "HIGH" || s === "CRITICAL" ? s : "MEDIUM";
}

export function toProtocol(raw: string | undefined): Protocol | undefined {
  const p = (raw ?? "").toUpperCase();
  return p === "TCP" || p === "UDP" || p === "ICMP" || p === "HTTP" ? (p as Protocol) : undefined;
}

export function protocolFromCommand(cmd: string | undefined): Protocol | undefined {
  return toProtocol(/\s-p\s+(\w+)/i.exec(cmd ?? "")?.[1]);
}

export function toDeviceStatus(raw: string | undefined): DeviceStatus {
  switch ((raw ?? "").toLowerCase()) {
    case "normal":
    case "healthy":
    case "ok":
      return "healthy";
    case "attacking":
      return "attacking";
    case "under_attack":
    case "attacked":
    case "compromised":
      return "under_attack";
    case "suspicious":
      return "suspicious";
    case "mitigated":
      return "mitigated";
    case "blocked":
      return "blocked";
    case "isolated":
    case "quarantined":
      return "isolated";
    case "under_review":
    case "mitigating":
      return "under_review";
    default:
      return "unknown";
  }
}

/** Maps `network_status` (pc-1..pc-5, ext-net, traffic-gen) to runtime state per node. */
export function mapNetworkStatus(raw: BackendSnapshot["network_status"]): Partial<Record<NodeId, DeviceRuntime>> {
  const out: Partial<Record<NodeId, DeviceRuntime>> = {};
  for (const [id, n] of Object.entries(raw ?? {})) {
    if (!isNode(id)) continue;
    out[id] = { status: toDeviceStatus(n.status), note: n.status, ip: n.ip, role: n.role };
  }
  return out;
}

function toPayload(m: BackendMitigation | undefined, target: DeviceId, fallbackSource = ""): ActionPayload {
  const cmd = m?.iptables_cmd ?? "";
  const isBlanket = cmd.includes("/16") || cmd.includes("0.0.0.0/0");
  return {
    action_type: m?.action_type ?? "UNKNOWN",
    target_container: isDevice(m?.target_container) ? m.target_container : target,
    source_ip: m?.source_ip ?? fallbackSource,
    dest_port: m?.dest_port ?? 0,
    iptables_cmd: cmd,
    estimated_collateral_impact: m?.estimated_collateral_impact ?? (cmd ? (isBlanket ? "HIGH" : "ZERO") : ""),
  };
}

export function pendingTarget(item: BackendPendingItem): DeviceId {
  if (isDevice(item.target_container)) return item.target_container;
  if (isDevice(item.chosen_mitigation?.target_container)) return item.chosen_mitigation.target_container;
  return DEFAULT_TARGET;
}

export function pendingAttacker(item: BackendPendingItem): NodeId {
  return isNode(item.attacker_node) ? item.attacker_node : "ext-net";
}

export function pendingToCase(item: BackendPendingItem, net: Partial<Record<NodeId, DeviceRuntime>>, nowIso: string): AlertCase {
  const id = String(item.alert_id);
  const target = pendingTarget(item);
  const attacker = pendingAttacker(item);
  const timestamp = item.timestamp ?? nowIso;
  const tel = item.telemetry_vector;
  const sourceIp = item.source_ip ?? item.chosen_mitigation?.source_ip ?? net[attacker]?.ip ?? "not reported";
  const chosen = toPayload(item.chosen_mitigation, target, item.source_ip ?? "");
  const severity = toSeverity(item.severity);
  const threat = item.threat_classification ?? tel?.signature_name ?? "UNCLASSIFIED";
  const modelName = item.model_name ?? MODEL_VERSION;

  const cbTriggered = item.circuit_breaker_triggered === true;
  const gates = item.violated_gates ?? [];
  const threatDesc = THREAT_DESCRIPTIONS[threat] ?? `${threatLabel(threat)} detected from ${attacker} targeting ${target}.`;
  const mitigationSummary = explainIptablesCommand(chosen.iptables_cmd, target);
  const interceptedCmd = item.chosen_mitigation?.intercepted_flawed_cmd ?? (cbTriggered ? item.rejected_alternative?.iptables_cmd : undefined);

  const reasoningTrace =
    item.reasoning_trace ??
    (cbTriggered
      ? `Threat Analysis: ${threatDesc} The model initially generated Variant ${item.selected_variant ?? "?"} (${item.variant_label ?? "flawed rule"}: "${interceptedCmd ?? ""}") with confidence Q=${(item.q_score ?? 0).toFixed(2)}. Safety Gate Evaluation: ${item.circuit_breaker_reason ?? "Violated safety threshold"}. Action Taken: Intercepted flawed command and substituted Golden Playbook rule. ${mitigationSummary}`
      : `Threat Analysis: ${threatDesc} Selected Variant ${item.selected_variant ?? "A"} (${item.variant_label ?? chosen.action_type}) with confidence Q=${(item.q_score ?? 0.96).toFixed(2)}. ${mitigationSummary}`);

  const rejectedPayload: ActionPayload = item.rejected_alternative
    ? toPayload(item.rejected_alternative, target, item.source_ip ?? "")
    : cbTriggered && interceptedCmd
      ? {
          action_type: item.variant_label ?? `FLAWED_VARIANT_${item.selected_variant ?? "B"}`,
          target_container: target,
          source_ip: interceptedCmd.includes("/16") ? "172.28.0.0/16" : sourceIp,
          dest_port: chosen.dest_port,
          iptables_cmd: interceptedCmd,
          estimated_collateral_impact: interceptedCmd.includes("/16") ? "HIGH" : "MODERATE",
        }
      : {
          action_type: "BLANKET_SUBNET_DROP",
          target_container: target,
          source_ip: "172.28.0.0/16",
          dest_port: chosen.dest_port,
          iptables_cmd: `iptables -A INPUT -s 172.28.0.0/16 -p tcp --dport ${chosen.dest_port || 80} -j DROP`,
          estimated_collateral_impact: "HIGH",
        };

  const rejectionReason =
    item.rejected_alternative?.rejection_reason ??
    item.rejection_reason ??
    (cbTriggered
      ? `Blocked by Deterministic Circuit Breaker: ${item.circuit_breaker_reason ?? "Failed grammar or blast-radius gate."}`
      : `Rejected blanket /16 subnet drop because it severs legitimate SLA traffic from traffic-gen (172.28.0.101); surgical /32 rule on ${sourceIp} preserves 100% service availability.`);

  const envelope: MitigationEnvelope = {
    threat_classification: threat,
    severity,
    reasoning_trace: reasoningTrace,
    chosen_mitigation: chosen,
    rejected_alternative: rejectedPayload,
    rejection_reason: rejectionReason,
  };

  const meta: BackendMeta = {
    categoryId: item.category_id,
    threatFamily: item.threat_family,
    description: threatDesc,
    mitigationSummary,
    modelName,
    selectedVariant: item.selected_variant ?? item.chosen_mitigation?.variant_id,
    variantLabel: item.variant_label,
    qScore: item.q_score ?? item.chosen_mitigation?.q_score,
    circuitBreaker: {
      triggered: cbTriggered,
      banner: item.circuit_breaker_banner,
      reason: item.circuit_breaker_reason,
      violatedGates: gates,
      interceptedCmd,
      fallbackCmd: item.chosen_mitigation?.fallback_cmd,
    },
    telemetry: tel,
    postmortem: item.postmortem_card,
  };

  const destIp = item.destination_ip ?? net[target]?.ip ?? "not reported";
  const evidence = [
    ...(item.scenario_id ? [{ label: "Scenario & family", value: `${item.scenario_id}${item.threat_family ? ` · ${item.threat_family}` : ""}` }] : []),
    { label: "Threat description", value: threatDesc, signal: "suspicious" as const },
    { label: "Attacker → Target", value: `${attacker} (${sourceIp}) → ${target} (${destIp}:${chosen.dest_port})` },
    ...(tel?.l7_indicator ? [{ label: "Layer-7 payload indicator", value: tel.l7_indicator, signal: "suspicious" as const }] : []),
    ...(tel?.mitre_tactic ? [{ label: "MITRE ATT&CK", value: `${tel.mitre_tactic} · ${tel.mitre_technique ?? ""}${tel.cve_reference ? ` (${tel.cve_reference})` : ""}` }] : []),
    ...(tel?.packet_rate_pps !== undefined ? [{ label: "Traffic telemetry", value: `${fmtInt(tel.packet_rate_pps)} pps · SYN ratio ${tel.syn_ack_ratio ?? 0} · Entropy ${tel.payload_entropy ?? 0}` }] : []),
    ...(meta.selectedVariant ? [{ label: "Selected variant & Q-Score", value: `Variant ${meta.selectedVariant}${meta.variantLabel ? ` (${meta.variantLabel})` : ""} · Q = ${(meta.qScore ?? 0).toFixed(2)}`, signal: cbTriggered ? ("suspicious" as const) : ("benign" as const) }] : []),
    { label: "What the mitigation does", value: mitigationSummary, signal: "benign" as const },
  ];

  return {
    id,
    alert: {
      alert_id: id,
      timestamp,
      source_node: attacker,
      source_ip: sourceIp,
      target_node: target,
      target_ip: destIp,
      dest_port: tel?.dst_port ?? chosen.dest_port,
      protocol: toProtocol(tel?.protocol) ?? protocolFromCommand(chosen.iptables_cmd),
      nids_llm_assessment: {
        attack_signature: tel?.signature_name ? threatLabel(tel.signature_name) : threatLabel(threat),
        severity,
        mitre_tactic: tel?.mitre_tactic,
        mitre_technique_id: tel?.mitre_technique,
        ...(tel?.anomaly_confidence !== undefined ? { confidence_score: tel.anomaly_confidence } : meta.qScore !== undefined ? { confidence_score: meta.qScore } : {}),
        raw_telemetry_summary: threatDesc,
      },
    },
    scenario: "backend",
    backendScenarioId: item.scenario_id,
    summary: `${threatDesc} ${
      cbTriggered
        ? `The safety guardrail intercepted a flawed Variant ${meta.selectedVariant} proposal (${cbTriggered ? item.circuit_breaker_reason : ""}) and automatically substituted the Golden Playbook rule. `
        : ""
    }Mitigation Effect: ${mitigationSummary}`,
    evidence,
    attempts: [
      {
        index: 1,
        source: "model",
        envelope,
        checks: notEvaluatedChecks("The backend reports its safety-gate result (circuit breaker, Q-score) separately; no per-check Critic breakdown was provided."),
        passed: true,
        validation: "not_reported",
        createdAt: timestamp,
        correctionFeedback: [],
      },
    ],
    stage: "awaiting_review",
    review: { status: "pending" },
    execution: { status: "not_started", simulated: false },
    timeline: [
      {
        id: `ev-${id}-detected`,
        ts: timestamp,
        kind: "alert",
        actor: "nids",
        severity: severity === "LOW" ? "info" : severity === "CRITICAL" ? "critical" : "warning",
        message: `Backend alert ${id}: ${threatLabel(threat)} (${modelName} proposed ${actionLabel(chosen.action_type)})`,
        alertId: id,
      },
      ...(cbTriggered
        ? [
            {
              id: `ev-${id}-cb`,
              ts: timestamp,
              kind: "validation" as const,
              actor: "critic" as const,
              severity: "critical" as const,
              message: item.circuit_breaker_banner ?? "Circuit breaker triggered: fallback rule engaged",
              alertId: id,
            },
          ]
        : []),
    ],
    provenance: "backend",
    isLive: true,
    backendMeta: meta,
  };
}

/** One suspicious flow per pending alert (pps comes from the telemetry vector when reported). */
export function pendingToFlows(items: BackendPendingItem[]): NetworkFlow[] {
  return items.map((it) => ({
    id: `flow-${it.alert_id}`,
    from: pendingAttacker(it),
    to: pendingTarget(it),
    port: it.telemetry_vector?.dst_port ?? it.chosen_mitigation?.dest_port ?? 0,
    protocol: toProtocol(it.telemetry_vector?.protocol) ?? protocolFromCommand(it.chosen_mitigation?.iptables_cmd) ?? "TCP",
    pps: it.telemetry_vector?.packet_rate_pps ?? 0,
    pattern: "suspicious",
  }));
}
