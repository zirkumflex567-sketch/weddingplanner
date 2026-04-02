import { randomUUID } from "node:crypto";
import {
  buildGooglePlacesTextSearchRequest,
  createVendorConnectorPreview,
  type DirectoryDiscoveryResultInput,
  type GooglePlacesResultInput,
  type VendorConnectorPreview,
  type VendorWebsitePageInput
} from "./connectors";
import type {
  VendorRefreshJob,
  VendorPublishGate
} from "./index";
import type { VendorSearchCategory } from "@wedding/shared";

type FetchLike = typeof fetch;

const defaultBraveSearchEndpoint = "https://api.search.brave.com/res/v1/web/search";
const relevantWebsitePathPattern =
  /(hochzeit|wedding|preise|pakete|leistungen|portfolio|kontakt|faq|about|ueber-uns)/i;

export interface VendorRefreshExecutorOptions {
  env?: Record<string, string | undefined>;
  fetch?: FetchLike;
}

export interface VendorRefreshExecutionInput {
  job: VendorRefreshJob;
  category: VendorSearchCategory;
}

export interface VendorConnectorRunResult {
  connectorId: string;
  status: "success" | "skipped" | "failed";
  executedAt: string;
  itemCount: number;
  note?: string;
}

export interface VendorRefreshQualityIssue {
  severity: "warning" | "error";
  code:
    | "blocked-fields-audited"
    | "missing-required-field"
    | "no-publishable-records";
  message: string;
  recordName?: string;
}

export interface VendorRefreshQualityReport {
  status: "ready-for-review" | "needs-attention";
  publishableRecordCount: number;
  issues: VendorRefreshQualityIssue[];
}

export interface VendorRefreshRun {
  id: string;
  jobId: string;
  category: VendorSearchCategory;
  createdAt: string;
  completedAt: string;
  status: "completed" | "completed-with-gaps" | "failed";
  connectorResults: VendorConnectorRunResult[];
  preview: VendorConnectorPreview;
  quality: VendorRefreshQualityReport;
}

export interface VendorRefreshExecutor {
  executeJobRun(input: VendorRefreshExecutionInput): Promise<VendorRefreshRun>;
}

export function createVendorRefreshExecutor(
  options: VendorRefreshExecutorOptions = {}
): VendorRefreshExecutor {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetch ?? fetch;

  return {
    async executeJobRun(input) {
      const createdAt = new Date().toISOString();
      const connectorResults: VendorConnectorRunResult[] = [];

      try {
        const connectorIds = new Set(input.job.plan.connectors.map((connector) => connector.id));
        let directoryResults: DirectoryDiscoveryResultInput[] = [];
        let googlePlacesResults: GooglePlacesResultInput[] = [];
        let websitePages: VendorWebsitePageInput[] = [];

        if (connectorIds.has("directory-discovery")) {
          const directoryResult = await runDirectoryDiscoveryConnector({
            region: input.job.request.region,
            category: input.category,
            env,
            fetchImpl
          });
          connectorResults.push(directoryResult.result);
          directoryResults = directoryResult.entries;
        }

        if (connectorIds.has("google-places")) {
          const placesResult = await runGooglePlacesConnector({
            region: input.job.request.region,
            category: input.category,
            env,
            fetchImpl
          });
          connectorResults.push(placesResult.result);
          googlePlacesResults = placesResult.entries;
        }

        if (connectorIds.has("vendor-websites")) {
          const websiteResult = await runVendorWebsiteConnector({
            region: input.job.request.region,
            category: input.category,
            env,
            fetchImpl,
            directoryResults,
            googlePlacesResults
          });
          connectorResults.push(websiteResult.result);
          websitePages = websiteResult.entries;
        }

        const completedAt = new Date().toISOString();
        const preview = createVendorConnectorPreview({
          category: input.category,
          region: input.job.request.region,
          requestedAt: completedAt,
          ...(directoryResults.length > 0 ? { directoryResults } : {}),
          ...(googlePlacesResults.length > 0 ? { googlePlacesResults } : {}),
          ...(websitePages.length > 0 ? { websitePages } : {})
        });
        const quality = evaluateQuality(preview, input.job.plan.publishGate);
        const hasFailure = connectorResults.some(
          (result) => result.status === "failed" || result.status === "skipped"
        );

        return {
          id: randomUUID(),
          jobId: input.job.id,
          category: input.category,
          createdAt,
          completedAt,
          status:
            hasFailure || quality.status === "needs-attention"
              ? "completed-with-gaps"
              : "completed",
          connectorResults,
          preview,
          quality
        };
      } catch (error) {
        const completedAt = new Date().toISOString();
        return {
          id: randomUUID(),
          jobId: input.job.id,
          category: input.category,
          createdAt,
          completedAt,
          status: "failed",
          connectorResults: [
            {
              connectorId: "pipeline",
              status: "failed",
              executedAt: completedAt,
              itemCount: 0,
              note: error instanceof Error ? error.message : "Unknown pipeline error"
            }
          ],
          preview: createVendorConnectorPreview({
            category: input.category,
            region: input.job.request.region,
            requestedAt: completedAt
          }),
          quality: {
            status: "needs-attention",
            publishableRecordCount: 0,
            issues: [
              {
                severity: "error",
                code: "no-publishable-records",
                message: "The connector pipeline failed before publishable records were produced."
              }
            ]
          }
        };
      }
    }
  };
}

