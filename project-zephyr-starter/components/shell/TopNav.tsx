"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { NavDrawer } from "./NavDrawer";
import { ThemeToggle } from "./ThemeToggle";

export function TopNav() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <header className="sticky top-0 z-40 flex h-[var(--nav-h)] shrink-0 items-center border-b border-border bg-surface px-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation menu"
          aria-expanded={open}
          aria-haspopup="dialog"
          className="grid h-8 w-8 place-items-center rounded text-muted hover:bg-hover hover:text-fg-strong"
        >
          <Menu aria-hidden className="size-4" />
        </button>

        <Link href="/simulation" className="ml-2 font-mono text-sm font-semibold tracking-tight text-fg-strong">
          Zephyr
        </Link>

        <div className="ml-auto flex items-center">
          <ThemeToggle />
        </div>
      </header>
      <NavDrawer open={open} onClose={close} />
    </>
  );
}
