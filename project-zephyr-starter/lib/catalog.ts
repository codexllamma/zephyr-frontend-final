import type { Catalog, CatalogThreat } from "@/types/backend";
import { THREAT_DESCRIPTIONS } from "./explain";

/**
 * Parses GET /api/v1/catalog tolerantly. The exact shape is not fixed, so this
 * accepts arrays of strings or objects, under any of several common key names.
 * Anything it cannot read is dropped (the UI falls back to built-in lists).
 */

export const FALLBACK_SOURCES = ["ext-net", "pc-1", "pc-2", "pc-3", "pc-4", "pc-5"];
export const FALLBACK_TARGETS = ["pc-4", "pc-1", "pc-2", "pc-3", "pc-5"];

export const SCENARIO_META: Record<number, { port: number; protocol: string }> = {
  1: { port: 80, protocol: "TCP" },
  2: { port: 8080, protocol: "UDP" },
  3: { port: 11211, protocol: "UDP" },
  4: { port: 80, protocol: "HTTP" },
  5: { port: 80, protocol: "HTTP" },
  6: { port: 443, protocol: "HTTPS" },
  7: { port: 0, protocol: "TCP" },
  8: { port: 80, protocol: "TCP" },
  9: { port: 161, protocol: "UDP" },
  10: { port: 80, protocol: "HTTP" },
  11: { port: 8080, protocol: "HTTP" },
  12: { port: 80, protocol: "HTTP" },
  13: { port: 2375, protocol: "TCP" },
  14: { port: 10250, protocol: "HTTPS" },
  15: { port: 80, protocol: "HTTP" },
  16: { port: 22, protocol: "SSH" },
  17: { port: 5432, protocol: "TCP" },
  18: { port: 3306, protocol: "TCP" },
  19: { port: 445, protocol: "TCP" },
  20: { port: 21, protocol: "TCP" },
  21: { port: 6379, protocol: "TCP" },
  22: { port: 53, protocol: "DNS" },
  23: { port: 0, protocol: "ICMP" },
  24: { port: 3333, protocol: "TCP" },
  25: { port: 23, protocol: "TCP" },
  26: { port: 1883, protocol: "TCP" },
  27: { port: 5683, protocol: "UDP" },
  28: { port: 80, protocol: "TCP" },
  29: { port: 179, protocol: "TCP" },
  30: { port: 0, protocol: "ICMP" },
  99: { port: 80, protocol: "TCP" },
};

export const FALLBACK_THREATS: CatalogThreat[] = Object.entries(THREAT_DESCRIPTIONS).map(([key, desc], idx) => {
  const num = idx + 1;
  const scenarioKey = `SCENARIO_${num}`;
  const meta = SCENARIO_META[num] ?? { port: 80, protocol: "TCP" };
  let threatFamily = "General Threats";
  if (num <= 6) threatFamily = "Volumetric & Protocol Exhaustion (L3/L4 DDoS)";
  else if (num <= 9) threatFamily = "Reconnaissance & Pre-Attack Probing";
  else if (num <= 15) threatFamily = "Web & API Exploitation (L7 / Cloud Native)";
  else if (num <= 21) threatFamily = "Lateral Movement & Service Exploitation";
  else if (num <= 26) threatFamily = "Command & Control / Data Exfiltration";
  else threatFamily = "Evasion & State Manipulation";

  return {
    id: scenarioKey,
    scenarioKey,
    threatClassification: key,
    threatFamily,
    label: `${scenarioKey} · ${key}`,
    prompt: `Launch ${scenarioKey} (${key}): ${desc}`,
    description: desc,
    categoryId: num,
    targetPort: meta.port,
    protocol: meta.protocol,
  };
});

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : undefined);

function pick(o: Obj, keys: string[]): unknown {
  for (const k of keys) if (o[k] !== undefined) return o[k];
  return undefined;
}

function toList(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (isObj(v)) return Object.entries(v).map(([k, val]) => (isObj(val) ? { id: k, ...val } : { id: k, name: val }));
  return [];
}

