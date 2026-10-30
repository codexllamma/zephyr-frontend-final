/** Passive, non-interactive readout of the scroll-driven camera timeline. */
export function CameraHud({ progress, label, playing }: { progress: number; label: string; playing: boolean }) {
  return (
    <div
      role="progressbar"
      aria-label="Camera timeline"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      aria-valuetext={label}
      className="pointer-events-none absolute bottom-2 left-2 z-10 w-64 rounded-md border border-border bg-surface px-2.5 py-1.5"
    >
      <p className="flex items-center justify-between text-[11px] text-muted">
        <span className="font-medium text-fg">{label}</span>
        <span>{playing ? "Auto · click to pause" : "Paused · click to resume"}</span>
      </p>
      <div className="mt-1 h-0.5 w-full bg-border">
        <div className="h-full bg-accent" style={{ width: `${progress * 100}%` }} />
      </div>
    </div>
  );
}
