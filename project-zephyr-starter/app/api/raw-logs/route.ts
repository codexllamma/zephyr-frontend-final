import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { preprocessRawLogFile, type PreprocessedLogEntry } from "@/lib/raw-log-preprocessor";

const RAW_LOGS_DIR = path.join(process.cwd(), "data", "raw_logs");
const FILES_PER_BATCH = 8;

let cachedFileNames: string[] | null = null;

async function getSortedLogFiles(): Promise<string[]> {
  if (cachedFileNames && cachedFileNames.length > 0) {
    return cachedFileNames;
  }
  const entries = await readdir(RAW_LOGS_DIR);
  const txtFiles = entries
    .filter((name) => name.toLowerCase().endsWith(".txt"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  cachedFileNames = txtFiles;
  return txtFiles;
}

export interface RawLogsApiResponse {
  fileIndex: number;
  nextIndex: number;
  totalFiles: number;
  fileName: string;
  logs: PreprocessedLogEntry[];
}

export async function GET(request: NextRequest) {
  try {
    const files = await getSortedLogFiles();
    if (files.length === 0) {
      return Response.json({
        fileIndex: 0,
        nextIndex: 0,
        totalFiles: 0,
        fileName: "",
        logs: [],
      } satisfies RawLogsApiResponse);
    }

    const indexParam = request.nextUrl.searchParams.get("index");
    const parsedIdx = indexParam !== null ? Number.parseInt(indexParam, 10) : 0;
    const startIdx =
      Number.isFinite(parsedIdx) && parsedIdx >= 0 ? parsedIdx % files.length : 0;

    const batchCount = Math.min(FILES_PER_BATCH, files.length);
    const logs: PreprocessedLogEntry[] = [];
    const deferredCores: PreprocessedLogEntry[] = [];
    let hasEmittedFiller = false;

    for (let offset = 0; offset < batchCount; offset++) {
      const idx = (startIdx + offset) % files.length;
      const fileName = files[idx];
      const fullPath = path.join(RAW_LOGS_DIR, fileName);
      const rawContent = await readFile(fullPath, "utf-8");
      const fileLogs = preprocessRawLogFile(rawContent);

      const hasFiller = fileLogs.some((entry) => entry.kind === "filler");
      if (!hasFiller && !hasEmittedFiller) {
        deferredCores.push(...fileLogs);
        continue;
      }

      hasEmittedFiller = true;
      logs.push(...fileLogs);
      if (deferredCores.length > 0) {
        logs.push(...deferredCores);
        deferredCores.length = 0;
      }
    }

    if (deferredCores.length > 0) {
      logs.push(...deferredCores);
    }

    const endIdx = (startIdx + batchCount - 1) % files.length;
    return Response.json({
      fileIndex: startIdx,
      nextIndex: (startIdx + batchCount) % files.length,
      totalFiles: files.length,
      fileName: `${files[startIdx]}..${files[endIdx]}`,
      logs,
    } satisfies RawLogsApiResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read raw_logs";
    return Response.json({ detail: message }, { status: 500 });
  }
}
