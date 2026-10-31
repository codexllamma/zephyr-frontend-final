"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, RotateCcw, ShieldCheck, Zap } from "lucide-react";
import { useDemo } from "@/components/providers/DemoProvider";
import { Segmented } from "@/components/ui/Segmented";
import { markResolved, requestSync } from "@/hooks/useBackendSync";
import { CAMERA_OVERVIEW_EVENT } from "@/hooks/useScrollCamera";
import { FALLBACK_SOURCES, FALLBACK_TARGETS, normalizeCatalog } from "@/lib/catalog";
import { cn } from "@/lib/cn";
import { liveApi } from "@/lib/services/live";
import { LLM_THINKING_DURATION_MS } from "@/lib/terminal-feeds";
import type { DeviceId, NodeId, Protocol } from "@/types";
import type { BackendPendingItem, Catalog, CatalogThreat, VariantMode } from "@/types/backend";

const MAX_PROMPT = 500;
const VARIANTS: { value: VariantMode; label: string }[] = [
  { value: "RANDOM", label: "RANDOM" },
  { value: "A", label: "A · Golden" },
  { value: "B", label: "B · Subnet" },
  { value: "C", label: "C · Syntax" },
];

function normalizeProtocol(p?: string): Protocol {
  if (!p) return "TCP";
  const up = p.toUpperCase();
  if (up.includes("UDP")) return "UDP";
  if (up.includes("ICMP")) return "ICMP";
  if (up.includes("HTTP")) return "HTTP";
  return "TCP";
}

const inputFieldClass =
  "h-7 rounded border border-zinc-800 bg-zinc-900 px-2 font-mono text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none transition-colors";

