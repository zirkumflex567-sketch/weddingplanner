#!/usr/bin/env node

/**
 * Browser-use pipeline adapter.
 *
 * Input: one JSON arg with task payload
 * Output: JSON array of normalized records
 *
 * This adapter is designed to run in headless server environments.
 * It uses a search-first discovery approach, then extracts first-party
 * contact signals from candidate pages.
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
    ? Number.parseInt(process.env.BROWSER_USE_ADAPTER_MAX_RESULTS_PREMIUM ?? "16", 10)
    : Number.parseInt(process.env.BROWSER_USE_ADAPTER_MAX_RESULTS_FREE ?? "8", 10);

if (!portalUrl) {
  process.stdout.write("[]");
  process.exit(0);
}

const categoryLabel = categoryToQueryLabel(category);
const portalHost = safeHost(portalUrl);
const searchQuery = `site:${portalHost} ${categoryLabel} ${region}`;
const timeoutMs = Number.parseInt(process.env.BROWSER_USE_ADAPTER_TIMEOUT_MS ?? "15000", 10);

const result = await discoverPortalRecords({
  searchQuery,
  region,
  portalUrl,
  maxResults: Number.isFinite(maxResults) && maxResults > 0 ? maxResults : 8,
  timeoutMs
});

process.stdout.write(JSON.stringify(result));

async function discoverPortalRecords(input) {
  const candidates = await searchDuckDuckGo(input.searchQuery, input.maxResults, input.timeoutMs);
  const portalCandidates = buildPortalFallbackCandidates(input.portalUrl);
  const queue = [...candidates, ...portalCandidates];
  const records = [];
  const seen = new Set();

  for (const candidate of queue) {
    if (!candidate.url || seen.has(candidate.url)) {
      continue;
    }
    seen.add(candidate.url);
    const page = await fetchHtml(candidate.url, input.timeoutMs);
    if (!page) {
      continue;
    }

    const extracted = extractRecordFromHtml({
      url: candidate.url,
      title: candidate.title,
      html: page
    });

    if (!extracted.name && !extracted.websiteUrl && !extracted.contactPhone && !extracted.contactEmail) {
      continue;
    }

    if (!extracted.address) {
      extracted.address = findAddressSnippet(page, input.region);
    }
    if (!extracted.priceHints || extracted.priceHints.length === 0) {
      extracted.priceHints = findPriceHints(page);
    }

    records.push(extracted);
    if (records.length >= input.maxResults) {
      break;
    }
  }

  return dedupeRecords(records);
}

function buildPortalFallbackCandidates(portalUrl) {
  const targets = [];
  const suffixes = ["", "/kontakt", "/impressum", "/contact", "/ueber-uns"];

  for (const suffix of suffixes) {
    const resolved = safeJoinUrl(portalUrl, suffix);
    if (!resolved) {
      continue;
    }
    targets.push({
      url: resolved,
      title: ""
    });
  }

  return targets;
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
    candidates.push({
      url: resolved,
      title
    });
    if (candidates.length >= maxResults * 2) {
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

function extractRecordFromHtml(input) {
  const html = input.html;
  const title = firstMatch(html, /<title[^>]*>(.*?)<\/title>/is);
  const h1 = firstMatch(html, /<h1[^>]*>(.*?)<\/h1>/is);
  const email = firstMatch(html, /mailto:([^"'?\s>]+)/i);
  const phone = normalizePhone(firstMatch(html, /tel:([^"'?\s>]+)/i));
  const openingHours = extractOpeningHours(html);
  const priceHints = findPriceHints(html);
  const websiteUrl = safeOrigin(input.url);

  const name = cleanName(h1 || title || input.title || hostToName(input.url));
  const contactEmail = sanitizeEmail(email);

  return {
    ...(name ? { name } : {}),
    ...(websiteUrl ? { websiteUrl } : {}),
    sourceUrl: input.url,
    ...(phone ? { contactPhone: phone } : {}),
    ...(contactEmail ? { contactEmail } : {}),
    ...(openingHours.length > 0 ? { openingHours } : {}),
    ...(priceHints.length > 0 ? { priceHints } : {})
  };
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
  return undefined;
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
      if (hints.size >= 5) {
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
  for (const entry of records) {
    const key = (entry.websiteUrl || entry.sourceUrl || entry.name || "").toLowerCase();
    if (!key) {
      continue;
    }
    if (!map.has(key)) {
      map.set(key, entry);
      continue;
    }
    const current = map.get(key);
    map.set(key, {
      ...current,
      ...entry,
      openingHours: mergeArrays(current.openingHours, entry.openingHours),
      priceHints: mergeArrays(current.priceHints, entry.priceHints)
    });
  }
  return [...map.values()];
}

function mergeArrays(a = [], b = []) {
  return [...new Set([...a, ...b])].filter(Boolean);
}

function resolveSearchHref(rawHref) {
  if (!rawHref) {
    return null;
  }
  try {
    if (rawHref.startsWith("/l/?")) {
      const parsed = new URL(`https://duckduckgo.com${rawHref}`);
      const target = parsed.searchParams.get("uddg");
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

function safeOrigin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

function safeJoinUrl(base, suffix) {
  try {
    return new URL(suffix, base).toString();
  } catch {
    return null;
  }
}

function safeHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function firstMatch(value, regex) {
  const match = value.match(regex);
  return match?.[1] ? normalizeWhitespace(stripTags(decodeHtmlEntities(match[1]))) : "";
}

function cleanName(value) {
  return normalizeWhitespace(
    value
      .replace(/\|.*$/u, "")
      .replace(/[-–—].*$/u, "")
      .replace(/\b(hotel|hochzeit|event|deutschland|homepage)\b/gi, "")
      .trim()
  );
}

function hostToName(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./i, "");
    return hostname.split(".")[0] ?? hostname;
  } catch {
    return "";
  }
}

function normalizePhone(value) {
  const stripped = normalizeWhitespace(value || "").replace(/[^\d+]/g, "");
  return stripped.length >= 7 ? stripped : "";
}

function sanitizeEmail(value) {
  const email = normalizeWhitespace(value || "").toLowerCase();
  if (!email.includes("@") || email.length < 5) {
    return "";
  }
  return email;
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
    "live-artist": "live zeichner hochzeit",
    childcare: "kinderbetreuung hochzeit",
    rentals: "hochzeit verleih"
  };
  return map[category] ?? category;
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

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}
