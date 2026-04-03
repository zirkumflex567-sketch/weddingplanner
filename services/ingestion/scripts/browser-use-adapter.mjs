#!/usr/bin/env node

/**
 * Browser-use pipeline adapter.
 *
 * Input: one JSON arg with task payload
 * Output: JSON array of normalized records
 *
 * Strategy:
 * 1. Search portal-specific listing pages
 * 2. Parse listing page + JSON-LD
 * 3. Follow likely external vendor links
 * 4. Return normalized contact facts
 */

const taskRaw = process.argv[2] ?? "{}";
let task;
try {
  task = JSON.parse(taskRaw);
} catch {
  process.stdout.write("[]");
  process.exit(0);
}

const portalUrl = asString(task.portalUrl);
const region = asString(task.region) || "Deutschland";
const category = asString(task.category) || "venue";
const mode = asString(task.mode) || "free-baseline";
const maxResults =
  mode === "premium-deep-scan"
    ? Number.parseInt(process.env.BROWSER_USE_ADAPTER_MAX_RESULTS_PREMIUM ?? "20", 10)
    : Number.parseInt(process.env.BROWSER_USE_ADAPTER_MAX_RESULTS_FREE ?? "10", 10);
const timeoutMs = Number.parseInt(process.env.BROWSER_USE_ADAPTER_TIMEOUT_MS ?? "18000", 10);
const minQualityScore = Number.parseInt(process.env.BROWSER_USE_ADAPTER_MIN_QUALITY_SCORE ?? "55", 10);

if (!portalUrl) {
  process.stdout.write("[]");
  process.exit(0);
}

const categoryLabel = categoryToQueryLabel(category);
const portalHost = safeHost(portalUrl);
const searchQuery = `site:${portalHost} ${categoryLabel} ${region}`;

const result = await discoverPortalRecords({
  searchQuery,
  portalUrl,
  portalHost,
  region,
  maxResults: Number.isFinite(maxResults) && maxResults > 0 ? maxResults : 10,
  timeoutMs
});

process.stdout.write(JSON.stringify(result));

async function discoverPortalRecords(input) {
  const searchCandidates = await searchDuckDuckGo(input.searchQuery, input.maxResults, input.timeoutMs);
  const portalFallback = buildPortalFallbackCandidates(input.portalUrl);
  const queue = [...searchCandidates, ...portalFallback];

  const seenUrls = new Set();
  const records = [];

  for (const candidate of queue) {
    if (!candidate.url || seenUrls.has(candidate.url)) {
      continue;
    }
    seenUrls.add(candidate.url);

    const pageHtml = await fetchHtml(candidate.url, input.timeoutMs);
    if (!pageHtml) {
      continue;
    }

    const pageRecord = extractRecordFromHtml({
      url: candidate.url,
      title: candidate.title,
      html: pageHtml,
      region: input.region
    });
    if (isUsefulRecord(pageRecord, input.portalHost, input.category, minQualityScore)) {
      records.push(pageRecord);
    }

    for (const structured of extractSchemaOrgRecords(candidate.url, pageHtml)) {
      if (isUsefulRecord(structured, input.portalHost, input.category, minQualityScore)) {
        records.push(structured);
      }
    }

    const outbound = extractLikelyVendorLinks(candidate.url, pageHtml, input.portalHost);
    for (const link of outbound.slice(0, 4)) {
      if (seenUrls.has(link)) {
        continue;
      }
      seenUrls.add(link);

      const vendorHtml = await fetchHtml(link, input.timeoutMs);
      if (!vendorHtml) {
        continue;
      }

      const vendorRecord = extractRecordFromHtml({
        url: link,
        title: "",
        html: vendorHtml,
        region: input.region
      });
      if (isUsefulRecord(vendorRecord, input.portalHost, input.category, minQualityScore)) {
        records.push(vendorRecord);
      }

      for (const structured of extractSchemaOrgRecords(link, vendorHtml)) {
        if (isUsefulRecord(structured, input.portalHost, input.category, minQualityScore)) {
          records.push(structured);
        }
      }

      if (records.length >= input.maxResults * 4) {
        break;
      }
    }

    if (records.length >= input.maxResults * 4) {
      break;
    }
  }

  return dedupeRecords(records).slice(0, input.maxResults);
}

