"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Play } from "lucide-react";
import { useDemo } from "@/components/providers/DemoProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Segmented";
import { CAMERA_OVERVIEW_EVENT } from "@/hooks/useScrollCamera";
import { requestSync } from "@/hooks/useBackendSync";
import { liveApi } from "@/lib/services/live";
import { FALLBACK_SOURCES, FALLBACK_TARGETS, normalizeCatalog } from "@/lib/catalog";
import type { Catalog, CatalogThreat, NlpAttackResponse, VariantMode } from "@/types/backend";

const MAX_PROMPT = 500;
const VARIANTS: { value: VariantMode; label: string; hint: string }[] = [
  { value: "RANDOM", label: "RANDOM", hint: "Randomly selects between Golden Rule (A/D) and Circuit Breaker trap (B/C)." },
  { value: "A", label: "A · Golden Rule", hint: "Golden rule (Q ≥ 0.95): passes the safety gates." },
  { value: "B", label: "B · Subnet Drop", hint: "Blanket /16 drop (Q < 0.75): triggers the Blast Radius circuit breaker." },
  { value: "C", label: "C · Syntax Error", hint: "Invalid iptables syntax (Q < 0.30): triggers the Grammar circuit breaker." },
];
const field = "mt-1 h-8 w-full rounded-md border border-border bg-elevated px-2.5 text-xs text-fg placeholder:text-subtle aria-[invalid=true]:border-danger";

