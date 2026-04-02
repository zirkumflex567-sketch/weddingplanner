import { describe, expect, it } from "vitest";
import {
  calculateBudgetOverview,
  createBootstrapPlan,
  createGuidedPlanningSession,
  createPrototypeTasks,
  createPrototypeVendorTracker,
  createPrototypeWeddingWebsite,
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
    website: createPrototypeWeddingWebsite(input),
    vendorTracker: createPrototypeVendorTracker(plan.vendorMatches, "2026-04-02T00:00:00.000Z"),
    budgetOverview: calculateBudgetOverview(plan.budgetCategories, [])
  };
}

describe("createGuidedPlanningSession", () => {
  it("starts a fresh workspace at the venue step after the profile is already known", () => {
    const workspace = createWorkspace();

    const session = createGuidedPlanningSession(workspace);

    expect(session.currentStepId).toBe("venue-and-date");
    expect(session.steps.map((step) => ({
      id: step.id,
      status: step.status
    }))).toEqual([
      { id: "foundation", status: "done" },
      { id: "venue-and-date", status: "active" },
      { id: "core-vendors", status: "upcoming" },
      { id: "guest-experience", status: "upcoming" },
      { id: "legal-admin", status: "upcoming" },
      { id: "final-control-room", status: "upcoming" }
    ]);
    expect(session.headline).toContain("Location");
  });

  it("moves the guided flow forward when vendors, guests, and admin tasks are already progressing", () => {
    const workspace = createWorkspace();

    for (const entry of workspace.vendorTracker) {
      if (entry.vendorId === "deidesheim-rebe") {
        entry.stage = "contacted";
      }

      if (entry.vendorId === "hassloch-event-taste") {
        entry.stage = "quoted";
        entry.quoteAmount = 4200;
      }

      if (entry.vendorId === "hassloch-nicitello") {
        entry.stage = "quoted";
        entry.quoteAmount = 2100;
      }
    }

    workspace.guests.push({
      id: "guest-1",
      accessToken: "token-1",
      name: "Lena Vogel",
      household: "Vogel",
      email: "lena@example.com",
      plusOneAllowed: false,
      plusOneName: "",
      childCount: 0,
      rsvpStatus: "pending",
      mealPreference: "undecided",
      dietaryNotes: "",
      songRequest: "",
      message: "",
      eventIds: ["civil-ceremony", "celebration"]
    });
    workspace.guestSummary = summarizeGuests(workspace.guests);

    workspace.tasks = workspace.tasks.map((task) =>
      task.category === "legal-admin" ? { ...task, completed: true } : task
    );
    workspace.progress = {
      completedTasks: workspace.tasks.filter((task) => task.completed).length,
      totalTasks: workspace.tasks.length
    };

    const session = createGuidedPlanningSession(workspace);

    expect(session.currentStepId).toBe("final-control-room");
    expect(session.steps.find((step) => step.id === "core-vendors")).toMatchObject({
      status: "done"
    });
    expect(session.steps.find((step) => step.id === "guest-experience")).toMatchObject({
      status: "done"
    });
    expect(session.steps.find((step) => step.id === "legal-admin")).toMatchObject({
      status: "done"
    });
    expect(session.steps.find((step) => step.id === "final-control-room")).toMatchObject({
      status: "active",
      primaryActionLabel: "Control Room oeffnen"
    });
  });
});
