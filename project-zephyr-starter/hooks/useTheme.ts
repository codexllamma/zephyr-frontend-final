"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { Theme } from "@/types";

const KEY = "zephyr-theme";
const listeners = new Set<() => void>();

function readTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Theme is owned by the DOM attribute set before first paint (see app/layout.tsx). */
export function useTheme() {
  const theme = useSyncExternalStore<Theme>(subscribe, readTheme, () => "dark");
  const setTheme = useCallback((next: Theme) => {
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* storage unavailable: theme still applies for this visit */
    }
    listeners.forEach((l) => l());
  }, []);
  const toggle = useCallback(() => setTheme(readTheme() === "dark" ? "light" : "dark"), [setTheme]);
  return { theme, setTheme, toggle };
}

export const THEME_STORAGE_KEY = KEY;
