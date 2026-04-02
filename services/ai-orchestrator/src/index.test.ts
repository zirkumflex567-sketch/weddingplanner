import { describe, expect, it, vi } from "vitest";
import {
  buildAiOrchestratorApp,
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

  it("rewrites wedding consultant replies through the app endpoint", async () => {
    const app = buildAiOrchestratorApp({
      ollama: new OllamaChatClient({
        fetchImpl: vi.fn(async () => ({
          ok: true,
          json: async () => ({
            message: {
              content: JSON.stringify({
                assistantMessage:
                  "Dann lasst uns die Venue-Liste einmal sauber durchgehen. Rund um Haßloch sind THE SPACE, Rebe Deidesheim und Hambacher Schloss die ersten starken Gespraeche."
              })
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
              content: JSON.stringify({
                assistantMessage:
                  "Danke, Herr Test. Ich habe Haßloch und das Thema Rollladen schon notiert. Schickt mir bitte noch kurz eure Rueckrufnummer, dann kann ich die Anfrage komplett weitergeben."
              })
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
    expect(response.json().response.assistantMessage).toContain("Rueckrufnummer");
    await app.close();
  });
});
