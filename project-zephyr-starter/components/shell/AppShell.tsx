"use client";

import type { ReactNode } from "react";
import { Kbd } from "@/components/ui/Panel";
import { ToastViewport } from "@/components/ui/Toasts";
import { useShiftQ } from "@/hooks/useShiftQ";
import { TopNav } from "./TopNav";

export function AppShell({ children }: { children: ReactNode }) {
  useShiftQ();
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[70] focus:rounded-md focus:bg-accent focus:px-3 focus:py-1.5 focus:text-accent-fg">
        Skip to content
      </a>
      <TopNav />
      <main id="main" className="flex min-h-0 flex-1 flex-col">
        {children}
      </main>
      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-surface px-4 py-1.5 text-[11px] text-subtle">
        <span className="ml-auto flex items-center gap-1.5 whitespace-nowrap">
          <Kbd>Shift</Kbd>+<Kbd>Q</Kbd> · Switch tab
        </span>
      </footer>
      <ToastViewport />
    </div>
  );
}
