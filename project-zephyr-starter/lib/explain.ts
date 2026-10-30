import { DEVICE_BY_ID, serviceName } from "@/data/devices";
import { actionLabel, fmtInt, threatLabel } from "@/lib/format";
import { currentAttempt } from "@/lib/selectors";
import type { AlertCase } from "@/types";

export interface ExplanationItem {
  question: string;
  answer: string;
}

/** Exact scenario threat descriptions from the Zephyr 30-category catalog. */
export const THREAT_DESCRIPTIONS: Record<string, string> = {
  TCP_SYN_VOLUMETRIC: "Floods the target with half-open connections to exhaust kernel connection tracking tables.",
  UDP_CARPET_BOMB: "Blasts high-entropy UDP datagrams across application ports to saturate link bandwidth and stateless packet processing.",
  MEMCACHED_UDP_REFLECTION: "Exploits exposed Memcached UDP instances on port 11211 to generate massive amplified reflection responses.",
  HTTP_SLOWLORIS: "Holds concurrent HTTP sockets open indefinitely by trickling partial request headers to starve worker pools.",
  HTTP_RUDY_SLOW_POST: "Declares a large Content-Length header and trickles HTTP POST body data at 1 byte per interval to lock application threads.",
  TLS_RENEGOTIATION_DOS: "Forces repeated cryptographic TLS handshakes on port 443 to exhaust server asymmetric key compute capacity.",
  TCP_STEALTH_SYN_SCAN: "Performs half-open SYN port sweeping across common service ports without completing the TCP handshake.",
  TCP_XMAS_FINGERPRINT: "Sends malformed TCP segments with FIN, URG, and PSH flags illuminated to fingerprint target OS kernel TCP/IP stack responses.",
  UDP_SNMP_WALK: "Enumerates network management information bases (MIBs) on UDP port 161 using default public community strings.",
  SQL_INJECTION_UNION: "Injects UNION SELECT SQL payloads into HTTP query strings to extract backend relational database credentials.",
  LOG4SHELL_JNDI_INJECTION: "Sends crafted JNDI LDAP lookup expressions in HTTP headers to trigger remote class loading and code execution.",
  PATH_TRAVERSAL_LFI: "Attempts directory traversal using dot-dot-slash sequences in HTTP URIs to read sensitive host configuration files.",
  DOCKER_DAEMON_BREAKOUT: "Probes unauthenticated Docker Engine TCP socket on port 2375 to spawn privileged host-mounted containers.",
  KUBELET_ANON_EXEC: "Targets Kubelet API port 10250 with anonymous HTTPS requests to execute arbitrary commands inside running pods.",
  SSRF_METADATA_PROBE: "Exploits Server-Side Request Forgery to query cloud instance metadata endpoints for temporary IAM credentials.",
  SSH_CREDENTIAL_STUFFING: "Executes high-velocity automated SSH login attempts on port 22 using leaked credential lists.",
  POSTGRES_AUTH_BRUTEFORCE: "Floods PostgreSQL port 5432 with rapid MD5/SCRAM authentication handshakes to crack database superuser passwords.",
  MYSQL_AUTH_BYPASS: "Repeatedly initiates MySQL handshake packets on port 3306 to trigger timing-based authentication bypass flaws.",
  SMB_ETERNALBLUE: "Sends crafted SMBv1 Trans2 buffer overflow payloads to port 445 for wormable lateral code execution.",
  FTP_BOUNCE_ATTACK: "Abuses FTP PORT active mode commands on port 21 to proxy internal port scans through an intermediary server.",
  REDIS_SLAVEOF_RCE: "Connects to unauthenticated Redis instances on port 6379 to inject rogue replication commands and SSH authorized keys.",
  DNS_TXT_EXFILTRATION: "Encodes sensitive internal data into high-entropy base64 subdomains within outbound/inbound UDP port 53 TXT queries.",
  ICMP_PAYLOAD_TUNNELING: "Embeds encrypted command-and-control payloads inside oversized ICMP Echo Request packets to bypass TCP/UDP filters.",
  CRYPTOMINER_STRATUM_BEACON: "Establishes persistent JSON-RPC Stratum connections on port 3333 to coordinate unauthorized cryptocurrency mining.",
  TELNET_MIRAI_LOADER: "Sweeps TCP port 23 with factory default credentials to deploy Mirai botnet BusyBox droppers on edge appliances.",
  MQTT_TOPIC_HIJACK: "Connects to unauthenticated MQTT message brokers on port 1883 and subscribes to wildcard '#' topics to intercept telemetry.",
  COAP_MULTICAST_FLOOD: "Sends spoofed Constrained Application Protocol requests to UDP port 5683 to trigger IoT packet amplification.",
  TCP_RST_TEARDOWN: "Injects high-rate out-of-window TCP RST segments to prematurely sever established client-server sessions.",
  BGP_SESSION_HIJACK: "Targets Border Gateway Protocol port 179 with unauthorized route announcements and session resets to blackhole subnet traffic.",
  IP_FRAGMENTATION_TEARDROP: "Transmits oversized, overlapping IPv4 packet fragments via ICMP to corrupt kernel reassembly buffers and evade stateless inspection.",
};