export function LiveAttackControls() {
  const { state, dispatch } = useDemo();
  const [source, setSource] = useState<NodeId>("ext-net");
  const [target, setTarget] = useState<DeviceId>("pc-4");
  const [threat, setThreat] = useState<string>("SCENARIO_1");
  const [prompt, setPrompt] = useState<string>(
    "Launch SCENARIO_1 (TCP_SYN_VOLUMETRIC): Floods the target with half-open connections to exhaust kernel connection tracking tables.",
  );
  const [variant, setVariant] = useState<VariantMode>("RANDOM");
  const [catalog, setCatalog] = useState<Catalog>(() => normalizeCatalog({}));
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);

  const mounted = useRef(true);
  const fallbackTimerRef = useRef<number | null>(null);

  const isLiveMode = state.mode === "live";
  const isThinking = state.drama.phase === "thinking";
  const trimmed = prompt.trim();
  const problem = !trimmed || trimmed.length > MAX_PROMPT || source === target;
  const canRun = !busy && !isThinking && !problem;

  // Load 30-category catalog from backend if available, fallback gracefully
  useEffect(() => {
    mounted.current = true;
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
        const isAbort =
          (e instanceof Error && e.name === "AbortError") ||
          (e as { message?: string })?.message === "Request cancelled";
        if (isAbort) return;
        setCatalog(normalizeCatalog({}));
      });

    return () => {
      mounted.current = false;
      ctrl.abort();
      if (fallbackTimerRef.current !== null) {
        window.clearTimeout(fallbackTimerRef.current);
      }
    };
  }, []);

  const groupedThreats = useMemo(() => {
    const groups = new Map<string, CatalogThreat[]>();
    for (const t of catalog.threats) {
      const fam = t.threatFamily || "General Threats";
      const list = groups.get(fam) ?? [];
      list.push(t);
      groups.set(fam, list);
    }
    return Array.from(groups.entries());
  }, [catalog]);

  const sources = catalog.sources.length ? catalog.sources : FALLBACK_SOURCES;
  const targets = catalog.targets.length ? catalog.targets : FALLBACK_TARGETS;

  const handleToggleMode = (mode: "demo" | "live") => {
    if (isThinking) return;
    dispatch({ type: "set_mode", mode });
  };

  const handleSelectThreat = (scenarioKey: string) => {
    setThreat(scenarioKey);
    if (!scenarioKey) return;
    const selected = catalog.threats.find(
      (x) => x.scenarioKey === scenarioKey || x.id === scenarioKey,
    );
    if (selected) {
      setPrompt(selected.prompt);
    }
  };

  const runThreat = async () => {
    if (!canRun) return;
    setBusy(true);
    const startedAt = Date.now();

    // Clear stale unreviewed cases so the current launch takes focus
    for (const c of state.cases) {
      if (c.stage === "awaiting_review") {
        markResolved(c.id);
      }
    }

    const selectedThreatObj = catalog.threats.find(
      (x) => x.scenarioKey === threat || x.id === threat,
    );
    const catId = selectedThreatObj?.categoryId ?? 1;
    const threatSignature = selectedThreatObj?.threatClassification ?? "TCP_SYN_VOLUMETRIC";
    const targetPort = selectedThreatObj?.targetPort ?? 80;
    const protocol = normalizeProtocol(selectedThreatObj?.protocol);

    // 1. Trigger CSS screen-shake, edge throbbing red strokes & rapid red terminal logs
    dispatch({
      type: "drama_attack_start",
      sourceNode: source,
      targetNode: target,
      targetPort,
      protocol,
      threatSignature,
      nowMs: startedAt,
    });
    window.dispatchEvent(new Event(CAMERA_OVERVIEW_EVENT));

    const payload = {
      source,
      target,
      scenario_id: threat || "SCENARIO_1",
      category_id: catId,
      threat_type: threatSignature,
      prompt: trimmed,
      force_variant: variant,
    };

    try {
      // 2. Dynamic routing based on global isLiveMode toggle:
      //    DEMO -> /api/mock/threat (14s simulated latency in backend)
      //    LIVE -> /api/live/threat (Kaggle Cloudflare Tunnel + Circuit Breaker)
      const res = isLiveMode
        ? await liveApi.liveThreat(payload)
        : await liveApi.mockThreat(payload);

      if (!mounted.current) return;

      if (res.mitigation_envelope) {
        dispatch({
          type: "live_envelope_received",
          item: res.mitigation_envelope as BackendPendingItem,
          nowMs: Date.now(),
        });
      }

      dispatch({
        type: "live_attack",
        nowMs: Date.now(),
        message: `${isLiveMode ? "Live" : "Mock"} threat launched: ${res.threat_classification ?? res.scenario_id ?? threatSignature}`,
      });
      requestSync();
      window.setTimeout(requestSync, 800);
    } catch {
      // Standalone/offline rehearsal fallback: holds full 14s thinking sequence before prompting HITL
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(50, LLM_THINKING_DURATION_MS - elapsed);
      fallbackTimerRef.current = window.setTimeout(() => {
        if (!mounted.current) return;
        const offlineVariant = variant === "RANDOM" ? (isLiveMode ? "A" : "B") : variant;
        dispatch({
          type: "drama_offline_fallback",
          sourceNode: source,
          targetNode: target,
          variant: offlineVariant,
          threatSignature,
          targetPort,
          protocol,
          nowMs: Date.now(),
        });
      }, remaining);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const handleReset = async () => {
    if (resetting) return;
    setResetting(true);
    try {
      await liveApi.resetEnvironment();
      requestSync();
    } catch {
      // Offline fallback: ignore network error
    } finally {
      dispatch({ type: "reset" });
      dispatch({ type: "terminal_clear", deviceId: state.selectedDeviceId });
      window.dispatchEvent(new Event(CAMERA_OVERVIEW_EVENT));
      setResetting(false);
    }
  };

  // Keyboard shortcut: Shift + R to launch threat
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || !e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.key.toLowerCase() !== "r") return;
      const t = e.target;
      if (
        t instanceof HTMLElement &&
        (t.isContentEditable || t.closest("[data-terminal]") || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))
      ) {
        return;
      }
      if (!canRun) return;
      e.preventDefault();
      void runThreat();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="flex w-full flex-col gap-2 font-mono text-xs">
      {/* Top Tier: Environment Routing & Primary Triggers */}
      <div className="flex w-full flex-wrap items-center justify-between gap-2.5 border-b border-zinc-800/80 pb-2">
        <div className="flex items-center gap-3">
          {/* Environment Mode Toggle: DEMO | LIVE */}
          <div
            role="group"
            aria-label="Environment Mode Toggle"
            className="inline-flex rounded-md border border-zinc-800 bg-zinc-900 p-0.5"
          >
            <button
              type="button"
              onClick={() => handleToggleMode("demo")}
              disabled={isThinking}
              className={cn(
                "flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50",
                !isLiveMode
                  ? "bg-zinc-800 text-zinc-100 shadow-xs"
                  : "text-zinc-400 hover:text-zinc-200",
              )}
            >
              <ShieldCheck className="size-3 text-zinc-400" />
              <span>DEMO</span>
            </button>
            <button
              type="button"
              onClick={() => handleToggleMode("live")}
              disabled={isThinking}
              className={cn(
                "flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50",
                isLiveMode
                  ? "bg-emerald-950 text-emerald-300 border border-emerald-800/80 shadow-xs"
                  : "text-zinc-400 hover:text-zinc-200",
              )}
            >
              <Zap className="size-3 text-emerald-400" />
              <span>LIVE</span>
            </button>
          </div>

          {/* Minimalist Route Indicator */}
          <div className="hidden items-center gap-2 text-[11px] text-zinc-400 sm:flex">
            <span
              className={cn(
                "inline-block size-1.5 rounded-full",
                isLiveMode ? "animate-pulse bg-emerald-500" : "bg-zinc-600",
              )}
            />
            <span>
              {isLiveMode
                ? "ROUTING: /api/live/threat · KAGGLE LLM TUNNEL"
                : "ROUTING: /api/mock/threat · 14s SIMULATED LATENCY"}
            </span>
          </div>
        </div>

        {/* Action Controls: Reset & Launch */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleReset()}
            disabled={resetting || isThinking}
            title="Reset System and Container Chains"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-3 text-xs text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-800 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCcw aria-hidden className={cn("size-3.5", resetting && "animate-spin")} />
            <span>{resetting ? "Resetting..." : "Reset System"}</span>
          </button>

          <button
            type="button"
            onClick={() => void runThreat()}
            disabled={!canRun}
            className="inline-flex h-8 items-center gap-2 rounded-md border border-red-800 bg-red-700 px-4 text-xs font-bold uppercase tracking-wider text-white shadow-xs transition-colors hover:bg-red-600 active:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Crosshair aria-hidden className="size-3.5" />
            <span>{isThinking || busy ? "Threat Active..." : "Launch Threat"}</span>
          </button>
        </div>
      </div>

      {/* Bottom Tier: 30-Category Threat Configurator & Prompt Inspector */}
      <div className="flex w-full flex-wrap items-center gap-2 pt-0.5">
        {/* Source Dropdown */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">SRC:</span>
          <select
            aria-label="Source node"
            value={source}
            disabled={isThinking}
            onChange={(e) => setSource(e.target.value as NodeId)}
            className={cn(inputFieldClass, "w-24")}
          >
            {sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {/* Target Dropdown */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">DST:</span>
          <select
            aria-label="Target node"
            value={target}
            disabled={isThinking}
            onChange={(e) => setTarget(e.target.value as DeviceId)}
            className={cn(inputFieldClass, "w-20")}
          >
            {targets.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        {/* 30-Category Threat Dropdown */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">THREAT:</span>
          <select
            aria-label="Threat scenario"
            value={threat}
            disabled={isThinking}
            onChange={(e) => handleSelectThreat(e.target.value)}
            className={cn(inputFieldClass, "max-w-[260px] truncate")}
          >
            <option value="">Custom prompt...</option>
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
        </div>

        {/* Prompt Input */}
        <div className="flex min-w-[200px] flex-1 items-center gap-1.5">
          <input
            aria-label="Attack prompt"
            value={prompt}
            disabled={isThinking}
            onChange={(e) => {
              setPrompt(e.target.value);
              setThreat("");
            }}
            maxLength={MAX_PROMPT + 50}
            autoComplete="off"
            placeholder="Attack prompt (natural language or category description)..."
            className={cn(inputFieldClass, "w-full min-w-0")}
          />
        </div>

        {/* Variant Mode Selection */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">VAR:</span>
          <Segmented
            label="Variant"
            value={variant}
            onChange={setVariant}
            options={VARIANTS}
            disabled={isThinking || busy}
          />
        </div>
      </div>
    </div>
  );
}
