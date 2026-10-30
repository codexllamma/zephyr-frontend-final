"use client";

import { useState } from "react";
import { Check, FilePenLine, ShieldCheck, ShieldX, X } from "lucide-react";
import { useDemo } from "@/components/providers/DemoProvider";
import { Button } from "@/components/ui/Button";
import { REVIEWER } from "@/data/devices";
import { currentAttempt } from "@/lib/selectors";
import type { AlertCase, ReviewDecision } from "@/types";

export function ReviewControls({ c }: { c: AlertCase }) {
  const { dispatch } = useDemo();
  const [note, setNote] = useState("");
  const attempt = currentAttempt(c);

  if (c.stage === "revision_requested") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">Revision requested by {c.review.reviewer ?? REVIEWER}. No action has been applied.</p>
        <Button size="sm" onClick={() => dispatch({ type: "return_to_queue", caseId: c.id })}>
          Return to review queue
        </Button>
      </div>
    );
  }
  if (c.stage !== "awaiting_review" || !attempt) {
    return (
      <p className="text-xs text-muted">
        {c.stage === "detected"
          ? "Waiting for a validated proposal before a human can review."
          : "Review is complete for this alert. Decision and outcome are recorded in the timeline."}
      </p>
    );
  }
  const decide = (decision: ReviewDecision) => {
    dispatch({ type: "review", caseId: c.id, decision, note });
    setNote("");
  };
  const blocked = !attempt.passed;
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-xs font-medium text-muted">Reviewer note (optional)</span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={160}
          className="mt-1 h-8 w-full rounded-md border border-border bg-elevated px-2.5 text-xs text-fg placeholder:text-subtle"
          placeholder="e.g. Matches the scheduled backup window"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => decide("approve")} disabled={blocked} title={blocked ? "Blocked: the Critic rejected this proposal" : undefined}>
          <Check aria-hidden className="size-4" /> Approve
        </Button>
        <Button onClick={() => decide("reject")}>
          <X aria-hidden className="size-4" /> Reject
        </Button>
        <Button onClick={() => decide("request_revision")}>
          <FilePenLine aria-hidden className="size-4" /> Request Revision
        </Button>
        <Button onClick={() => decide("mark_benign")}>
          <ShieldCheck aria-hidden className="size-4" /> Mark as Benign
        </Button>
      </div>
      {blocked && (
        <p className="flex items-center gap-1.5 text-xs text-danger">
          <ShieldX aria-hidden className="size-3.5" /> Approve is disabled because this proposal failed the Critic.
        </p>
      )}
    </div>
  );
}
