import { Badge, type Tone } from "@/components/ui/Badge";
import { EXECUTION_LABEL, REVIEW_LABEL, STAGE_LABEL } from "@/lib/format";
import type { ExecutionStatus, LifecycleStage, ReviewStatus, Severity } from "@/types";

const SEV: Record<Severity, Tone> = { LOW: "neutral", MEDIUM: "warning", HIGH: "danger", CRITICAL: "danger" };

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <Badge tone={SEV[severity]} className={severity === "CRITICAL" ? "font-bold uppercase" : "uppercase"}>
      {severity}
    </Badge>
  );
}

export const STAGE_TONE: Record<LifecycleStage, Tone> = {
  detected: "accent",
  awaiting_review: "warning",
  validating: "accent",
  approved: "accent",
  executing: "accent",
  executed: "success",
  rejected: "danger",
  failed: "danger",
  revision_requested: "warning",
  marked_benign: "success",
};

export function StageBadge({ stage }: { stage: LifecycleStage }) {
  return <Badge tone={STAGE_TONE[stage]}>{STAGE_LABEL[stage]}</Badge>;
}

const REVIEW_TONE: Record<ReviewStatus, Tone> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  revision_requested: "warning",
  marked_benign: "success",
};

export function ReviewBadge({ status }: { status: ReviewStatus }) {
  return <Badge tone={REVIEW_TONE[status]}>{REVIEW_LABEL[status]}</Badge>;
}

const EXEC_TONE: Record<ExecutionStatus, Tone> = {
  not_started: "neutral",
  pending: "warning",
  confirmed: "success",
  failed: "danger",
  not_applicable: "neutral",
};

export function ExecutionBadge({ status }: { status: ExecutionStatus }) {
  return <Badge tone={EXEC_TONE[status]}>{EXECUTION_LABEL[status]}</Badge>;
}
