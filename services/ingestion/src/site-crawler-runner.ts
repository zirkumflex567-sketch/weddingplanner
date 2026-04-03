import { spawn } from "node:child_process";
import type { VendorSearchCategory } from "@wedding/shared";
import type { BrowserUseDiscoveryRecord } from "./browser-use-runner";

export interface SiteCrawlerTask {
  portalId: string;
  portalLabel: string;
  portalUrl: string;
  region: string;
  category: VendorSearchCategory;
  mode: "free-baseline" | "premium-deep-scan";
}

export interface SiteCrawlerResult {
  status: "success" | "skipped" | "failed";
  command: string;
  records: BrowserUseDiscoveryRecord[];
  note?: string;
}

const defaultCommand = "node services/ingestion/scripts/site-crawler-adapter.mjs";
const defaultTimeoutMs = 2 * 60_000;

export async function runSiteCrawlerDiscovery(
  task: SiteCrawlerTask,
  env: Record<string, string | undefined> = process.env
): Promise<SiteCrawlerResult> {
  const command = env.SITE_CRAWLER_COMMAND?.trim() ?? defaultCommand;
  if (!command) {
    return { status: "skipped", command, records: [], note: "SITE_CRAWLER_COMMAND empty" };
  }

  const timeoutMs = Number.parseInt(env.SITE_CRAWLER_TIMEOUT_MS ?? "", 10);
  const payload = JSON.stringify(task);
  try {
    const { stdout, stderr, exitCode } = await runCommand(
      command,
      [payload],
      env,
      Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : defaultTimeoutMs
    );
    if (exitCode !== 0) {
      return {
        status: "failed",
        command,
        records: [],
        note: `Site crawler failed with exit ${exitCode}: ${stderr || "no stderr"}`
      };
    }
    const records = safeParse(stdout);
    if (!records) {
      return {
        status: "failed",
        command,
        records: [],
        note: "Site crawler output was not valid JSON."
      };
    }
    return { status: "success", command, records };
  } catch (error) {
    return {
      status: "failed",
      command,
      records: [],
      note: error instanceof Error ? error.message : "Site crawler failed"
    };
  }
}

function safeParse(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed
      .filter((entry) => entry && typeof entry === "object")
      .map((entry) => entry as BrowserUseDiscoveryRecord);
  } catch {
    return null;
  }
}

async function runCommand(
  command: string,
  args: string[],
  env: Record<string, string | undefined>,
  timeoutMs: number
) {
  const [executable, ...baseArgs] = tokenize(command);
  if (!executable) {
    throw new Error("No executable configured.");
  }

  return new Promise<{ stdout: string; stderr: string; exitCode: number | null }>(
    (resolve, reject) => {
      const child = spawn(executable, [...baseArgs, ...args], {
        stdio: ["ignore", "pipe", "pipe"],
        shell: false,
        env: { ...process.env, ...env }
      });

      let stdout = "";
      let stderr = "";

      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error(`Site crawler timed out after ${timeoutMs}ms.`));
      }, timeoutMs);

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf-8");
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf-8");
      });
      child.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.on("close", (exitCode) => {
        clearTimeout(timeout);
        resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode });
      });
    }
  );
}

function tokenize(command: string) {
  const result: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  for (const char of command.trim()) {
    if ((char === "'" || char === '"') && quote === null) {
      quote = char;
      continue;
    }
    if (char === quote) {
      quote = null;
      continue;
    }
    if (char === " " && quote === null) {
      if (current) {
        result.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current) result.push(current);
  return result;
}
