"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { TABS } from "@/components/shell/tabs";

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el.closest("[data-terminal]")) return true;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/** Global Shift+Q: cycle tabs in order, wrapping from the last to the first. */
export function useShiftQ() {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || !e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.toLowerCase() !== "q" || isTypingTarget(e.target)) return;
      e.preventDefault();
      // Read the live location so rapid presses never use a stale route.
      const path = window.location.pathname;
      const i = TABS.findIndex((t) => path.startsWith(t.href));
      router.push(TABS[(i + 1) % TABS.length].href);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
}
