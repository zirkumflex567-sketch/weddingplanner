import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  vendorSourcePortals,
  type VendorSearchCategory
} from "@wedding/shared";
import { createVendorRefreshJob } from "./index";
import { createVendorRefreshExecutor, type VendorRefreshRun } from "./runtime";
import { runBrowserUseDiscovery, type BrowserUseDiscoveryResult } from "./browser-use-runner";
import { runSiteCrawlerDiscovery, type SiteCrawlerResult } from "./site-crawler-runner";

export type PipelineMode = "weekly-baseline" | "premium-deep-scan";

export interface DiscoveryDbRecord {
  id: string;
  name: string;
  category: VendorSearchCategory;
  region: string;
  websiteUrl?: string | undefined;
  sourceUrl?: string | undefined;
  sourcePortalId: string;
  address?: string | undefined;
  contactPhone?: string | undefined;
  contactEmail?: string | undefined;
  openingHours?: string[] | undefined;
  priceHints?: string[] | undefined;
  ratingValue?: number | undefined;
  ratingCount?: number | undefined;
  sourceQualityScore?: number | undefined;
  freshnessTimestamp: string;
  note?: string | undefined;
}

export interface PipelineState {
  weeklyBaselineLastRunAt?: string;
}

export interface PipelineRunReport {
  id: string;
  mode: PipelineMode;
  createdAt: string;
  region: string;
  categories: VendorSearchCategory[];
  skippedAsNotDue: boolean;
  refreshRuns: VendorRefreshRun[];
  browserUseRuns: Array<{
    portalId: string;
    category: VendorSearchCategory;
    result: BrowserUseDiscoveryResult;
  }>;
  siteCrawlerRuns: Array<{
    portalId: string;
    category: VendorSearchCategory;
    result: SiteCrawlerResult;
  }>;
  dbRecordCount: number;
}

const defaultRegion = "Deutschland";
const outputRoot = path.resolve(process.cwd(), "output", "ingestion");
const stateFile = path.resolve(outputRoot, "pipeline-state.json");
const dbFile = path.resolve(outputRoot, "vendor-discovery-db.json");
const quarantineFile = path.resolve(outputRoot, "vendor-discovery-quarantine.json");

export interface DiscoveryQuarantineRecord extends DiscoveryDbRecord {
  quarantineReason: string;
  quarantinedAt: string;
  firstSeenAt?: string;
  lastSeenAt?: string;
  seenCount?: number;
  reasonHistory?: string[];
  reviewStatus?: "pending" | "approved" | "rejected";
}

const defaultCategories: VendorSearchCategory[] = [
  "venue",
  "photography",
  "catering",
  "music",
  "florals",
  "attire",
  "stationery",
  "cake",
  "transport",
  "lodging",
  "planner",
  "officiant",
  "videography",
  "photobooth",
  "magician",
  "live-artist",
  "childcare",
  "rentals"
];

export async function runPipelineFromCli() {
  const modeArg = normalizeModeArg(process.argv[2]);
  const mode = modeArg ?? "weekly-baseline";
  const region = process.env.VENDOR_PIPELINE_REGION?.trim() || defaultRegion;
  const categories = parseCategoriesEnv(process.env.VENDOR_PIPELINE_CATEGORIES);
  const force = (process.env.VENDOR_PIPELINE_FORCE ?? "").toLowerCase() === "true";

  const report = await runVendorDiscoveryPipeline({
    mode,
    region,
    categories: categories.length > 0 ? categories : defaultCategories,
    force
  });

  const reportPath = await persistReport(report);
  process.stdout.write(
    JSON.stringify(
      {
        reportPath,
        mode: report.mode,
        skippedAsNotDue: report.skippedAsNotDue,
        refreshRunCount: report.refreshRuns.length,
        browserUseRunCount: report.browserUseRuns.length,
        siteCrawlerRunCount: report.siteCrawlerRuns.length,
        dbRecordCount: report.dbRecordCount
      },
      null,
      2
    )
  );
}

export interface RunVendorDiscoveryPipelineInput {
  mode: PipelineMode;
  region: string;
  categories: VendorSearchCategory[];
  force?: boolean;
}

