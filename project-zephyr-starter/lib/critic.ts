import { IP_TO_NODE, NODE_IP } from "@/data/devices";
import type {
  ActionPayload,
  ActionType,
  CollateralImpact,
  CriticCheck,
  CriticCheckId,
  MitigationEnvelope,
  NIDSAlert,
  ThreatClass,
} from "@/types";
import { DEVICE_IDS } from "@/types";

/**
 * Frontend re-implementation of the deterministic Critic rule categories.
 *
 * IMPORTANT: this is NOT the production Critic (`judge.py` in the Zephyr
 * backend). It is a small, pure TypeScript mirror of the same rule families so
 * that the demo's pass/fail results are *computed* from the proposal under
 * review rather than hardcoded. The proposals it evaluates are demo fixtures.
 */

export const CRITIC_CHECKS: { id: CriticCheckId; label: string }[] = [
  { id: "schema", label: "Schema validity" },
  { id: "grounding", label: "Entity / IP grounding" },
  { id: "syntax", label: "Firewall syntax" },
  { id: "boundary", label: "Container / network boundary" },
  { id: "proportionality", label: "Action proportionality" },
];

const THREATS: ThreatClass[] = [
  "SYN_FLOOD",
  "RCE_ATTEMPT",
  "SQL_INJECTION",
  "SSH_BRUTE_FORCE",
  "PORT_SCAN",
  "BENIGN",
];
const ACTIONS: ActionType[] = [
  "BLOCK_SOURCE_IP",
  "RATE_LIMIT_SYN",
  "DROP_PORT_TRAFFIC",
  "ISOLATE_NODE",
  "NO_OP",
];
const IMPACTS: CollateralImpact[] = ["ZERO", "LOW", "MODERATE", "HIGH"];
const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

