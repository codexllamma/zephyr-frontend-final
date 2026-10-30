import { MODEL_VERSION } from "@/data/devices";
import { noOpPayload } from "@/lib/critic";
import { shortId } from "@/lib/format";
import type {
  ActionPayload,
  AlertCase,
  DecisionRecord,
  DeviceId,
  ProposalAttempt,
  TrainingPair,
} from "@/types";

/**
 * Decisions and training pairs are *derived* from alert cases, so every record
 * shares IDs with the alert it came from and can never drift out of sync.
 */

export function currentAttempt(c: AlertCase): ProposalAttempt | undefined {
  return c.attempts[c.attempts.length - 1];
}

/** True once a human decision has been recorded. */
export function hasDecision(c: AlertCase): boolean {
  return c.review.status !== "pending";
}

export function decisionId(c: AlertCase): string {
  return `DEC-${shortId(c.id)}`;
}

/** The action that was actually chosen by the decision process. */
export function chosenAction(c: AlertCase): ActionPayload | undefined {
  const attempt = currentAttempt(c);
  if (!attempt) return undefined;
  switch (c.review.status) {
    case "approved":
      return attempt.envelope.chosen_mitigation;
    case "marked_benign":
      return noOpPayload(c.alert);
    case "rejected":
    case "revision_requested":
      return noOpPayload(c.alert);
    default:
      return undefined;
  }
}

/** The alternative the decision rejected (model's block, if a human overrode it). */
export function rejectedAction(c: AlertCase): ActionPayload | undefined {
  const attempt = currentAttempt(c);
  if (!attempt) return undefined;
  if (c.review.status === "marked_benign" && attempt.envelope.chosen_mitigation.action_type !== "NO_OP") {
    return attempt.envelope.chosen_mitigation;
  }
  return attempt.envelope.rejected_alternative;
}

export function selectDecisions(cases: AlertCase[]): DecisionRecord[] {
  const out: DecisionRecord[] = [];
  for (const c of cases) {
    const attempt = currentAttempt(c);
    const chosen = chosenAction(c);
    const rejected = rejectedAction(c);
    if (!hasDecision(c) || !attempt || !chosen || !rejected) continue;
    out.push({
      id: decisionId(c),
      alertId: c.id,
      timestamp: c.review.decidedAt ?? c.alert.timestamp,
      threatClass: attempt.envelope.threat_classification,
      proposedAction: attempt.envelope.chosen_mitigation,
      chosenAction: chosen,
      rejectedAlternative: rejected,
      criticResult: attempt.passed ? "passed" : "failed",
      reviewerOutcome: c.review.status,
      executionStatus: c.execution.status,
      provenance: c.provenance,
    });
  }
  return out.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
}

export function selectTrainingPairs(cases: AlertCase[]): TrainingPair[] {
  const out: TrainingPair[] = [];
  for (const c of cases) {
    const attempt = currentAttempt(c);
    const chosen = chosenAction(c);
    const rejected = rejectedAction(c);
    if (!hasDecision(c) || !attempt || !chosen || !rejected) continue;
    const status = c.review.status;
    const eligible = status === "approved" || status === "marked_benign";
    const note =
      status === "approved"
        ? "Approved proposal becomes the chosen example; the rejected alternative is the over-broad option."
        : status === "marked_benign"
          ? attempt.envelope.chosen_mitigation.action_type === "NO_OP"
            ? "Reviewer confirmed the benign verdict: NO_OP is chosen, the block is rejected."
            : "Human override: reviewer labelled the traffic benign, so NO_OP is chosen and the model's block is the rejected example."
          : status === "rejected"
            ? "Excluded: the reviewer rejected the proposal, so there is no preferred label."
            : "Excluded until a revised proposal is approved.";
    out.push({
      id: `TP-${shortId(c.id)}`,
      alertId: c.id,
      decisionId: decisionId(c),
      timestamp: c.review.decidedAt ?? c.alert.timestamp,
      category: attempt.envelope.threat_classification,
      inputSummary: c.summary,
      chosen,
      rejected,
      rejectionReason: attempt.envelope.rejection_reason,
      reward: attempt.envelope.grpo_scoring_debug,
      criticOutcome: attempt.passed ? "passed" : "failed",
      modelVersion: MODEL_VERSION,
      reviewStatus: status,
      trainingEligible: eligible,
      eligibilityNote: note,
      provenance: c.provenance,
    });
  }
  return out.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
}

/** Rules that a (simulated) execution has applied inside a device's namespace. */
export function appliedRules(cases: AlertCase[], deviceId: DeviceId): { alertId: string; command: string }[] {
  return cases
    .filter(
      (c) =>
        c.execution.status === "confirmed" &&
        c.execution.appliedCommand &&
        c.alert.target_node === deviceId,
    )
    .sort((a, b) => ((a.execution.finishedAt ?? "") < (b.execution.finishedAt ?? "") ? -1 : 1))
    .map((c) => ({ alertId: c.id, command: c.execution.appliedCommand as string }));
}

export function newestCase(cases: AlertCase[]): AlertCase | undefined {
  return [...cases].sort((a, b) => (a.alert.timestamp < b.alert.timestamp ? 1 : -1))[0];
}

export function sortedByNewest(cases: AlertCase[]): AlertCase[] {
  return [...cases].sort((a, b) => (a.alert.timestamp < b.alert.timestamp ? 1 : -1));
}

/** Cases waiting for a human. */
export function pendingReview(cases: AlertCase[]): AlertCase[] {
  return cases.filter((c) => c.stage === "awaiting_review");
}