export async function runVendorDiscoveryPipeline(
  input: RunVendorDiscoveryPipelineInput
): Promise<PipelineRunReport> {
  await mkdir(outputRoot, { recursive: true });
  const createdAt = new Date().toISOString();
  const report: PipelineRunReport = {
    id: randomUUID(),
    mode: input.mode,
    createdAt,
    region: input.region,
    categories: input.categories,
    skippedAsNotDue: false,
    refreshRuns: [],
    browserUseRuns: [],
    siteCrawlerRuns: [],
    dbRecordCount: 0
  };

  const state = await readState();
  if (
    input.mode === "weekly-baseline" &&
    !input.force &&
    !isWeeklyRunDue(state.weeklyBaselineLastRunAt, createdAt)
  ) {
    report.skippedAsNotDue = true;
    const db = await readDiscoveryDb();
    report.dbRecordCount = db.length;
    return report;
  }

  const executor = createVendorRefreshExecutor();
  const db = await readDiscoveryDb();
  const dedupe = new Map(db.map((record) => [createRecordKey(record), record] as const));

  for (const category of input.categories) {
    const refreshJob = createVendorRefreshJob({
      paidOrderId: `${input.mode}-${category}-${Date.now()}`,
      region: input.region,
      categories: [category],
      requestedBy: "customer-payment"
    });
    const refreshRun = await executor.executeJobRun({ job: refreshJob, category });
    report.refreshRuns.push(refreshRun);
    upsertFromRefreshRun(refreshRun, category, input.region, dedupe);
  }

  const relevantPortals = vendorSourcePortals.filter((portal) =>
    input.categories.some((category) => portal.categories.includes(category))
  );
  const premiumOnlyPortals = new Set(["booking"]);

  for (const portal of relevantPortals) {
    for (const category of input.categories) {
      if (!portal.categories.includes(category)) {
        continue;
      }

      if (input.mode === "weekly-baseline" && premiumOnlyPortals.has(portal.id)) {
        continue;
      }

      const browserUseResult = await runBrowserUseDiscovery({
        portalId: portal.id,
        portalLabel: portal.label,
        portalUrl: portal.websiteUrl,
        region: input.region,
        category,
        mode:
          input.mode === "premium-deep-scan"
            ? "premium-deep-scan"
            : "free-baseline"
      });
      report.browserUseRuns.push({
        portalId: portal.id,
        category,
        result: browserUseResult
      });

      if (browserUseResult.status === "success") {
        upsertFromBrowserUseRun(
          browserUseResult,
          category,
          input.region,
          portal.id,
          dedupe
        );
      }

      const minBrowserRecords = Number.parseInt(
        process.env.SITE_CRAWLER_MIN_BROWSER_RECORDS ?? "2",
        10
      );
      const shouldRunCrawlerFallback =
        browserUseResult.status !== "success" ||
        browserUseResult.records.length <
          (Number.isFinite(minBrowserRecords) ? minBrowserRecords : 2);

      if (shouldRunCrawlerFallback) {
        const siteCrawlerResult = await runSiteCrawlerDiscovery({
          portalId: portal.id,
          portalLabel: portal.label,
          portalUrl: portal.websiteUrl,
          region: input.region,
          category,
          mode:
            input.mode === "premium-deep-scan"
              ? "premium-deep-scan"
              : "free-baseline"
        });
        report.siteCrawlerRuns.push({
          portalId: portal.id,
          category,
          result: siteCrawlerResult
        });
        if (siteCrawlerResult.status === "success") {
          upsertFromBrowserUseRun(
            {
              status: "success",
              command: siteCrawlerResult.command,
              records: siteCrawlerResult.records
            },
            category,
            input.region,
            portal.id,
            dedupe
          );
        }
      }
    }
  }

  const accepted: DiscoveryDbRecord[] = [];
  const quarantinedCurrentRun: DiscoveryQuarantineRecord[] = [];
  for (const record of dedupe.values()) {
    const decision = classifyDiscoveryRecord(record);
    if (decision.accepted) {
      accepted.push(record);
      continue;
    }
    quarantinedCurrentRun.push({
      ...record,
      quarantineReason: decision.reason ?? "quality-filter",
      quarantinedAt: new Date().toISOString()
    });
  }

  const nextDb = accepted.sort((a, b) => b.freshnessTimestamp.localeCompare(a.freshnessTimestamp));
  const previousQuarantine = await readDiscoveryQuarantine();
  const nextQuarantine = mergeQuarantineRecords(previousQuarantine, quarantinedCurrentRun).sort(
    (a, b) => (b.lastSeenAt ?? b.quarantinedAt).localeCompare(a.lastSeenAt ?? a.quarantinedAt)
  );
  await writeDiscoveryDb(nextDb);
  await writeDiscoveryQuarantine(nextQuarantine);
  report.dbRecordCount = nextDb.length;

  if (input.mode === "weekly-baseline") {
    state.weeklyBaselineLastRunAt = createdAt;
    await writeState(state);
  }

  return report;
}

