export type GlossaryKey =
  | "nids"
  | "mitigation"
  | "critic"
  | "grpo"
  | "entity_grounding"
  | "false_positive"
  | "container_namespace"
  | "syn_flood"
  | "mitre"
  | "iptables";

export interface GlossaryEntry {
  term: string;
  definition: string;
}

/** Plain-English explanations shown in tooltips throughout the UI. */
export const GLOSSARY: Record<GlossaryKey, GlossaryEntry> = {
  nids: {
    term: "NIDS",
    definition:
      "Network Intrusion Detection System. A watchful sensor that inspects network traffic in short windows and raises an alert when something looks wrong.",
  },
  mitigation: {
    term: "Mitigation",
    definition:
      "The response to a threat, for example blocking one hostile address. A good mitigation stops the attack without breaking things for legitimate users.",
  },
  critic: {
    term: "Critic",
    definition:
      "Deterministic code (not an AI) that checks every proposed action against fixed safety rules before anything can run. Same input, same verdict, every time.",
  },
  grpo: {
    term: "GRPO",
    definition:
      "Group Relative Policy Optimization. A training method where the model tries several answers, each is scored by the Critic's rules, and the model learns from the better ones.",
  },
  entity_grounding: {
    term: "Entity grounding",
    definition:
      "Making sure the proposal refers to the real machine, address and port from the alert, and does not invent any. It prevents an action from hitting the wrong target.",
  },
  false_positive: {
    term: "False positive",
    definition:
      "Harmless activity mistaken for an attack. Acting on one can cause an outage, for example blocking genuine customers during a flash sale.",
  },
  container_namespace: {
    term: "Container namespace",
    definition:
      "The private network space of one container. A rule applied inside it affects only that container, not the host or its neighbours.",
  },
  syn_flood: {
    term: "SYN flood",
    definition:
      "An attack that starts huge numbers of connections and never finishes them, leaving the server too busy to serve real users.",
  },
  mitre: {
    term: "MITRE ATT&CK",
    definition:
      "A public catalogue of attacker tactics and techniques. Each alert carries a technique ID so analysts can look up how the attack works.",
  },
  iptables: {
    term: "iptables",
    definition:
      "The Linux firewall tool. Zephyr proposes iptables rules that are applied inside the target container's own INPUT chain.",
  },
};
