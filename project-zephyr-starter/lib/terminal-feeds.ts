import type { DeviceId, NodeId, Protocol } from "@/types";

/**
 * 14-Second LLM Inference Sequence (updates every 3 seconds across 5 steps).
 */
export const LLM_THINKING_DURATION_MS = 14_000;
export const LLM_THINKING_STEP_MS = 3_000;

export const LLM_THINKING_STEPS = [
  "[SYS] Intercepting Anomalous Payload...",
  "[SYS] Extracting PCAP Signatures...",
  "[AI] LLM Inference Engine analyzing behavior...",
  "[AI] Evaluating Mitigation Envelopes...",
  "[SYS] Synthesizing Netfilter Rules...",
] as const;

export const MITIGATION_ENFORCED_BANNER =
  "============= MITIGATION RULE ENFORCED =============";

/**
 * Raw .txt-compatible terminal feeds.
 * Drop verbatim .txt lines into ATTACK_TERMINAL_FEED_TXT / BENIGN_TERMINAL_FEED_TXT
 * (optional placeholders: {SRC}, {DST}, {PORT}, {PROTO}, {SIG}, {TARGET}, {SOURCE}, {SEQ}, {TTL}).
 */
export const ATTACK_TERMINAL_FEED_TXT = `
[CRITICAL] TCP SYN Flood detected from {SRC} -> {DST}:{PORT} ({SIG})
[CRITICAL DROP] IN=eth0 SRC={SRC} DST={DST} LEN=60 TOS=0x00 TTL={TTL} PROTO={PROTO} DPT={PORT} FLAGS=SYN SEQ={SEQ}
[CRITICAL] Half-open SYN_RECV backlog saturation on {TARGET} ({DST}:{PORT}) from {SRC} — rate=14,520 pps
[CRITICAL DROP] Anomalous packet burst intercepted on br-zephyr: {SRC} -> {DST}:{PORT} PROTO={PROTO} WIN=512
[CRITICAL] Kernel nf_conntrack table threshold exceeded (98.4%) — hostile stream from {SRC}
[CRITICAL DROP] Socket starvation alert on {TARGET}: {SIG} signature matched from {SOURCE} ({SRC})
[CRITICAL] TCP SYN Flood detected from {SRC} — unacknowledged handshake storm targeting {DST}:{PORT}
[CRITICAL DROP] Netfilter ingress ring-buffer pressure on {TARGET}: dropping spoofed frame SRC={SRC} DPT={PORT}
`.trim();

export const BENIGN_TERMINAL_FEED_TXT = `
[HTTP 200 OK] GET /api/v1/health HTTP/1.1 SRC=172.28.0.101 -> {DST}:80 latency=1.3ms SLA=NOMINAL
[HTTP 200 OK] Keep-Alive probe traffic-gen (172.28.0.101) -> {TARGET} ({DST}:80) status=200 OK
[HTTP 200 OK] GET /api/v1/status HTTP/1.1 SRC=172.28.0.101 -> {DST}:80 latency=1.5ms bytes=640
[HTTP 200 OK] Benign SLA verification heartbeat passed on {TARGET} ({DST}) — 0% packet loss
`.trim();

export function parseTxtFeed(rawTxt: string): string[] {
  return rawTxt
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

const ATTACK_POOL = parseTxtFeed(ATTACK_TERMINAL_FEED_TXT);
const BENIGN_POOL = parseTxtFeed(BENIGN_TERMINAL_FEED_TXT);

export interface FeedContext {
  sourceNode: NodeId;
  targetNode: DeviceId;
  sourceIp: string;
  targetIp: string;
  targetPort: number;
  protocol: Protocol;
  threatSignature: string;
}

export function formatNowTime(date: Date = new Date()): string {
  return date.toTimeString().slice(0, 8);
}

function hydrateTemplate(template: string, ctx: FeedContext, tickIndex: number): string {
  const seqHex = `0x${((0x7a120 + tickIndex * 7919) & 0xfffff).toString(16)}`;
  const ttl = String(48 + (tickIndex % 16));
  return template
    .replaceAll("{SRC}", ctx.sourceIp)
    .replaceAll("{DST}", ctx.targetIp)
    .replaceAll("{PORT}", String(ctx.targetPort || 80))
    .replaceAll("{PROTO}", ctx.protocol || "TCP")
    .replaceAll("{SIG}", ctx.threatSignature || "TCP_SYN_VOLUMETRIC")
    .replaceAll("{TARGET}", ctx.targetNode)
    .replaceAll("{SOURCE}", ctx.sourceNode)
    .replaceAll("{SEQ}", seqHex)
    .replaceAll("{TTL}", ttl);
}

export function nextAttackFeedLine(ctx: FeedContext, tickIndex: number, customPool?: string[]): string {
  const pool = customPool && customPool.length > 0 ? customPool : ATTACK_POOL;
  const tpl = pool[tickIndex % pool.length];
  return hydrateTemplate(tpl, ctx, tickIndex);
}

export function nextBenignFeedLine(ctx: FeedContext, tickIndex: number, customPool?: string[]): string {
  const pool = customPool && customPool.length > 0 ? customPool : BENIGN_POOL;
  const tpl = pool[tickIndex % pool.length];
  return hydrateTemplate(tpl, ctx, tickIndex);
}
