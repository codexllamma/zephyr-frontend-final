"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Menu, ShieldCheck, User } from "lucide-react";
import { REVIEWER } from "@/data/devices";
import { Tooltip } from "@/components/ui/Tooltip";
import { useCriticalAlerts } from "@/hooks/useCriticalAlert";
import { NavDrawer } from "./NavDrawer";
import { ThemeToggle } from "./ThemeToggle";

export function TopNav() {
  const [open, setOpen] = useState(false);
  const critical = useCriticalAlerts().length > 0;
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <header className="sticky top-0 z-40 flex h-[var(--nav-h)] shrink-0 items-center gap-2 border-b border-border bg-surface px-3 sm:px-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation menu"
          aria-expanded={open}
          aria-haspopup="dialog"
          className="relative grid h-9 w-9 place-items-center rounded-md text-muted hover:bg-hover hover:text-fg-strong"
        >
          <Menu aria-hidden className="size-5" />
          {critical && <span aria-hidden className="absolute right-1 top-1 size-2.5 rounded-full bg-danger anim-blink" />}
        </button>
        {critical && (
          <Link
            href="/alerts"
            className="anim-blink flex items-center gap-1.5 rounded-md bg-danger-soft px-2 py-1 text-xs font-semibold text-danger"
          >
            <span className="size-2 rounded-full bg-danger" /> Critical alert generated
          </Link>
        )}

        <Link href="/simulation" className="flex items-center gap-2 rounded-md px-1.5 py-1">
          <ShieldCheck aria-hidden className="size-5 text-accent" />
          <span className="text-[15px] font-semibold tracking-tight text-fg-strong">Zephyr</span>
        </Link>


        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <Tooltip content={`Signed in as ${REVIEWER} (demo reviewer, no authentication)`} side="bottom">
          <button type="button" aria-label={`Profile: ${REVIEWER}`} className="flex h-9 items-center gap-2 rounded-md px-1.5 text-muted hover:bg-hover hover:text-fg-strong">
            <span className="grid size-7 place-items-center rounded-full bg-accent-soft text-accent">
              <User aria-hidden className="size-4" />
            </span>
            <span className="hidden text-[13px] font-medium text-fg sm:inline">{REVIEWER}</span>
          </button>
        </Tooltip>
        </div>
      </header>
      <NavDrawer open={open} onClose={close} alertBlink={critical} />
    </>
  );
}