async function runDirectoryDiscoveryConnector(input: {
  region: string;
  category: VendorSearchCategory;
  env: Record<string, string | undefined>;
  fetchImpl: FetchLike;
}) {
  const executedAt = new Date().toISOString();
  const apiKey = input.env.BRAVE_SEARCH_API_KEY;

  if (!apiKey) {
    return {
      entries: [] as DirectoryDiscoveryResultInput[],
      result: {
        connectorId: "directory-discovery",
        status: "skipped" as const,
        executedAt,
        itemCount: 0,
        note: "BRAVE_SEARCH_API_KEY is not configured."
      }
    };
  }

  try {
    const request = buildGooglePlacesTextSearchRequest(input.region, input.category);
    const endpoint =
      input.env.BRAVE_SEARCH_API_BASE_URL ?? defaultBraveSearchEndpoint;
    const url = new URL(endpoint);
    url.searchParams.set("q", request.body.textQuery);
    url.searchParams.set("country", "DE");
    url.searchParams.set("search_lang", "de");
    url.searchParams.set("count", "10");
    url.searchParams.set("safesearch", "moderate");
    url.searchParams.set("extra_snippets", "true");

    const response = await input.fetchImpl(url, {
      headers: {
        "Accept": "application/json",
        "X-Subscription-Token": apiKey
      }
    });

    if (!response.ok) {
      throw new Error(`Brave Search returned ${response.status}`);
    }

    const payload = (await response.json()) as {
      web?: {
        results?: Array<{
          title?: string;
          url?: string;
          description?: string;
        }>;
      };
    };

    const entries = (payload.web?.results ?? [])
      .filter((entry) => typeof entry.title === "string" && typeof entry.url === "string")
      .map((entry, index) => ({
        title: entry.title as string,
        url: entry.url as string,
        directoryName: "Brave Search",
        ...(entry.description ? { snippet: entry.description } : {}),
        rankingPosition: index + 1
      }));

    return {
      entries,
      result: {
        connectorId: "directory-discovery",
        status: "success" as const,
        executedAt,
        itemCount: entries.length
      }
    };
  } catch (error) {
    return {
      entries: [] as DirectoryDiscoveryResultInput[],
      result: {
        connectorId: "directory-discovery",
        status: "failed" as const,
        executedAt,
        itemCount: 0,
        note: error instanceof Error ? error.message : "Directory discovery failed."
      }
    };
  }
}