const SHELL_INJECTION = /[;&|`$><\n\r]/;
const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const FORBIDDEN_FLAGS = new Set(["-F", "--flush", "-X", "--delete-chain", "-P", "--policy", "-Z", "--zero"]);
const ALLOWED_TARGETS = new Set(["DROP", "REJECT", "ACCEPT"]);
const HOST_ROUTING_CHAINS = new Set(["PREROUTING", "POSTROUTING", "FORWARD", "OUTPUT"]);
/** Flags the demo parser understands, and how many values each takes. */
const FLAG_ARITY: Record<string, number> = {
  "-A": 1,
  "-s": 1,
  "-p": 1,
  "--dport": 1,
  "-j": 1,
  "--syn": 0,
  "-m": 1,
  "--limit": 1,
  "--limit-burst": 1,
  "-t": 1,
};

/* ------------------------------------------------------------------ */
/* Parsing                                                              */
/* ------------------------------------------------------------------ */

/** Minimal shlex-style tokenizer. Returns null on unbalanced quotes. */
export function shlexSplit(input: string): string[] | null {
  const tokens: string[] = [];
  let cur = "";
  let quote: '"' | "'" | null = null;
  let has = false;
  for (const ch of input) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      has = true;
    } else if (/\s/.test(ch)) {
      if (cur || has) tokens.push(cur);
      cur = "";
      has = false;
    } else {
      cur += ch;
    }
  }
  if (quote) return null;
  if (cur || has) tokens.push(cur);
  return tokens;
}

interface ParsedCommand {
  ok: boolean;
  errors: string[];
  chain?: string;
  table?: string;
  source?: string;
  proto?: string;
  dport?: number;
  target?: string;
  forbidden: string[];
}

export function parseIptables(cmd: string): ParsedCommand {
  const out: ParsedCommand = { ok: true, errors: [], forbidden: [] };
  if (SHELL_INJECTION.test(cmd)) {
    out.ok = false;
    out.errors.push("shell metacharacter detected (command-injection guard)");
    return out;
  }
  const tokens = shlexSplit(cmd);
  if (!tokens) {
    out.ok = false;
    out.errors.push("unbalanced quotes in command");
    return out;
  }
  if (tokens[0] !== "iptables") {
    out.ok = false;
    out.errors.push(`command must start with "iptables" (got "${tokens[0] ?? ""}")`);
    return out;
  }
  for (let i = 1; i < tokens.length; i++) {
    const tok = tokens[i];
    if (FORBIDDEN_FLAGS.has(tok)) {
      out.forbidden.push(tok);
      // -P consumes two values, -F/-X zero or one; skip a following non-flag token.
      if (tokens[i + 1] && !tokens[i + 1].startsWith("-")) i += tok === "-P" || tok === "--policy" ? 2 : 1;
      continue;
    }
    if (!tok.startsWith("-")) {
      out.errors.push(`unexpected token "${tok}"`);
      continue;
    }
    const arity = FLAG_ARITY[tok];
    if (arity === undefined) {
      out.errors.push(`unrecognised flag "${tok}"`);
      continue;
    }
    const value = arity > 0 ? tokens[i + 1] : undefined;
    if (arity > 0) {
      if (value === undefined || value.startsWith("-")) {
        out.errors.push(`flag ${tok} is missing its value`);
        continue;
      }
      i += 1;
    }
    switch (tok) {
      case "-A":
        out.chain = value;
        break;
      case "-t":
        out.table = value;
        break;
      case "-s":
        out.source = value;
        break;
      case "-p":
        out.proto = value;
        break;
      case "--dport": {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 1 || n > 65535) out.errors.push(`--dport "${value}" is not a valid port`);
        else out.dport = n;
        break;
      }
      case "-j":
        out.target = value;
        break;
      default:
        break;
    }
  }
  if (!out.chain) out.errors.push("missing -A <chain>");
  if (!out.target) out.errors.push("missing -j <target>");
  else if (!ALLOWED_TARGETS.has(out.target)) out.errors.push(`-j target "${out.target}" is not one of DROP, REJECT, ACCEPT`);
  if (out.source !== undefined) {
    const addr = out.source.split("/")[0];
    if (!IPV4.test(addr) || addr.split(".").some((o) => Number(o) > 255)) out.errors.push(`-s "${out.source}" is not a valid IPv4 address`);
  }
  if (out.proto !== undefined && !["tcp", "udp", "icmp"].includes(out.proto)) out.errors.push(`-p "${out.proto}" is not tcp, udp or icmp`);
  if (out.forbidden.length) out.errors.push(`forbidden flag(s): ${out.forbidden.join(", ")}`);
  if (out.table !== undefined) out.errors.push(`forbidden flag: -t ${out.table}`);
  out.ok = out.errors.length === 0;
  return out;
}

/* ------------------------------------------------------------------ */
/* Expected class (priority hierarchy)                                  */
/* ------------------------------------------------------------------ */

/** Ground-truth threat class derived from MITRE id / signature (strict priority order). */
export function inferExpectedClass(alert: NIDSAlert): ThreatClass {
  const a = alert.nids_llm_assessment;
  const sig = a.attack_signature.toLowerCase();
  const tech = a.mitre_technique_id ?? "";
  if (tech === "T0000" || a.mitre_tactic === "None" || sig.includes("benign")) return "BENIGN";
  if (tech === "T1046" || sig.includes("port scan")) return "PORT_SCAN";
  if (sig.includes("sql")) return "SQL_INJECTION";
  if (tech.startsWith("T1110") || sig.includes("brute")) return "SSH_BRUTE_FORCE";
  if (tech.startsWith("T1498") || tech.startsWith("T1499") || sig.includes("flood")) return "SYN_FLOOD";
  return "RCE_ATTEMPT";
}

/* ------------------------------------------------------------------ */
/* Individual checks                                                    */
/* ------------------------------------------------------------------ */

type Findings = string[];

function schemaFindings(env: MitigationEnvelope): Findings {
  const f: Findings = [];
  const e = env as unknown as Record<string, unknown>;
  for (const key of [
    "threat_classification",
    "severity",
    "reasoning_trace",
    "chosen_mitigation",
    "rejected_alternative",
    "rejection_reason",
    "grpo_scoring_debug",
  ]) {
    if (e[key] === undefined || e[key] === null) f.push(`missing required key "${key}"`);
  }
  if (f.length) return f;
  if (!THREATS.includes(env.threat_classification)) f.push(`threat_classification "${env.threat_classification}" is not a valid class`);
  if (!SEVERITIES.includes(env.severity)) f.push(`severity "${env.severity}" is not valid`);
  if (!env.reasoning_trace.trim()) f.push("reasoning_trace is empty");
  for (const [name, a] of [
    ["chosen_mitigation", env.chosen_mitigation],
    ["rejected_alternative", env.rejected_alternative],
  ] as const) {
    if (!ACTIONS.includes(a.action_type)) f.push(`${name}.action_type "${a.action_type}" is not valid`);
    if (!IMPACTS.includes(a.estimated_collateral_impact)) f.push(`${name}.estimated_collateral_impact "${a.estimated_collateral_impact}" is not valid`);
    if (!(DEVICE_IDS as readonly string[]).includes(a.target_container)) f.push(`${name}.target_container "${a.target_container}" is not a known container`);
    if (!/^172\.28\.0\.1[1-5]$/.test(a.source_ip)) f.push(`${name}.source_ip "${a.source_ip}" is outside the br-zephyr node range`);
    if (!Number.isInteger(a.dest_port) || a.dest_port < 1 || a.dest_port > 65535) f.push(`${name}.dest_port ${a.dest_port} is out of range`);
    if (typeof a.iptables_cmd !== "string" || !a.iptables_cmd.trim()) f.push(`${name}.iptables_cmd is empty`);
  }
  const r = env.grpo_scoring_debug;
  if (!r) return f; // live backend does not report GRPO rewards
  const inRange = (v: number, lo: number, hi: number) => typeof v === "number" && v >= lo && v <= hi;
  if (!inRange(r.schema_compliance_score, -2, 2)) f.push("schema_compliance_score outside [-2.0, 2.0]");
  if (!inRange(r.entity_grounding_score, -3, 3)) f.push("entity_grounding_score outside [-3.0, 3.0]");
  if (!inRange(r.surgical_precision_score, -3, 3)) f.push("surgical_precision_score outside [-3.0, 3.0]");
  if (!inRange(r.total_reward, -8, 8)) f.push("total_reward outside [-8.0, 8.0]");
  return f;
}

function groundingFindings(env: MitigationEnvelope, alert: NIDSAlert): Findings {
  const f: Findings = [];
  for (const [name, a] of [
    ["chosen_mitigation", env.chosen_mitigation],
    ["rejected_alternative", env.rejected_alternative],
  ] as const) {
    if (a.target_container !== alert.target_node)
      f.push(`${name}.target_container "${a.target_container}" does not match alert.target_node "${alert.target_node}"`);
    if (a.source_ip !== alert.source_ip)
      f.push(`${name}.source_ip "${a.source_ip}" does not match alert.source_ip "${alert.source_ip}"`);
    else if (!IP_TO_NODE[a.source_ip]) f.push(`${name}.source_ip "${a.source_ip}" is not in NODE_IP_MAP`);
    if (a.dest_port !== alert.dest_port)
      f.push(`${name}.dest_port ${a.dest_port} does not match alert.dest_port ${alert.dest_port}`);
    const targetIp = NODE_IP[a.target_container];
    if (targetIp && a.source_ip === targetIp && a.action_type !== "NO_OP")
      f.push(`${name} would make ${a.target_container} block its own IP (${a.source_ip})`);
    if (a.action_type !== "NO_OP") {
      const parsed = parseIptables(a.iptables_cmd);
      if (parsed.source && parsed.source.split("/")[0] !== alert.source_ip)
        f.push(`${name} command uses -s ${parsed.source}, but the alert source is ${alert.source_ip}`);
      if (parsed.dport !== undefined && parsed.dport !== alert.dest_port)
        f.push(`${name} command uses --dport ${parsed.dport}, but the alert destination port is ${alert.dest_port}`);
    }
  }
  return f;
}

function expectedProto(alert: NIDSAlert): string {
  switch (alert.protocol) {
    case "UDP":
      return "udp";
    case "ICMP":
      return "icmp";
    default:
      return "tcp";
  }
}

function syntaxFindings(env: MitigationEnvelope, alert: NIDSAlert): Findings {
  const f: Findings = [];
  for (const [name, a] of [
    ["chosen_mitigation", env.chosen_mitigation],
    ["rejected_alternative", env.rejected_alternative],
  ] as const) {
    if (a.action_type === "NO_OP") {
      if (a.iptables_cmd.trim() !== "# NO_OP") f.push(`${name} is NO_OP but its command is not "# NO_OP"`);
      continue;
    }
    const p = parseIptables(a.iptables_cmd);
    for (const err of p.errors) f.push(`${name}: ${err}`);
    if (p.proto && p.proto !== expectedProto(alert))
      f.push(`${name}: -p ${p.proto} does not match alert protocol ${alert.protocol}`);
  }
  return f;
}

function boundaryFindings(env: MitigationEnvelope): Findings {
  const f: Findings = [];
  for (const [name, a] of [
    ["chosen_mitigation", env.chosen_mitigation],
    ["rejected_alternative", env.rejected_alternative],
  ] as const) {
    if (a.action_type === "NO_OP") continue;
    const p = parseIptables(a.iptables_cmd);
    if (p.chain && HOST_ROUTING_CHAINS.has(p.chain))
      f.push(`${name}: chain ${p.chain} is a host-routing chain; only INPUT is allowed inside a container namespace`);
    else if (p.chain && p.chain !== "INPUT") f.push(`${name}: chain "${p.chain}" is not the container INPUT chain`);
    if (p.table !== undefined) f.push(`${name}: table selection (-t ${p.table}) is not allowed in a container namespace`);
  }
  return f;
}

const SURGICAL: ActionType[] = ["BLOCK_SOURCE_IP", "RATE_LIMIT_SYN"];

function proportionalityFindings(env: MitigationEnvelope, alert: NIDSAlert): Findings {
  const f: Findings = [];
  const expected = inferExpectedClass(alert);
  const { chosen_mitigation: c, rejected_alternative: r } = env;
  if (env.threat_classification !== expected)
    f.push(`threat_classification ${env.threat_classification} does not match the expected class ${expected}`);
  if (expected === "BENIGN") {
    if (c.action_type !== "NO_OP") f.push(`benign traffic must be handled with NO_OP, not ${c.action_type}`);
    if (c.estimated_collateral_impact !== "ZERO") f.push("benign traffic must carry ZERO collateral impact");
  } else {
    if (!SURGICAL.includes(c.action_type))
      f.push(`${c.action_type} is over-broad for a single-source threat; use BLOCK_SOURCE_IP or RATE_LIMIT_SYN`);
    if (c.estimated_collateral_impact === "MODERATE" || c.estimated_collateral_impact === "HIGH")
      f.push(`estimated collateral impact ${c.estimated_collateral_impact} is not proportionate (expected ZERO or LOW)`);
  }
  if (r.action_type === c.action_type) f.push("rejected_alternative must differ from chosen_mitigation");
  if ((env.rejection_reason ?? "").trim().length < 15) f.push("rejection_reason must explain the rejection (at least 15 characters)");
  return f;
}

/* ------------------------------------------------------------------ */
/* Public API                                                           */
/* ------------------------------------------------------------------ */

function check(id: CriticCheckId, findings: Findings, passDetail: string, failDetail: string): CriticCheck {
  const label = CRITIC_CHECKS.find((c) => c.id === id)!.label;
  return findings.length
    ? { id, label, status: "failed", detail: failDetail, findings }
    : { id, label, status: "passed", detail: passDetail, findings: [] };
}

/** Checks as they appear before any proposal exists. */
export function notEvaluatedChecks(reason = "No proposal has been validated yet."): CriticCheck[] {
  return CRITIC_CHECKS.map((c) => ({ ...c, status: "not_evaluated" as const, detail: reason, findings: [] }));
}

export function runCritic(env: MitigationEnvelope, alert: NIDSAlert): CriticCheck[] {
  const schema = check(
    "schema",
    schemaFindings(env),
    "Envelope matches the MitigationEnvelope schema.",
    "Envelope does not match the MitigationEnvelope schema.",
  );
  if (schema.status === "failed") {
    const rest = CRITIC_CHECKS.filter((c) => c.id !== "schema").map((c) => ({
      ...c,
      status: "not_evaluated" as const,
      detail: "Not evaluated because the schema check failed.",
      findings: [],
    }));
    return [schema, ...rest];
  }
  return [
    schema,
    check(
      "grounding",
      groundingFindings(env, alert),
      "Container, source IP and port match the alert exactly.",
      "Proposal references entities that do not match the alert.",
    ),
    check(
      "syntax",
      syntaxFindings(env, alert),
      "iptables commands parse cleanly with allowed flags only.",
      "iptables command is malformed or uses forbidden flags.",
    ),
    check(
      "boundary",
      boundaryFindings(env),
      "Commands stay inside the container's own INPUT chain.",
      "Command reaches outside the container network boundary.",
    ),
    check(
      "proportionality",
      proportionalityFindings(env, alert),
      "Action is proportionate to the threat and the alternative is justified.",
      "Action is not proportionate to the threat.",
    ),
  ];
}

export function criticPassed(checks: CriticCheck[]): boolean {
  return checks.length > 0 && checks.every((c) => c.status === "passed");
}

/** Error strings the Critic injects into `### CRITICAL SELF-CORRECTION REQUIRED`. */
export function correctionFeedback(checks: CriticCheck[]): string[] {
  return checks.filter((c) => c.status === "failed").flatMap((c) => c.findings.map((m) => `[${c.id}] ${m}`));
}

export function noOpPayload(alert: NIDSAlert): ActionPayload {
  return {
    action_type: "NO_OP",
    target_container: alert.target_node,
    source_ip: alert.source_ip,
    dest_port: alert.dest_port,
    iptables_cmd: "# NO_OP",
    estimated_collateral_impact: "ZERO",
  };
}
