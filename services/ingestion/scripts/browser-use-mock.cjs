#!/usr/bin/env node

const payloadRaw = process.argv[2] ?? "{}";
let payload = {};
try {
  payload = JSON.parse(payloadRaw);
} catch {
  process.stdout.write("[]");
  process.exit(0);
}

const region = payload.region ?? "Deutschland";
const category = payload.category ?? "venue";

const sample = [
  {
    name: `Mock ${category} Anbieter`,
    websiteUrl: "https://example.org",
    sourceUrl: payload.portalUrl ?? "https://example.org/source",
    address: `Musterstrasse 1, ${region}`,
    contactPhone: "+49 30 123456",
    contactEmail: "kontakt@example.org",
    openingHours: ["Mo-Fr 09:00-18:00"],
    priceHints: ["ab 2.500 EUR"]
  }
];

process.stdout.write(JSON.stringify(sample));
