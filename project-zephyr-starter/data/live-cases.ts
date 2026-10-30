import { buildAlert, buildBadEnvelope, buildEnvelope } from "@/data/builders";
import { fakeUuid } from "@/lib/format";
import type { EvidenceItem, MitigationEnvelope, NIDSAlert, ScenarioId } from "@/types";

/**
 * DEMO DATA — alert cases that scenarios create when they run.
 * Each builder receives the simulated detection time, so the alert timestamp
 * always matches the demo clock.
 */

export interface LiveCaseBuild {
  scenario: ScenarioId;
  alert: NIDSAlert;
  summary: string;
  evidence: EvidenceItem[];
  /** Model proposals in the order the correction loop produces them. */
  envelopes: MitigationEnvelope[];
}

export const LIVE_CASE_BUILDERS: Record<string, (ts: string) => LiveCaseBuild> = {
  flash_sale: (ts) => {
    const built = buildAlert({
      key: "live-flash-sale",
      // Alert id prefix taken from the benchmark's flash-sale burst (d9d80b8d).
      id: `d9d80b8d${fakeUuid("live-flash-sale").slice(8)}`,
      ts,
      threat: "BENIGN",
      benignKind: "flash_sale",
      src: "pc-5",
      dst: "pc-3",
      port: 443,
      pkts: 2762,
      bytes: 1_860_000,
      synRatio: 0.07,
    });
    return {
      scenario: "flash_sale",
      alert: built.alert,
      summary: built.summary,
      evidence: built.evidence,
      envelopes: [buildEnvelope(built.alert, "BENIGN")],
    };
  },
  suspicious_syn: (ts) => {
    const built = buildAlert({
      key: "live-suspicious-syn",
      ts,
      threat: "SYN_FLOOD",
      src: "pc-5",
      dst: "pc-3",
      port: 80,
      pkts: 5420,
      synRatio: 0.97,
      confidence: 0.94,
    });
    return {
      scenario: "suspicious",
      alert: built.alert,
      summary: built.summary,
      evidence: built.evidence,
      envelopes: [
        // Attempt 1 is intentionally unsafe so the Critic has something real to reject.
        buildBadEnvelope(built.alert, "SYN_FLOOD", "hallucinated"),
        buildEnvelope(built.alert, "SYN_FLOOD"),
      ],
    };
  },
};
