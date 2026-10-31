"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDemo } from "@/components/providers/DemoProvider";
import { Segmented } from "@/components/ui/Segmented";
import { CAMERA_OVERVIEW_EVENT } from "@/hooks/useScrollCamera";
import { requestSync } from "@/hooks/useBackendSync";
import { liveApi } from "@/lib/services/live";
import { FALLBACK_SOURCES, FALLBACK_TARGETS, normalizeCatalog } from "@/lib/catalog";
import { cn } from "@/lib/cn";
import type { Catalog, CatalogThreat, VariantMode } from "@/types/backend";

const MAX_PROMPT = 500;
const VARIANTS: { value: VariantMode; label: string }[] = [
  { value: "RANDOM", label: "RANDOM" },
  { value: "A", label: "A · Golden" },
  { value: "B", label: "B · Subnet" },
  { value: "C", label: "C · Syntax" },
];
const field = "h-8 rounded-md border border-border bg-elevated px-2.5 text-xs text-fg placeholder:text-subtle aria-[invalid=true]:border-danger";

export function LiveAttackControls() {
  const { state, dispatch } = useDemo();
  const [source, setSource] = useState<string>("ext-net");
  const [target, setTarget] = useState<string>("pc-4");
  const [prompt, setPrompt] = useState("Launch SCENARIO_1 (TCP_SYN_VOLUMETRIC): Floods the target with half-open connections to exhaust kernel connection tracking tables.");
  const [variant, setVariant] = useState<VariantMode>("RANDOM");
  const [catalog, setCatalog] = useState<Catalog | null>(() => normalizeCatalog({}));
  const [threat, setThreat] = useState("SCENARIO_1");
  const [busy, setBusy] = useState(false);
  const [simActive, setSimActive] = useState(false);
  const mounted = useRef(true);
  useEffect(() => () => void (mounted.current = false), []);

  useEffect(() => {
    const ctrl = new AbortController();
    liveApi
      .getCatalog(ctrl.signal)
      .then((raw) => {
        if (!mounted.current) return;
        const c = normalizeCatalog(raw);
        setCatalog(c);
        if (c.threats.length > 0) {
          const first = c.threats[0];
          setThreat(first.scenarioKey);
          setPrompt(first.prompt);
        }
      })
      .catch((e: unknown) => {
        if (!mounted.current) return;
        const isAbort = (e instanceof Error && e.name === "AbortError") || (e as { message?: string })?.message === "Request cancelled";
        if (isAbort) return;
        const fallback = normalizeCatalog({});
        setCatalog(fallback);
      });
    return () => ctrl.abort();
  }, []);

  const groupedThreats = useMemo(() => {
    const groups = new Map<string, CatalogThreat[]>();
    for (const t of catalog?.threats ?? []) {
      const fam = t.threatFamily || "General Threats";
      const list = groups.get(fam) ?? [];
      list.push(t);
      groups.set(fam, list);
    }
    return Array.from(groups.entries());
  }, [catalog]);

  const sources = catalog?.sources.length ? catalog.sources : FALLBACK_SOURCES;
  const targets = catalog?.targets.length ? catalog.targets : FALLBACK_TARGETS;
  const trimmed = prompt.trim();
  const problem = !trimmed || trimmed.length > MAX_PROMPT || source === target;
  const canRun = !busy && !problem;

  const hasPendingAlert = state.cases.some((c) => c.stage === "awaiting_review");
  const isActive = busy || simActive || hasPendingAlert || state.scenario.run === "running";

  const run = async () => {
    if (!canRun) return;
    setBusy(true);
    setSimActive(true);
    try {
      const res = await liveApi.simulateNlpAttack({
        source,
        target,
        prompt: trimmed,
        force_variant: variant,
        auto_inject_alert: true,
      });
      const what = res.threat_classification ?? res.scenario_id ?? "attack";
      dispatch({
        type: "live_attack",
        nowMs: Date.now(),
        message: `Live attack launched: ${what}`,
      });
      window.dispatchEvent(new Event(CAMERA_OVERVIEW_EVENT));
      requestSync();
      window.setTimeout(requestSync, 800);
      window.setTimeout(requestSync, 1600);
    } catch {
      // Fallback to local simulation if backend is offline
      dispatch({ type: "set_mode", mode: "demo" });
      window.setTimeout(() => dispatch({ type: "scenario_start" }), 50);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const toggleSimulation = async () => {
    if (isActive) {
      setSimActive(false);
      try {
        await liveApi.resetEnvironment();
        requestSync();
      } catch {
        dispatch({ type: "reset" });
      }
    } else {
      await run();
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || !e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.key.toLowerCase() !== "r") return;
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || t.closest("[data-terminal]") || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      if (!canRun) return;
      e.preventDefault();
      void run();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <form
      className="flex w-full flex-wrap items-center gap-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        void run();
      }}
    >
      <select
        aria-label="Source node"
        value={source}
        onChange={(e) => setSource(e.target.value)}
        className={`${field} w-28 font-mono`}
      >
        {sources.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>

      <select
        aria-label="Target node"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        className={`${field} w-24 font-mono`}
      >
        {targets.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>

      <select
        aria-label="Threat scenario"
        value={threat}
        onChange={(e) => {
          const val = e.target.value;
          setThreat(val);
          const t = catalog?.threats.find((x) => x.scenarioKey === val || x.id === val);
          if (t) setPrompt(t.prompt);
        }}
        className={`${field} w-56 font-mono`}
      >
        <option value="">Custom prompt</option>
        {groupedThreats.map(([family, items]) => (
          <optgroup key={family} label={family}>
            {items.map((t) => (
              <option key={t.scenarioKey} value={t.scenarioKey}>
                {t.scenarioKey} · {t.threatClassification}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      <input
        aria-label="Attack prompt"
        value={prompt}
        onChange={(e) => {
          setPrompt(e.target.value);
          setThreat("");
        }}
        maxLength={MAX_PROMPT + 50}
        autoComplete="off"
        placeholder="Attack prompt"
        className={`${field} min-w-[180px] flex-1`}
      />

      <Segmented
        label="Variant"
        value={variant}
        onChange={setVariant}
        options={VARIANTS}
        disabled={busy}
      />

      <div className="ml-auto flex items-center justify-end">
        <button
          type="button"
          role="switch"
          aria-checked={isActive}
          disabled={busy}
          onClick={() => void toggleSimulation()}
          className="inline-flex items-center gap-2.5 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-100 transition-colors hover:border-zinc-500 disabled:opacity-50"
        >
          <span>Simulation</span>
          <span
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
              isActive ? "bg-green-600" : "bg-zinc-700",
            )}
          >
            <span
              className={cn(
                "inline-block size-3.5 transform rounded-full bg-white transition-transform",
                isActive ? "translate-x-4" : "translate-x-1",
              )}
            />
          </span>
          <span className={cn("font-mono text-[11px]", isActive ? "text-green-400" : "text-zinc-400")}>
            {busy ? "..." : isActive ? "ON" : "OFF"}
          </span>
        </button>
      </div>
    </form>
  );
}