async function runGooglePlacesConnector(input: {
  region: string;
  category: VendorSearchCategory;
  env: Record<string, string | undefined>;
  fetchImpl: FetchLike;
}) {
  const executedAt = new Date().toISOString();
  const apiKey = input.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return {
      entries: [] as GooglePlacesResultInput[],
      result: {
        connectorId: "google-places",
        status: "skipped" as const,
        executedAt,
        itemCount: 0,
        note: "GOOGLE_MAPS_API_KEY is not configured."
      }
    };
  }

  try {
    const request = buildGooglePlacesTextSearchRequest(input.region, input.category);
    const endpoint = input.env.GOOGLE_PLACES_API_BASE_URL ?? request.endpoint;
    const response = await input.fetchImpl(endpoint, {
      method: request.method,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": request.fieldMask
      },
      body: JSON.stringify(request.body)
    });

    if (!response.ok) {
      throw new Error(`Google Places returned ${response.status}`);
    }

    const payload = (await response.json()) as { places?: GooglePlacesResultInput[] };
    const entries = payload.places ?? [];

    return {
      entries,
      result: {
        connectorId: "google-places",
        status: "success" as const,
        executedAt,
        itemCount: entries.length
      }
    };
  } catch (error) {
    return {
      entries: [] as GooglePlacesResultInput[],
      result: {
        connectorId: "google-places",
        status: "failed" as const,
        executedAt,
        itemCount: 0,
        note: error instanceof Error ? error.message : "Google Places lookup failed."
      }
    };
  }
}

async function runVendorWebsiteConnector(input: {
  region: string;
  category: VendorSearchCategory;
  env: Record<string, string | undefined>;
  fetchImpl: FetchLike;
  directoryResults: DirectoryDiscoveryResultInput[];
  googlePlacesResults: GooglePlacesResultInput[];
}) {
  const executedAt = new Date().toISOString();
  const websiteUrls = collectWebsiteUrls(input.directoryResults, input.googlePlacesResults);

  if (websiteUrls.length === 0) {
    return {
      entries: [] as VendorWebsitePageInput[],
      result: {
        connectorId: "vendor-websites",
        status: "skipped" as const,
        executedAt,
        itemCount: 0,
        note: "No vendor website URLs were available for crawling."
      }
    };
  }

  try {
    const entries = await crawlVendorWebsitePages(websiteUrls, input.fetchImpl);

    return {
      entries,
      result: {
        connectorId: "vendor-websites",
        status: "success" as const,
        executedAt,
        itemCount: entries.length
      }
    };
  } catch (error) {
    return {
      entries: [] as VendorWebsitePageInput[],
      result: {
        connectorId: "vendor-websites",
        status: "failed" as const,
        executedAt,
        itemCount: 0,
        note: error instanceof Error ? error.message : "Vendor website crawling failed."
      }
    };
  }
}

function collectWebsiteUrls(
  directoryResults: DirectoryDiscoveryResultInput[],
  googlePlacesResults: GooglePlacesResultInput[]
) {
  const urls = new Set<string>();

  for (const entry of googlePlacesResults) {
    if (entry.websiteUri) {
      urls.add(entry.websiteUri);
    }
  }

  for (const entry of directoryResults) {
    if (looksLikeVendorWebsite(entry.url)) {
      urls.add(entry.url);
    }
  }

  return [...urls];
}

async function crawlVendorWebsitePages(urls: string[], fetchImpl: FetchLike) {
  const pageMap = new Map<string, VendorWebsitePageInput>();

  for (const url of urls) {
    const pages = await crawlSingleVendorWebsite(url, fetchImpl);
    for (const page of pages) {
      if (!pageMap.has(page.url)) {
        pageMap.set(page.url, page);
      }
    }
  }

  return [...pageMap.values()];
}

