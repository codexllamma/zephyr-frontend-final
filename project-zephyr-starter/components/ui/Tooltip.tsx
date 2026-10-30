"use client";

import { useId, useState, type ReactNode } from "react";
import { GLOSSARY, type GlossaryKey } from "@/data/glossary";
import { cn } from "@/lib/cn";

/** Accessible hover/focus tooltip. Content is linked to the trigger via aria-describedby. */
export function Tooltip({
  content,
  children,
  side = "top",
  className,
}: {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom";
  className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
    >
      <span aria-describedby={open ? id : undefined} className="inline-flex">
        {children}
      </span>
      {open && (
        <span
          id={id}
          role="tooltip"
          className={cn(
            "pointer-events-none absolute left-1/2 z-50 w-64 -translate-x-1/2 rounded-md border border-border-strong bg-overlay px-2.5 py-2 text-left text-xs font-normal normal-case leading-snug tracking-normal text-fg shadow-lg",
            side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5",
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}

/** Inline glossary term with a plain-English tooltip. */
export function Term({ k, children }: { k: GlossaryKey; children?: ReactNode }) {
  const entry = GLOSSARY[k];
  return (
    <Tooltip
      content={
        <>
          <strong className="block text-fg-strong">{entry.term}</strong>
          {entry.definition}
        </>
      }
    >
      <span tabIndex={0} className="cursor-help underline decoration-subtle decoration-dotted underline-offset-2">
        {children ?? entry.term}
      </span>
    </Tooltip>
  );
}
