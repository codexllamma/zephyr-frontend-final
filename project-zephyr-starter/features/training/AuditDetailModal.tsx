"use client";

import { useEffect, useState } from "react";
import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Shield,
  X,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { fmtDateTime, threatLabel } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { AuditRecord } from "./mockAuditLogs";

interface AuditDetailModalProps {
  record: AuditRecord | null;
  open: boolean;
  onClose: () => void;
}

export function AuditDetailModal({ record, open, onClose }: AuditDetailModalProps) {
  const [copiedChosen, setCopiedChosen] = useState(false);
  const [copiedRejected, setCopiedRejected] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open || !record) return null;

  const copyCmd = (cmd: string | undefined, isChosen: boolean) => {
    if (!cmd) return;
    void navigator.clipboard.writeText(cmd);
    if (isChosen) {
      setCopiedChosen(true);
      setTimeout(() => setCopiedChosen(false), 1500);
    } else {
      setCopiedRejected(true);
      setTimeout(() => setCopiedRejected(false), 1500);
    }
  };

  const isApproved = record.reviewStatus === "approved";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="audit-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Clean & Minimal, No Green Dot */}
        <div className="flex items-center justify-between border-b border-border bg-surface-elevated/60 px-5 py-3.5">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="font-mono text-xs font-semibold text-accent">{record.id}</span>
            <span className="text-muted">·</span>
            <h2 id="audit-modal-title" className="text-sm font-semibold text-fg-strong">
              {threatLabel(record.category)}
            </h2>
            <Badge
              tone={
                record.severity === "CRITICAL"
                  ? "danger"
                  : record.severity === "HIGH"
                    ? "warning"
                    : record.severity === "MEDIUM"
                      ? "accent"
                      : "neutral"
              }
            >
              {record.severity}
            </Badge>
            {record.isLive && (
              <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                LIVE
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted font-mono">{fmtDateTime(record.timestamp)}</span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="grid size-7 place-items-center rounded-lg text-muted transition-colors hover:bg-hover hover:text-fg-strong"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Modal Body - Essential Information Only */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {/* Target & Attacker Pill Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-elevated/30 px-3 py-2 font-mono text-[11px]">
            <div className="flex items-center gap-2">
              <span className="text-muted">Target:</span>
              <strong className="text-fg-strong">{record.targetNode}:{record.destPort}</strong>
              <span className="text-muted">({record.protocol})</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted">Attacker:</span>
              <strong className="text-rose-400">{record.attackerIp}</strong>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted">Review:</span>
              <span className={cn("font-semibold capitalize", isApproved ? "text-emerald-400" : "text-amber-400")}>
                {record.reviewStatus.replace("_", " ")}
              </span>
            </div>
          </div>

          {/* Incident Summary */}
          <div className="rounded-lg border border-border bg-surface-elevated/20 p-3">
            <p className="text-fg leading-relaxed">{record.inputSummary}</p>
          </div>

          {/* Decision Diff: Accepted vs Rejected */}
          <div className="space-y-3">
            {/* Accepted Rule */}
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/15 p-3.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-emerald-400 flex items-center gap-1.5 text-xs">
                  <Check className="size-3.5" />
                  <span>Accepted ({record.chosen.action_type})</span>
                </span>
                <button
                  type="button"
                  onClick={() => copyCmd(record.chosen.iptables_cmd, true)}
                  className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 font-mono"
                >
                  {copiedChosen ? <Check className="size-3" /> : <Copy className="size-3" />}
                  <span>{copiedChosen ? "Copied" : "Copy"}</span>
                </button>
              </div>

              <div className="mt-2 rounded bg-black/50 p-2 font-mono text-[11px] text-emerald-300 border border-emerald-900/40 break-all">
                <code>{record.chosen.iptables_cmd}</code>
              </div>

              {/* 1-2 line explanation */}
              <p className="mt-2 text-xs text-emerald-100/90 leading-relaxed font-normal">
                <strong className="font-semibold text-emerald-300">Why accepted: </strong>
                {record.chosenRationale}
              </p>
            </div>

            {/* Rejected Rule */}
            <div className="rounded-lg border border-border bg-surface-elevated/20 p-3.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-subtle flex items-center gap-1.5 text-xs">
                  <X className="size-3.5 text-rose-400" />
                  <span>Rejected ({record.rejected.action_type})</span>
                </span>
                <button
                  type="button"
                  onClick={() => copyCmd(record.rejected.iptables_cmd, false)}
                  className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-fg font-mono"
                >
                  {copiedRejected ? <Check className="size-3" /> : <Copy className="size-3" />}
                  <span>{copiedRejected ? "Copied" : "Copy"}</span>
                </button>
              </div>

              <div className="mt-2 rounded bg-black/40 p-2 font-mono text-[11px] text-subtle line-through border border-border break-all">
                <code>{record.rejected.iptables_cmd}</code>
              </div>

              {/* 1-2 line explanation */}
              <p className="mt-2 text-xs text-muted leading-relaxed font-normal">
                <strong className="font-semibold text-rose-400/90">Why rejected: </strong>
                {record.rejectionReason}
              </p>
            </div>
          </div>

          {/* Validation & Sign-off - Minimal Compact Row */}
          <div className="grid gap-2.5 sm:grid-cols-2">
            {/* Critic Checks */}
            <div className="rounded-lg border border-border bg-surface-elevated/20 p-3">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-fg-strong flex items-center gap-1">
                  <Shield className="size-3 text-accent" /> Critic Verification
                </span>
                <span className={cn("font-medium", record.criticOutcome === "passed" ? "text-emerald-400" : "text-amber-400")}>
                  {record.criticOutcome === "passed" ? "All Passed" : "Interception"}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {record.criticChecks.map((chk, i) => (
                  <span
                    key={i}
                    className={cn(
                      "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px]",
                      chk.passed
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : "bg-rose-500/10 text-rose-400 border border-rose-500/20",
                    )}
                  >
                    {chk.passed ? <Check className="size-2.5" /> : <X className="size-2.5" />}
                    <span>{chk.name.replace(" Gate", "")}</span>
                  </span>
                ))}
              </div>
            </div>

            {/* Reviewer Sign-off */}
            <div className="rounded-lg border border-border bg-surface-elevated/20 p-3 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-fg-strong">Reviewer Sign-off</span>
                <span className="font-mono text-muted">{record.reviewer}</span>
              </div>
              <p className="mt-2 text-muted italic line-clamp-2">&ldquo;{record.reviewerNotes}&rdquo;</p>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-border bg-surface-elevated/60 px-5 py-2.5 text-xs text-muted">
          <span className="font-mono text-[11px]">Decision: {record.decisionId}</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border bg-surface px-3 py-1 text-xs font-semibold text-fg hover:bg-hover transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