function upsertFromRefreshRun(
  run: VendorRefreshRun,
  category: VendorSearchCategory,
  region: string,
  dedupe: Map<string, DiscoveryDbRecord>
) {
  for (const record of run.preview.publishableRecords) {
    const normalized: DiscoveryDbRecord = {
      id: randomUUID(),
      name: record.name,
      category,
      region,
      ...(record.websiteUrl ? { websiteUrl: record.websiteUrl } : {}),
      ...(record.address ? { address: record.address } : {}),
      ...(record.contactPhone ? { contactPhone: record.contactPhone } : {}),
      ...(record.contactEmail ? { contactEmail: record.contactEmail } : {}),
      ...(record.priceAnchors.length > 0 ? { priceHints: record.priceAnchors } : {}),
      sourcePortalId: "first-party-refresh",
      ...(record.sourceProvenance[0] ? { sourceUrl: record.sourceProvenance[0] } : {}),
      freshnessTimestamp: run.completedAt
    };
    dedupe.set(createRecordKey(normalized), mergeRecords(dedupe.get(createRecordKey(normalized)), normalized));
  }
}

function upsertFromBrowserUseRun(
  result: BrowserUseDiscoveryResult,
  category: VendorSearchCategory,
  region: string,
  sourcePortalId: string,
  dedupe: Map<string, DiscoveryDbRecord>
) {
  const now = new Date().toISOString();

  for (const row of result.records) {
    if (!row.name && !row.websiteUrl) {
      continue;
    }

    const normalized: DiscoveryDbRecord = {
      id: randomUUID(),
      name: row.name ?? extractHostAsName(row.websiteUrl) ?? "Unbekannter Anbieter",
      category,
      region,
      ...(row.websiteUrl ? { websiteUrl: row.websiteUrl } : {}),
      ...(row.sourceUrl ? { sourceUrl: row.sourceUrl } : {}),
      ...(row.address ? { address: row.address } : {}),
      ...(row.contactPhone ? { contactPhone: row.contactPhone } : {}),
      ...(row.contactEmail ? { contactEmail: row.contactEmail } : {}),
      ...(row.openingHours && row.openingHours.length > 0 ? { openingHours: row.openingHours } : {}),
      ...(row.priceHints && row.priceHints.length > 0 ? { priceHints: row.priceHints } : {}),
      ...(typeof row.ratingValue === "number" ? { ratingValue: row.ratingValue } : {}),
      ...(typeof row.ratingCount === "number" ? { ratingCount: row.ratingCount } : {}),
      ...(typeof row.sourceQualityScore === "number"
        ? { sourceQualityScore: row.sourceQualityScore }
        : {}),
      ...(row.note ? { note: row.note } : {}),
      sourcePortalId,
      freshnessTimestamp: now
    };
    dedupe.set(createRecordKey(normalized), mergeRecords(dedupe.get(createRecordKey(normalized)), normalized));
  }
}

