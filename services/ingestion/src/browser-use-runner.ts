import { spawn } from "node:child_process";
import type { VendorSearchCategory } from "@wedding/shared";

export type BrowserUseRunMode = "free-baseline" | "premium-deep-scan";

export interface BrowserUseDiscoveryTask {
  portalId: string;
  portalLabel: string;
  portalUrl: string;
  region: string;
  category: VendorSearchCategory;
  mode: BrowserUseRunMode;
}

export interface BrowserUseDiscoveryRecord {
  name?: string;
  websiteUrl?: string;
  sourceUrl?: string;
  address?: string;
  contactPhone?: string;
  contactEmail?: string;
  openingHours?: string[];
  priceHints?: string[];
  ratingValue?: number;
  ratingCount?: number;
  sourceQualityScore?: number;
  note?: string;
}

export interface BrowserUseDiscoveryResult {
  status: "success" | "skipped" | "failed";
  command: string;
  records: BrowserUseDiscoveryRecord[];
  note?: string;
}

export interface BrowserUseRunnerOptions {
  env?: Record<string, string | undefined>;
}

const defaultCommand = "browser-use-cli";
const defaultTimeoutMs = 2 * 60_000;

export async function runBrowserUseDiscovery(
  task: BrowserUseDiscoveryTask,
  options: BrowserUseRunnerOptions = {}
): Promise<BrowserUseDiscoveryResult> {
  const env = options.env ?? process.env;
  const command = env.BROWSER_USE_CLI_COMMAND?.trim() ?? defaultCommand;
  const timeoutMs = Number.parseInt(env.BROWSER_USE_TIMEOUT_MS ?? "", 10);

  if (!command) {
    return {
      status: "skipped",
      command,
      records: [],
      note: "BROWSER_USE_CLI_COMMAND is empty."
    };
  }

  const payload = JSON.stringify(task);
  const args = [payload];

  try {
    const { stdout, stderr, exitCode } = await runCommand(
      command,
      args,
      env,
      Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : defaultTimeoutMs
    );

    if (exitCode !== 0) {
      return {
        status: "failed",
        command,
        records: [],
        note: `Browser Use command failed with exit ${exitCode}: ${stderr || "no stderr"}`
      };
    }

    const parsed = safeParseDiscoveryOutput(stdout);
    if (!parsed) {
      return {
        status: "failed",
        command,
        records: [],
        note: "Browser Use command output was not valid JSON."
      };
    }

    return {
      status: "success",
      command,
      records: parsed
    };
  } catch (error) {
    return {
      status: "failed",
      command,
      records: [],
      note: error instanceof Error ? error.message : "Browser Use command failed."
    };
  }
}

function safeParseDiscoveryOutput(value: string): BrowserUseDiscoveryRecord[] | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return null;
    }

    return parsed
      .filter((entry) => entry && typeof entry === "object")
      .map((entry) => normalizeDiscoveryRecord(entry as Record<string, unknown>))
      .filter((entry) => Object.keys(entry).length > 0);
  } catch {
    return null;
  }
}

function normalizeDiscoveryRecord(
  input: Record<string, unknown>
): BrowserUseDiscoveryRecord {
  const openingHours = asStringArray(input.openingHours);
  const priceHints = asStringArray(input.priceHints);
  const ratingValue = asFiniteNumber(input.ratingValue);
  const ratingCount = asFiniteNumber(input.ratingCount);
  const sourceQualityScore = asFiniteNumber(input.sourceQualityScore);

  return {
    ...(asString(input.name) ? { name: asString(input.name) } : {}),
    ...(asString(input.websiteUrl) ? { websiteUrl: asString(input.websiteUrl) } : {}),
    ...(asString(input.sourceUrl) ? { sourceUrl: asString(input.sourceUrl) } : {}),
    ...(asString(input.address) ? { address: asString(input.address) } : {}),
    ...(asString(input.contactPhone) ? { contactPhone: asString(input.contactPhone) } : {}),
    ...(asString(input.contactEmail) ? { contactEmail: asString(input.contactEmail) } : {}),
    ...(openingHours.length > 0 ? { openingHours } : {}),
    ...(priceHints.length > 0 ? { priceHints } : {}),
    ...(ratingValue !== null ? { ratingValue } : {}),
    ...(ratingCount !== null ? { ratingCount } : {}),
    ...(sourceQualityScore !== null ? { sourceQualityScore } : {}),
    ...(asString(input.note) ? { note: asString(input.note) } : {})
  };
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "";
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function asFiniteNumber(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

async function runCommand(
  command: string,
  args: string[],
  env: Record<string, string | undefined>,
  timeoutMs: number
) {
  const [executable, ...baseArgs] = tokenizeCommand(command);
  if (!executable) {
    throw new Error("No executable found in BROWSER_USE_CLI_COMMAND.");
  }

  return new Promise<{ stdout: string; stderr: string; exitCode: number | null }>(
    (resolve, reject) => {
      const child = spawn(executable, [...baseArgs, ...args], {
        stdio: ["ignore", "pipe", "pipe"],
        shell: false,
        env: {
          ...process.env,
          ...env
        }
      });

      let stdout = "";
      let stderr = "";

      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error(`Browser Use command timed out after ${timeoutMs}ms.`));
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
        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode
        });
      });
    }
  );
}

function tokenizeCommand(command: string) {
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

  if (current) {
    result.push(current);
  }

  return result;
}
