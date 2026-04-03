import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

interface QuarantineRecord {
  name?: string;
  category?: string;
  region?: string;
  websiteUrl?: string;
  sourceUrl?: string;
  sourcePortalId?: string;
  quarantineReason?: string;
  reasonHistory?: string[];
  seenCount?: number;
  firstSeenAt?: string;
  lastSeenAt?: string;
}

async function run() {
  const root = path.resolve(process.cwd(), "output", "ingestion");
  const quarantinePath = path.resolve(root, "vendor-discovery-quarantine.json");
  const reportPath = path.resolve(root, "quarantine-review.md");

  const records = await readQuarantine(quarantinePath);
  const byReason = new Map<string, number>();
  const byPortal = new Map<string, number>();

  for (const record of records) {
    const reasons = record.reasonHistory?.length
      ? record.reasonHistory
      : [record.quarantineReason ?? "unknown"];
    for (const reason of reasons) {
      byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
    }
    const portal = record.sourcePortalId ?? "unknown";
    byPortal.set(portal, (byPortal.get(portal) ?? 0) + 1);
  }

  const topReasons = [...byReason.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  const topPortals = [...byPortal.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  const samples = records
    .slice()
    .sort((a, b) => (b.lastSeenAt ?? "").localeCompare(a.lastSeenAt ?? ""))
    .slice(0, 40);

  const lines: string[] = [];
  lines.push("# Quarantine Review");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Total candidates: ${records.length}`);
  lines.push("");
  lines.push("## Top Reasons");
  lines.push("");
  for (const [reason, count] of topReasons) {
    lines.push(`- ${reason}: ${count}`);
  }
  lines.push("");
  lines.push("## Top Source Portals");
  lines.push("");
  for (const [portal, count] of topPortals) {
    lines.push(`- ${portal}: ${count}`);
  }
  lines.push("");
  lines.push("## Recent Candidates");
  lines.push("");
  for (const row of samples) {
    lines.push(
      `- ${row.name ?? "unknown"} | ${row.category ?? "unknown"} | ${row.region ?? "unknown"} | ${row.sourcePortalId ?? "unknown"} | ${row.websiteUrl ?? row.sourceUrl ?? "no-url"} | reason=${row.quarantineReason ?? "unknown"} | seen=${row.seenCount ?? 1}`
    );
  }

  await writeFile(reportPath, `${lines.join("\n")}\n`, "utf-8");
  process.stdout.write(
    JSON.stringify(
      {
        reportPath,
        records: records.length,
        topReasons: topReasons.length,
        topPortals: topPortals.length
      },
      null,
      2
    )
  );
}

async function readQuarantine(filePath: string): Promise<QuarantineRecord[]> {
  try {
    const content = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(content) as unknown;
    return Array.isArray(parsed) ? (parsed as QuarantineRecord[]) : [];
  } catch {
    return [];
  }
}

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "quarantine report failed"}\n`);
  process.exitCode = 1;
});