function mergeRecords(
  previous: DiscoveryDbRecord | undefined,
  incoming: DiscoveryDbRecord
): DiscoveryDbRecord {
  if (!previous) {
    return incoming;
  }

  return {
    ...previous,
    ...incoming,
    id: previous.id,
    name: preferredString(previous.name, incoming.name) ?? previous.name ?? incoming.name,
    category: incoming.category,
    region: incoming.region,
    websiteUrl: preferredString(previous.websiteUrl, incoming.websiteUrl),
    sourceUrl: preferredString(previous.sourceUrl, incoming.sourceUrl),
    address: preferredString(previous.address, incoming.address),
    contactPhone: preferredString(previous.contactPhone, incoming.contactPhone),
    contactEmail: preferredString(previous.contactEmail, incoming.contactEmail),
    openingHours: mergeStringArrays(previous.openingHours, incoming.openingHours),
    priceHints: mergeStringArrays(previous.priceHints, incoming.priceHints),
    ratingValue: preferredNumber(previous.ratingValue, incoming.ratingValue),
    ratingCount: preferredNumber(previous.ratingCount, incoming.ratingCount),
    sourceQualityScore: preferredNumber(previous.sourceQualityScore, incoming.sourceQualityScore),
    note: preferredString(previous.note, incoming.note),
    sourcePortalId:
      incoming.sourcePortalId || previous.sourcePortalId || "first-party-refresh",
    freshnessTimestamp:
      previous.freshnessTimestamp >= incoming.freshnessTimestamp
        ? previous.freshnessTimestamp
        : incoming.freshnessTimestamp
  };
}

function preferredString(a?: string, b?: string) {
  if (b && b.trim().length > 0) {
    return b.trim();
  }
  if (a && a.trim().length > 0) {
    return a.trim();
  }
  return undefined;
}

function preferredNumber(a?: number, b?: number) {
  if (typeof b === "number" && Number.isFinite(b)) {
    return b;
  }
  if (typeof a === "number" && Number.isFinite(a)) {
    return a;
  }
  return undefined;
}

function mergeStringArrays(a?: string[], b?: string[]) {
  const merged = new Set([...(a ?? []), ...(b ?? [])]);
  const rows = [...merged].filter(Boolean);
  return rows.length > 0 ? rows : undefined;
}

function extractHostAsName(url?: string) {
  if (!url) {
    return null;
  }
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return null;
  }
}

function createRecordKey(record: Pick<DiscoveryDbRecord, "name" | "websiteUrl" | "category" | "region">) {
  if (record.websiteUrl) {
    try {
      const parsed = new URL(record.websiteUrl);
      return `${record.category}|${record.region}|${parsed.origin.toLowerCase()}`;
    } catch {
      return `${record.category}|${record.region}|${record.websiteUrl.toLowerCase()}`;
    }
  }
  return `${record.category}|${record.region}|${record.name.toLowerCase()}`;
}

function classifyDiscoveryRecord(record: DiscoveryDbRecord): {
  accepted: boolean;
  reason?: string;
} {
  const blockedHosts = [
    "onelink.to",
    "trustlocal.de",
    "trustlocal.com",
    "trustlocal.be",
    "trustpilot.com",
    "xing.com",
    "linkedin.com",
    "facebook.com",
    "instagram.com",
    "youtube.com",
    "pinterest.com",
    "exali.de",
    "orangefluid.com",
    "location-award.de"
  ];

  const host = extractHost(record.websiteUrl ?? record.sourceUrl);
  if (host && blockedHosts.some((blocked) => host === blocked || host.endsWith(`.${blocked}`))) {
    return { accepted: false, reason: `blocked-host:${host}` };
  }

  const lowerName = (record.name ?? "").trim().toLowerCase();
  if (!lowerName || lowerName.length < 3 || lowerName.length > 90) {
    return { accepted: false, reason: "invalid-name-length" };
  }
  if (isGenericVendorName(lowerName)) {
    return { accepted: false, reason: `generic-name:${lowerName}` };
  }

  const lowValueNameTokens = [
    "kontakt",
    "impressum",
    "datenschutz",
    "privacy",
    "terms",
    "cookies",
    "so koennen sie uns erreichen",
    "so können sie uns erreichen",
    "te",
    "app",
    "business",
    "ihr web",
    "mageschneiderte versicherungen fur freelancer, selbstandige und unternehmen"
  ];
  if (lowValueNameTokens.some((token) => lowerName === token || lowerName.includes(token))) {
    if (record.contactEmail && record.contactPhone) {
      return { accepted: true };
    }
    return { accepted: false, reason: `low-value-name:${lowerName}` };
  }

  const hasEmailSignal =
    typeof record.contactEmail === "string" && isLikelyEmail(record.contactEmail);
  const hasPhoneSignal =
    typeof record.contactPhone === "string" && isLikelyPhone(record.contactPhone);
  const hasAddressSignal =
    typeof record.address === "string" && isLikelyAddress(record.address);
  const hasDirectContactSignal = hasEmailSignal || hasPhoneSignal;
  const qualityScore = record.sourceQualityScore ?? 0;
  const relevanceScore = computeWeddingRelevanceScore(record);
  const disableCategoryFit = (process.env.DISCOVERY_DISABLE_CATEGORY_FIT ?? "").toLowerCase() === "true";
  const hasCategoryFit = disableCategoryFit ? true : categoryFit(record);
  const minRelevance = Number.parseInt(
    process.env.DISCOVERY_MIN_WEDDING_RELEVANCE ?? "45",
    10
  );
  const minQuality = Number.parseInt(process.env.DISCOVERY_MIN_QUALITY_SCORE ?? "60", 10);
  if (hasStrongNonWeddingBusinessSignal(record)) {
    return {
      accepted: false,
      reason: "non-wedding-business-signal"
    };
  }

  if (
    relevanceScore < (Number.isFinite(minRelevance) ? minRelevance : 45) &&
    !isClearlyWeddingHost(record.websiteUrl ?? record.sourceUrl)
  ) {
    return {
      accepted: false,
      reason: `low-wedding-relevance:${relevanceScore}`
    };
  }

  if (!hasCategoryFit) {
    return {
      accepted: false,
      reason: "category-mismatch"
    };
  }

  if (record.address && !hasAddressSignal) {
    return {
      accepted: false,
      reason: "invalid-address-signal"
    };
  }

  if (!hasDirectContactSignal) {
    return {
      accepted: false,
      reason: "missing-direct-contact"
    };
  }

  if (qualityScore >= (Number.isFinite(minQuality) ? minQuality : 60) || hasAddressSignal) {
    return { accepted: true };
  }
  return { accepted: false, reason: "insufficient-contact-and-score" };
}

