import { explainDecision } from "@/lib/explain";
import type { AlertCase } from "@/types";

export function ExplainPanel({ c }: { c: AlertCase }) {
  const items = explainDecision(c);
  return (
    <div>
      <dl className="space-y-3">
        {items.map((i) => (
          <div key={i.question}>
            <dt className="text-xs font-semibold text-fg-strong">{i.question}</dt>
            <dd className="mt-0.5 text-[13px] text-muted">{i.answer}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[11px] text-subtle">Built from the alert and validation data by fixed templates. It is not free-form model output.</p>
    </div>
  );
}
