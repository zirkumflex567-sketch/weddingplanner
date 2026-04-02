import { afterEach, describe, expect, it } from "vitest";
import { buildApp, shouldUseAiConsultantRewrite } from "./app";

const onboardingPayload = {
  coupleName: "Mira & Leon",
  targetDate: "2027-09-15",
  region: "Berlin",
  guestCountTarget: 80,
  budgetTotal: 18000,
  stylePreferences: ["modern", "natural"],
  noGoPreferences: ["ballroom"],
  plannedEvents: ["civil-ceremony", "celebration", "brunch"]
};

const hasslochOnboardingPayload = {
  coupleName: "Alina & Jonas",
  targetDate: "2027-08-21",
  region: "67454 Haßloch",
  guestCountTarget: 70,
  budgetTotal: 24000,
  stylePreferences: ["natural", "romantic"],
  noGoPreferences: ["ballroom"],
  plannedEvents: ["civil-ceremony", "celebration"]
};

const openApps: ReturnType<typeof buildApp>[] = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

describe("POST /planning/bootstrap", () => {
  it("creates a normalized wedding profile from onboarding input", async () => {
    const app = buildApp();
    openApps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/planning/bootstrap",
      payload: onboardingPayload
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.plan.profile).toMatchObject({
      coupleName: "Mira & Leon",
      region: "Berlin",
      targetDate: "2027-09-15",
      guestCountTarget: 80,
      budgetTotal: 18000,
      stylePreferences: ["modern", "natural"],
      noGoPreferences: ["ballroom"]
    });
  });

  it("returns milestones that are anchored to the target date and ordered by urgency", async () => {
    const app = buildApp();
    openApps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/planning/bootstrap",
      payload: onboardingPayload
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.plan.milestones).toEqual([
      {
        id: "venue-shortlist",
        title: "Location shortlist finalisieren",
        dueDate: "2026-09-15",
        category: "venue",
        rationale: "Location und Termin bestimmen fast alle spaeteren Vendor-Entscheidungen."
      },
      {
        id: "photo-direction",
        title: "Foto- und Stilrichtung fixieren",
        dueDate: "2026-11-15",
        category: "photography",
        rationale: "Fotografie ist in beliebten Zeitraeumen frueh ausgebucht und haengt stark vom Stilprofil ab."
      },
      {
        id: "guest-framework",
        title: "Gaeste- und Budgetrahmen absichern",
        dueDate: "2027-03-15",
        category: "planning",
        rationale: "Gaestezahl und Budgetrahmen steuern Catering, Seating und Kommunikationsaufwand."
      }
    ]);
  });

  it("returns starter budget categories that add up to the declared budget", async () => {
    const app = buildApp();
    openApps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/planning/bootstrap",
      payload: onboardingPayload
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();
    const plannedTotal = body.plan.budgetCategories.reduce(
      (sum: number, item: { plannedAmount: number }) => sum + item.plannedAmount,
      0
    );

    expect(body.plan.budgetCategories).toMatchObject([
      { category: "venue", plannedAmount: 7200 },
      { category: "catering", plannedAmount: 3600 },
      { category: "photography", plannedAmount: 1800 },
      { category: "music", plannedAmount: 1260 },
      { category: "attire", plannedAmount: 1800 },
      { category: "florals", plannedAmount: 1440 },
      { category: "stationery-admin", plannedAmount: 900 }
    ]);
    expect(plannedTotal).toBe(18000);
  });

  it("returns dach admin reminders and event blueprints for the planned celebration shape", async () => {
    const app = buildApp();
    openApps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/planning/bootstrap",
      payload: onboardingPayload
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.plan.adminReminders).toEqual([
      {
        id: "documents-check",
        title: "Standesamt-Unterlagen vorpruefen",
        dueDate: "2027-01-15",
        category: "legal-admin",
        rationale:
          "Fuer Deutschland sollten Ausweise, Geburtsregister und moegliche Sonderunterlagen frueh geklaert sein."
      },
      {
        id: "civil-registration-window",
        title: "Eheschliessung beim Standesamt anmelden",
        dueDate: "2027-03-15",
        category: "legal-admin",
        rationale:
          "Die Anmeldung ist in Deutschland typischerweise fruehestens sechs Monate vor dem Termin moeglich."
      }
    ]);
    expect(body.plan.eventBlueprints).toEqual([
      {
        id: "civil-ceremony",
        label: "Standesamt",
        planningFocus: "Termin, Unterlagen und moegliche Sonderfaelle frueh absichern."
      },
      {
        id: "celebration",
        label: "Feier",
        planningFocus: "Venue, Catering, Musik und Ablauf als zusammenhaengenden Haupttag planen."
      },
      {
        id: "brunch",
        label: "Brunch",
        planningFocus: "Unterkuenfte, Reisewege und lockeren Folgetag fuer Gaeste mitdenken."
      }
    ]);
  });

  it("returns curated vendor matches and runtime topology aligned with shadow for ai workloads", async () => {
    const app = buildApp();
    openApps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/planning/bootstrap",
      payload: onboardingPayload
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.plan.vendorMatches).toEqual([
      {
        id: "berlin-kranich-catering",
        name: "Kranich Catering",
        category: "catering",
        region: "Berlin",
        fitScore: 95,
        priceBandLabel: "ca. 3.200-4.100 EUR",
        reasonSummary: "Skaliert gut auf 80 Gaeste, bleibt nah am Catering-Rahmen und passt zu moderner saisonaler Planung."
      },
      {
        id: "berlin-spree-loft",
        name: "Spree Loft Atelier",
        category: "venue",
        region: "Berlin",
        fitScore: 95,
        priceBandLabel: "5.500-8.500 EUR",
        reasonSummary: "Passt zu Berlin, 80 Gaesten und einem modernen naturnahen Stil."
      },
      {
        id: "berlin-nordlicht-photo",
        name: "Studio Nordlicht",
        category: "photography",
        region: "Berlin",
        fitScore: 95,
        priceBandLabel: "ca. 1.800-2.600 EUR",
        reasonSummary: "Trifft den Stil, liegt im Foto-Budget und ist auf urbane Feiern im Berliner Raum ausgerichtet."
      }
    ]);
    expect(body.plan.runtimeTopology).toEqual({
      aiExecution: "shadow-workstation",
      hosting: "vps-web-api-only",
      note:
        "Inference, Dokumentenverarbeitung und spaetere Modell-Orchestrierung laufen auf Shadow; der VPS hostet Web und API."
    });
    expect(body.plan.vendorSearchStrategy).toMatchObject({
      mode: "curated-plus-refresh",
      requiresPaidRefresh: true,
      curatedCoverageAreaIds: ["berlin-core"]
    });
  });

  it("returns local curated vendor matches for the 67454 radius seed including source metadata", async () => {
    const app = buildApp();
    openApps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/planning/bootstrap",
      payload: hasslochOnboardingPayload
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.plan.vendorMatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "hassloch-the-space",
          name: "THE SPACE",
          category: "venue",
          city: "Hassloch",
          websiteUrl: "https://the-space.bar/reservieren/",
          portfolioUrl: "https://the-space.bar/reservieren/",
          sourceLabel: "Offizielle Reservierungsseite"
        }),
        expect.objectContaining({
          id: "hassloch-event-taste",
          name: "Event Taste",
          category: "catering",
          city: "Hassloch",
          websiteUrl: "https://www.eventtaste.de/",
          portfolioUrl: "https://www.eventtaste.de/",
          sourceLabel: "Offizielle Menue- und Kontaktseite"
        }),
        expect.objectContaining({
          id: "pfalz-markus-husner",
          name: "Markus Husner",
          category: "photography",
          city: "Bad Duerkheim",
          websiteUrl: "https://www.markushusner.com/hochzeitsfotograf/",
          portfolioUrl: "https://www.markushusner.com/hochzeitsfotograf/",
          sourceLabel: "Offizielle Hochzeitsfotografie-Seite"
        })
      ])
    );
    expect(body.plan.vendorMatches.every((vendor: { region: string }) => vendor.region !== "Berlin")).toBe(
      true
    );
  });

  it("returns an expanded local vendor directory for 67454 with richer categories and first-party evidence links", async () => {
    const app = buildApp();
    openApps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/planning/bootstrap",
      payload: hasslochOnboardingPayload
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();
    const categories = new Set(
      body.plan.vendorMatches.map((vendor: { category: string }) => vendor.category)
    );

    expect(body.plan.vendorMatches.length).toBeGreaterThanOrEqual(25);
    expect(categories).toEqual(
      new Set(["venue", "photography", "catering", "music", "florals", "attire"])
    );
    expect(body.plan.vendorMatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "dj-stefan-kietz",
          category: "music",
          serviceLabel: "DJ & Moderation",
          websiteUrl: "https://www.djstefankietz.de/",
          portfolioUrl: "https://www.djstefankietz.de/",
          sourceLabel: "Offizielle DJ-Seite"
        }),
        expect.objectContaining({
          id: "iman-bader-bridal-styling",
          category: "attire",
          city: "Neustadt an der Weinstrasse",
          serviceLabel: "Brautstyling & Make-up",
          websiteUrl: "https://imanbader.de/brautpakete/",
          sourceLabel: "Offizielle Brautpakete-Seite"
        }),
        expect.objectContaining({
          id: "floristik-ringelblume-deidesheim",
          category: "florals",
          city: "Deidesheim",
          serviceLabel: "Hochzeitsfloristik & Tischdeko",
          websiteUrl: "https://www.floristik-ringelblume.de/",
          portfolioUrl: "https://www.floristik-ringelblume.de/hochzeit/"
        })
      ])
    );
  });

  it("matches the 67454 seed area when the region is entered as postal code only", async () => {
    const app = buildApp();
    openApps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/planning/bootstrap",
      payload: {
        ...hasslochOnboardingPayload,
        region: "67454"
      }
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.plan.vendorMatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "hassloch-the-space" }),
        expect.objectContaining({ id: "hassloch-event-taste" }),
        expect.objectContaining({ id: "pfalz-markus-husner" })
      ])
    );
    expect(body.plan.vendorSearchStrategy).toMatchObject({
      mode: "curated-plus-refresh",
      requiresPaidRefresh: true,
      curatedCoverageAreaIds: ["67454-radius-40km"]
    });
  });

  it("creates a paid vendor refresh job for uncovered regions with a source-safe plan", async () => {
    const app = buildApp();
    openApps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/prototype/vendor-refresh-jobs",
      payload: {
        paidOrderId: "order_koeln_001",
        region: "50667 Koeln",
        categories: ["venue", "photography", "music", "magician"],
        requestedBy: "customer-payment"
      }
    });

    expect(response.statusCode).toBe(201);

    const body = response.json();
    expect(body.job.plan.strategy).toMatchObject({
      mode: "refresh-only",
      requiresPaidRefresh: true
    });
    expect(body.job.plan.connectors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "directory-discovery",
          discoveryOnly: true
        }),
        expect.objectContaining({
          id: "vendor-websites",
          discoveryOnly: false
        })
      ])
    );
    expect(body.job.plan.publishGate.blockedFields).toContain("thirdPartyReviewScore");
  });

  it("previews connector execution for a refresh job with publish-safe normalized records", async () => {
    const app = buildApp();
    openApps.push(app);

    const createJobResponse = await app.inject({
      method: "POST",
      url: "/prototype/vendor-refresh-jobs",
      payload: {
        paidOrderId: "order_hassloch_002",
        region: "67454 Hassloch",
        categories: ["photography"],
        requestedBy: "customer-payment"
      }
    });

    const jobId = createJobResponse.json().job.id;

    const previewResponse = await app.inject({
      method: "POST",
      url: `/prototype/vendor-refresh-jobs/${jobId}/preview`,
      payload: {
        category: "photography",
        requestedAt: "2026-04-02T10:00:00.000Z",
        directoryResults: [
          {
            title: "Studio Beispiel Hochzeitsfotografie",
            url: "https://directory.example/studio-beispiel",
            directoryName: "Directory Example",
            location: "67454 Hassloch"
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
                  <p>ab 2.400 EUR</p>
                </body>
              </html>
            `
          }
        ]
      }
    });

    expect(previewResponse.statusCode).toBe(200);
    expect(previewResponse.json().preview.publishableRecords).toEqual([
      expect.objectContaining({
        name: "Studio Beispiel",
        category: "photography",
        region: "67454 Hassloch",
        websiteUrl: "https://example-vendor.de/hochzeit",
        blockedFieldAudit: expect.arrayContaining([
          "thirdPartyReviewScore",
          "thirdPartyReviewCount"
        ])
      })
    ]);
    expect(previewResponse.json().preview.googlePlacesRequest.fieldMask).not.toContain("rating");
  });
});

describe("POST /prototype/consultant/reply", () => {
  it("skips AI rewrite for long list-heavy venue replies", () => {
    expect(
      shouldUseAiConsultantRewrite(
        "Liste mir bitte alle venues in der naehe auf.",
        {
          stepId: "venue-and-date",
          focusArea: "vendors",
          assistantMessage:
            "Hier ist eine Liste der moeglichen Locations in der Naehe von Hassloch: THE SPACE, Rebe Deidesheim, Hambacher Schloss, Gut Rehbach, Hotel Schloss Edesheim und weitere Optionen fuer 70 Gaeste.",
          suggestedReplies: []
        }
      )
    ).toBe(false);
  });

  it("uses the injected consultant responder when available", async () => {
    const app = buildApp({
      consultantResponder: {
        async respond(payload) {
          return {
            turn: {
              ...payload.currentTurn,
              assistantMessage:
                "Dann gehen wir die Venue-Auswahl jetzt einmal ruhig und konkret durch."
            },
            provider: "ollama",
            model: "qwen3.5:4b"
          };
        }
      }
    });
    openApps.push(app);

    const createResponse = await app.inject({
      method: "POST",
      url: "/prototype/workspaces",
      payload: hasslochOnboardingPayload
    });
    const created = createResponse.json();

    const response = await app.inject({
      method: "POST",
      url: "/prototype/consultant/reply",
      payload: {
        workspace: created.workspace,
        currentTurn: {
          stepId: "venue-and-date",
          focusArea: "vendors",
          assistantMessage: "Ich wuerde mit euch die Location-Schicht sauber ziehen.",
          suggestedReplies: []
        },
        messages: [
          {
            role: "assistant",
            content: "Ich wuerde mit euch die Location-Schicht sauber ziehen."
          }
        ],
        userMessage: "Liste mir bitte alle venues in der naehe auf."
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      provider: "ollama",
      model: "qwen3.5:4b",
      turn: {
        stepId: "venue-and-date",
        assistantMessage: expect.stringContaining("Venue-Auswahl")
      }
    });
  });
});

describe("prototype workspace flow", () => {
  it("lists saved workspace profiles with progress and current planning focus", async () => {
    const app = buildApp();
    openApps.push(app);

    const firstCreateResponse = await app.inject({
      method: "POST",
      url: "/prototype/workspaces",
      payload: onboardingPayload
    });
    const firstWorkspace = firstCreateResponse.json().workspace;

    const secondCreateResponse = await app.inject({
      method: "POST",
      url: "/prototype/workspaces",
      payload: {
        ...hasslochOnboardingPayload,
        coupleName: "Nora & Felix"
      }
    });
    const secondWorkspace = secondCreateResponse.json().workspace;

    await app.inject({
      method: "PATCH",
      url: `/prototype/workspaces/${secondWorkspace.id}/tasks/venue-shortlist`,
      payload: {
        completed: true
      }
    });

    const listResponse = await app.inject({
      method: "GET",
      url: "/prototype/workspaces"
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual({
      profiles: [
        expect.objectContaining({
          id: secondWorkspace.id,
          coupleName: "Nora & Felix",
          targetDate: "2027-08-21",
          region: expect.stringContaining("67454"),
          guestCountTarget: 70,
          budgetTotal: 24000,
          updatedAt: expect.any(String),
          progress: {
            completedTasks: 1,
            totalTasks: 5
          },
          guestSummary: {
            total: 0,
            pending: 0,
            attending: 0,
            declined: 0
          },
          currentStepId: "venue-and-date",
          currentStepTitle: "Location und Datum festziehen"
        }),
        expect.objectContaining({
          id: firstWorkspace.id,
          coupleName: "Mira & Leon",
          targetDate: "2027-09-15",
          region: "Berlin",
          guestCountTarget: 80,
          budgetTotal: 18000,
          updatedAt: expect.any(String),
          progress: {
            completedTasks: 0,
            totalTasks: 5
          },
          currentStepId: "venue-and-date",
          currentStepTitle: "Location und Datum festziehen"
        })
      ]
    });
  });

  it("deletes a workspace profile so it no longer appears in the library", async () => {
    const app = buildApp();
    openApps.push(app);

    const createResponse = await app.inject({
      method: "POST",
      url: "/prototype/workspaces",
      payload: onboardingPayload
    });
    const workspaceId = createResponse.json().workspace.id;

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/prototype/workspaces/${workspaceId}`
    });

    expect(deleteResponse.statusCode).toBe(204);

    const loadResponse = await app.inject({
      method: "GET",
      url: `/prototype/workspaces/${workspaceId}`
    });

    expect(loadResponse.statusCode).toBe(404);

    const listResponse = await app.inject({
      method: "GET",
      url: "/prototype/workspaces"
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual({
      profiles: []
    });
  });

  it("creates a persistent workspace and allows loading it again", async () => {
    const app = buildApp();
    openApps.push(app);

    const createResponse = await app.inject({
      method: "POST",
      url: "/prototype/workspaces",
      payload: onboardingPayload
    });

    expect(createResponse.statusCode).toBe(201);

    const created = createResponse.json();
    expect(created.workspace.id).toBeTypeOf("string");
    expect(created.workspace.coupleName).toBe("Mira & Leon");
    expect(created.workspace.tasks).toHaveLength(5);
    expect(created.workspace.guests).toEqual([]);

    const loadResponse = await app.inject({
      method: "GET",
      url: `/prototype/workspaces/${created.workspace.id}`
    });

    expect(loadResponse.statusCode).toBe(200);

    const loaded = loadResponse.json();
    expect(loaded.workspace.id).toBe(created.workspace.id);
    expect(loaded.workspace.plan.profile.region).toBe("Berlin");
  });

  it("adds guests with rsvp defaults and updates guest summary counts", async () => {
    const app = buildApp();
    openApps.push(app);

    const createResponse = await app.inject({
      method: "POST",
      url: "/prototype/workspaces",
      payload: onboardingPayload
    });
    const created = createResponse.json();

    const addGuestResponse = await app.inject({
      method: "POST",
      url: `/prototype/workspaces/${created.workspace.id}/guests`,
      payload: {
        name: "Anna Schmidt",
        household: "Schmidt",
        email: "anna@example.com",
        eventIds: ["civil-ceremony", "celebration"]
      }
    });

    expect(addGuestResponse.statusCode).toBe(201);

    const updated = addGuestResponse.json();
    expect(updated.workspace.guests).toEqual([
      {
        id: expect.any(String),
        accessToken: expect.any(String),
        name: "Anna Schmidt",
        household: "Schmidt",
        email: "anna@example.com",
        rsvpStatus: "pending",
        mealPreference: "undecided",
        dietaryNotes: "",
        message: "",
        eventIds: ["civil-ceremony", "celebration"]
      }
    ]);
    expect(updated.workspace.guestSummary).toEqual({
      total: 1,
      pending: 1,
      attending: 0,
      declined: 0
    });
  });

  it("toggles a task completion state and persists the result", async () => {
    const app = buildApp();
    openApps.push(app);

    const createResponse = await app.inject({
      method: "POST",
      url: "/prototype/workspaces",
      payload: onboardingPayload
    });
    const created = createResponse.json();
    const firstTask = created.workspace.tasks[0];

    const toggleResponse = await app.inject({
      method: "PATCH",
      url: `/prototype/workspaces/${created.workspace.id}/tasks/${firstTask.id}`,
      payload: {
        completed: true
      }
    });

    expect(toggleResponse.statusCode).toBe(200);

    const toggled = toggleResponse.json();
    expect(toggled.workspace.tasks[0]).toMatchObject({
      id: firstTask.id,
      completed: true
    });
    expect(toggled.workspace.progress.completedTasks).toBe(1);
    expect(toggled.workspace.progress.totalTasks).toBe(5);

    const loadResponse = await app.inject({
      method: "GET",
      url: `/prototype/workspaces/${created.workspace.id}`
    });

    expect(loadResponse.statusCode).toBe(200);
    expect(loadResponse.json().workspace.tasks[0].completed).toBe(true);
  });

  it("updates onboarding data for an existing workspace while preserving guests and completed tasks", async () => {
    const app = buildApp();
    openApps.push(app);

    const createResponse = await app.inject({
      method: "POST",
      url: "/prototype/workspaces",
      payload: onboardingPayload
    });
    const created = createResponse.json();
    const workspaceId = created.workspace.id;
    const firstTaskId = created.workspace.tasks[0].id;

    await app.inject({
      method: "POST",
      url: `/prototype/workspaces/${workspaceId}/guests`,
      payload: {
        name: "Anna Schmidt",
        household: "Schmidt",
        email: "anna@example.com",
        eventIds: ["celebration"]
      }
    });

    await app.inject({
      method: "PATCH",
      url: `/prototype/workspaces/${workspaceId}/tasks/${firstTaskId}`,
      payload: {
        completed: true
      }
    });

    const updateResponse = await app.inject({
      method: "PATCH",
      url: `/prototype/workspaces/${workspaceId}/onboarding`,
      payload: {
        ...onboardingPayload,
        coupleName: "Mira & Leon 2.0",
        budgetTotal: 24000,
        plannedEvents: ["civil-ceremony", "celebration"]
      }
    });

    expect(updateResponse.statusCode).toBe(200);

    const updated = updateResponse.json();
    expect(updated.workspace.coupleName).toBe("Mira & Leon 2.0");
    expect(updated.workspace.plan.profile.budgetTotal).toBe(24000);
    expect(updated.workspace.guests).toHaveLength(1);
    expect(updated.workspace.tasks.find((task: { id: string; completed: boolean }) => task.id === firstTaskId))
      .toMatchObject({ completed: true });
    expect(updated.workspace.plan.eventBlueprints).toEqual([
      {
        id: "civil-ceremony",
        label: "Standesamt",
        planningFocus: "Termin, Unterlagen und moegliche Sonderfaelle frueh absichern."
      },
      {
        id: "celebration",
        label: "Feier",
        planningFocus: "Venue, Catering, Musik und Ablauf als zusammenhaengenden Haupttag planen."
      }
    ]);
  });

  it("updates a guest rsvp status and recalculates summary counters", async () => {
    const app = buildApp();
    openApps.push(app);

    const createResponse = await app.inject({
      method: "POST",
      url: "/prototype/workspaces",
      payload: onboardingPayload
    });
    const created = createResponse.json();

    const guestResponse = await app.inject({
      method: "POST",
      url: `/prototype/workspaces/${created.workspace.id}/guests`,
      payload: {
        name: "Anna Schmidt",
        household: "Schmidt",
        email: "anna@example.com",
        eventIds: ["celebration"]
      }
    });
    const addedGuest = guestResponse.json().workspace.guests[0];

    const rsvpResponse = await app.inject({
      method: "PATCH",
      url: `/prototype/workspaces/${created.workspace.id}/guests/${addedGuest.id}`,
      payload: {
        rsvpStatus: "attending"
      }
    });

    expect(rsvpResponse.statusCode).toBe(200);

    const updated = rsvpResponse.json();
    expect(updated.workspace.guests[0]).toMatchObject({
      id: addedGuest.id,
      rsvpStatus: "attending"
    });
    expect(updated.workspace.guestSummary).toEqual({
      total: 1,
      pending: 0,
      attending: 1,
      declined: 0
    });
  });

  it("loads a public rsvp session by guest access token", async () => {
    const app = buildApp();
    openApps.push(app);

    const createResponse = await app.inject({
      method: "POST",
      url: "/prototype/workspaces",
      payload: onboardingPayload
    });
    const created = createResponse.json();

    const guestResponse = await app.inject({
      method: "POST",
      url: `/prototype/workspaces/${created.workspace.id}/guests`,
      payload: {
        name: "Anna Schmidt",
        household: "Schmidt",
        email: "anna@example.com",
        eventIds: ["civil-ceremony", "celebration"]
      }
    });

    const guest = guestResponse.json().workspace.guests[0];

    const publicResponse = await app.inject({
      method: "GET",
      url: `/public/rsvp/${guest.accessToken}`
    });

    expect(publicResponse.statusCode).toBe(200);
    expect(publicResponse.json()).toMatchObject({
      guest: {
        id: guest.id,
        accessToken: guest.accessToken,
        name: "Anna Schmidt",
        rsvpStatus: "pending",
        mealPreference: "undecided"
      },
      context: {
        coupleName: "Mira & Leon",
        targetDate: "2027-09-15",
        region: "Berlin"
      }
    });
    expect(publicResponse.json().context.invitedEvents).toEqual([
      {
        id: "civil-ceremony",
        label: "Standesamt",
        planningFocus: "Termin, Unterlagen und moegliche Sonderfaelle frueh absichern."
      },
      {
        id: "celebration",
        label: "Feier",
        planningFocus: "Venue, Catering, Musik und Ablauf als zusammenhaengenden Haupttag planen."
      }
    ]);
  });

  it("updates a guest through the public rsvp route and persists dietary details", async () => {
    const app = buildApp();
    openApps.push(app);

    const createResponse = await app.inject({
      method: "POST",
      url: "/prototype/workspaces",
      payload: onboardingPayload
    });
    const created = createResponse.json();

    const guestResponse = await app.inject({
      method: "POST",
      url: `/prototype/workspaces/${created.workspace.id}/guests`,
      payload: {
        name: "Anna Schmidt",
        household: "Schmidt",
        email: "anna@example.com",
        eventIds: ["civil-ceremony", "celebration"]
      }
    });

    const guest = guestResponse.json().workspace.guests[0];

    const publicUpdateResponse = await app.inject({
      method: "PATCH",
      url: `/public/rsvp/${guest.accessToken}`,
      payload: {
        rsvpStatus: "attending",
        mealPreference: "vegetarian",
        dietaryNotes: "Keine Nuesse bitte.",
        message: "Wir freuen uns sehr."
      }
    });

    expect(publicUpdateResponse.statusCode).toBe(200);
    expect(publicUpdateResponse.json()).toMatchObject({
      guest: {
        id: guest.id,
        rsvpStatus: "attending",
        mealPreference: "vegetarian",
        dietaryNotes: "Keine Nuesse bitte.",
        message: "Wir freuen uns sehr."
      }
    });

    const loadResponse = await app.inject({
      method: "GET",
      url: `/prototype/workspaces/${created.workspace.id}`
    });

    expect(loadResponse.statusCode).toBe(200);
    expect(loadResponse.json().workspace.guestSummary).toEqual({
      total: 1,
      pending: 0,
      attending: 1,
      declined: 0
    });
    expect(loadResponse.json().workspace.guests[0]).toMatchObject({
      id: guest.id,
      mealPreference: "vegetarian",
      dietaryNotes: "Keine Nuesse bitte.",
      message: "Wir freuen uns sehr."
    });
  });

  it("adds expenses and recalculates budget overview for the workspace", async () => {
    const app = buildApp();
    openApps.push(app);

    const createResponse = await app.inject({
      method: "POST",
      url: "/prototype/workspaces",
      payload: onboardingPayload
    });
    const created = createResponse.json();

    const expenseResponse = await app.inject({
      method: "POST",
      url: `/prototype/workspaces/${created.workspace.id}/expenses`,
      payload: {
        label: "Fotograf Anzahlung",
        category: "photography",
        amount: 1500,
        status: "booked",
        vendorName: "Studio Nordlicht"
      }
    });

    expect(expenseResponse.statusCode).toBe(201);

    const updated = expenseResponse.json();
    expect(updated.workspace.expenses).toEqual([
      {
        id: expect.any(String),
        label: "Fotograf Anzahlung",
        category: "photography",
        amount: 1500,
        status: "booked",
        vendorName: "Studio Nordlicht"
      }
    ]);
    expect(updated.workspace.budgetOverview.overall).toEqual({
      planned: 18000,
      committed: 1500,
      paid: 0,
      remaining: 16500
    });
    expect(
      updated.workspace.budgetOverview.categories.find(
        (entry: { category: string }) => entry.category === "photography"
      )
    ).toMatchObject({
      category: "photography",
      planned: 1800,
      committed: 1500,
      paid: 0,
      remaining: 300
    });
  });

  it("tracks vendor pipeline status with quote and note for a recommended vendor", async () => {
    const app = buildApp();
    openApps.push(app);

    const createResponse = await app.inject({
      method: "POST",
      url: "/prototype/workspaces",
      payload: onboardingPayload
    });
    const created = createResponse.json();
    const vendorId = created.workspace.plan.vendorMatches[1].id;

    const vendorResponse = await app.inject({
      method: "PATCH",
      url: `/prototype/workspaces/${created.workspace.id}/vendors/${vendorId}`,
      payload: {
        stage: "quoted",
        quoteAmount: 2200,
        note: "Termin angefragt, Angebot kommt bis Freitag."
      }
    });

    expect(vendorResponse.statusCode).toBe(200);

    const updated = vendorResponse.json();
    expect(updated.workspace.vendorTracker).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          vendorId,
          stage: "quoted",
          quoteAmount: 2200,
          note: "Termin angefragt, Angebot kommt bis Freitag."
        })
      ])
    );
  });

  it("preserves vendor tracking decisions for matching vendors after onboarding updates", async () => {
    const app = buildApp();
    openApps.push(app);

    const createResponse = await app.inject({
      method: "POST",
      url: "/prototype/workspaces",
      payload: onboardingPayload
    });
    const created = createResponse.json();
    const workspaceId = created.workspace.id;
    const vendorId = created.workspace.plan.vendorMatches[0].id;

    await app.inject({
      method: "PATCH",
      url: `/prototype/workspaces/${workspaceId}/vendors/${vendorId}`,
      payload: {
        stage: "contacted",
        quoteAmount: null,
        note: "Rueckruf angefragt."
      }
    });

    const updateResponse = await app.inject({
      method: "PATCH",
      url: `/prototype/workspaces/${workspaceId}/onboarding`,
      payload: {
        ...onboardingPayload,
        budgetTotal: 22000,
        noGoPreferences: ["ballroom", "minimal"]
      }
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json().workspace.vendorTracker).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          vendorId,
          stage: "contacted",
          quoteAmount: null,
          note: "Rueckruf angefragt."
        })
      ])
    );
  });
});