function isGenericVendorName(lowerName: string) {
  const compact = lowerName
    .replace(/[^a-z0-9\s-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!compact) return true;

  const singleToken = compact.split(" ").filter(Boolean);
  const firstToken = singleToken[0];
  if (
    typeof firstToken === "string" &&
    singleToken.length === 1 &&
    /^(hochzeit|hochzeits|wedding|vendor|anbieter|dienstleister|venue|location)$/.test(firstToken)
  ) {
    return true;
  }

  const genericFragments = [
    "urheberrechte",
    "impressum",
    "datenschutz",
    "cookie",
    "kontaktformular",
    "all rights reserved"
  ];
  return genericFragments.some((fragment) => compact.includes(fragment));
}

function isLikelyEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isLikelyPhone(value: string) {
  const normalized = value.replace(/[^\d+]/g, "");
  return normalized.length >= 7;
}

function isLikelyAddress(value: string) {
  const normalized = value.toLowerCase().trim();
  if (normalized.length < 10) return false;
  if (
    normalized.includes("urheberrecht") ||
    normalized.includes("impressum") ||
    normalized.includes("datenschutz")
  ) {
    return false;
  }
  const hasNumber = /\d/.test(normalized);
  const hasStreetWord = /(str\.|straße|strasse|platz|allee|weg|gasse|ring|ufer|chaussee)/.test(normalized);
  return hasNumber && hasStreetWord;
}

function extractHost(url?: string) {
  if (!url) {
    return "";
  }
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function isClearlyWeddingHost(url?: string) {
  const host = extractHost(url);
  if (!host) return false;
  return /(wedding|hochzeit|braut|wedd)/i.test(host);
}

function computeWeddingRelevanceScore(record: DiscoveryDbRecord) {
  const corpus = [
    record.name ?? "",
    record.websiteUrl ?? "",
    record.sourceUrl ?? "",
    record.note ?? "",
    record.address ?? ""
  ]
    .join(" ")
    .toLowerCase();

  let score = 0;

  const weddingSignals = [
    "hochzeit",
    "wedding",
    "braut",
    "trauung",
    "eventlocation",
    "hochzeitslocation",
    "hochzeitsfotograf",
    "hochzeitsplaner",
    "trauredner",
    "hochzeitsdeko",
    "hochzeitsband",
    "dj",
    "catering"
  ];
  for (const signal of weddingSignals) {
    if (corpus.includes(signal)) {
      score += 10;
    }
  }

  const categorySignals = categoryKeywords(record.category);
  for (const signal of categorySignals) {
    if (corpus.includes(signal)) {
      score += 6;
    }
  }

  const negativeSignals = [
    "versicher",
    "steuer",
    "kanzlei",
    "anwalt",
    "software",
    "hosting",
    "recruiting",
    "consulting",
    "agentur fuer startups",
    "business register",
    "register",
    "impressum"
  ];
  for (const signal of negativeSignals) {
    if (corpus.includes(signal)) {
      score -= 12;
    }
  }

  if (isClearlyWeddingHost(record.websiteUrl ?? record.sourceUrl)) {
    score += 20;
  }
  if (record.contactEmail && /(info|kontakt|booking|hello|anfrage)@/i.test(record.contactEmail)) {
    score += 4;
  }

  return Math.max(0, Math.min(100, score));
}

function categoryKeywords(category: VendorSearchCategory) {
  const map: Record<VendorSearchCategory, string[]> = {
    venue: ["location", "saal", "schloss", "villa", "hotel", "event"],
    photography: ["foto", "fotograf", "photography", "portrait"],
    catering: ["catering", "buffet", "menu", "menue", "fingerfood"],
    music: ["dj", "musik", "band", "live"],
    florals: ["flor", "blumen", "deko"],
    attire: ["brautmode", "kleid", "anzug", "fashion"],
    stationery: ["papeterie", "einladung", "karten", "print"],
    cake: ["torte", "konditor", "patisserie", "cake"],
    transport: ["shuttle", "limo", "bus", "chauffeur"],
    lodging: ["hotel", "unterkunft", "uebernachtung", "zimmer"],
    planner: ["planer", "wedding planner", "koordination"],
    officiant: ["trauredner", "freier redner", "officiant"],
    videography: ["video", "filmer", "videograf"],
    photobooth: ["fotobox", "photo booth", "mirror booth"],
    magician: ["zauber", "magier", "illusion"],
    "live-artist": ["kuenstler", "live painter", "illustrator"],
    childcare: ["kinder", "kids", "betreuung", "nanny"],
    rentals: ["verleih", "miete", "rental", "equipment"]
  };
  return map[category] ?? [];
}

function categoryFit(record: DiscoveryDbRecord) {
  const corpus = `${record.name ?? ""} ${record.websiteUrl ?? ""} ${record.sourceUrl ?? ""}`.toLowerCase();
  const keywords = categoryKeywords(record.category);
  if (keywords.length === 0) return true;

  const hasPositive = keywords.some((keyword) => corpus.includes(keyword));
  if (record.category === "venue" && /(hochzeit|wedding|eventlocation|hochzeitslocation)/.test(corpus)) {
    return true;
  }
  if (!hasPositive) return false;

  const categoryNegative: Partial<Record<VendorSearchCategory, string[]>> = {
    catering: ["trauring", "brautkleid", "anzug", "fotobox"],
    music: ["catering", "trauring", "brautkleid"],
    photography: ["catering", "trauring", "brautkleid", "dj"],
    florals: ["dj", "catering", "trauring"],
    cake: ["dj", "trauring", "brautkleid"],
    attire: ["dj", "catering", "trauring"],
    transport: ["trauring", "brautkleid", "catering"],
    planner: ["trauring", "brautkleid"],
    videography: ["catering", "trauring", "brautkleid"]
  };
  const negatives = categoryNegative[record.category] ?? [];
  return !negatives.some((token) => corpus.includes(token));
}

function hasStrongNonWeddingBusinessSignal(record: DiscoveryDbRecord) {
  const corpus = [
    record.name ?? "",
    record.websiteUrl ?? "",
    record.sourceUrl ?? "",
    record.note ?? ""
  ]
    .join(" ")
    .toLowerCase();

  const tokens = [
    "versicherung",
    "versicherungen",
    "freelancer",
    "selbständige",
    "selbstandige",
    "unternehmen",
    "startup",
    "software",
    "webdesign",
    "orangefluid",
    "exali"
  ];

  const hits = tokens.filter((token) => corpus.includes(token));
  return hits.length >= 2;
}

function normalizeModeArg(value?: string | null): PipelineMode | null {
  if (!value) {
    return null;
  }
  if (value === "weekly" || value === "weekly-baseline") {
    return "weekly-baseline";
  }
  if (value === "premium" || value === "premium-deep-scan") {
    return "premium-deep-scan";
  }
  return null;
}

function parseCategoriesEnv(value?: string) {
  if (!value) {
    return [];
  }
  const allowed = new Set(defaultCategories);
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry): entry is VendorSearchCategory => allowed.has(entry as VendorSearchCategory));
}

