#!/usr/bin/env node

const raw = process.argv[2] ?? "{}";
let task;
try {
  task = JSON.parse(raw);
} catch {
  process.stdout.write("[]");
  process.exit(0);
}

const portalUrl = asString(task.portalUrl);
const maxPages = Number.parseInt(process.env.SITE_CRAWLER_MAX_PAGES ?? "8", 10);
const timeoutMs = Number.parseInt(process.env.SITE_CRAWLER_FETCH_TIMEOUT_MS ?? "15000", 10);

if (!portalUrl) {
  process.stdout.write("[]");
  process.exit(0);
}

const baseHost = hostOf(portalUrl);
const queue = [portalUrl, ...seedPages(portalUrl)];
const seen = new Set();
const records = [];

for (const url of queue) {
  if (!url || seen.has(url)) continue;
  seen.add(url);
  if (seen.size > maxPages) break;

  const html = await fetchHtml(url, timeoutMs);
  if (!html) continue;

  const pageRecord = toRecord(url, html);
  if (isLikelyUseful(pageRecord, baseHost)) {
    records.push(pageRecord);
  }

  const links = extractLinks(url, html)
    .filter((entry) => hostOf(entry) === baseHost)
    .slice(0, 6);
  for (const link of links) {
    if (!seen.has(link)) queue.push(link);
  }
}

process.stdout.write(JSON.stringify(dedupe(records).slice(0, 12)));

function seedPages(base) {
  return ["/dienstleister", "/locations", "/hochzeit", "/vendor", "/kontakt", "/impressum"]
    .map((suffix) => joinUrl(base, suffix))
    .filter(Boolean);
}

async function fetchHtml(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari",
        accept: "text/html,application/xhtml+xml"
      }
    });
    if (!response.ok) return "";
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) return "";
    return await response.text();
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

function toRecord(url, html) {
  const title = normalize(stripTags(firstMatch(html, /<title[^>]*>(.*?)<\/title>/is)));
  const h1 = normalize(stripTags(firstMatch(html, /<h1[^>]*>(.*?)<\/h1>/is)));
  const email = sanitizeEmail(firstMatch(html, /mailto:([^"'?\s>]+)/i));
  const phone = sanitizePhone(firstMatch(html, /tel:([^"'?\s>]+)/i));
  const address = findAddress(html);
  const name = cleanName(h1 || title || hostOf(url));
  const quality = score({ name, email, phone, address, url });
  return {
    name,
    websiteUrl: originOf(url),
    sourceUrl: url,
    ...(email ? { contactEmail: email } : {}),
    ...(phone ? { contactPhone: phone } : {}),
    ...(address ? { address } : {}),
    sourceQualityScore: quality
  };
}

function isLikelyUseful(record, baseHost) {
  const host = hostOf(record.sourceUrl || record.websiteUrl || "");
  if (!host || host !== baseHost) return false;
  if (!record.name || record.name.length < 3) return false;
  const lower = record.name.toLowerCase();
  if (/(impressum|datenschutz|cookie|terms|privacy|kontakt)/.test(lower)) return false;
  return Boolean(record.contactEmail || record.contactPhone || record.address || (record.sourceQualityScore ?? 0) >= 70);
}

function score(input) {
  let s = 0;
  if (input.name) s += 20;
  if (input.email) s += 30;
  if (input.phone) s += 30;
  if (input.address) s += 20;
  return Math.max(0, Math.min(100, s));
}

function extractLinks(baseUrl, html) {
  const out = [];
  const links = [...html.matchAll(/<a[^>]*href=["']([^"']+)["'][^>]*>/gi)];
  for (const match of links) {
    const href = decode(match[1] ?? "");
    if (!href) continue;
    try {
      const absolute = new URL(href, baseUrl).toString();
      out.push(absolute);
    } catch {
      // ignore
    }
  }
  return [...new Set(out)];
}

function findAddress(html) {
  const plain = normalize(stripTags(html));
  const match = plain.match(/([A-ZÄÖÜ][\wÄÖÜäöüß .-]{2,}\s\d{1,4}[a-zA-Z]?,?\s\d{5}\s[A-ZÄÖÜ][\wÄÖÜäöüß .-]{2,})/u);
  return match?.[1] ? normalize(match[1]) : "";
}

function dedupe(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = `${(row.websiteUrl ?? "").toLowerCase()}|${(row.name ?? "").toLowerCase()}`;
    if (!key) continue;
    if (!map.has(key)) map.set(key, row);
  }
  return [...map.values()];
}

function cleanName(value) {
  return normalize(value)
    .replace(/\|.*$/u, "")
    .replace(/[-–—].*$/u, "")
    .trim();
}

function firstMatch(value, regex) {
  const match = value.match(regex);
  return match?.[1] ?? "";
}

function stripTags(value) {
  return value.replace(/<[^>]+>/g, " ");
}

function normalize(value) {
  return asString(value).replace(/\s+/g, " ").trim();
}

function sanitizeEmail(value) {
  const email = normalize(value).toLowerCase().replace(/["'\\]/g, "");
  return email.includes("@") ? email : "";
}

function sanitizePhone(value) {
  const phone = normalize(value).replace(/[^\d+]/g, "");
  return phone.length >= 7 ? phone : "";
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

function joinUrl(base, suffix) {
  try {
    return new URL(suffix, base).toString();
  } catch {
    return "";
  }
}

function decode(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function asString(value) {
  return typeof value === "string" ? value : "";
}
