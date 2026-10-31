export interface PreprocessedLogEntry {
  /** Clean relevant log content with [CORE]/[FILLER] tags and header metadata stripped. */
  text: string;
  /** Original tag classification before stripping ("core" -> red, "filler" -> green). */
  kind: "core" | "filler";
}

/**
 * Synthetic web-asset filler paths present in some INC-*_syslog.txt files
 * (e.g. INC-001_syslog.txt) that resemble browser DOM / dev-server requests.
 */
const SYNTHETIC_WEB_ASSET_NOISE =
  /\/(favicon\.ico|assets\/css\/style\.css|assets\/main\.js|telemetry|api\/v1\/health)\b/i;

/**
 * Strips leading [CORE] / [FILLER] tags, secondary alert/category tags (e.g. [IDS-ALERT]),
 * and synthetic source/timestamp prefixes so only the relevant syslog payload remains.
 */
export function preprocessRawLogLine(rawLine: string): PreprocessedLogEntry | null {
  let s = rawLine.trim();
  if (!s) return null;

  const isCore = /^\[CORE\]/i.test(s);

  // 1. Remove leading [CORE] or [FILLER] tag
  s = s.replace(/^\[(CORE|FILLER)\]\s*/i, "");

  // 2. Remove any secondary bracketed category/alert tags e.g. [WAF-ALERT], [EDR-ALERT], [IDS-ALERT]
  s = s.replace(/^(?:\[[A-Za-z0-9_-]+\]\s*)+/, "");

  // 3. Handle CLF HTTP access lines: <ip> - - [dd/Mmm/yyyy:...] "<METHOD> <PATH> HTTP/x.x" <STATUS> <BYTES>
  const clfHttpMatch = s.match(
    /^(\S+)\s+-\s+-\s+\[\d{2}\/[A-Za-z]{3}\/\d{4}:[^\]]+\]\s+"([A-Z]+)\s+([^"]+?)(?:\s+(HTTP\/[0-9.]+))?"\s+(\d{3})(?:\s+\d+)?(.*)$/,
  );
  if (clfHttpMatch) {
    const [, ip, method, urlPath, proto, status, rest] = clfHttpMatch;
    if (!isCore && SYNTHETIC_WEB_ASSET_NOISE.test(urlPath)) {
      return null;
    }
    const suffix = rest && rest.trim() ? ` ${rest.trim()}` : "";
    return {
      text: `${ip} -> ${method} ${urlPath}${proto ? ` ${proto}` : ""} [${status}]${suffix}`,
      kind: isCore ? "core" : "filler",
    };
  }

  // 4. Remove CLF-style "<host/ip> - - [dd/Mmm/yyyy:HH:MM:SS +0000] " header for non-HTTP lines (SMBv2, LDAP, RPC, Kerberos)
  s = s.replace(/^\S+\s+-\s+-\s+\[\d{2}\/[A-Za-z]{3}\/\d{4}:[^\]]+\]\s*/, "");

  // 5. Remove Syslog/Service header "<SourceName> [dd/Mmm/yyyy:HH:MM:SS +0000]: " (+ optional kernel "[ 1234.56] ")
  s = s.replace(
    /^[^[\]"]+?\[\d{2}\/[A-Za-z]{3}\/\d{4}:[^\]]+\]:\s*(?:\[\s*\d+(?:\.\d+)?\]\s*)?/,
    "",
  );

  // 6. Remove any standalone "[dd/Mmm/yyyy:HH:MM:SS +0000]:? " timestamp prefix
  s = s.replace(/^\[\d{2}\/[A-Za-z]{3}\/\d{4}:[^\]]+\]:?\s*/, "");

  // 7. Unwrap any remaining bare quoted HTTP request lines
  const bareHttpMatch = s.match(
    /^"([A-Z]+)\s+([^"]+?)(?:\s+(HTTP\/[0-9.]+))?"\s+(\d{3})(?:\s+\d+)?(.*)$/,
  );
  if (bareHttpMatch) {
    const [, method, urlPath, proto, status, rest] = bareHttpMatch;
    if (!isCore && SYNTHETIC_WEB_ASSET_NOISE.test(urlPath)) {
      return null;
    }
    const suffix = rest && rest.trim() ? ` ${rest.trim()}` : "";
    return {
      text: `HTTP ${method} ${urlPath}${proto ? ` ${proto}` : ""} [${status}]${suffix}`,
      kind: isCore ? "core" : "filler",
    };
  }

  const cleaned = s.trim();
  if (!cleaned) return null;
  if (!isCore && SYNTHETIC_WEB_ASSET_NOISE.test(cleaned)) {
    return null;
  }

  return {
    text: cleaned,
    kind: isCore ? "core" : "filler",
  };
}

/**
 * Preprocesses a .txt syslog file from `data/raw_logs`, deduplicating repeated
 * filler templates within the file so the stream cycles cleanly across files.
 */
export function preprocessRawLogFile(rawContent: string): PreprocessedLogEntry[] {
  const fillers: PreprocessedLogEntry[] = [];
  const cores: PreprocessedLogEntry[] = [];
  const seen = new Set<string>();

  for (const line of rawContent.split(/\r?\n/)) {
    const parsed = preprocessRawLogLine(line);
    if (!parsed) continue;
    const key = `${parsed.kind}:${parsed.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (parsed.kind === "core") {
      cores.push(parsed);
    } else {
      fillers.push(parsed);
    }
  }

  return [...fillers, ...cores];
}