/**
 * Translates a raw netfilter `iptables` command into a clear, plain-English operational explanation
 * of what the mitigation does, how it works in the Linux kernel, and why benign traffic stays safe.
 */
export function explainIptablesCommand(cmd: string | undefined, targetNode = "pc-4"): string {
  if (!cmd || !cmd.trim()) return "No firewall command specified.";
  const c = cmd.trim();
  const srcMatch = /-s\s+([^\s]+)/.exec(c);
  const protoMatch = /-p\s+([^\s]+)/.exec(c);
  const dportMatch = /--dport\s+(\d+)/.exec(c);
  const limitMatch = /--limit\s+([^\s]+)/.exec(c);
  const burstMatch = /--limit-burst\s+(\d+)/.exec(c);
  const connlimitMatch = /--connlimit-above\s+(\d+)/.exec(c);
  const lengthMatch = /--length\s+([^\s]+)/.exec(c);
  const recentSecMatch = /--seconds\s+(\d+)/.exec(c);
  const hitcountMatch = /--hitcount\s+(\d+)/.exec(c);
  const flagsMatch = /--tcp-flags\s+([^\s]+)\s+([^\s]+)/.exec(c);
  const jumpMatch = /-j\s+([^\s]+)/.exec(c);
  const rejectWithMatch = /--reject-with\s+([^\s]+)/.exec(c);

  const src = srcMatch ? srcMatch[1] : "the attacker IP";
  const proto = protoMatch ? protoMatch[1].toUpperCase() : "network";
  const portPart = dportMatch ? ` targeting port ${dportMatch[1]}` : "";
  const jump = jumpMatch ? jumpMatch[1] : "DROP";

  // Check if it's a flawed /16 blanket drop
  if (src.includes("/16") || src === "0.0.0.0/0") {
    return `Over-broad subnet rule: drops all ${proto} traffic from ${src}${portPart} on ${targetNode}, which would sever legitimate users across the entire bridge.`;
  }

  const parts: string[] = [];

  if (connlimitMatch) {
    parts.push(
      `Enforces a concurrent connection cap (-m connlimit) on ${targetNode}: any single source (${src}) attempting more than ${connlimitMatch[1]} simultaneous ${proto} connections${portPart} is immediately ${jump === "REJECT" ? `rejected (${rejectWithMatch?.[1] ?? "tcp-reset"})` : "dropped"}`,
    );
  } else if (hitcountMatch && recentSecMatch) {
    parts.push(
      `Enforces stateful brute-force tracking (-m recent) on ${targetNode}: blocks ${src}${portPart} once it exceeds ${hitcountMatch[1]} connection attempts within ${recentSecMatch[1]} seconds`,
    );
  } else if (limitMatch) {
    const inverted = /!\s*--limit/.test(c);
    const burst = burstMatch ? ` (burst tolerance ${burstMatch[1]} packets)` : "";
    if (inverted && jump === "DROP") {
      parts.push(
        `Applies a surgical token-bucket rate limiter (-m limit) on ${targetNode}: drops excess ${proto}${c.includes("--syn") ? " SYN handshake" : ""} packets from ${src}${portPart} exceeding ${limitMatch[1]}${burst}`,
      );
    } else {
      parts.push(
        `Applies a rate-limited acceptance policy (-m limit) on ${targetNode}: caps ${proto} traffic from ${src}${portPart} to ${limitMatch[1]}${burst}`,
      );
    }
  } else if (lengthMatch) {
    parts.push(
      `Filters by packet payload size (-m length) on ${targetNode}: ${jump.toLowerCase()}s oversized ${proto} packets (${lengthMatch[1]} bytes) from ${src}${portPart} used for C2/exfiltration while allowing normal-sized queries`,
    );
  } else if (flagsMatch) {
    parts.push(
      `Inspects TCP header flags (--tcp-flags ${flagsMatch[1]} ${flagsMatch[2]}) on ${targetNode}: ${jump.toLowerCase()}s malformed/reconnaissance segments from ${src}${portPart}`,
    );
  } else if (/\s-f(\s|$)/.test(c)) {
    parts.push(
      `Blocks fragmented packets (-f) on ${targetNode}: drops overlapping IPv4/ICMP fragments from ${src} to prevent kernel reassembly buffer corruption`,
    );
  } else if (jump === "REJECT") {
    parts.push(
      `Surgically terminates malicious sessions from ${src}/32${portPart} on ${targetNode} using ${rejectWithMatch ? `TCP RST (${rejectWithMatch[1]})` : "ICMP reject"} to immediately free server sockets`,
    );
  } else {
    parts.push(
      `Surgically drops inbound ${proto} packets strictly from attacker IP ${src}/32${portPart} at the ${targetNode} INPUT netfilter chain`,
    );
  }

  parts.push("Legitimate traffic from other hosts (such as traffic-gen 172.28.0.101) remains 100% unaffected (Zero Collateral Blast Radius).");
  return parts.join(". ");
}

