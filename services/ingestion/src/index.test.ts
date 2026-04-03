import { describe, expect, it, vi } from "vitest";
import {
  buildGooglePlacesTextSearchRequest,
  createVendorConnectorPreview,
  createVendorRefreshExecutor,
  createVendorRefreshJob,
  createVendorRefreshPlan,
  extractVendorWebsiteFacts,
  isWeeklyRunDue
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

  it("executes a live-capable vendor refresh run with discovery, places, crawling and quality output", async () => {
    const job = createVendorRefreshJob({
      paidOrderId: "order_live_001",
      region: "67454 Hassloch",
      categories: ["photography"],
      requestedBy: "customer-payment"
    });

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url.startsWith("https://api.search.brave.com/res/v1/web/search")) {
        return new Response(
          JSON.stringify({
            web: {
              results: [
                {
                  title: "Studio Beispiel Hochzeitsfotografie",
                  url: "https://example-vendor.de/hochzeit",
                  description: "Reportagen und Paarshootings in der Pfalz"
                }
              ]
            }
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        );
      }

      if (url === "https://places.googleapis.com/v1/places:searchText") {
        return new Response(
          JSON.stringify({
            places: [
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
            ]
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        );
      }

      if (url === "https://example-vendor.de/hochzeit") {
        return new Response(
          `
            <html>
              <head><title>Studio Beispiel | Hochzeitsfotografie</title></head>
              <body>
                <h1>Studio Beispiel</h1>
                <a href="/preise">Preise</a>
                <a href="mailto:hallo@example-vendor.de">Mail</a>
                <p>Hochzeitsreportagen und Paarshootings.</p>
              </body>
            </html>
          `,
          {
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8" }
          }
        );
      }

      if (url === "https://example-vendor.de/preise") {
        return new Response(
          `
            <html>
              <body>
                <h1>Preise</h1>
                <p>Pakete ab 2.400 EUR fuer Ganztagsreportagen.</p>
              </body>
            </html>
          `,
          {
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8" }
          }
        );
      }

      throw new Error(`Unexpected fetch url: ${url}`);
    });

    const executor = createVendorRefreshExecutor({
      env: {
        BRAVE_SEARCH_API_KEY: "brave-test-key",
        GOOGLE_MAPS_API_KEY: "google-test-key"
      },
      fetch: fetchMock
    });

    const run = await executor.executeJobRun({
      job,
      category: "photography"
    });

    expect(run.status).toBe("completed");
    expect(run.connectorResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          connectorId: "directory-discovery",
          status: "success"
        }),
        expect.objectContaining({
          connectorId: "google-places",
          status: "success"
        }),
        expect.objectContaining({
          connectorId: "vendor-websites",
          status: "success"
        })
      ])
    );
    expect(run.preview.publishableRecords).toEqual([
      expect.objectContaining({
        name: "Studio Beispiel",
        websiteUrl: "https://example-vendor.de/hochzeit",
        contactEmail: "hallo@example-vendor.de",
        priceAnchors: expect.arrayContaining(["ab 2.400 EUR"])
      })
    ]);
    expect(run.quality).toMatchObject({
      status: "ready-for-review",
      publishableRecordCount: 1
    });
    expect(run.quality.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "blocked-fields-audited",
          severity: "warning"
        })
      ])
    );
  });

  it("marks a run as needing attention when live connector credentials are missing", async () => {
    const job = createVendorRefreshJob({
      paidOrderId: "order_live_002",
      region: "50667 Koeln",
      categories: ["venue"],
      requestedBy: "customer-payment"
    });

    const executor = createVendorRefreshExecutor({
      env: {},
      fetch: vi.fn()
    });

    const run = await executor.executeJobRun({
      job,
      category: "venue"
    });

    expect(run.status).toBe("completed-with-gaps");
    expect(run.connectorResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          connectorId: "directory-discovery",
          status: "skipped"
        }),
        expect.objectContaining({
          connectorId: "google-places",
          status: "skipped"
        })
      ])
    );
    expect(run.quality).toMatchObject({
      status: "needs-attention",
      publishableRecordCount: 0
    });
    expect(run.quality.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "no-publishable-records",
          severity: "error"
        })
      ])
    );
  });

  it("marks weekly baseline as due when last run is older than 7 days", () => {
    expect(isWeeklyRunDue("2026-03-20T10:00:00.000Z", "2026-03-28T10:00:00.000Z")).toBe(true);
    expect(isWeeklyRunDue("2026-03-22T10:00:00.000Z", "2026-03-28T09:59:59.000Z")).toBe(false);
    expect(isWeeklyRunDue(undefined, "2026-03-28T10:00:00.000Z")).toBe(true);
  });
});