function toNodes(v: unknown): string[] {
  const out: string[] = [];
  for (const it of toList(v)) {
    const id = isObj(it) ? str(pick(it, ["id", "node", "name", "container"])) : str(it);
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

function toThreats(v: unknown): CatalogThreat[] {
  const out: CatalogThreat[] = [];
  for (const it of toList(v)) {
    if (isObj(it)) {
      const scenarioKey = str(pick(it, ["scenario_key", "scenario_id", "key", "id"])) ?? "";
      const threatClassification = str(pick(it, ["threat_classification", "signature_name", "signature", "threat", "name", "title", "label"])) ?? scenarioKey;
      const threatFamily = str(pick(it, ["threat_family", "family", "group", "category"])) ?? "General Threats";
      const id = scenarioKey || str(pick(it, ["category_id", "id"])) || threatClassification;
      if (!id || !threatClassification) continue;
      const label = scenarioKey ? `${scenarioKey} · ${threatClassification}` : threatClassification;
      const keywords = Array.isArray(it.search_keywords) ? it.search_keywords : [];
      const firstKw = keywords.length > 0 && typeof keywords[0] === "string" ? keywords[0] : undefined;
      const description = str(pick(it, ["description", "example_prompt", "prompt", "example"]));
      const prompt = scenarioKey
        ? `Launch ${scenarioKey} (${threatClassification}): ${description ?? firstKw ?? threatClassification}`
        : description ?? threatClassification.replace(/_/g, " ").toLowerCase();
      const cat = Number(pick(it, ["category_id", "id"]));
      const severity = str(pick(it, ["severity"]));
      const protocol = str(pick(it, ["protocol"]));
      const targetPort = Number(pick(it, ["target_port"]));
      out.push({
        id,
        scenarioKey: scenarioKey || id,
        threatClassification,
        threatFamily,
        label,
        prompt,
        categoryId: Number.isFinite(cat) ? cat : undefined,
        severity,
        protocol,
        targetPort: Number.isFinite(targetPort) ? targetPort : undefined,
        description,
      });
    } else {
      const s = str(it);
      if (s) {
        out.push({
          id: s,
          scenarioKey: s,
          threatClassification: s,
          threatFamily: "General Threats",
          label: s,
          prompt: s.replace(/_/g, " ").toLowerCase(),
        });
      }
    }
  }
  return out;
}

export function normalizeCatalog(raw: unknown): Catalog {
  const root = isObj(raw) ? raw : {};
  const sources = toNodes(pick(root, ["attackers", "sources", "attacker_nodes", "source_nodes", "red_team"]));
  const targets = toNodes(pick(root, ["victims", "targets", "target_nodes", "victim_nodes", "target_containers"]));
  const threats = toThreats(pick(root, ["threats", "categories", "attacks", "attack_categories", "threat_classifications", "scenarios", "catalog"]) ?? (Array.isArray(raw) ? raw : undefined));
  const baseThreats = threats.length ? [...threats] : [...FALLBACK_THREATS];
  if (!baseThreats.some((t) => t.categoryId === 99 || t.scenarioKey === "SCENARIO_99")) {
    baseThreats.push({
      id: "UNKNOWN_ANOMALY",
      scenarioKey: "SCENARIO_99",
      threatClassification: "UNKNOWN_ANOMALY",
      threatFamily: "Zero-Day & Advanced Persistent Threats",
      label: "SCENARIO_99 · UNKNOWN_ANOMALY (Zero-Day)",
      prompt: "Simulate novel zero-day payload with unmapped polymorphic signature targeting internal port 80.",
      description: "Unmapped out-of-distribution anomaly triggering Fail-Safe Protocol and conservative L4 rate limiting.",
      categoryId: 99,
      targetPort: 80,
      protocol: "TCP",
    });
  }
  return {
    sources: sources.length ? sources : FALLBACK_SOURCES,
    targets: targets.length ? targets : FALLBACK_TARGETS,
    threats: baseThreats,
  };
}
