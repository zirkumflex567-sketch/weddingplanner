import type { VendorSearchCategory } from "@wedding/shared";

const googlePlacesFieldMask = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.websiteUri",
  "places.nationalPhoneNumber",
  "places.googleMapsUri",
  "places.location",
  "places.primaryType",
  "places.types"
].join(",");

const categoryQueryLabels: Record<VendorSearchCategory, string> = {
  venue: "hochzeitslocation",
  photography: "hochzeitsfotograf",
  catering: "hochzeitscatering",
  music: "hochzeits dj",
  florals: "hochzeitsfloristik",
  attire: "brautstyling",
  stationery: "hochzeitspapeterie",
  cake: "hochzeitstorte",
  transport: "hochzeit shuttle",
  lodging: "hochzeit hotel",
  planner: "hochzeitsplaner",
  officiant: "trauredner",
  videography: "hochzeitsvideo",
  photobooth: "fotobox hochzeit",
  magician: "hochzeitszauberer",
  "live-artist": "live painter hochzeit",
  childcare: "kinderbetreuung hochzeit",
  rentals: "hochzeit verleih"
};

export interface GooglePlacesTextSearchRequest {
  endpoint: string;
  method: "POST";
  fieldMask: string;
  body: {
    textQuery: string;
    languageCode: "de";
    regionCode: "DE";
    maxResultCount: number;
  };
}

export interface DirectoryDiscoveryResultInput {
  title: string;
  url: string;
  directoryName: string;
  location?: string;
  snippet?: string;
  rankingPosition?: number;
}

export interface DirectoryDiscoveryCandidate {
  source: "directory-discovery";
  name: string;
  category: VendorSearchCategory;
  region: string;
  websiteUrl?: string;
  provenanceUrl: string;
  sourceDirectory: string;
  discoveryTimestamp: string;
}

export interface GooglePlacesResultInput {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  googleMapsUri?: string;
  primaryType?: string;
  types?: string[];
  location?: {
    latitude?: number;
    longitude?: number;
  };
  rating?: number;
  userRatingCount?: number;
}

export interface GooglePlacesBusinessFact {
  source: "google-places";
  placeId: string;
  name: string;
  region: string;
  websiteUrl?: string;
  contactPhone?: string;
  address?: string;
  mapsUrl?: string;
  latitude?: number;
  longitude?: number;
  provenanceUrl: string;
  freshnessTimestamp: string;
  blockedFieldAudit: string[];
}

export interface VendorWebsitePageInput {
  url: string;
  html: string;
  fetchedAt: string;
}

export interface VendorWebsiteFact {
  source: "vendor-website";
  name: string;
  websiteUrl: string;
  contactEmail?: string;
  contactPhone?: string;
  pdfUrls: string[];
  priceAnchors: string[];
  serviceHints: string[];
  provenanceUrl: string;
  freshnessTimestamp: string;
}

export interface PublishableVendorRecord {
  name: string;
  category: VendorSearchCategory;
  region: string;
  websiteUrl?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  mapsUrl?: string;
  priceAnchors: string[];
  serviceHints: string[];
  sourceProvenance: string[];
  freshnessTimestamp: string;
  blockedFieldAudit: string[];
}

export interface VendorConnectorPreviewInput {
  category: VendorSearchCategory;
  region: string;
  requestedAt: string;
  directoryResults?: DirectoryDiscoveryResultInput[];
  googlePlacesResults?: GooglePlacesResultInput[];
  websitePages?: VendorWebsitePageInput[];
}

export interface VendorConnectorPreview {
  googlePlacesRequest: GooglePlacesTextSearchRequest;
  discoveryCandidates: DirectoryDiscoveryCandidate[];
  businessFacts: GooglePlacesBusinessFact[];
  websiteFacts: VendorWebsiteFact[];
  publishableRecords: PublishableVendorRecord[];
}

export function buildGooglePlacesTextSearchRequest(
  region: string,
  category: VendorSearchCategory
): GooglePlacesTextSearchRequest {
  return {
    endpoint: "https://places.googleapis.com/v1/places:searchText",
    method: "POST",
    fieldMask: googlePlacesFieldMask,
    body: {
      textQuery: `${categoryQueryLabels[category] ?? category} ${region}`,
      languageCode: "de",
      regionCode: "DE",
      maxResultCount: 10
    }
  };
}