async function crawlSingleVendorWebsite(url: string, fetchImpl: FetchLike) {
  const rootPage = await fetchHtmlPage(url, fetchImpl);

  if (!rootPage) {
    return [];
  }

  const pages = [rootPage];
  const candidateUrls = extractRelevantInternalLinks(rootPage.url, rootPage.html)
    .slice(0, 2)
    .filter((candidateUrl) => candidateUrl !== rootPage.url);

  for (const candidateUrl of candidateUrls) {
    const page = await fetchHtmlPage(candidateUrl, fetchImpl);
    if (page) {
      pages.push(page);
    }
  }

  return pages;
}

async function fetchHtmlPage(url: string, fetchImpl: FetchLike) {
  try {
    const response = await fetchImpl(url, {
      headers: {
        "Accept": "text/html,application/xhtml+xml",
        "User-Agent": "WeddingPlannerBot/1.0 (+https://h-town.duckdns.org/wedding/)"
      }
    });

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      return null;
    }

    return {
      url,
      html: await response.text(),
      fetchedAt: new Date().toISOString()
    } satisfies VendorWebsitePageInput;
  } catch {
    return null;
  }
}

function extractRelevantInternalLinks(baseUrl: string, html: string) {
  const links = Array.from(
    new Set(
      [...html.matchAll(/href=["']([^"'#]+)["']/gi)]
        .map((match) => match[1] ?? "")
        .filter(Boolean)
        .map((target) => {
          try {
            return new URL(target, baseUrl).toString();
          } catch {
            return null;
          }
        })
        .filter((target): target is string => Boolean(target))
        .filter((target) => {
          try {
            return new URL(target).origin === new URL(baseUrl).origin;
          } catch {
            return false;
          }
        })
        .filter((target) => relevantWebsitePathPattern.test(target))
    )
  );

  return links;
}

function looksLikeVendorWebsite(url: string) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return !hostname.includes("instagram.com") && !hostname.includes("facebook.com");
  } catch {
    return false;
  }
}

function evaluateQuality(
  preview: VendorConnectorPreview,
  publishGate: VendorPublishGate
): VendorRefreshQualityReport {
  const issues: VendorRefreshQualityIssue[] = [];

  if (preview.publishableRecords.length === 0) {
    issues.push({
      severity: "error",
      code: "no-publishable-records",
      message: "The run did not produce any publishable vendor records."
    });
  }

  for (const record of preview.publishableRecords) {
    const missingFields = collectMissingRequiredFields(record, publishGate.requiredFields);
    for (const missingField of missingFields) {
      issues.push({
        severity: "error",
        code: "missing-required-field",
        message: `Required publish field is missing: ${missingField}.`,
        recordName: record.name
      });
    }
  }

  const blockedFieldHits = new Set(
    preview.publishableRecords.flatMap((record) => record.blockedFieldAudit)
  );

  if (blockedFieldHits.size > 0) {
    issues.push({
      severity: "warning",
      code: "blocked-fields-audited",
      message: `Blocked source fields were audited and not published: ${[...blockedFieldHits].join(", ")}.`
    });
  }

  return {
    status: issues.some((issue) => issue.severity === "error")
      ? "needs-attention"
      : "ready-for-review",
    publishableRecordCount: preview.publishableRecords.length,
    issues
  };
}

function collectMissingRequiredFields(
  record: VendorConnectorPreview["publishableRecords"][number],
  requiredFields: string[]
) {
  const missingFields: string[] = [];

  for (const field of requiredFields) {
    if (field === "contactOrWebsite") {
      const hasContactOrWebsite = Boolean(
        record.websiteUrl || record.contactEmail || record.contactPhone
      );
      if (!hasContactOrWebsite) {
        missingFields.push(field);
      }
      continue;
    }

    if (field === "sourceProvenance") {
      if (record.sourceProvenance.length === 0) {
        missingFields.push(field);
      }
      continue;
    }

    if (field === "freshnessTimestamp") {
      if (!record.freshnessTimestamp) {
        missingFields.push(field);
      }
      continue;
    }

    if (!record[field as keyof typeof record]) {
      missingFields.push(field);
    }
  }

  return missingFields;
}