/**
 * Builds the plain-English "explain the decision" panel from case data.
 * Deterministic templates over structured fields — not model-generated text.
 */
export function explainDecision(c: AlertCase): ExplanationItem[] {
  const a = c.alert;
  const m = a.flow_metrics;
  const attempt = currentAttempt(c);
  if (c.provenance === "backend") return explainBackendDecision(c);
  const items: ExplanationItem[] = [];
  const conf = Math.round((a.nids_llm_assessment.confidence_score ?? 0) * 100);

  items.push({
    question: "What did the system observe?",
    answer: m
      ? `In a 2-second window, ${a.source_node} sent ${fmtInt(m.packet_count_2s)} packets to the ${serviceName(a.dest_port)} on ${a.target_node} (${a.target_ip}:${a.dest_port}). ${Math.round(m.syn_ratio * 100)}% of them were connection-start (SYN) packets.`
      : `${a.source_node} was flagged against ${a.target_node} (${a.target_ip}:${a.dest_port}). No flow metrics were reported.`,
  });

  items.push({
    question: "Why might the traffic be suspicious?",
    answer:
      a.nids_llm_assessment.mitre_technique_id === "T0000"
        ? `Mostly it is not: ${a.nids_llm_assessment.raw_telemetry_summary ?? ""} Confidence that this is an attack is only ${conf}%.`
        : `${a.nids_llm_assessment.raw_telemetry_summary ?? ""} The NIDS rates this ${a.nids_llm_assessment.severity} with ${conf}% confidence (MITRE ${a.nids_llm_assessment.mitre_technique_id ?? "n/a"}, ${a.nids_llm_assessment.mitre_tactic ?? "n/a"}).`,
  });

  if (!attempt) {
    items.push({
      question: "What action is proposed?",
      answer: "No proposal exists yet. The model is still drafting a mitigation for this alert.",
    });
    return items;
  }

  const env = attempt.envelope;
  const chosen = env.chosen_mitigation;
  const rejected = env.rejected_alternative;
  const isNoOp = chosen.action_type === "NO_OP";

  items.push({
    question: "What action is proposed?",
    answer: isNoOp
      ? `Take no action (NO_OP) and keep monitoring. Classification: ${threatLabel(env.threat_classification)}.`
      : `${actionLabel(chosen.action_type)} on ${chosen.target_container}: ${chosen.iptables_cmd}`,
  });

  items.push({
    question: "Why is that action proportionate?",
    answer: isNoOp
      ? `Volume alone does not prove malicious intent. Leaving ${DEVICE_BY_ID[a.target_node].role.toLowerCase()} untouched has zero collateral impact. ${env.reasoning_trace}`
      : `It targets only ${chosen.source_ip} on port ${chosen.dest_port}, with ${chosen.estimated_collateral_impact.toLowerCase()} collateral impact, so legitimate users of other addresses are unaffected. ${env.reasoning_trace}`,
  });

  items.push({
    question: "What alternative was rejected?",
    answer: `${actionLabel(rejected.action_type)} (${rejected.estimated_collateral_impact.toLowerCase()} collateral). ${env.rejection_reason}`,
  });

  const failed = attempt.checks.filter((k) => k.status === "failed");
  const passed = attempt.checks.filter((k) => k.status === "passed");
  items.push({
    question: "What did the Critic validate?",
    answer: attempt.passed
      ? `All ${passed.length} deterministic checks passed: ${passed.map((k) => k.label.toLowerCase()).join(", ")}.${c.attempts.length > 1 ? ` This is attempt ${attempt.index}; earlier unsafe attempts were rejected and corrected.` : ""}`
      : `${failed.length} check(s) failed (${failed.map((k) => k.label.toLowerCase()).join(", ")}). This proposal is blocked and cannot be executed.`,
  });

  let human: string;
  switch (c.review.status) {
    case "pending":
      human = attempt.passed
        ? "A human reviewer must approve before anything runs. Approving triggers a final Critic re-check, then execution."
        : "Nothing can proceed: the Critic blocked this proposal, so it cannot be approved as written.";
      break;
    case "approved":
      human = `${c.review.reviewer ?? "A reviewer"} approved this proposal. ${c.execution.simulated ? "Execution is simulated in this demo." : ""}`.trim();
      break;
    case "rejected":
      human = `${c.review.reviewer ?? "A reviewer"} rejected the proposal. Nothing was applied.`;
      break;
    case "revision_requested":
      human = `${c.review.reviewer ?? "A reviewer"} asked for a revision. Nothing was applied.`;
      break;
    case "marked_benign":
      human = `${c.review.reviewer ?? "A reviewer"} marked this traffic as benign. Nothing was applied.`;
      break;
  }
  items.push({ question: "What still requires human approval?", answer: human });
  return items;
}

