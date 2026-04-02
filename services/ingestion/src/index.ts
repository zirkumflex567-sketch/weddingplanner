import { randomUUID } from "node:crypto";
import {
  buildVendorSearchStrategy,
  type VendorCoverageArea,
  type VendorSearchCategory,
  type VendorSearchStrategy
} from "@wedding/shared";

export type VendorRefreshStageId =
  | "discovery"
  | "facts"
  | "normalization"
  | "dedupe"
  | "quality"
  | "publish";

export type VendorConnectorRole =
  | "directory-discovery"
  | "business-facts"
  | "vendor-first-party"
  | "claimed-data"
  | "geocoding";

export interface VendorRefreshRequest {
  paidOrderId: string;
  region: string;
  categories: VendorSearchCategory[];
  targetDate?: string;
  guestCountTarget?: number;
  budgetTotal?: number;
  requestedBy: "customer-payment";
}

export interface VendorConnectorPlan {
  id: string;
  label: string;
  role: VendorConnectorRole;
  discoveryOnly: boolean;
  maxFreshnessHours: number;
}

export interface VendorRefreshStage {
  id: VendorRefreshStageId;
  label: string;
  status: "pending" | "ready";
}

export interface VendorPublishGate {
  requiredFields: string[];
  blockedFields: string[];
  notes: string[];
}

export interface VendorRefreshPlan {
  strategy: VendorSearchStrategy;
  connectors: VendorConnectorPlan[];
  stages: VendorRefreshStage[];
  freshnessWindowHours: number;
  publishGate: VendorPublishGate;
}

export interface VendorRefreshJob {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: "queued";
  request: VendorRefreshRequest;
  plan: VendorRefreshPlan;
}

function hasCategory(
  categories: VendorSearchCategory[],
  ...targets: VendorSearchCategory[]
) {
  return targets.some((target) => categories.includes(target));
}

function createConnectors(
  coverageAreas: VendorCoverageArea[],
  categories: VendorSearchCategory[]
): VendorConnectorPlan[] {
  const connectors: VendorConnectorPlan[] = [
    {
      id: "self-hosted-nominatim",
      label: "Self-hosted Nominatim",
      role: "geocoding",
      discoveryOnly: false,
      maxFreshnessHours: 24 * 30
    },
    {
      id: "google-places",
      label: "Google Places",
      role: "business-facts",
      discoveryOnly: false,
      maxFreshnessHours: 24 * 14
    },
    {
      id: "vendor-websites",
      label: "Vendor websites",
      role: "vendor-first-party",
      discoveryOnly: false,
      maxFreshnessHours: 24 * 7
    },
    {
      id: "claimed-profiles",
      label: "Claimed vendor profiles",
      role: "claimed-data",
      discoveryOnly: false,
      maxFreshnessHours: 24 * 2
    }
  ];

  if (
    coverageAreas.some((area) => area.kind === "nationwide") ||
    hasCategory(
      categories,
      "music",
      "magician",
      "live-artist",
      "photobooth",
      "planner",
      "officiant"
    )
  ) {
    connectors.unshift({
      id: "directory-discovery",
      label: "Directory discovery",
      role: "directory-discovery",
      discoveryOnly: true,
      maxFreshnessHours: 24 * 3
    });
  }

  return connectors;
}

export function createVendorRefreshPlan(
  request: VendorRefreshRequest
): VendorRefreshPlan {
  const strategy = buildVendorSearchStrategy(request.region, request.categories);

  return {
    strategy,
    connectors: createConnectors(strategy.coverageAreas, request.categories),
    stages: [
      { id: "discovery", label: "Discovery queue", status: "ready" },
      { id: "facts", label: "Business facts capture", status: "ready" },
      { id: "normalization", label: "Normalization", status: "ready" },
      { id: "dedupe", label: "Deduplication", status: "ready" },
      { id: "quality", label: "Quality review", status: "ready" },
      { id: "publish", label: "Publish gate", status: "ready" }
    ],
    freshnessWindowHours: 48,
    publishGate: {
      requiredFields: [
        "name",
        "category",
        "region",
        "contactOrWebsite",
        "sourceProvenance",
        "freshnessTimestamp"
      ],
      blockedFields: [
        "thirdPartyReviewScore",
        "thirdPartyReviewCount",
        "directoryRankingPosition"
      ],
      notes: [
        "Directory sources may seed discovery but not become publishable review truth.",
        "Publish only first-party facts, verified claimed data, or structured business facts with provenance."
      ]
    }
  };
}

export function createVendorRefreshJob(
  request: VendorRefreshRequest
): VendorRefreshJob {
  const timestamp = new Date().toISOString();

  return {
    id: randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    status: "queued",
    request,
    plan: createVendorRefreshPlan(request)
  };
}
