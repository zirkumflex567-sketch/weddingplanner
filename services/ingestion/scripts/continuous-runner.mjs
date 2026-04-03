#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../../..");
const outputDir = path.resolve(rootDir, "services/ingestion/output/ingestion");
const statePath = path.resolve(outputDir, "continuous-runner-state.json");

const defaults = {
  regionSize: envInt("VENDOR_BATCH_REGION_SIZE", 1),
  categorySize: envInt("VENDOR_BATCH_CATEGORY_SIZE", 2),
  regionLimit: envInt("VENDOR_BATCH_REGION_LIMIT", 3),
  categoryLimit: envInt("VENDOR_BATCH_CATEGORY_LIMIT", 4),
  intervalSeconds: envInt("VENDOR_BATCH_INTERVAL_SECONDS", 120),
  adapterPath:
    process.env.BROWSER_USE_CLI_COMMAND ||
    path.resolve(rootDir, "services/ingestion/scripts/browser-use-adapter.mjs")
};

await mkdir(outputDir, { recursive: true });
const state = await readState();

state.startedAt = state.startedAt || new Date().toISOString();
state.pid = process.pid;
state.active = true;
state.lastHeartbeatAt = new Date().toISOString();
state.regionOffset = Number.isFinite(state.regionOffset) ? state.regionOffset : 0;
state.categoryOffset = Number.isFinite(state.categoryOffset) ? state.categoryOffset : 0;
state.cycles = Number.isFinite(state.cycles) ? state.cycles : 0;
await writeState(state);

const runOnce = process.env.CONTINUOUS_RUN_ONCE === "true";

while (true) {
  const cycleStartedAt = new Date().toISOString();
  state.lastHeartbeatAt = cycleStartedAt;
  state.lastCycleStartedAt = cycleStartedAt;
  state.active = true;
  await writeState(state);

  try {
    const result = await runBatch({
      rootDir,
      adapterPath: defaults.adapterPath,
      regionSize: defaults.regionSize,
      categorySize: defaults.categorySize,
      regionLimit: defaults.regionLimit,
      categoryLimit: defaults.categoryLimit,
      regionOffset: state.regionOffset,
      categoryOffset: state.categoryOffset
    });

    state.lastExitCode = result.exitCode;
    state.lastStdoutTail = result.stdout.slice(-4000);
    state.lastStderrTail = result.stderr.slice(-4000);
    state.lastError = "";
  } catch (error) {
    state.lastError = error instanceof Error ? error.message : "Unknown batch runner error";
    state.lastExitCode = 1;
  }

  state.cycles += 1;
  state.regionOffset += defaults.regionSize;
  state.categoryOffset += defaults.categorySize;
  state.lastCycleCompletedAt = new Date().toISOString();
  state.lastHeartbeatAt = state.lastCycleCompletedAt;
  await writeState(state);

  if (runOnce) {
    break;
  }

  await sleep(defaults.intervalSeconds * 1000);
}

state.active = false;
state.lastHeartbeatAt = new Date().toISOString();
await writeState(state);

async function runBatch(input) {
  const env = {
    ...process.env,
    BROWSER_USE_CLI_COMMAND: input.adapterPath,
    VENDOR_PIPELINE_FORCE: "true",
    VENDOR_BATCH_REGION_SIZE: String(input.regionSize),
    VENDOR_BATCH_CATEGORY_SIZE: String(input.categorySize),
    VENDOR_BATCH_REGION_LIMIT: String(input.regionLimit),
    VENDOR_BATCH_CATEGORY_LIMIT: String(input.categoryLimit),
    VENDOR_BATCH_REGION_OFFSET: String(input.regionOffset),
    VENDOR_BATCH_CATEGORY_OFFSET: String(input.categoryOffset)
  };

  return new Promise((resolve, reject) => {
    const child = spawn("npm", ["run", "pipeline:batch", "--workspace", "@wedding/ingestion"], {
      cwd: input.rootDir,
      env,
      shell: false
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf-8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf-8");
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      if (exitCode === 0) {
        resolve({ exitCode, stdout, stderr });
      } else {
        reject(
          new Error(
            `pipeline:batch failed with exit ${exitCode}\n${stderr || stdout || "No output"}`
          )
        );
      }
    });
  });
}

async function readState() {
  try {
    const content = await readFile(statePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}

async function writeState(value) {
  await writeFile(statePath, JSON.stringify(value, null, 2), "utf-8");
}

function envInt(key, fallback) {
  const parsed = Number.parseInt(process.env[key] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