export function normalizeDirectoryDiscoveryResult(
  input: DirectoryDiscoveryResultInput,
  category: VendorSearchCategory,
  region: string,
  requestedAt: string
): DirectoryDiscoveryCandidate {
  return {
    source: "directory-discovery",
    name: normalizeCandidateName(input.title),
    category,
    region,
    provenanceUrl: input.url,
    sourceDirectory: input.directoryName,
    discoveryTimestamp: requestedAt
  };
}

export function normalizeGooglePlacesBusinessFact(
  result: GooglePlacesResultInput,
  region: string,
  requestedAt: string
): GooglePlacesBusinessFact {
  return {
    source: "google-places",
    placeId: result.id,
    name: normalizeCandidateName(result.displayName?.text ?? "Unknown vendor"),
    region,
    ...(result.websiteUri ? { websiteUrl: result.websiteUri } : {}),
    ...(result.nationalPhoneNumber ? { contactPhone: result.nationalPhoneNumber } : {}),
    ...(result.formattedAddress ? { address: result.formattedAddress } : {}),
    ...(result.googleMapsUri ? { mapsUrl: result.googleMapsUri } : {}),
    ...(typeof result.location?.latitude === "number" ? { latitude: result.location.latitude } : {}),
    ...(typeof result.location?.longitude === "number" ? { longitude: result.location.longitude } : {}),
    provenanceUrl: result.googleMapsUri ?? `google-place:${result.id}`,
    freshnessTimestamp: requestedAt,
    blockedFieldAudit: [
      ...(typeof result.rating === "number" ? ["thirdPartyReviewScore"] : []),
      ...(typeof result.userRatingCount === "number" ? ["thirdPartyReviewCount"] : [])
    ]
  };
}

