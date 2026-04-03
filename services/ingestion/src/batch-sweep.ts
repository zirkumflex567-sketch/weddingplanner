import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { VendorSearchCategory } from "@wedding/shared";
import { runVendorDiscoveryPipeline, type PipelineMode } from "./pipeline";
import {
  chunkArray,
  germanSweepCategories,
  germanSweepRegions
} from "./region-batches";

interface BatchSweepSummary {
  startedAt: string;
  completedAt: string;
  mode: PipelineMode;
  regionBatchSize: number;
  categoryBatchSize: number;
  regionLimit: number;
  categoryLimit: number;
  regionOffset: number;
  categoryOffset: number;
  runCount: number;
  totalRefreshRuns: number;
  totalBrowserUseRuns: number;
  lastDbRecordCount: number;
  outputReportPaths: string[];
}

const outputRoot = path.resolve(process.cwd(), "output", "ingestion");

export async function runBatchSweepFromCli() {
  const mode = normalizeMode(process.env.VENDOR_BATCH_MODE);
  const regionBatchSize = parsePositiveInt(process.env.VENDOR_BATCH_REGION_SIZE, 2);
  const categoryBatchSize = parsePositiveInt(process.env.VENDOR_BATCH_CATEGORY_SIZE, 3);
  const regionLimit = parsePositiveInt(process.env.VENDOR_BATCH_REGION_LIMIT, germanSweepRegions.length);
  const categoryLimit = parsePositiveInt(process.env.VENDOR_BATCH_CATEGORY_LIMIT, germanSweepCategories.length);
  const regionOffset = parseNonNegativeInt(process.env.VENDOR_BATCH_REGION_OFFSET, 0);
  const categoryOffset = parseNonNegativeInt(process.env.VENDOR_BATCH_CATEGORY_OFFSET, 0);
  const force = (process.env.VENDOR_PIPELINE_FORCE ?? "true").toLowerCase() === "true";

  const regions = rotateAndLimit(germanSweepRegions, regionOffset, regionLimit);
  const categories = rotateAndLimit(germanSweepCategories, categoryOffset, categoryLimit);
  const regionChunks = chunkArray(regions, regionBatchSize);
  const categoryChunks = chunkArray(categories, categoryBatchSize);
  const startedAt = new Date().toISOString();

  const outputReportPaths: string[] = [];
  let totalRefreshRuns = 0;
  let totalBrowserUseRuns = 0;
  let lastDbRecordCount = 0;

  for (const regionChunk of regionChunks) {
    for (const categoryChunk of categoryChunks) {
      for (const region of regionChunk) {
        const report = await runVendorDiscoveryPipeline({
          mode,
          region,
          categories: categoryChunk as VendorSearchCategory[],
          force
        });

        const reportPath = await persistBatchRunReport(report, region, categoryChunk);
        outputReportPaths.push(reportPath);
        totalRefreshRuns += report.refreshRuns.length;
        totalBrowserUseRuns += report.browserUseRuns.length;
        lastDbRecordCount = report.dbRecordCount;
      }
    }
  }

  const summary: BatchSweepSummary = {
    startedAt,
    completedAt: new Date().toISOString(),
    mode,
    regionBatchSize,
    categoryBatchSize,
    regionLimit,
    categoryLimit,
    regionOffset,
    categoryOffset,
    runCount: outputReportPaths.length,
    totalRefreshRuns,
    totalBrowserUseRuns,
    lastDbRecordCount,
    outputReportPaths
  };

  const summaryPath = await persistSummary(summary);
  process.stdout.write(
    JSON.stringify(
      {
        summaryPath,
        runCount: summary.runCount,
        totalRefreshRuns: summary.totalRefreshRuns,
        totalBrowserUseRuns: summary.totalBrowserUseRuns,
        lastDbRecordCount: summary.lastDbRecordCount
      },
      null,
      2
    )
  );
}

async function persistBatchRunReport(
  report: unknown,
  region: string,
  categories: string[]
) {
  await mkdir(outputRoot, { recursive: true });
  const filePath = path.resolve(
    outputRoot,
    `batch-run-${safeSlug(region)}-${safeSlug(categories.join("-"))}-${Date.now()}.json`
  );
  await writeFile(filePath, JSON.stringify(report, null, 2), "utf-8");
  return filePath;
}

async function persistSummary(summary: BatchSweepSummary) {
  await mkdir(outputRoot, { recursive: true });
  const filePath = path.resolve(outputRoot, `batch-summary-${Date.now()}.json`);
  await writeFile(filePath, JSON.stringify(summary, null, 2), "utf-8");
  return filePath;
}

function safeSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function rotateAndLimit<T>(values: T[], offset: number, limit: number) {
  if (values.length === 0) {
    return [];
  }
  const normalizedOffset = ((offset % values.length) + values.length) % values.length;
  const rotated = [...values.slice(normalizedOffset), ...values.slice(0, normalizedOffset)];
  return rotated.slice(0, Math.max(1, limit));
}

function normalizeMode(value: string | undefined): PipelineMode {
  if (value === "premium" || value === "premium-deep-scan") {
    return "premium-deep-scan";
  }
  return "weekly-baseline";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runBatchSweepFromCli().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.stack ?? error.message : "Unknown batch sweep error"}\n`
    );
    process.exitCode = 1;
  });
}
