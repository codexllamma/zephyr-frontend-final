import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Panel({
  title,
  actions,
  children,
  className,
  bodyClassName,
  as: Tag = "section",
  id,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  as?: "section" | "div" | "aside";
  id?: string;
}) {
  return (
    <Tag id={id} aria-labelledby={id ? `${id}-title` : undefined} className={cn("flex min-h-0 flex-col rounded-lg border border-border bg-surface", className)}>
      {(title || actions) && (
        <header className="flex min-h-11 shrink-0 items-center justify-between gap-2 border-b border-border px-3.5 py-2">
          <h2 id={id ? `${id}-title` : undefined} className="text-[13px] font-semibold text-fg-strong">
            {title}
          </h2>
          {actions && <div className="flex items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div className={cn("min-h-0 flex-1", bodyClassName ?? "p-3.5")}>{children}</div>
    </Tag>
  );
}

export function Field({ label, children, mono }: { label: ReactNode; children: ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-subtle">{label}</dt>
      <dd className={cn("mt-0.5 break-words text-[13px] text-fg", mono && "font-mono text-xs")}>{children}</dd>
    </div>
  );
}

export function EmptyState({ title, hint, icon }: { title: string; hint?: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-4 py-10 text-center">
      {icon && <div className="mb-1 text-subtle">{icon}</div>}
      <p className="text-sm font-medium text-fg-strong">{title}</p>
      {hint && <p className="max-w-sm text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-border-strong bg-elevated px-1.5 py-px font-mono text-[11px] text-muted">{children}</kbd>
  );
}
