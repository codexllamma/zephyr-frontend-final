"use client";

import { useEffect } from "react";
import { AlertTriangle, CheckCircle2, Info, OctagonAlert, X } from "lucide-react";
import { useDemo } from "@/components/providers/DemoProvider";
import { cn } from "@/lib/cn";
import type { Toast, ToastTone } from "@/types";

const TONE: Record<ToastTone, { icon: typeof Info; cls: string }> = {
  info: { icon: Info, cls: "text-accent" },
  success: { icon: CheckCircle2, cls: "text-success" },
  warning: { icon: AlertTriangle, cls: "text-warning" },
  danger: { icon: OctagonAlert, cls: "text-danger" },
};

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onClose, toast.tone === "danger" ? 8000 : 5500);
    return () => window.clearTimeout(t);
  }, [toast.id, toast.tone, onClose]);
  const { icon: Icon, cls } = TONE[toast.tone];
  return (
    <div role="status" className="anim-toast-in pointer-events-auto flex w-80 max-w-[calc(100vw-2rem)] gap-2.5 rounded-lg border border-border-strong bg-overlay p-3 shadow-lg">
      <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", cls)} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-fg-strong">{toast.title}</p>
        {toast.message && <p className="mt-0.5 text-xs text-muted">{toast.message}</p>}
      </div>
      <button type="button" onClick={onClose} aria-label={`Dismiss: ${toast.title}`} className="h-6 w-6 shrink-0 rounded text-subtle hover:bg-hover hover:text-fg">
        <X aria-hidden className="mx-auto size-3.5" />
      </button>
    </div>
  );
}

/** Reusable toast viewport. Any component can push via `dispatch({ type: "toast_push", … })`. */
export function ToastViewport() {
  const { state, dispatch } = useDemo();
  return (
    <div aria-live="polite" aria-label="Notifications" className="pointer-events-none fixed bottom-4 left-4 z-[60] flex flex-col gap-2">
      {state.toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onClose={() => dispatch({ type: "toast_dismiss", id: t.id })} />
      ))}
    </div>
  );
}
