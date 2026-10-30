import type { ImplementationStatus, LifecycleStage } from "@/types";

/**
 * Architecture description used by the React Flow diagram.
 * `status` says honestly what this frontend demo implements:
 *   demo      – implemented in this frontend with real logic (e.g. the Critic)
 *   simulated – represented by deterministic fixtures / scripted behaviour
 *   planned   – exists in the Zephyr design but is NOT part of this demo
 */

export type ArchKind = "data" | "ai" | "validation" | "execution" | "learning";

export interface ArchNodeDef {
  id: string;
  layer: 1 | 2 | 3 | 4 | 5 | 6;
  row: number;
  title: string;
  subtitle: string;
  kind: ArchKind;
  status: ImplementationStatus;
  role: string;
  inputs: string[];
  outputs: string[];
  note?: string;
}

export interface ArchEdgeDef {
  id: string;
  from: string;
  to: string;
  label?: string;
  kind: ArchKind | "danger";
  animated?: boolean;
}

export interface LayerDef {
  n: 1 | 2 | 3 | 4 | 5 | 6;
  title: string;
  subtitle: string;
  boundary?: boolean;
}

export const LAYERS: LayerDef[] = [
  { n: 1, title: "Network Environment", subtitle: "Where traffic happens" },
  { n: 2, title: "Perception / NIDS", subtitle: "Turns traffic into alerts" },
  { n: 3, title: "AI Deliberation", subtitle: "Probabilistic reasoning proposes" },
  { n: 4, title: "Deterministic Critic / Safety Gate", subtitle: "Code decides what may run", boundary: true },
  { n: 5, title: "Execution Layer", subtitle: "Approved actions only" },
  { n: 6, title: "Feedback & Learning", subtitle: "Decisions become training data" },
];

export const ARCH_NODES: ArchNodeDef[] = [
  {
    id: "containers", layer: 1, row: 0, title: "5 containers", subtitle: "pc-1 … pc-5", kind: "data", status: "simulated",
    role: "The monitored lab: five containers (directory, database, web storefront, SSH/FTP host, workstation pool).",
    inputs: ["Legitimate and hostile traffic"], outputs: ["Packets on the bridge"],
    note: "Simulated here: the Simulation tab animates a fixture topology. No real containers run.",
  },
  {
    id: "bridge", layer: 1, row: 1, title: "br-zephyr", subtitle: "Docker bridge network", kind: "data", status: "simulated",
    role: "The shared bridge all containers talk over. Traffic crossing it is what the sensor watches.",
    inputs: ["Packets from containers"], outputs: ["Mirrored traffic for the sensor"],
    note: "Simulated here. IPs shown in the UI are illustrative.",
  },
  {
    id: "sensor", layer: 2, row: 0, title: "NIDS sensor", subtitle: "Packet observation", kind: "data", status: "planned",
    role: "Watches bridge traffic and extracts per-flow metrics (packet/byte counts, SYN ratio, ports).",
    inputs: ["Bridge traffic"], outputs: ["Flow metrics"],
    note: "Not implemented in this demo: there is no packet capture. Alerts are scripted fixtures.",
  },
  {
    id: "window", layer: 2, row: 1, title: "2-second windows", subtitle: "Flow aggregation", kind: "data", status: "simulated",
    role: "Groups traffic into 2-second windows so each alert describes a short, comparable slice of time.",
    inputs: ["Flow metrics"], outputs: ["Windowed flow summary"],
  },
  {
    id: "alert", layer: 2, row: 2, title: "NIDSAlert", subtitle: "Contract A", kind: "data", status: "demo",
    role: "The structured alert handed to the AI layer: IPs, port, protocol, flow metrics and the NIDS assessment.",
    inputs: ["Windowed flow summary"], outputs: ["NIDSAlert JSON"],
    note: "The TypeScript type mirrors the schema; instances are demo fixtures.",
  },
  {
    id: "model", layer: 3, row: 0, title: "Qwen2.5-7B-Instruct", subtitle: "Fine-tuned proposer", kind: "ai", status: "simulated",
    role: "Reads an alert and proposes a threat class, a chosen mitigation and a rejected alternative with reasons.",
    inputs: ["NIDSAlert", "Correction feedback (on retry)"], outputs: ["Raw proposal"],
    note: "Simulated: proposals are scripted fixtures. No model inference runs in this demo.",
  },
  {
    id: "inference", layer: 3, row: 1, title: "GGUF / Ollama + T4", subtitle: "Inference targets", kind: "ai", status: "planned",
    role: "Where the model runs: a Tesla T4 GPU for speed, or a local 4-bit GGUF through Ollama for edge use.",
    inputs: ["Prompt"], outputs: ["Model text"],
    note: "Planned / not in this demo. Latency figures in Training & Decisions are project-provided.",
  },
  {
    id: "envelope", layer: 3, row: 2, title: "MitigationEnvelope", subtitle: "Contract B · chosen / rejected", kind: "ai", status: "demo",
    role: "The structured proposal: threat class, chosen mitigation, rejected alternative, reasoning and reward breakdown.",
    inputs: ["Raw proposal"], outputs: ["MitigationEnvelope JSON"],
  },
  {
    id: "grpo", layer: 3, row: 3, title: "GRPO training", subtitle: "Preference optimisation", kind: "learning", status: "planned",
    role: "Training loop that improves the model from chosen/rejected pairs and reward signals.",
    inputs: ["Training pairs", "Reward signals"], outputs: ["Updated model weights"],
    note: "Planned / offline. This demo only produces the training records.",
  },
  {
    id: "critic", layer: 4, row: 0, title: "Deterministic Critic", subtitle: "Schema · grounding · syntax · boundary · proportionality", kind: "validation", status: "demo",
    role: "Plain code (no AI) that checks schema, IP/container/port grounding, iptables syntax and protocol, container boundary, forbidden flags and proportionality.",
    inputs: ["MitigationEnvelope", "NIDSAlert"], outputs: ["Validated Action or rejection"],
    note: "Implemented in this demo as real TypeScript (lib/critic.ts). The checklist in Alerts & Review is computed, not hard-coded.",
  },
  {
    id: "reject", layer: 4, row: 1, title: "Rejection / correction", subtitle: "Errors fed back to the model", kind: "validation", status: "demo",
    role: "When a check fails the exact errors go back to the model for a retry. Failed proposals never become executable.",
    inputs: ["Failed checks"], outputs: ["Correction feedback"],
    note: "Shown live in the Suspicious Traffic scenario (attempt 1 rejected, attempt 2 passes).",
  },
  {
    id: "review", layer: 5, row: 0, title: "Human review", subtitle: "Approve · Reject · Revise · Benign", kind: "execution", status: "demo",
    role: "A person (Admin3 in this demo) approves or overrides every validated proposal before anything runs.",
    inputs: ["Validated Action"], outputs: ["Approved Action"],
  },
  {
    id: "exec", layer: 5, row: 1, title: "Executor", subtitle: "Runs inside target namespace", kind: "execution", status: "simulated",
    role: "Applies an approved rule inside the target container's network namespace, nowhere else.",
    inputs: ["Approved Action"], outputs: ["Execution result"],
    note: "Simulated: the UI marks results as simulated. No firewall rule is applied to a real container.",
  },
  {
    id: "result", layer: 5, row: 2, title: "Result to app", subtitle: "Confirmed / failed", kind: "execution", status: "simulated",
    role: "Reports back whether the action was confirmed, so the UI only shows Executed when the execution layer says so.",
    inputs: ["Execution result"], outputs: ["Status update"],
  },
  {
    id: "pairs", layer: 6, row: 0, title: "Chosen / rejected records", subtitle: "Training pairs", kind: "learning", status: "demo",
    role: "Each reviewed decision is stored as a preference pair. Rejected or unlabelled cases are excluded.",
    inputs: ["Decision + outcome"], outputs: ["Training pairs"],
  },
  {
    id: "reward", layer: 6, row: 1, title: "Reward signals", subtitle: "Schema · grounding · precision", kind: "learning", status: "demo",
    role: "Scores each proposal on schema compliance, entity grounding and surgical precision (range -8 to +8).",
    inputs: ["Proposal", "Critic result"], outputs: ["Reward breakdown"],
  },
];