async function searchDuckDuckGo(query, maxResults, timeoutMs) {
  const url = new URL("https://duckduckgo.com/html/");
  url.searchParams.set("q", query);
  const html = await fetchHtml(url.toString(), timeoutMs);
  if (!html) {
    return [];
  }

  const candidates = [];
  const linkRegex = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gims;
  for (const match of html.matchAll(linkRegex)) {
    const rawHref = decodeHtmlEntities(match[1] ?? "");
    const title = stripTags(decodeHtmlEntities(match[2] ?? ""));
    const resolved = resolveSearchHref(rawHref);
    if (!resolved) {
      continue;
    }
    candidates.push({ url: resolved, title });
    if (candidates.length >= maxResults * 3) {
      break;
    }
  }
  return candidates;
}

async function fetchHtml(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari",
        accept: "text/html,application/xhtml+xml"
      },
      signal: controller.signal
    });
    if (!response.ok) {
      return null;
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      return null;
    }
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function buildPortalFallbackCandidates(portalUrl) {
  const suffixes = ["", "/kontakt", "/impressum", "/about", "/ueber-uns", "/vendor", "/dienstleister"];
  const out = [];
  for (const suffix of suffixes) {
    const target = safeJoinUrl(portalUrl, suffix);
    if (target) {
      out.push({ url: target, title: "" });
    }
  }
  return out;
}