async function readState(): Promise<PipelineState> {
  try {
    const content = await readFile(stateFile, "utf-8");
    return JSON.parse(content) as PipelineState;
  } catch {
    return {};
  }
}

async function writeState(state: PipelineState) {
  await writeFile(stateFile, JSON.stringify(state, null, 2), "utf-8");
}

async function readDiscoveryDb(): Promise<DiscoveryDbRecord[]> {
  try {
    const content = await readFile(dbFile, "utf-8");
    const parsed = JSON.parse(content) as unknown;
    return Array.isArray(parsed) ? (parsed as DiscoveryDbRecord[]) : [];
  } catch {
    return [];
  }
}

async function writeDiscoveryDb(rows: DiscoveryDbRecord[]) {
  await writeFile(dbFile, JSON.stringify(rows, null, 2), "utf-8");
}

async function writeDiscoveryQuarantine(rows: DiscoveryQuarantineRecord[]) {
  await writeFile(quarantineFile, JSON.stringify(rows, null, 2), "utf-8");
}

async function readDiscoveryQuarantine(): Promise<DiscoveryQuarantineRecord[]> {
  try {
    const content = await readFile(quarantineFile, "utf-8");
    const parsed = JSON.parse(content) as unknown;
    return Array.isArray(parsed) ? (parsed as DiscoveryQuarantineRecord[]) : [];
  } catch {
    return [];
  }
}