/** Zone 1: Red Team Threat Launcher (GET /api/v1/catalog & POST /api/v1/simulate_nlp_attack). */
export function LiveAttackControls() {
  const { dispatch } = useDemo();
  const [source, setSource] = useState<string>("ext-net");
  const [target, setTarget] = useState<string>("pc-4");
  const [prompt, setPrompt] = useState("Launch SCENARIO_1 (TCP_SYN_VOLUMETRIC): Floods the target with half-open connections to exhaust kernel connection tracking tables.");
  const [variant, setVariant] = useState<VariantMode>("RANDOM");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogNote, setCatalogNote] = useState<string>("Loading attack catalog from http://localhost:8000/api/v1/catalog…");
  const [threat, setThreat] = useState("SCENARIO_1");
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<NlpAttackResponse | null>(null);
  const mounted = useRef(true);
  useEffect(() => () => void (mounted.current = false), []);

  // Zone 1 Initial Load: Fetch GET http://localhost:8000/api/v1/catalog exactly once on component mount.
  useEffect(() => {
    const ctrl = new AbortController();
    liveApi
      .getCatalog(ctrl.signal)
      .then((raw) => {
        const c = normalizeCatalog(raw);
        setCatalog(c);
        if (c.threats.length > 0) {
          const first = c.threats[0];
          setThreat(first.scenarioKey);
          setPrompt(first.prompt);
          setCatalogNote(`Catalog loaded: ${c.threats.length} threat scenarios across ${new Set(c.threats.map((t) => t.threatFamily)).size} threat families.`);
        } else {
          setCatalogNote("Catalog loaded; describe the attack in text.");
        }
      })
      .catch((e) => {
        if (!ctrl.signal.aborted) setCatalogNote(`Catalog unavailable (${e instanceof Error ? e.message : "error"}); using built-in node lists.`);
      });
    return () => ctrl.abort();
  }, []);

  // Group threats by `threat_family` for optical groupings (<optgroup>) in the dropdown
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
  const problem = !trimmed
    ? "Select a scenario from the catalog or describe the attack."
    : trimmed.length > MAX_PROMPT
      ? `Prompt is too long (max ${MAX_PROMPT} characters).`
      : source === target
        ? "Source and target must be different nodes."
        : null;
  const canRun = !busy && !problem;

  const run = async () => {
    if (!canRun) return;
    setBusy(true);
    try {
      const res = await liveApi.simulateNlpAttack({
        source,
        target,
        prompt: trimmed,
        force_variant: variant,
        auto_inject_alert: true,
      });
      setLast(res);
      const what = res.threat_classification ?? res.scenario_id ?? "attack";
      dispatch({
        type: "live_attack",
        nowMs: Date.now(),
        message: `Live attack launched: ${what} from ${res.attacker ?? source} against ${res.target ?? target}${res.router_tier ? ` (router ${res.router_tier}` : ""}${res.selected_variant_mode ? `, variant ${res.selected_variant_mode})` : res.router_tier ? ")" : ""}${res.alert_id ? `, alert ${res.alert_id}` : ""}`,
      });
      dispatch({
        type: "toast_push",
        tone: "success",
        title: "Attack launched",
        message: `${what}${res.selected_variant_mode ? ` · variant ${res.selected_variant_mode}` : ""}${res.alert_id ? ` · ${res.alert_id}` : ""}. Alert queued in HITL Guardrail.`,
      });
      window.dispatchEvent(new Event(CAMERA_OVERVIEW_EVENT));
      requestSync();
      window.setTimeout(requestSync, 800);
      window.setTimeout(requestSync, 1600);
    } catch (e) {
      dispatch({ type: "toast_push", tone: "danger", title: "Attack failed to start", message: e instanceof Error ? e.message : "Unknown error" });
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  // Shift+R triggers the same button (ignored while typing).
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

  const selectedThreat = useMemo(
    () => catalog?.threats.find((x) => x.scenarioKey === threat || x.id === threat),
    [catalog, threat],
  );
  const hint = VARIANTS.find((v) => v.value === variant)?.hint;
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void run();
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="block w-32">
          <span className="text-xs font-medium text-muted">Source</span>
          <select value={source} onChange={(e) => setSource(e.target.value)} className={`${field} font-mono`}>
            {sources.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label className="block w-28">
          <span className="text-xs font-medium text-muted">Target</span>
          <select value={target} onChange={(e) => setTarget(e.target.value)} className={`${field} font-mono`}>
            {targets.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label className="block w-72">
          <span className="text-xs font-medium text-muted">Threat Catalog (30 Scenarios)</span>
          <select
            value={threat}
            onChange={(e) => {
              const val = e.target.value;
              setThreat(val);
              const t = catalog?.threats.find((x) => x.scenarioKey === val || x.id === val);
              if (t) setPrompt(t.prompt);
            }}
            className={`${field} font-mono`}
          >
            <option value="">Custom NLP prompt</option>
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
        </label>
        <label className="block min-w-[240px] flex-1">
          <span className="text-xs font-medium text-muted">NLP Attack Prompt / Payload</span>
          <input
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              setThreat("");
            }}
            maxLength={MAX_PROMPT + 50}
            autoComplete="off"
            aria-invalid={!!problem && prompt.length > 0}
            aria-describedby="nlp-attack-hint"
            placeholder="Launch a massive syn flood to exhaust connection tables"
            className={field}
          />
        </label>
      </div>
      {selectedThreat && (
        <div className="rounded-md border border-border bg-elevated/60 px-3 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">{selectedThreat.scenarioKey}</Badge>
            <span className="font-semibold text-fg-strong">{selectedThreat.threatClassification}</span>
            <span className="text-muted">· {selectedThreat.threatFamily}</span>
            {selectedThreat.protocol && (
              <span className="font-mono text-[11px] text-muted">
                ({selectedThreat.protocol}{selectedThreat.targetPort ? `/${selectedThreat.targetPort}` : ""})
              </span>
            )}
          </div>
          {selectedThreat.description && <p className="mt-1 text-muted">{selectedThreat.description}</p>}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Segmented label="Force Variant" value={variant} onChange={setVariant} options={VARIANTS.map((v) => ({ value: v.value, label: v.label }))} disabled={busy} />
        <Button type="submit" variant="primary" size="sm" disabled={!canRun} title="Shift + R">
          <Play aria-hidden className="size-3.5" /> {busy ? "Launching…" : "Launch Threat"}
        </Button>
        {last?.alert_id && <Badge tone="accent">Injected: {last.alert_id} ({last.scenario_id})</Badge>}
      </div>
      <p id="nlp-attack-hint" aria-live="polite" className={`text-xs ${problem && prompt.length > 0 ? "text-danger" : "text-muted"}`}>
        {problem ?? hint} <span className="text-subtle">{catalogNote}</span>
      </p>
    </form>
  );
}
