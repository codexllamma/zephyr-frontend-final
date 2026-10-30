import type { InputHTMLAttributes, SelectHTMLAttributes } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/cn";

const base =
  "h-8 rounded-md border border-border bg-elevated px-2.5 text-xs text-fg placeholder:text-subtle hover:border-border-strong";

export function SearchInput({ className, label, ...p }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className={cn("relative block", className)}>
      <span className="sr-only">{label}</span>
      <Search aria-hidden className="pointer-events-none absolute left-2.5 top-2 size-4 text-subtle" />
      <input type="search" className={cn(base, "w-full pl-8")} placeholder={label} {...p} />
    </label>
  );
}

export function Select({ label, className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="sr-only">{label}</span>
      <select className={cn(base, "w-full pr-6")} {...p}>
        {children}
      </select>
    </label>
  );
}
