"use client";

import type { ReactNode } from "react";
import { ToastViewport } from "@/components/ui/Toasts";
import { useShiftQ } from "@/hooks/useShiftQ";
import { TopNav } from "./TopNav";

export function AppShell({ children }: { children: ReactNode }) {
  useShiftQ();
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[70] focus:rounded-md focus:bg-accent focus:px-3 focus:py-1.5 focus:text-accent-fg"
      >
        Skip to content
      </a>
      <TopNav />
      <main id="main" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {children}
      </main>
      <ToastViewport />
    </div>
  );
}
