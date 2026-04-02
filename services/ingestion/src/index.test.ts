import { describe, expect, it } from "vitest";
import {
  buildGooglePlacesTextSearchRequest,
  createVendorConnectorPreview,
  createVendorRefreshJob,
  createVendorRefreshPlan,
  extractVendorWebsiteFacts
} from "./index";

describe("vendor refresh planning", () => {
  it("creates a refresh-only strategy for uncovered German regions", () => {
    const plan = createVendorRefreshPlan({
      paidOrderId: "order_123",
      region: "50667 Koeln",
      categories: ["venue", "photography", "music", "magician"],
      requestedBy: "customer-payment"
    });

    expect(plan.strategy.mode).toBe("refresh-only");
    expect(plan.strategy.coverageAreas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "de-postal-50667", kind: "postal-code" }),
        expect.objectContaining({ id: "de-national", kind: "nationwide" })
      ])
    );
  });

  it("adds directory discovery only as a non-publish source", () => {
    const plan = createVendorRefreshPlan({
      paidOrderId: "order_456",
      region: "Deutschland",
      categories: ["music", "magician", "live-artist"],
      requestedBy: "customer-payment"
    });

    expect(plan.connectors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "directory-discovery",
          discoveryOnly: true,
          role: "directory-discovery"
        })
      ])
    );
    expect(plan.publishGate.blockedFields).toContain("thirdPartyReviewScore");
  });

  it("creates queueable jobs for a paid refresh request", () => {
    const job = createVendorRefreshJob({
      paidOrderId: "order_789",
      region: "67454 Hassloch",
      categories: ["venue", "photography"],
      requestedBy: "customer-payment"
    });

    expect(job.status).toBe("queued");
    expect(job.plan.strategy.mode).toBe("curated-plus-refresh");
    expect(job.plan.stages).toHaveLength(6);
  });

  it("builds a Google Places text search request with an explicit field mask", () => {
    const request = buildGooglePlacesTextSearchRequest("50667 Koeln", "venue");

    expect(request.endpoint).toBe("https://places.googleapis.com/v1/places:searchText");
    expect(request.method).toBe("POST");
    expect(request.fieldMask).toContain("places.displayName");
    expect(request.fieldMask).not.toContain("rating");
    expect(request.body).toMatchObject({
      languageCode: "de",
      regionCode: "DE",
      maxResultCount: 10
    });
    expect(request.body.textQuery).toContain("50667 Koeln");
  });

  it("extracts publishable first-party facts from vendor website html", () => {
    const facts = extractVendorWebsiteFacts({
      url: "https://example-vendor.de/hochzeit",
      fetchedAt: "2026-04-02T10:00:00.000Z",
      html: `
        <html>
          <head><title>Studio Beispiel | Hochzeitsfotografie</title></head>
          <body>
            <h1>Studio Beispiel</h1>
            <p>Hochzeitsreportagen, Paarshootings und After Wedding.</p>
            <a href="mailto:hallo@example-vendor.de">Mail</a>
            <a href="tel:+496321123456">Telefon</a>
            <a href="/downloads/preisliste.pdf">Preisliste</a>
            <p>Pakete ab 2.400 EUR fuer Ganztagsreportagen.</p>
          </body>
        </html>
      `
    });

    expect(facts).toMatchObject({
      source: "vendor-website",
      name: "Studio Beispiel",
      websiteUrl: "https://example-vendor.de/hochzeit",
      contactEmail: "hallo@example-vendor.de",
      contactPhone: "+496321123456",
      freshnessTimestamp: "2026-04-02T10:00:00.000Z"
    });
    expect(facts.pdfUrls).toContain("https://example-vendor.de/downloads/preisliste.pdf");
    expect(facts.priceAnchors).toContain("ab 2.400 EUR");
    expect(facts.serviceHints).toEqual(
      expect.arrayContaining(["hochzeitsreportagen", "paarshootings", "after wedding"])
    );
  });

  it("creates a publish-safe connector preview from discovery, places and website inputs", () => {
    const preview = createVendorConnectorPreview({
      category: "photography",
      region: "67454 Hassloch",
      requestedAt: "2026-04-02T10:00:00.000Z",
      directoryResults: [
        {
          title: "Studio Beispiel Hochzeitsfotografie",
          url: "https://directory.example/studio-beispiel",
          directoryName: "Directory Example",
          location: "67454 Hassloch",
          snippet: "Bewertung 4.9/5 fuer Hochzeitsreportagen in der Pfalz"
        }
      ],
      googlePlacesResults: [
        {
          id: "places/abc123",
          displayName: { text: "Studio Beispiel" },
          formattedAddress: "Musterstrasse 12, 67454 Hassloch",
          websiteUri: "https://example-vendor.de/hochzeit",
          nationalPhoneNumber: "+49 6321 123456",
          googleMapsUri: "https://maps.google.com/?cid=abc123",
          rating: 4.9,
          userRatingCount: 54
        }
      ],
      websitePages: [
        {
          url: "https://example-vendor.de/hochzeit",
          fetchedAt: "2026-04-02T10:00:00.000Z",
          html: `
            <html>
              <head><title>Studio Beispiel | Hochzeitsfotografie</title></head>
              <body>
                <h1>Studio Beispiel</h1>
                <p>Hochzeitsreportagen, Paarshootings und After Wedding.</p>
                <a href="mailto:hallo@example-vendor.de">Mail</a>
                <a href="/downloads/preisliste.pdf">Preisliste</a>
                <p>Pakete ab 2.400 EUR.</p>
              </body>
            </html>
          `
        }
      ]
    });

    expect(preview.discoveryCandidates).toHaveLength(1);
    expect(preview.businessFacts).toHaveLength(1);
    expect(preview.websiteFacts).toHaveLength(1);
    expect(preview.publishableRecords).toEqual([
      expect.objectContaining({
        name: "Studio Beispiel",
        category: "photography",
        region: "67454 Hassloch",
        websiteUrl: "https://example-vendor.de/hochzeit",
        contactEmail: "hallo@example-vendor.de",
        contactPhone: "+49 6321 123456",
        sourceProvenance: expect.arrayContaining([
          "directory:Directory Example",
          "google-places:places/abc123",
          "vendor-website:https://example-vendor.de/hochzeit"
        ]),
        blockedFieldAudit: expect.arrayContaining(["thirdPartyReviewScore", "thirdPartyReviewCount"])
      })
    ]);
  });
});