function mergeQuarantineRecords(
  previous: DiscoveryQuarantineRecord[],
  currentRun: DiscoveryQuarantineRecord[]
) {
  const map = new Map<string, DiscoveryQuarantineRecord>();

  for (const record of previous) {
    map.set(createRecordKey(record), {
      ...record,
      firstSeenAt: record.firstSeenAt ?? record.quarantinedAt,
      lastSeenAt: record.lastSeenAt ?? record.quarantinedAt,
      seenCount: record.seenCount ?? 1,
      reasonHistory: [...new Set(record.reasonHistory ?? [record.quarantineReason])],
      reviewStatus: record.reviewStatus ?? "pending"
    });
  }

  for (const record of currentRun) {
    const key = createRecordKey(record);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        ...record,
        firstSeenAt: record.quarantinedAt,
        lastSeenAt: record.quarantinedAt,
        seenCount: 1,
        reasonHistory: [record.quarantineReason],
        reviewStatus: "pending"
      });
      continue;
    }

    map.set(key, {
      ...existing,
      ...record,
      id: existing.id,
      freshnessTimestamp:
        existing.freshnessTimestamp >= record.freshnessTimestamp
          ? existing.freshnessTimestamp
          : record.freshnessTimestamp,
      firstSeenAt: existing.firstSeenAt ?? existing.quarantinedAt,
      lastSeenAt: record.quarantinedAt,
      seenCount: (existing.seenCount ?? 1) + 1,
      reasonHistory: [...new Set([...(existing.reasonHistory ?? []), record.quarantineReason])],
      reviewStatus: existing.reviewStatus ?? "pending"
    });
  }

  return [...map.values()];
}

async function persistReport(report: PipelineRunReport) {
  await mkdir(outputRoot, { recursive: true });
  const filePath = path.resolve(outputRoot, `run-${report.mode}-${Date.now()}.json`);
  await writeFile(filePath, JSON.stringify(report, null, 2), "utf-8");
  return filePath;
}

export function isWeeklyRunDue(lastRunAt: string | undefined, nowIso: string) {
  if (!lastRunAt) {
    return true;
  }
  const last = new Date(lastRunAt).getTime();
  const now = new Date(nowIso).getTime();
  if (!Number.isFinite(last) || !Number.isFinite(now)) {
    return true;
  }
  return now - last >= 7 * 24 * 60 * 60 * 1000;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPipelineFromCli().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.stack ?? error.message : "Unknown pipeline error"}\n`
    );
    process.exitCode = 1;
  });
}