export const ARCH_EDGES: ArchEdgeDef[] = [
  { id: "e1", from: "containers", to: "bridge", kind: "data" },
  { id: "e2", from: "bridge", to: "sensor", label: "traffic", kind: "data", animated: true },
  { id: "e3", from: "sensor", to: "window", kind: "data" },
  { id: "e4", from: "window", to: "alert", kind: "data" },
  { id: "e5", from: "alert", to: "model", label: "NIDSAlert", kind: "data", animated: true },
  { id: "e6", from: "inference", to: "model", kind: "ai" },
  { id: "e7", from: "model", to: "envelope", kind: "ai" },
  { id: "e8", from: "envelope", to: "critic", label: "MitigationEnvelope", kind: "ai", animated: true },
  { id: "e9", from: "critic", to: "reject", label: "on failure", kind: "danger" },
  { id: "e10", from: "reject", to: "model", label: "Correction feedback", kind: "danger" },
  { id: "e11", from: "critic", to: "review", label: "Validated Action", kind: "validation", animated: true },
  { id: "e12", from: "review", to: "exec", kind: "execution" },
  { id: "e13", from: "exec", to: "result", kind: "execution" },
  { id: "e14", from: "result", to: "pairs", label: "Feedback", kind: "learning" },
  { id: "e15", from: "pairs", to: "reward", kind: "learning" },
  { id: "e16", from: "reward", to: "grpo", label: "Feedback", kind: "learning" },
  { id: "e17", from: "grpo", to: "model", label: "Updated weights", kind: "learning" },
];

/** Which components an alert has reached, given its lifecycle stage (for the trace toggle). */
const BASE = ["containers", "bridge", "sensor", "window", "alert"];
const PROPOSED = [...BASE, "model", "envelope", "critic"];
export function reachedNodes(stage: LifecycleStage, hadRetry: boolean): Set<string> {
  const ids: string[] = [...BASE];
  if (stage !== "detected") ids.push("model", "envelope", "critic");
  if (hadRetry) ids.push("reject");
  if (["validating", "approved", "executing", "executed", "failed"].includes(stage)) ids.push("review");
  if (["executing", "executed", "failed"].includes(stage)) ids.push("exec");
  if (["executed", "failed"].includes(stage)) ids.push("result", "pairs", "reward");
  if (stage === "marked_benign") ids.push("review", "pairs", "reward");
  if (stage === "rejected" || stage === "revision_requested") ids.push("review");
  return new Set(ids.length ? ids : PROPOSED);
}
