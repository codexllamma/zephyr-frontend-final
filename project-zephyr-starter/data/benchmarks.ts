import type { BenchmarkSnapshot } from "@/types";

/**
 * PROJECT-PROVIDED benchmark figures from the Zephyr team's 100-alert test
 * dataset. These are not independently verified production results. Only one
 * evaluation snapshot exists, so this is shown as a comparison of
 * configurations — not as a training curve over time.
 */
export const BENCHMARK_SNAPSHOT: BenchmarkSnapshot = {
  id: "bench-100-alert-snapshot",
  title: "100-alert benchmark snapshot",
  datasetDescription: "100 labelled NIDS alerts (project-provided test dataset), including hard-negative benign surges.",
  environment: "Tesla T4 GPU (14.56 GB) for accelerated inference; local 4-bit GGUF via Ollama for edge inference.",
  caveat:
    "Project-provided figures from the specified test dataset and environment. They are not independently verified, do not describe production behaviour, and do not mean the system is 100% secure.",
  configurations: [
    {
      id: "base",
      label: "Base Qwen2.5-7B-Instruct",
      description: "Zero-shot, raw output, no fine-tuning.",
    },
    {
      id: "raw",
      label: "Stage-2 Zephyr-DPO-V3 (1-shot, raw)",
      description: "Fine-tuned model, first attempt only, all 100 alerts.",
    },
    {
      id: "pipeline",
      label: "Full Zephyr pipeline",
      description: "Fine-tuned model + deterministic Critic loop + fallback.",
    },
  ],
  metrics: [
    {
      id: "schema",
      label: "Schema compliance",
      unit: "percent",
      description: "Share of outputs that are valid MitigationEnvelope JSON.",
      values: [78.0, 98.0, 100.0],
    },
    {
      id: "grounding",
      label: "Entity grounding",
      unit: "percent",
      description: "Container, IP and port in the proposal match the alert.",
      values: [71.0, 97.0, 100.0],
    },
    {
      id: "syntax",
      label: "Firewall syntax validity",
      unit: "percent",
      description: "iptables -A INPUT commands that parse with allowed flags.",
      values: [64.0, 98.0, 100.0],
    },
    {
      id: "classification",
      label: "Threat classification",
      unit: "percent",
      description: "Predicted threat class equals the expected class.",
      values: [68.0, 94.0, 100.0],
    },
    {
      id: "surgical",
      label: "Surgical action accuracy",
      unit: "percent",
      description: "Proportionate action chosen (not over-broad).",
      values: [72.0, 95.0, 100.0],
    },
    {
      id: "benign",
      label: "Benign-traffic protection",
      unit: "percent",
      description: "Benign surges answered with NO_OP instead of a false-positive block.",
      values: [80.0, 100.0, 100.0],
    },
    {
      id: "valid",
      label: "Judge first-shot valid rate",
      unit: "percent",
      description: "Proposals accepted by the deterministic judge on the first shot (full pipeline: post-Critic).",
      values: [38.0, 92.0, 100.0],
    },
    {
      id: "reward",
      label: "Mean GRPO reward (of 8.0)",
      unit: "reward",
      description: "Average total reward on the [-8, +8] scale.",
      values: [2.15, 7.48, 7.96],
    },
    {
      id: "latency",
      label: "Mean response time",
      unit: "seconds",
      description: "End-to-end seconds per alert on a Tesla T4 GPU; local GGUF shown as secondary.",
      values: [3.1, 2.38, 2.61],
      secondaryValues: [16.2, 13.85, 14.9],
      secondaryLabel: "Local GGUF",
    },
  ],
  provenance: "project_provided",
};
