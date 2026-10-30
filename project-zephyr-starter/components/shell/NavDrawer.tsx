"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Kbd } from "@/components/ui/Panel";
import { TABS } from "./tabs";

export function NavDrawer({ open, onClose, alertBlink = false }: { open: boolean; onClose: () => void; alertBlink?: boolean }) {
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const focusables = () =>
      Array.from(panel?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? []);
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onClose();
      if (e.key !== "Tab") return;
      const f = focusables();
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-[var(--scrim)]" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Main navigation"
        className="anim-drawer-in absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-border bg-surface shadow-xl"
      >
        <div className="flex h-14 items-center justify-between border-b border-border px-4">
          <span className="text-sm font-semibold text-fg-strong">Navigation</span>
          <button type="button" onClick={onClose} aria-label="Close navigation" className="h-8 w-8 rounded-md text-muted hover:bg-hover hover:text-fg">
            <X aria-hidden className="mx-auto size-4" />
          </button>
        </div>
        <nav aria-label="Main" className="flex flex-col gap-1 p-2">
          {TABS.map((t) => {
            const active = pathname.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                onClick={onClose}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium",
                  active ? "bg-accent-soft text-accent" : "text-fg hover:bg-hover",
                  alertBlink && t.href === "/alerts" && "anim-blink bg-danger-soft text-danger",
                )}
              >
                <t.icon aria-hidden className="size-4" />
                {t.label}
                {alertBlink && t.href === "/alerts" && <span className="ml-auto text-[11px] font-semibold">Critical alert</span>}
              </Link>
            );
          })}
        </nav>
        <p className="mt-auto flex items-center gap-2 border-t border-border p-4 text-xs text-muted">
          <Kbd>Shift</Kbd>+<Kbd>Q</Kbd> switch tab
        </p>
      </div>
    </div>
  );
}