function extractRecordFromHtml(input) {
  const html = input.html;
  const title = firstMatch(html, /<title[^>]*>(.*?)<\/title>/is);
  const h1 = firstMatch(html, /<h1[^>]*>(.*?)<\/h1>/is);
  const email = sanitizeEmail(firstMatch(html, /mailto:([^"'?\s>]+)/i));
  const phone = normalizePhone(firstMatch(html, /tel:([^"'?\s>]+)/i));
  const openingHours = extractOpeningHours(html);
  const priceHints = findPriceHints(html);
  const ratingSignal = findRatingSignal(html);
  const address = findAddressSnippet(html, input.region);
  const websiteUrl = safeOrigin(input.url);
  const name = cleanName(h1 || title || input.title || hostToName(input.url));
  const quality = scoreRecordQuality({
    name,
    websiteUrl,
    sourceUrl: input.url,
    address,
    contactPhone: phone,
    contactEmail: email,
    openingHours,
    priceHints,
    ratingValue: ratingSignal.value,
    ratingCount: ratingSignal.count
  });

  return {
    ...(name ? { name } : {}),
    ...(websiteUrl ? { websiteUrl } : {}),
    sourceUrl: input.url,
    ...(address ? { address } : {}),
    ...(phone ? { contactPhone: phone } : {}),
    ...(email ? { contactEmail: email } : {}),
    ...(openingHours.length > 0 ? { openingHours } : {}),
    ...(priceHints.length > 0 ? { priceHints } : {})
    ,
    ...(typeof ratingSignal.value === "number" ? { ratingValue: ratingSignal.value } : {}),
    ...(typeof ratingSignal.count === "number" ? { ratingCount: ratingSignal.count } : {}),
    sourceQualityScore: quality
  };
}

function extractSchemaOrgRecords(sourceUrl, html) {
  const rows = [];
  const scripts = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const match of scripts) {
    const raw = (match[1] ?? "").trim();
    if (!raw) {
      continue;
    }

    const parsed = safeJsonParse(raw);
    if (!parsed) {
      continue;
    }

    const nodes = flattenJsonLd(parsed);
    for (const node of nodes) {
      if (!node || typeof node !== "object") {
        continue;
      }
      const typeValue = normalizeWhitespace(asString(node["@type"]));
      if (
        !/(LocalBusiness|Organization|LodgingBusiness|EventVenue|EntertainmentBusiness|FoodEstablishment)/i.test(
          typeValue
        )
      ) {
        continue;
      }

      const addressText =
        typeof node.address === "string"
          ? normalizeWhitespace(node.address)
          : node.address && typeof node.address === "object"
            ? normalizeWhitespace(
                [
                  asString(node.address.streetAddress),
                  asString(node.address.postalCode),
                  asString(node.address.addressLocality)
                ]
                  .filter(Boolean)
                  .join(" ")
              )
            : "";

      const openingHours = normalizeOpeningHours(node.openingHoursSpecification ?? node.openingHours);
      const email = sanitizeEmail(firstIn(asStringArray(node.email)));
      const phone = normalizePhone(firstIn(asStringArray(node.telephone)));
      const priceRange = asString(node.priceRange);
      const websiteUrl = asString(node.url) || safeOrigin(sourceUrl) || "";
      const name = cleanName(asString(node.name) || hostToName(websiteUrl || sourceUrl));
      const ratingValue = asFiniteNumber(node.aggregateRating?.ratingValue);
      const ratingCount = asFiniteNumber(node.aggregateRating?.ratingCount ?? node.aggregateRating?.reviewCount);
      const quality = scoreRecordQuality({
        name,
        websiteUrl,
        sourceUrl,
        address: addressText,
        contactPhone: phone,
        contactEmail: email,
        openingHours,
        priceHints: priceRange ? [priceRange] : [],
        ratingValue,
        ratingCount
      });

      rows.push({
        ...(name ? { name } : {}),
        ...(websiteUrl ? { websiteUrl } : {}),
        sourceUrl,
        ...(addressText ? { address: addressText } : {}),
        ...(email ? { contactEmail: email } : {}),
        ...(phone ? { contactPhone: phone } : {}),
        ...(openingHours.length > 0 ? { openingHours } : {}),
        ...(priceRange ? { priceHints: [priceRange] } : {}),
        ...(typeof ratingValue === "number" ? { ratingValue } : {}),
        ...(typeof ratingCount === "number" ? { ratingCount } : {}),
        sourceQualityScore: quality
      });
    }
  }
  return rows;
}

function extractLikelyVendorLinks(baseUrl, html, portalHost) {
  const out = new Set();
  const links = [...html.matchAll(/<a[^>]*href=["']([^"']+)["'][^>]*>/gi)];
  for (const link of links) {
    const href = decodeHtmlEntities(link[1] ?? "");
    if (!href) {
      continue;
    }
    try {
      const absolute = new URL(href, baseUrl).toString();
      const host = safeHost(absolute);
      if (!host || host === portalHost) {
        continue;
      }
      if (isBlockedHost(host)) {
        continue;
      }
      if (
        host.includes("facebook.com") ||
        host.includes("instagram.com") ||
        host.includes("youtube.com") ||
        host.includes("linkedin.com")
      ) {
        continue;
      }
      out.add(absolute);
    } catch {
      // ignore invalid links
    }
  }
  return [...out];
}

function findAddressSnippet(html, region) {
  const plain = normalizeWhitespace(stripTags(html));
  const regionToken = normalizeWhitespace(region).split(" ")[0]?.toLowerCase();
  const regex = /([A-ZÄÖÜ][a-zäöüßA-ZÄÖÜ\-. ]{2,}\s\d{1,4}[a-zA-Z]?,?\s\d{5}\s[A-ZÄÖÜ][a-zäöüßA-ZÄÖÜ\-. ]{2,})/g;
  for (const match of plain.matchAll(regex)) {
    const value = normalizeWhitespace(match[1] ?? "");
    if (!value) {
      continue;
    }
    if (!regionToken || value.toLowerCase().includes(regionToken)) {
      return value;
    }
  }
  return "";
}

function findPriceHints(html) {
  const plain = normalizeWhitespace(stripTags(html));
  const hints = new Set();
  const regexes = [
    /\bab\s+\d[\d.\s]{1,12}\s?(?:€|eur)\b/gi,
    /\b\d[\d.\s]{1,12}\s?(?:€|eur)\s*(?:pro\s*person|p\.?\s*p\.?)\b/gi,
    /\bpauschal(?:e|paket)?\s+\d[\d.\s]{1,12}\s?(?:€|eur)\b/gi
  ];
  for (const regex of regexes) {
    for (const match of plain.matchAll(regex)) {
      const value = normalizeWhitespace(match[0] ?? "");
      if (value) {
        hints.add(value);
      }
      if (hints.size >= 6) {
        return [...hints];
      }
    }
  }
  return [...hints];
}

function extractOpeningHours(html) {
  const plain = normalizeWhitespace(stripTags(html));
  const rows = [];
  const pattern =
    /(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|mo\.?|di\.?|mi\.?|do\.?|fr\.?|sa\.?|so\.?)\s*[:\-]?\s*(\d{1,2}[:.]\d{2}\s*[-–]\s*\d{1,2}[:.]\d{2})/gi;
  for (const match of plain.matchAll(pattern)) {
    const value = normalizeWhitespace(`${match[1] ?? ""} ${match[2] ?? ""}`);
    if (value) {
      rows.push(value);
    }
    if (rows.length >= 7) {
      break;
    }
  }
  return rows;
}

function dedupeRecords(records) {
  const map = new Map();
  for (const row of records) {
    const key = normalizeWhitespace(
      [row.websiteUrl || "", row.sourceUrl || "", row.name || ""].filter(Boolean).join("|")
    ).toLowerCase();
    if (!key) {
      continue;
    }
    const prev = map.get(key);
    if (!prev) {
      map.set(key, row);
      continue;
    }
      map.set(key, {
        ...prev,
        ...row,
        openingHours: mergeArrays(prev.openingHours, row.openingHours),
        priceHints: mergeArrays(prev.priceHints, row.priceHints),
        ratingValue: preferNumber(prev.ratingValue, row.ratingValue),
        ratingCount: preferNumber(prev.ratingCount, row.ratingCount),
        sourceQualityScore: Math.max(prev.sourceQualityScore ?? 0, row.sourceQualityScore ?? 0)
      });
  }
  return [...map.values()];
}

function resolveSearchHref(rawHref) {
  if (!rawHref) {
    return null;
  }
  try {
    if (rawHref.startsWith("/l/?")) {
      const url = new URL(`https://duckduckgo.com${rawHref}`);
      const target = url.searchParams.get("uddg");
      return target ? decodeURIComponent(target) : null;
    }
    if (rawHref.startsWith("http://") || rawHref.startsWith("https://")) {
      return rawHref;
    }
    return null;
  } catch {
    return null;
  }
}

function normalizeOpeningHours(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeWhitespace(asString(entry))).filter(Boolean);
  }
  if (value && typeof value === "object") {
    const day = asString(value.dayOfWeek);
    const opens = asString(value.opens);
    const closes = asString(value.closes);
    const line = normalizeWhitespace(`${day} ${opens}-${closes}`.trim());
    return line ? [line] : [];
  }
  const line = normalizeWhitespace(asString(value));
  return line ? [line] : [];
}

function flattenJsonLd(value) {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => flattenJsonLd(entry));
  }
  if (value && typeof value === "object") {
    if (Array.isArray(value["@graph"])) {
      return value["@graph"].flatMap((entry) => flattenJsonLd(entry));
    }
    return [value];
  }
  return [];
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function safeOrigin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

function safeHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function safeJoinUrl(base, suffix) {
  try {
    return new URL(suffix, base).toString();
  } catch {
    return "";
  }
}

function cleanName(value) {
  const normalized = normalizeWhitespace(
    value
      .replace(/\|.*$/u, "")
      .replace(/[-–—].*$/u, "")
      .replace(/\b(hotel|hochzeit|event|deutschland|homepage)\b/gi, "")
      .trim()
  );
  return normalized
    .replace(/^[^a-zA-Z0-9ÄÖÜäöüß]+/u, "")
    .replace(/[^a-zA-Z0-9ÄÖÜäöüß]+$/u, "")
    .trim();
}

function hostToName(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./i, "");
    return host.split(".")[0] ?? host;
  } catch {
    return "";
  }
}

function hasMeaningfulData(row) {
  return Boolean(row.name || row.websiteUrl || row.contactEmail || row.contactPhone || row.address);
}

function isUsefulRecord(row, portalHost, category, minScore) {
  if (!hasMeaningfulData(row)) {
    return false;
  }

  const name = normalizeWhitespace(asString(row.name));
  if (!name) {
    return Boolean(row.contactEmail || row.contactPhone || row.address);
  }

  if (name.length < 2 || name.length > 90) {
    return false;
  }

  if (/[{}()[\]=<>]/.test(name)) {
    return false;
  }

  const lower = name.toLowerCase();
  const blocked = [
    "impressum",
    "kontakt",
    "dashboard",
    "site relocation",
    "entscheidungen zu treffen",
    "locaties en bedrijfsuitjes",
    "anbieterkennzeichnung",
    "digitale loesungen",
    "share on whatsapp",
    "trouwen is keuzes",
    "javascript",
    "const ",
    "function ",
    "window.",
    "document."
  ];
  if (blocked.some((token) => lower.includes(token))) {
    return false;
  }

  const sourceHost = safeHost(row.sourceUrl || row.websiteUrl || "");
  if (!sourceHost || isBlockedHost(sourceHost)) {
    return false;
  }
  if (sourceHost === portalHost && !hasDirectContact(row)) {
    return false;
  }

  const usefulSignals = [
    row.contactEmail,
    row.contactPhone,
    row.address,
    row.priceHints && row.priceHints.length > 0 ? "price" : "",
    row.openingHours && row.openingHours.length > 0 ? "hours" : ""
  ].filter(Boolean);

  if (usefulSignals.length === 0) {
    return false;
  }

  if (name.split(" ").length > 7 && usefulSignals.length < 2) {
    return false;
  }

  const qualityScore = scoreRecordQuality(row, category);
  if (qualityScore < minScore) {
    return false;
  }
  row.sourceQualityScore = qualityScore;

  return true;
}

function hasDirectContact(row) {
  return Boolean(row.contactEmail || row.contactPhone || row.address);
}

function isBlockedHost(host) {
  const blockedHosts = [
    "onelink.to",
    "bit.ly",
    "tinyurl.com",
    "t.co",
    "trustlocal.de",
    "trustlocal.com",
    "trustlocal.be",
    "pinterest.com",
    "reddit.com",
    "youtube.com",
    "facebook.com",
    "instagram.com",
    "linkedin.com"
  ];
  return blockedHosts.some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
}

function scoreRecordQuality(row, category = "") {
  let score = 0;
  if (row.name && row.name.length >= 3) score += 10;
  if (row.websiteUrl) score += 8;
  if (row.contactEmail) score += 22;
  if (row.contactPhone) score += 22;
  if (row.address) score += 18;
  if (Array.isArray(row.priceHints) && row.priceHints.length > 0) score += 8;
  if (Array.isArray(row.openingHours) && row.openingHours.length > 0) score += 5;
  if (typeof row.ratingValue === "number") score += 4;
  if (typeof row.ratingCount === "number" && row.ratingCount > 0) score += 3;

  const lowerName = asString(row.name).toLowerCase();
  if (/(impressum|kontakt|datenschutz|cookie|privacy|terms)/.test(lowerName)) score -= 35;
  if (category && !categoryKeywordMatch(category, `${row.name ?? ""} ${row.sourceUrl ?? ""}`)) score -= 8;

  return clamp(score, 0, 100);
}

function categoryKeywordMatch(category, value) {
  const lower = value.toLowerCase();
  const keywords = {
    venue: ["hochzeit", "location", "event", "saal", "schloss", "hotel"],
    photography: ["foto", "photography", "fotograf"],
    catering: ["catering", "buffet", "food", "menue", "cater"],
    music: ["dj", "musik", "band", "live"],
    florals: ["flor", "blumen", "deko"],
    attire: ["brautmode", "anzug", "kleid", "fashion"],
    stationery: ["papeterie", "karten", "einladung"],
    cake: ["torte", "konditor", "cake"],
    transport: ["shuttle", "limo", "bus", "chauffeur"],
    lodging: ["hotel", "uebernacht", "unterkunft"],
    planner: ["planer", "wedding planner", "agentur"],
    officiant: ["trauredner", "redner", "officiant"],
    videography: ["video", "filmer", "videograf"],
    photobooth: ["fotobox", "photo booth"],
    magician: ["zauber", "magier"],
    "live-artist": ["live painter", "live artist", "kuenstler"],
    childcare: ["kinderbetreuung", "nanny", "kids"],
    rentals: ["verleih", "rental", "mieten"]
  };
  const list = keywords[category] ?? [];
  return list.some((keyword) => lower.includes(keyword));
}

function findRatingSignal(html) {
  const plain = normalizeWhitespace(stripTags(html));
  const value = firstNumberFromPatterns(plain, [
    /\b([1-5](?:[.,]\d)?)\s*(?:\/\s*5|von\s*5|stars?)\b/i,
    /\brating[:\s]+([1-5](?:[.,]\d)?)\b/i,
    /\bbewertung[:\s]+([1-5](?:[.,]\d)?)\b/i
  ]);
  const count = firstNumberFromPatterns(plain, [
    /\b(\d{1,6})\s*(?:bewertungen|reviews|rezensionen)\b/i
  ]);
  return {
    ...(typeof value === "number" ? { value } : {}),
    ...(typeof count === "number" ? { count } : {})
  };
}

function firstNumberFromPatterns(value, patterns) {
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (!match?.[1]) continue;
    const normalized = match[1].replace(",", ".");
    const parsed = Number.parseFloat(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function preferNumber(a, b) {
  if (typeof b === "number" && Number.isFinite(b)) {
    return b;
  }
  if (typeof a === "number" && Number.isFinite(a)) {
    return a;
  }
  return undefined;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function asFiniteNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function firstMatch(value, regex) {
  const match = value.match(regex);
  return match?.[1] ? normalizeWhitespace(stripTags(decodeHtmlEntities(match[1]))) : "";
}

function stripTags(value) {
  return value.replace(/<[^>]+>/g, " ");
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function normalizePhone(value) {
  const normalized = normalizeWhitespace(value || "").replace(/[^\d+]/g, "");
  return normalized.length >= 7 ? normalized : "";
}

function sanitizeEmail(value) {
  const email = normalizeWhitespace(value || "")
    .replace(/\\u0022/g, "")
    .replace(/["'\\]/g, "")
    .toLowerCase();
  if (!email || !email.includes("@")) {
    return "";
  }
  return email;
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function mergeArrays(a = [], b = []) {
  return [...new Set([...(a ?? []), ...(b ?? [])])].filter(Boolean);
}

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => asString(entry)).filter(Boolean);
  }
  const single = asString(value);
  return single ? [single] : [];
}

function firstIn(values) {
  return values.length > 0 ? values[0] : "";
}

function categoryToQueryLabel(category) {
  const map = {
    venue: "hochzeitslocation",
    photography: "hochzeitsfotograf",
    catering: "hochzeitscatering",
    music: "hochzeits dj",
    florals: "hochzeitsflorist",
    attire: "brautmode",
    stationery: "hochzeitspapeterie",
    cake: "hochzeitstorte",
    transport: "hochzeit shuttle",
    lodging: "hochzeit hotel",
    planner: "hochzeitsplaner",
    officiant: "trauredner",
    videography: "hochzeitsvideo",
    photobooth: "fotobox hochzeit",
    magician: "zauberer hochzeit",
    "live-artist": "live painter hochzeit",
    childcare: "kinderbetreuung hochzeit",
    rentals: "hochzeit verleih"
  };
  return map[category] ?? category;
}
