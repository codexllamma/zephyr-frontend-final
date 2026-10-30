import type {
  ExecutionStatus,
  LifecycleStage,
  ReviewStatus,
} from "@/types";

/**
 * Locale-independent formatting helpers. Everything here is deterministic so
 * server-rendered markup always matches the client (no hydration mismatches).
 */

const intFormatter = new Intl.NumberFormat("en-US");

export function fmtInt(n: number): string {
  return intFormatter.format(Math.round(n));
}

export function fmtBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(2)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} kB`;
  return `${bytes} B`;
}

/** "2026-10-28T10:31:07Z" -> "10:31:07" (UTC) */
export function fmtTime(iso: string): string {
  return iso.slice(11, 19);
}

/** "2026-10-28T10:31:07Z" -> "2026-10-28 10:31:07 UTC" */
export function fmtDateTime(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC`;
}

export function isoFromMs(ms: number): string {
  return new Date(ms).toISOString().replace(".000Z", "Z");
}

/** First 8 characters of an alert id — enough to recognise it in tables. */
export function shortId(id: string): string {
  // Backend ids such as "evt-1793304262" are already short and must stay unique.
  return id.length <= 16 ? id : id.slice(0, 8);
}

export function fmtPercent(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}

export const THREAT_LABEL: Record<string, string> = {
  SYN_FLOOD: "SYN flood",
  RCE_ATTEMPT: "Remote code execution",
  SQL_INJECTION: "SQL injection",
  SSH_BRUTE_FORCE: "SSH brute force",
  PORT_SCAN: "Port scan",
  BENIGN: "Benign traffic",
};

export const ACTION_LABEL: Record<string, string> = {
  BLOCK_SOURCE_IP: "Block source IP",
  RATE_LIMIT_SYN: "Rate-limit SYN",
  DROP_PORT_TRAFFIC: "Drop port traffic",
  ISOLATE_NODE: "Isolate node",
  NO_OP: "No action (NO_OP)",
};

export const IMPACT_LABEL: Record<string, string> = {
  ZERO: "Zero collateral",
  NONE: "No collateral",
  LOW: "Low collateral",
  MODERATE: "Moderate collateral",
  HIGH: "High collateral",
};

export const STAGE_LABEL: Record<LifecycleStage, string> = {
  detected: "Detected",
  awaiting_review: "Awaiting review",
  validating: "Validating",
  approved: "Approved",
  executing: "Executing",
  executed: "Executed",
  rejected: "Rejected",
  failed: "Failed",
  revision_requested: "Revision requested",
  marked_benign: "Marked benign",
};

export const REVIEW_LABEL: Record<ReviewStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  revision_requested: "Revision requested",
  marked_benign: "Marked benign",
};

export const EXECUTION_LABEL: Record<ExecutionStatus, string> = {
  not_started: "Not started",
  pending: "Pending",
  confirmed: "Confirmed (simulated)",
  failed: "Failed (simulated)",
  not_applicable: "No action applied",
};

/** Deterministic id from a seed string (FNV-1a + mulberry32) shaped like a UUID v4. */
export function fakeUuid(seed: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const next = () => {
    h = (h + 0x6d2b79f5) >>> 0;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0).toString(16).padStart(8, "0");
  };
  const hex = next() + next() + next() + next();
  const variant = "89ab"[parseInt(hex[16], 16) % 4];
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}


/** "RESTRICT_OVERSIZED_ICMP" -> "Restrict oversized ICMP" (short words stay upper-case: ICMP, C2). */
function humanize(raw: string): string {
  const words = raw.split(/[_\s]+/).filter(Boolean);
  return words
    .map((w, i) => (w.length <= 4 ? w.toUpperCase() : i === 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase()))
    .join(" ");
}

/** Label lookups that stay readable for values the demo does not know (live backend). */
export const threatLabel = (t: string | undefined): string => (t ? (THREAT_LABEL[t] ?? humanize(t)) : "Unknown");
export const actionLabel = (a: string | undefined): string => (a ? (ACTION_LABEL[a] ?? humanize(a)) : "Unknown");
export const impactLabel = (i: string | undefined): string => (i ? (IMPACT_LABEL[i] ?? `${humanize(i)} collateral`) : "Collateral not reported");

/** Known threat classes plus any others present in the data (e.g. from the live backend). */
export const threatOptionsFrom = (present: Iterable<string | undefined>): string[] => {
  const set = new Set<string>(Object.keys(THREAT_LABEL));
  for (const p of present) if (p) set.add(p);
  return [...set];
};
