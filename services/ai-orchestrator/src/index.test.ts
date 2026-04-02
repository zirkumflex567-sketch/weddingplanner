import { describe, expect, it, vi } from "vitest";
import {
  buildAiOrchestratorApp,
  buildSiggiFallbackReply,
  createVendorResearchBrief,
  OllamaChatClient,
  type AssistantChatMessage
} from "./index";
import {
  calculateBudgetOverview,
  createBootstrapPlan,
  createPrototypeTasks,
  createPrototypeVendorTracker,
  summarizeGuests,
  type PrototypeWorkspace,
  type WeddingBootstrapInput,
  type WeddingConsultantTurn
} from "@wedding/shared";

const input: WeddingBootstrapInput = {
  coupleName: "Alina & Jonas",
  targetDate: "2027-08-21",
  region: "67454 Hassloch",
  guestCountTarget: 70,
  budgetTotal: 24000,
  stylePreferences: ["natural", "romantic"],
  noGoPreferences: ["ballroom"],
  plannedEvents: ["civil-ceremony", "celebration"]
};

function createWorkspace(): PrototypeWorkspace {
  const plan = createBootstrapPlan(input);
  const tasks = createPrototypeTasks(plan);

  return {
    id: "workspace-1",
    createdAt: "2026-04-02T00:00:00.000Z",
    updatedAt: "2026-04-02T00:00:00.000Z",
    coupleName: input.coupleName,
    onboarding: input,
    plan,
    tasks,
    guests: [],
    guestSummary: summarizeGuests([]),
    progress: {
      completedTasks: 0,
      totalTasks: tasks.length
    },
    expenses: [],
    vendorTracker: createPrototypeVendorTracker(plan.vendorMatches, "2026-04-02T00:00:00.000Z"),
    budgetOverview: calculateBudgetOverview(plan.budgetCategories, [])
  };
}

const baselineTurn: WeddingConsultantTurn = {
  stepId: "venue-and-date",
  focusArea: "vendors",
  assistantMessage:
    "Ich wuerde mit euch jetzt ganz bewusst die Location-Schicht sauber ziehen.",
  suggestedReplies: [
    {
      id: "venue-shortlist",
      label: "Liste mir alle venues in der naehe auf"
    }
  ]
};

const transcript: AssistantChatMessage[] = [
  {
    role: "assistant",
    content: baselineTurn.assistantMessage
  }
];

describe("ai orchestrator", () => {
  it("keeps vendor research brief behaviour intact", () => {
    const brief = createVendorResearchBrief({
      id: "job-1",
      createdAt: "2026-04-02T00:00:00.000Z",
      updatedAt: "2026-04-02T00:00:00.000Z",
      status: "queued",
      request: {
        paidOrderId: "paid-1",
        region: "67454 Hassloch",
        categories: ["photography"],
        requestedBy: "customer-payment"
      },
      plan: {
        strategy: {
          mode: "curated-plus-refresh",
          requiresPaidRefresh: false,
          curatedCoverageAreaIds: ["67454-radius-40km"],
          coverageAreas: [],
          refreshCategories: ["photography"],
          note: "Test strategy"
        },
        connectors: [],
        stages: [],
        freshnessWindowHours: 168,
        publishGate: {
          requiredFields: ["name"],
          blockedFields: [],
          notes: []
        }
      }
    });

    expect(brief.headline).toContain("67454 Hassloch");
    expect(brief.instructions[0]).toContain("directory sources");
  });

  it("parses JSON answers from Ollama", async () => {
    const client = new OllamaChatClient({
      fetchImpl: vi.fn(async () => ({
        ok: true,
        json: async () => ({
          message: {
            content: JSON.stringify({
              assistantMessage: "Natuerliche Antwort"
            })
          }
        })
      })) as unknown as typeof fetch
    });

    const payload = await client.generateJson<{ assistantMessage: string }>("system", "user");
    expect(payload.assistantMessage).toBe("Natuerliche Antwort");
  });

  it("accepts plain text answers from Ollama for lightweight chat flows", async () => {
    const client = new OllamaChatClient({
      fetchImpl: vi.fn(async () => ({
        ok: true,
        json: async () => ({
          message: {
            content:
              "Klar, rund um Hassloch wuerde ich mir zuerst THE SPACE, Rebe Deidesheim und das Hambacher Schloss anschauen. Was ist euch davon am wichtigsten?"
          }
        })
      })) as unknown as typeof fetch
    });

    const payload = await client.generateText("system", "user");
    expect(payload).toContain("THE SPACE");
  });

  it("builds a grounded Siggi fallback reply from the missing intake fields", () => {
    const payload = buildSiggiFallbackReply({
      state: {
        name: "Kevin",
        city: "Hassloch",
        productArea: "rolllaeden",
        roomPosition: "Wohnzimmer"
      },
      userMessage: "Mein Rollladen klemmt.",
      transcript,
      summary: {
        missingFields: ["mindestens eine Kontaktmoeglichkeit (Telefon oder E-Mail)"],
        readyToSubmit: false
      }
    });

    expect(payload).toContain("Rollladen");
    expect(payload).toContain("Telefonnummer oder E-Mail");
  });

  it("rewrites wedding consultant replies through the app endpoint", async () => {
    const app = buildAiOrchestratorApp({
      ollama: new OllamaChatClient({
        fetchImpl: vi.fn(async () => ({
          ok: true,
          json: async () => ({
            message: {
              content:
                "Dann lasst uns die Venue-Liste einmal sauber durchgehen. Rund um Hassloch sind THE SPACE, Rebe Deidesheim und Hambacher Schloss die ersten starken Gespraeche."
            }
          })
        })) as unknown as typeof fetch
      })
    });

    const response = await app.inject({
      method: "POST",
      url: "/chat/wedding-consultant",
      payload: {
        workspace: createWorkspace(),
        baselineTurn,
        messages: transcript,
        userMessage: "Liste mir alle venues in der naehe auf."
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().response.assistantMessage).toContain("Venue-Liste");
    await app.close();
  });

  it("returns a Siggi response through the app endpoint", async () => {
    const app = buildAiOrchestratorApp({
      ollama: new OllamaChatClient({
        fetchImpl: vi.fn(async () => ({
          ok: true,
          json: async () => ({
            message: {
              content:
                "Danke, ich habe Hassloch und den klemmenden Rollladen schon notiert. Gib mir bitte noch kurz deine Telefonnummer oder E-Mail, damit ich die Anfrage sauber weitergeben kann."
            }
          })
        })) as unknown as typeof fetch
      })
    });

    const response = await app.inject({
      method: "POST",
      url: "/chat/siggi-intake",
      payload: {
        state: {
          name: "Max Test",
          city: "Hassloch",
          productArea: "rolllaeden"
        },
        userMessage: "Mein Rollladen klemmt.",
        transcript: [
          {
            role: "user",
            content: "Mein Rollladen klemmt."
          }
        ],
        summary: {
          missingFields: ["Telefon"],
          readyToSubmit: false
        }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().response.assistantMessage).toContain("Telefonnummer");
    await app.close();
  });
});
