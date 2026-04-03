import { describe, expect, it } from "vitest";
import {
  calculateBudgetOverview,
  continueWeddingConsultantConversation,
  createBootstrapPlan,
  createGuidedPlanningSession,
  createPrototypeTasks,
  createPrototypeVendorTracker,
  createWeddingConsultantOpening,
  summarizeGuests,
  type PrototypeWorkspace,
  type WeddingBootstrapInput
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

describe("wedding consultant conversation", () => {
  it("opens on the currently active planning step with a consultative message", () => {
    const workspace = createWorkspace();
    const opening = createWeddingConsultantOpening(workspace);

    expect(createGuidedPlanningSession(workspace).currentStepId).toBe("venue-and-date");
    expect(opening.stepId).toBe("venue-and-date");
    expect(opening.focusArea).toBe("vendors");
    expect(opening.assistantMessage).toContain("Location");
    expect(opening.assistantMessage).toContain("Gut Rehbach");
    expect(opening.suggestedReplies.map((item) => item.id)).toEqual([
      "venue-style-fit",
      "venue-budget-fit",
      "venue-shortlist",
      "venue-next"
    ]);
  });

  it("responds to budget questions in the venue phase with real category anchors", () => {
    const workspace = createWorkspace();
    const turn = continueWeddingConsultantConversation(workspace, "venue-and-date", {
      text: "Uns macht das Location Budget ehrlich gesagt Sorgen."
    });

    expect(turn.stepId).toBe("venue-and-date");
    expect(turn.focusArea).toBe("budget");
    expect(turn.assistantMessage).toContain("9.600");
    expect(turn.assistantMessage).toContain("THE SPACE");
  });

  it("lists nearby venues when the user explicitly asks for all venues", () => {
    const workspace = createWorkspace();
    const turn = continueWeddingConsultantConversation(workspace, "venue-and-date", {
      text: "Liste mir alle venues in der naehe auf."
    });

    expect(turn.stepId).toBe("venue-and-date");
    expect(turn.focusArea).toBe("vendors");
    expect(turn.assistantMessage).toContain("THE SPACE");
    expect(turn.assistantMessage).toContain("Rebe Deidesheim");
    expect(turn.assistantMessage).toContain("Hambacher Schloss");
  });

  it("can jump back to the venue phase when the user asks for venue listings from a later step", () => {
    const workspace = createWorkspace();
    const turn = continueWeddingConsultantConversation(workspace, "core-vendors", {
      text: "Liste mir bitte erst alle venues in der naehe auf."
    });

    expect(turn.stepId).toBe("venue-and-date");
    expect(turn.focusArea).toBe("vendors");
    expect(turn.assistantMessage).toContain("Venue-Liste");
  });

  it("does not auto-advance on unclear free text", () => {
    const workspace = createWorkspace();
    const turn = continueWeddingConsultantConversation(workspace, "core-vendors", {
      text: "Ich denke gerade laut und bin noch unsicher."
    });

    expect(turn.stepId).toBe("core-vendors");
    expect(turn.focusArea).toBe("vendors");
    expect(turn.assistantMessage).toContain("Ich bleibe in diesem Block");
  });

  it("can advance the conversation from vendors into the guest phase", () => {
    const workspace = createWorkspace();
    const turn = continueWeddingConsultantConversation(workspace, "core-vendors", {
      actionId: "vendors-next"
    });

    expect(turn.stepId).toBe("guest-experience");
    expect(turn.focusArea).toBe("guests");
    expect(turn.assistantMessage).toContain("Guestlist");
    expect(turn.suggestedReplies.map((item) => item.id)).toEqual([
      "guests-start-list",
      "guests-rsvp-test",
      "guests-count-check",
      "guests-next"
    ]);
  });
});