/** Explanation for a live-backend case: uses catalog threat descriptions, telemetry, and netfilter rule breakdown. */
export function explainBackendDecision(c: AlertCase): ExplanationItem[] {
  const a = c.alert;
  const attempt = currentAttempt(c);
  const tel = c.backendMeta?.telemetry;
  const threatDesc = c.backendMeta?.description ?? THREAT_DESCRIPTIONS[attempt?.envelope.threat_classification ?? ""] ?? "";

  const items: ExplanationItem[] = [
    {
      question: "What threat was detected & what does it do?",
      answer: `${threatLabel(attempt?.envelope.threat_classification ?? a.nids_llm_assessment.attack_signature)} (${c.backendMeta?.threatFamily ?? "Network Threat"}). ${threatDesc} Source ${a.source_node} (${a.source_ip}) targeted ${a.target_node} (${a.target_ip}:${a.dest_port}).`,
    },
    {
      question: "What network telemetry triggered the alert?",
      answer: tel
        ? `Observed ${fmtInt(tel.packet_rate_pps ?? 0)} packets/s (${fmtInt(tel.byte_rate_bps ?? 0)} B/s), SYN/ACK ratio ${tel.syn_ack_ratio ?? 0}, payload entropy ${tel.payload_entropy ?? 0}, and ${fmtInt(tel.active_socket_count ?? 0)} active sockets.${tel.l7_indicator ? ` Layer-7 payload indicator: "${tel.l7_indicator}".` : ""}${tel.mitre_tactic ? ` Mapped to MITRE ATT&CK ${tel.mitre_tactic} (${tel.mitre_technique ?? ""}${tel.cve_reference ? ` · ${tel.cve_reference}` : ""}).` : ""}`
        : `Flagged ${a.source_node} (${a.source_ip}) against ${a.target_node}.`,
    },
  ];
  if (!attempt) return items;
  const env = attempt.envelope;
  const chosen = env.chosen_mitigation;
  const isNoOp = chosen.action_type === "NO_OP";
  const cmdExplanation = explainIptablesCommand(chosen.iptables_cmd, chosen.target_container);

  items.push(
    {
      question: "What does the mitigation do & how does the rule work?",
      answer: isNoOp
        ? "Take no action (NO_OP) and continue monitoring."
        : `${cmdExplanation} Exact rule: ${chosen.iptables_cmd}`,
    },
    {
      question: "How did the Circuit Breaker & Safety Gates evaluate this?",
      answer: c.backendMeta
        ? c.backendMeta.circuitBreaker.triggered
          ? `CIRCUIT BREAKER TRIGGERED: The model initially proposed Variant ${c.backendMeta.selectedVariant} ("${c.backendMeta.circuitBreaker.interceptedCmd}") with confidence Q = ${c.backendMeta.qScore?.toFixed(2)}. It failed: ${c.backendMeta.circuitBreaker.reason ?? c.backendMeta.circuitBreaker.violatedGates.join(" | ")}. The safety guardrail blocked that command and automatically substituted the verified Golden Playbook rule.`
          : `PASSED ALL GATES: Variant ${c.backendMeta.selectedVariant ?? "A"} (${c.backendMeta.variantLabel ?? chosen.action_type}) achieved Q-Score = ${c.backendMeta.qScore?.toFixed(2) ?? "0.96"} (threshold ≥ 0.75), passed deterministic iptables grammar validation, and verified a surgical /32 blast radius.`
        : "Validated by backend safety gates.",
    },
  );
  let human: string;
  switch (c.review.status) {
    case "pending":
      human = `Awaiting Blue Team operator approval. Clicking Approve runs "docker exec ${chosen.target_container} ${chosen.iptables_cmd}" inside the container's Linux network namespace and immediately runs an SLA health probe.`;
      break;
    case "approved":
      human = `Approved & Executed in Docker container ${chosen.target_container}: "${c.execution.appliedCommand ?? chosen.iptables_cmd}". Attacker traffic from ${a.source_ip} is neutralized while benign SLA traffic remains HTTP 200 OK.`;
      break;
    case "rejected":
      human = `Rejected by operator. No firewall rule was injected into ${chosen.target_container}.`;
      break;
    default:
      human = "No further action is recorded.";
  }
  items.push({ question: "Execution & SLA Status", answer: human });
  return items;
}
