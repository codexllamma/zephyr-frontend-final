/** Strict dotted-quad IPv4 check (0-255 per octet, no leading zeros). */
export function isIPv4(value: string): boolean {
  const parts = value.trim().split(".");
  return (
    parts.length === 4 &&
    parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255 && (p === "0" || !p.startsWith("0")))
  );
}