export function extractVendorWebsiteFacts(input: VendorWebsitePageInput): VendorWebsiteFact {
  const html = input.html;
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/is);
  const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/is);
  const nameSource = stripHtml(h1Match?.[1] ?? titleMatch?.[1] ?? input.url);
  const emailMatch = html.match(/mailto:([^"'?\s>]+)/i);
  const phoneMatch = html.match(/tel:([^"'?\s>]+)/i);
  const pdfUrls = Array.from(
    new Set(
      [...html.matchAll(/href=["']([^"']+\.pdf(?:\?[^"']*)?)["']/gi)].map((match) =>
        toAbsoluteUrl(input.url, match[1] ?? "")
      )
    )
  );
  const priceAnchors = Array.from(
    new Set(
      [...html.matchAll(/(?:pakete?\s+)?(ab\s+\d[\d.\s]*\s*EUR)/gi)].map((match) =>
        normalizeWhitespace(match[1] ?? match[0] ?? "")
      )
    )
  );
  const serviceHints = extractServiceHints(html);

  return {
    source: "vendor-website",
    name: normalizeCandidateName(nameSource),
    websiteUrl: input.url,
    ...(emailMatch?.[1] ? { contactEmail: emailMatch[1] } : {}),
    ...(phoneMatch?.[1] ? { contactPhone: phoneMatch[1] } : {}),
    pdfUrls,
    priceAnchors,
    serviceHints,
    provenanceUrl: input.url,
    freshnessTimestamp: input.fetchedAt
  };
}

export function createVendorConnectorPreview(
  input: VendorConnectorPreviewInput
): VendorConnectorPreview {
  const discoveryCandidates = (input.directoryResults ?? []).map((entry) =>
    normalizeDirectoryDiscoveryResult(entry, input.category, input.region, input.requestedAt)
  );
  const businessFacts = (input.googlePlacesResults ?? []).map((entry) =>
    normalizeGooglePlacesBusinessFact(entry, input.region, input.requestedAt)
  );
  const websiteFacts = (input.websitePages ?? []).map((entry) => extractVendorWebsiteFacts(entry));

  return {
    googlePlacesRequest: buildGooglePlacesTextSearchRequest(input.region, input.category),
    discoveryCandidates,
    businessFacts,
    websiteFacts,
    publishableRecords: mergeConnectorRecords(
      input.category,
      input.region,
      discoveryCandidates,
      businessFacts,
      websiteFacts
    )
  };
}

function mergeConnectorRecords(
  category: VendorSearchCategory,
  region: string,
  discoveryCandidates: DirectoryDiscoveryCandidate[],
  businessFacts: GooglePlacesBusinessFact[],
  websiteFacts: VendorWebsiteFact[]
): PublishableVendorRecord[] {
  const recordByKey = new Map<string, PublishableVendorRecord>();

  function ensureRecord(key: string, seed: Partial<PublishableVendorRecord>) {
    const existing = recordByKey.get(
      findExistingKey(key, seed.name ?? "", seed.websiteUrl)
    );

    if (existing) {
      return existing;
    }

    const created: PublishableVendorRecord = {
      name: seed.name ?? "Unknown vendor",
      category,
      region,
      ...(seed.websiteUrl ? { websiteUrl: seed.websiteUrl } : {}),
      ...(seed.contactEmail ? { contactEmail: seed.contactEmail } : {}),
      ...(seed.contactPhone ? { contactPhone: seed.contactPhone } : {}),
      ...(seed.address ? { address: seed.address } : {}),
      ...(seed.mapsUrl ? { mapsUrl: seed.mapsUrl } : {}),
      priceAnchors: seed.priceAnchors ?? [],
      serviceHints: seed.serviceHints ?? [],
      sourceProvenance: seed.sourceProvenance ?? [],
      freshnessTimestamp: seed.freshnessTimestamp ?? new Date().toISOString(),
      blockedFieldAudit: seed.blockedFieldAudit ?? []
    };
    recordByKey.set(key, created);
    return created;
  }

  function findExistingKey(
    candidateKey: string,
    candidateName: string,
    candidateWebsiteUrl?: string
  ) {
    if (recordByKey.has(candidateKey)) {
      return candidateKey;
    }

    const normalizedName = normalizeWhitespace(candidateName).toLowerCase();
    const candidateOrigin = extractOrigin(candidateWebsiteUrl);

    for (const [existingKey, existingRecord] of recordByKey.entries()) {
      if (
        candidateOrigin &&
        extractOrigin(existingRecord.websiteUrl) === candidateOrigin
      ) {
        return existingKey;
      }

      if (normalizeWhitespace(existingRecord.name).toLowerCase() === normalizedName) {
        return existingKey;
      }
    }

    return candidateKey;
  }

  for (const candidate of discoveryCandidates) {
    const key = createRecordKey(candidate.name, candidate.websiteUrl);
    const record = ensureRecord(key, {
      name: candidate.name,
      ...(candidate.websiteUrl ? { websiteUrl: candidate.websiteUrl } : {}),
      freshnessTimestamp: candidate.discoveryTimestamp,
      sourceProvenance: [`directory:${candidate.sourceDirectory}`]
    });
    mergeArrays(record.sourceProvenance, [`directory:${candidate.sourceDirectory}`]);
  }

  for (const fact of businessFacts) {
    const key = createRecordKey(fact.name, fact.websiteUrl);
    const record = ensureRecord(key, {
      name: fact.name,
      ...(fact.websiteUrl ? { websiteUrl: fact.websiteUrl } : {}),
      ...(fact.contactPhone ? { contactPhone: fact.contactPhone } : {}),
      ...(fact.address ? { address: fact.address } : {}),
      ...(fact.mapsUrl ? { mapsUrl: fact.mapsUrl } : {}),
      freshnessTimestamp: fact.freshnessTimestamp,
      sourceProvenance: [`google-places:${fact.placeId}`],
      blockedFieldAudit: fact.blockedFieldAudit
    });

    if (shouldReplaceRecordName(record.name, fact.name)) {
      record.name = fact.name;
    }
    if (fact.websiteUrl) {
      record.websiteUrl = fact.websiteUrl;
    }
    if (fact.contactPhone) {
      record.contactPhone = fact.contactPhone;
    }
    if (fact.address) {
      record.address = fact.address;
    }
    if (fact.mapsUrl) {
      record.mapsUrl = fact.mapsUrl;
    }
    record.freshnessTimestamp = newestTimestamp(record.freshnessTimestamp, fact.freshnessTimestamp);
    mergeArrays(record.sourceProvenance, [`google-places:${fact.placeId}`]);
    mergeArrays(record.blockedFieldAudit, fact.blockedFieldAudit);
  }

  for (const fact of websiteFacts) {
    const key = createRecordKey(fact.name, fact.websiteUrl);
    const record = ensureRecord(key, {
      name: fact.name,
      websiteUrl: fact.websiteUrl,
      ...(fact.contactEmail ? { contactEmail: fact.contactEmail } : {}),
      ...(fact.contactPhone ? { contactPhone: fact.contactPhone } : {}),
      priceAnchors: fact.priceAnchors,
      serviceHints: fact.serviceHints,
      freshnessTimestamp: fact.freshnessTimestamp,
      sourceProvenance: [`vendor-website:${fact.websiteUrl}`]
    });

    if (shouldReplaceRecordName(record.name, fact.name)) {
      record.name = fact.name;
    }
    if (!record.websiteUrl) {
      record.websiteUrl = fact.websiteUrl;
    }
    if (fact.contactEmail) {
      record.contactEmail = fact.contactEmail;
    }
    if (fact.contactPhone && !record.contactPhone) {
      record.contactPhone = fact.contactPhone;
    }
    record.freshnessTimestamp = newestTimestamp(record.freshnessTimestamp, fact.freshnessTimestamp);
    mergeArrays(record.priceAnchors, fact.priceAnchors);
    mergeArrays(record.serviceHints, fact.serviceHints);
    mergeArrays(record.sourceProvenance, [`vendor-website:${fact.websiteUrl}`]);
  }

  return [...recordByKey.values()];
}

function normalizeCandidateName(value: string) {
  return normalizeWhitespace(
    value
      .replace(/\|.*$/u, "")
      .replace(/[-–—]\s*hochzeits.*$/iu, "")
      .replace(/\bhochzeitsfotografie\b/giu, "")
      .replace(/\bhochzeitsfotograf(?:ie|in)?\b/giu, "")
      .replace(/\bhochzeitslocation\b/giu, "")
      .trim()
  );
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function stripHtml(value: string) {
  return normalizeWhitespace(value.replace(/<[^>]+>/g, " "));
}

function toAbsoluteUrl(baseUrl: string, target: string) {
  try {
    return new URL(target, baseUrl).toString();
  } catch {
    return target;
  }
}

function createRecordKey(name: string, websiteUrl?: string) {
  if (websiteUrl) {
    try {
      return new URL(websiteUrl).origin.toLowerCase();
    } catch {
      return websiteUrl.toLowerCase();
    }
  }

  return normalizeWhitespace(name).toLowerCase();
}

function newestTimestamp(current: string, candidate: string) {
  return current >= candidate ? current : candidate;
}

function extractOrigin(url?: string) {
  if (!url) {
    return null;
  }

  try {
    return new URL(url).origin.toLowerCase();
  } catch {
    return null;
  }
}

function shouldReplaceRecordName(currentName: string, incomingName: string) {
  const normalizedCurrent = normalizeWhitespace(currentName).toLowerCase();
  const normalizedIncoming = normalizeWhitespace(incomingName).toLowerCase();

  if (!normalizedCurrent) {
    return true;
  }

  if (isGenericWebsitePageName(normalizedIncoming) && !isGenericWebsitePageName(normalizedCurrent)) {
    return false;
  }

  if (normalizedCurrent === normalizedIncoming) {
    return false;
  }

  return normalizedIncoming.length >= normalizedCurrent.length;
}

function isGenericWebsitePageName(value: string) {
  return ["preise", "kontakt", "home", "startseite", "leistungen", "portfolio"].includes(
    value
  );
}

function mergeArrays(target: string[], additions: string[]) {
  for (const item of additions) {
    if (!target.includes(item)) {
      target.push(item);
    }
  }
}

function extractServiceHints(html: string) {
  const lower = html.toLowerCase();
  const serviceHints = new Set<string>();
  const patterns = [
    "hochzeitsreportagen",
    "paarshootings",
    "after wedding",
    "ganztagsreportagen",
    "freie trauung",
    "dj",
    "moderation",
    "floristik",
    "buffet",
    "brautstyling"
  ];

  for (const pattern of patterns) {
    if (lower.includes(pattern)) {
      serviceHints.add(pattern);
    }
  }

  return [...serviceHints];
}
