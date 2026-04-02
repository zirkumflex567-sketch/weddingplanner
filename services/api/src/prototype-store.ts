import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import {
  calculateBudgetOverview,
  calculateProgress,
  createBootstrapPlan,
  createPrototypeWeddingWebsite,
  createPrototypeWorkspaceProfile,
  createPrototypeTasks,
  createPrototypeVendorTracker,
  mergePrototypeVendorTracker,
  normalizePrototypeWeddingWebsite,
  normalizePrototypeVendorTrackerEntry,
  summarizeGuests,
  type PlannedEventId,
  type PrototypeExpense,
  type PrototypeGuest,
  type PrototypeMealPreference,
  type PrototypePublicRsvpSession,
  type PrototypePublicSiteSession,
  type PrototypeTask,
  type PrototypeVendorAvailability,
  type PrototypeVendorContractStatus,
  type PrototypeVendorPaymentStatus,
  type PrototypeVendorStage,
  type PrototypeWeddingWebsite,
  type PrototypeWorkspaceProfile,
  type PrototypeWorkspace,
  type WeddingBootstrapInput
} from "@wedding/shared";

export interface CreateGuestInput {
  name: string;
  household: string;
  email: string;
  plusOneAllowed?: boolean;
  childCount?: number;
  songRequest?: string;
  eventIds: PlannedEventId[];
}

export interface UpdateGuestInput {
  rsvpStatus?: PrototypeGuest["rsvpStatus"];
  mealPreference?: PrototypeGuest["mealPreference"];
  dietaryNotes?: string;
  plusOneName?: string;
  childCount?: number;
  songRequest?: string;
  message?: string;
}

export interface UpdateWebsiteInput {
  heroTitle: string;
  storyIntro: string;
  venueNote: string;
  travelNote: string;
  hotelNote: string;
  dressCode: string;
  rsvpDeadline: string;
}

export interface CreateExpenseInput {
  label: string;
  category: PrototypeExpense["category"];
  amount: number;
  status: PrototypeExpense["status"];
  vendorName: string;
}

export interface UpdateVendorInput {
  stage: PrototypeVendorStage;
  quoteAmount: number | null;
  note: string;
  packageLabel?: string;
  availability?: PrototypeVendorAvailability;
  contractStatus?: PrototypeVendorContractStatus;
  paymentStatus?: PrototypeVendorPaymentStatus;
  depositAmount?: number | null;
  followUpOn?: string | null;
}

export interface PrototypeWorkspaceStore {
  listWorkspaces(): Promise<PrototypeWorkspaceProfile[]>;
  createWorkspace(input: WeddingBootstrapInput): Promise<PrototypeWorkspace>;
  getWorkspace(id: string): Promise<PrototypeWorkspace | null>;
  deleteWorkspace(id: string): Promise<boolean>;
  updateWorkspace(
    id: string,
    input: WeddingBootstrapInput
  ): Promise<PrototypeWorkspace | null>;
  addGuest(id: string, input: CreateGuestInput): Promise<PrototypeWorkspace | null>;
  updateGuest(
    workspaceId: string,
    guestId: string,
    input: UpdateGuestInput
  ): Promise<PrototypeWorkspace | null>;
  getPublicRsvpSession(accessToken: string): Promise<PrototypePublicRsvpSession | null>;
  updatePublicRsvp(
    accessToken: string,
    input: UpdateGuestInput
  ): Promise<PrototypePublicRsvpSession | null>;
  getPublicSiteSession(siteToken: string): Promise<PrototypePublicSiteSession | null>;
  updateWebsite(
    workspaceId: string,
    input: UpdateWebsiteInput
  ): Promise<PrototypeWorkspace | null>;
  updateVendor(
    workspaceId: string,
    vendorId: string,
    input: UpdateVendorInput
  ): Promise<PrototypeWorkspace | null>;
  addExpense(
    workspaceId: string,
    input: CreateExpenseInput
  ): Promise<PrototypeWorkspace | null>;
  setTaskCompletion(
    workspaceId: string,
    taskId: string,
    completed: boolean
  ): Promise<PrototypeWorkspace | null>;
}

function cloneWorkspace(workspace: PrototypeWorkspace): PrototypeWorkspace {
  return structuredClone(workspace);
}

function normalizeGuest(guest: PrototypeGuest): PrototypeGuest {
  return {
    ...guest,
    accessToken:
      typeof guest.accessToken === "string" && guest.accessToken.length > 0
        ? guest.accessToken
        : randomUUID(),
    plusOneAllowed: typeof guest.plusOneAllowed === "boolean" ? guest.plusOneAllowed : false,
    plusOneName: typeof guest.plusOneName === "string" ? guest.plusOneName : "",
    childCount: typeof guest.childCount === "number" ? Math.max(0, guest.childCount) : 0,
    mealPreference: isMealPreference(guest.mealPreference)
      ? guest.mealPreference
      : "undecided",
    dietaryNotes: typeof guest.dietaryNotes === "string" ? guest.dietaryNotes : "",
    songRequest: typeof guest.songRequest === "string" ? guest.songRequest : "",
    message: typeof guest.message === "string" ? guest.message : ""
  };
}

function createGuestRecord(input: CreateGuestInput): PrototypeGuest {
  return {
    id: randomUUID(),
    accessToken: randomUUID(),
    name: input.name,
    household: input.household,
    email: input.email,
    plusOneAllowed: input.plusOneAllowed ?? false,
    plusOneName: "",
    childCount: Math.max(0, input.childCount ?? 0),
    rsvpStatus: "pending",
    mealPreference: "undecided",
    dietaryNotes: "",
    songRequest: input.songRequest ?? "",
    message: "",
    eventIds: input.eventIds
  };
}

function applyGuestUpdate(guest: PrototypeGuest, input: UpdateGuestInput) {
  if (typeof input.rsvpStatus !== "undefined") {
    guest.rsvpStatus = input.rsvpStatus;
  }

  if (typeof input.mealPreference !== "undefined") {
    guest.mealPreference = input.mealPreference;
  }

  if (typeof input.dietaryNotes !== "undefined") {
    guest.dietaryNotes = input.dietaryNotes;
  }

  if (typeof input.plusOneName !== "undefined") {
    guest.plusOneName = guest.plusOneAllowed ? input.plusOneName : "";
  }

  if (typeof input.childCount !== "undefined") {
    guest.childCount = Math.max(0, input.childCount);
  }

  if (typeof input.songRequest !== "undefined") {
    guest.songRequest = input.songRequest;
  }

  if (typeof input.message !== "undefined") {
    guest.message = input.message;
  }
}

function createPublicRsvpSession(
  workspace: PrototypeWorkspace,
  guest: PrototypeGuest
): PrototypePublicRsvpSession {
  return {
    guest: structuredClone(guest),
    context: {
      coupleName: workspace.coupleName,
      targetDate: workspace.onboarding.targetDate,
      region: workspace.onboarding.region,
      invitedEvents: workspace.plan.eventBlueprints.filter((event) =>
        guest.eventIds.includes(event.id)
      )
    }
  };
}

function createPublicSiteSession(workspace: PrototypeWorkspace): PrototypePublicSiteSession {
  return {
    coupleName: workspace.coupleName,
    targetDate: workspace.onboarding.targetDate,
    region: workspace.onboarding.region,
    guestCountTarget: workspace.onboarding.guestCountTarget,
    eventBlueprints: structuredClone(workspace.plan.eventBlueprints),
    website: structuredClone(workspace.website)
  };
}

function normalizeWorkspace(workspace: PrototypeWorkspace): PrototypeWorkspace {
  const plan = createBootstrapPlan(workspace.onboarding);
  const tasks = mergeTasks(workspace.tasks ?? [], createPrototypeTasks(plan));
  const guests = (workspace.guests ?? []).map((guest) => normalizeGuest(guest));
  const expenses = workspace.expenses ?? [];
  const normalizedVendorTracker = mergePrototypeVendorTracker(
    (workspace.vendorTracker ?? []).map((entry) =>
      normalizePrototypeVendorTrackerEntry(entry, workspace.updatedAt)
    ),
    plan.vendorMatches,
    workspace.updatedAt
  );

  return {
    ...workspace,
    coupleName: workspace.onboarding.coupleName,
    plan,
    tasks,
    guests,
    guestSummary: summarizeGuests(guests),
    progress: calculateProgress(tasks),
    expenses,
    website: normalizePrototypeWeddingWebsite(workspace.website, workspace.onboarding),
    vendorTracker: normalizedVendorTracker,
    budgetOverview:
      workspace.budgetOverview ??
      calculateBudgetOverview(plan.budgetCategories, expenses)
  };
}

function createWorkspaceRecord(input: WeddingBootstrapInput): PrototypeWorkspace {
  const now = new Date().toISOString();
  const plan = createBootstrapPlan(input);
  const tasks = createPrototypeTasks(plan);

  return {
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    coupleName: input.coupleName,
    onboarding: structuredClone(input),
    plan,
    tasks,
    guests: [],
    guestSummary: summarizeGuests([]),
    progress: calculateProgress(tasks),
    expenses: [],
    website: createPrototypeWeddingWebsite(input),
    vendorTracker: createPrototypeVendorTracker(plan.vendorMatches, now),
    budgetOverview: calculateBudgetOverview(plan.budgetCategories, [])
  };
}

function mergeTasks(
  currentTasks: PrototypeTask[],
  nextTasks: PrototypeTask[]
): PrototypeTask[] {
  const currentById = new Map(currentTasks.map((task) => [task.id, task]));

  return nextTasks.map((task) => ({
    ...task,
    completed: currentById.get(task.id)?.completed ?? false
  }));
}

function isMealPreference(value: unknown): value is PrototypeMealPreference {
  return (
    value === "undecided" ||
    value === "standard" ||
    value === "vegetarian" ||
    value === "vegan" ||
    value === "kids"
  );
}

function sortProfilesByUpdatedAt(
  profiles: PrototypeWorkspaceProfile[]
): PrototypeWorkspaceProfile[] {
  return [...profiles].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export class InMemoryPrototypeWorkspaceStore implements PrototypeWorkspaceStore {
  private readonly workspaces = new Map<string, PrototypeWorkspace>();

  async listWorkspaces() {
    return sortProfilesByUpdatedAt(
      [...this.workspaces.values()].map((workspace) =>
        createPrototypeWorkspaceProfile(workspace)
      )
    );
  }

  async createWorkspace(input: WeddingBootstrapInput) {
    const workspace = createWorkspaceRecord(input);
    this.workspaces.set(workspace.id, workspace);
    return cloneWorkspace(workspace);
  }

  async getWorkspace(id: string) {
    const workspace = this.workspaces.get(id);
    return workspace ? cloneWorkspace(workspace) : null;
  }

  async deleteWorkspace(id: string) {
    return this.workspaces.delete(id);
  }

  async updateWorkspace(id: string, input: WeddingBootstrapInput) {
    const workspace = this.workspaces.get(id);

    if (!workspace) {
      return null;
    }

    const plan = createBootstrapPlan(input);
    const tasks = mergeTasks(workspace.tasks, createPrototypeTasks(plan));

    workspace.updatedAt = new Date().toISOString();
    workspace.coupleName = input.coupleName;
    workspace.onboarding = structuredClone(input);
    workspace.plan = plan;
    workspace.tasks = tasks;
    workspace.progress = calculateProgress(tasks);
    workspace.vendorTracker = mergePrototypeVendorTracker(
      workspace.vendorTracker,
      plan.vendorMatches,
      workspace.updatedAt
    );
    workspace.budgetOverview = calculateBudgetOverview(plan.budgetCategories, workspace.expenses);

    return cloneWorkspace(workspace);
  }

  async addGuest(id: string, input: CreateGuestInput) {
    const workspace = this.workspaces.get(id);

    if (!workspace) {
      return null;
    }

    const guest = createGuestRecord(input);

    workspace.guests.push(guest);
    workspace.updatedAt = new Date().toISOString();
    workspace.guestSummary = summarizeGuests(workspace.guests);

    return cloneWorkspace(workspace);
  }

  async updateGuest(workspaceId: string, guestId: string, input: UpdateGuestInput) {
    const workspace = this.workspaces.get(workspaceId);

    if (!workspace) {
      return null;
    }

    const guest = workspace.guests.find((entry) => entry.id === guestId);

    if (!guest) {
      return null;
    }

    applyGuestUpdate(guest, input);
    workspace.updatedAt = new Date().toISOString();
    workspace.guestSummary = summarizeGuests(workspace.guests);

    return cloneWorkspace(workspace);
  }

  async getPublicRsvpSession(accessToken: string) {
    for (const workspace of this.workspaces.values()) {
      const guest = workspace.guests.find((entry) => entry.accessToken === accessToken);

      if (guest) {
        return createPublicRsvpSession(workspace, guest);
      }
    }

    return null;
  }

  async updatePublicRsvp(accessToken: string, input: UpdateGuestInput) {
    for (const workspace of this.workspaces.values()) {
      const guest = workspace.guests.find((entry) => entry.accessToken === accessToken);

      if (!guest) {
        continue;
      }

      applyGuestUpdate(guest, input);
      workspace.updatedAt = new Date().toISOString();
      workspace.guestSummary = summarizeGuests(workspace.guests);

      return createPublicRsvpSession(workspace, guest);
    }

    return null;
  }

  async getPublicSiteSession(siteToken: string) {
    for (const workspace of this.workspaces.values()) {
      if (workspace.website.publicSiteToken === siteToken) {
        return createPublicSiteSession(workspace);
      }
    }

    return null;
  }

  async updateWebsite(workspaceId: string, input: UpdateWebsiteInput) {
    const workspace = this.workspaces.get(workspaceId);

    if (!workspace) {
      return null;
    }

    workspace.website = {
      ...workspace.website,
      ...input
    };
    workspace.updatedAt = new Date().toISOString();

    return cloneWorkspace(workspace);
  }

  async updateVendor(workspaceId: string, vendorId: string, input: UpdateVendorInput) {
    const workspace = this.workspaces.get(workspaceId);

    if (!workspace) {
      return null;
    }

    const vendorEntry = workspace.vendorTracker.find((entry) => entry.vendorId === vendorId);

    if (!vendorEntry) {
      return null;
    }

    vendorEntry.stage = input.stage;
    vendorEntry.quoteAmount = input.quoteAmount;
    vendorEntry.note = input.note;
    if (typeof input.packageLabel !== "undefined") {
      vendorEntry.packageLabel = input.packageLabel;
    }
    if (typeof input.availability !== "undefined") {
      vendorEntry.availability = input.availability;
    }
    if (typeof input.contractStatus !== "undefined") {
      vendorEntry.contractStatus = input.contractStatus;
    }
    if (typeof input.paymentStatus !== "undefined") {
      vendorEntry.paymentStatus = input.paymentStatus;
    }
    if (typeof input.depositAmount !== "undefined") {
      vendorEntry.depositAmount = input.depositAmount;
    }
    if (typeof input.followUpOn !== "undefined") {
      vendorEntry.followUpOn = input.followUpOn;
    }
    vendorEntry.updatedAt = new Date().toISOString();
    workspace.updatedAt = vendorEntry.updatedAt;

    return cloneWorkspace(workspace);
  }

  async addExpense(workspaceId: string, input: CreateExpenseInput) {
    const workspace = this.workspaces.get(workspaceId);

    if (!workspace) {
      return null;
    }

    const expense: PrototypeExpense = {
      id: randomUUID(),
      label: input.label,
      category: input.category,
      amount: input.amount,
      status: input.status,
      vendorName: input.vendorName
    };

    workspace.expenses.push(expense);
    workspace.updatedAt = new Date().toISOString();
    workspace.budgetOverview = calculateBudgetOverview(
      workspace.plan.budgetCategories,
      workspace.expenses
    );

    return cloneWorkspace(workspace);
  }

  async setTaskCompletion(workspaceId: string, taskId: string, completed: boolean) {
    const workspace = this.workspaces.get(workspaceId);

    if (!workspace) {
      return null;
    }

    const task = workspace.tasks.find((entry) => entry.id === taskId);

    if (!task) {
      return null;
    }

    task.completed = completed;
    workspace.updatedAt = new Date().toISOString();
    workspace.progress = calculateProgress(workspace.tasks);

    return cloneWorkspace(workspace);
  }
}

interface PersistedPrototypeState {
  workspaces: PrototypeWorkspace[];
}

export class FilePrototypeWorkspaceStore implements PrototypeWorkspaceStore {
  constructor(private readonly filePath: string) {}

  private async readState(): Promise<PersistedPrototypeState> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as PersistedPrototypeState;

      return {
        workspaces: (parsed.workspaces ?? []).map((workspace) =>
          normalizeWorkspace(workspace)
        )
      };
    } catch {
      return { workspaces: [] };
    }
  }

  private async writeState(state: PersistedPrototypeState) {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(state, null, 2), "utf8");
  }

  async listWorkspaces() {
    const state = await this.readState();

    return sortProfilesByUpdatedAt(
      state.workspaces.map((workspace) => createPrototypeWorkspaceProfile(workspace))
    );
  }

  async createWorkspace(input: WeddingBootstrapInput) {
    const state = await this.readState();
    const workspace = createWorkspaceRecord(input);
    state.workspaces.push(workspace);
    await this.writeState(state);
    return cloneWorkspace(workspace);
  }

  async getWorkspace(id: string) {
    const state = await this.readState();
    const workspace = state.workspaces.find((entry) => entry.id === id);
    return workspace ? cloneWorkspace(workspace) : null;
  }

  async deleteWorkspace(id: string) {
    const state = await this.readState();
    const nextWorkspaces = state.workspaces.filter((entry) => entry.id !== id);

    if (nextWorkspaces.length === state.workspaces.length) {
      return false;
    }

    await this.writeState({ workspaces: nextWorkspaces });
    return true;
  }

  async updateWorkspace(id: string, input: WeddingBootstrapInput) {
    const state = await this.readState();
    const workspace = state.workspaces.find((entry) => entry.id === id);

    if (!workspace) {
      return null;
    }

    const plan = createBootstrapPlan(input);
    const tasks = mergeTasks(workspace.tasks, createPrototypeTasks(plan));

    workspace.updatedAt = new Date().toISOString();
    workspace.coupleName = input.coupleName;
    workspace.onboarding = structuredClone(input);
    workspace.plan = plan;
    workspace.tasks = tasks;
    workspace.progress = calculateProgress(tasks);
    workspace.vendorTracker = mergePrototypeVendorTracker(
      workspace.vendorTracker,
      plan.vendorMatches,
      workspace.updatedAt
    );
    workspace.budgetOverview = calculateBudgetOverview(plan.budgetCategories, workspace.expenses);

    await this.writeState(state);
    return cloneWorkspace(workspace);
  }

  async addGuest(id: string, input: CreateGuestInput) {
    const state = await this.readState();
    const workspace = state.workspaces.find((entry) => entry.id === id);

    if (!workspace) {
      return null;
    }

    const guest = createGuestRecord(input);

    workspace.guests.push(guest);
    workspace.updatedAt = new Date().toISOString();
    workspace.guestSummary = summarizeGuests(workspace.guests);

    await this.writeState(state);
    return cloneWorkspace(workspace);
  }

  async updateGuest(workspaceId: string, guestId: string, input: UpdateGuestInput) {
    const state = await this.readState();
    const workspace = state.workspaces.find((entry) => entry.id === workspaceId);

    if (!workspace) {
      return null;
    }

    const guest = workspace.guests.find((entry) => entry.id === guestId);

    if (!guest) {
      return null;
    }

    applyGuestUpdate(guest, input);
    workspace.updatedAt = new Date().toISOString();
    workspace.guestSummary = summarizeGuests(workspace.guests);

    await this.writeState(state);
    return cloneWorkspace(workspace);
  }

  async getPublicRsvpSession(accessToken: string) {
    const state = await this.readState();

    for (const workspace of state.workspaces) {
      const guest = workspace.guests.find((entry) => entry.accessToken === accessToken);

      if (guest) {
        return createPublicRsvpSession(workspace, guest);
      }
    }

    return null;
  }

  async updatePublicRsvp(accessToken: string, input: UpdateGuestInput) {
    const state = await this.readState();

    for (const workspace of state.workspaces) {
      const guest = workspace.guests.find((entry) => entry.accessToken === accessToken);

      if (!guest) {
        continue;
      }

      applyGuestUpdate(guest, input);
      workspace.updatedAt = new Date().toISOString();
      workspace.guestSummary = summarizeGuests(workspace.guests);

      await this.writeState(state);
      return createPublicRsvpSession(workspace, guest);
    }

    return null;
  }

  async getPublicSiteSession(siteToken: string) {
    const state = await this.readState();

    for (const workspace of state.workspaces) {
      if (workspace.website.publicSiteToken === siteToken) {
        return createPublicSiteSession(workspace);
      }
    }

    return null;
  }

  async updateWebsite(workspaceId: string, input: UpdateWebsiteInput) {
    const state = await this.readState();
    const workspace = state.workspaces.find((entry) => entry.id === workspaceId);

    if (!workspace) {
      return null;
    }

    workspace.website = {
      ...workspace.website,
      ...input
    };
    workspace.updatedAt = new Date().toISOString();

    await this.writeState(state);
    return cloneWorkspace(workspace);
  }

  async updateVendor(workspaceId: string, vendorId: string, input: UpdateVendorInput) {
    const state = await this.readState();
    const workspace = state.workspaces.find((entry) => entry.id === workspaceId);

    if (!workspace) {
      return null;
    }

    const vendorEntry = workspace.vendorTracker.find((entry) => entry.vendorId === vendorId);

    if (!vendorEntry) {
      return null;
    }

    vendorEntry.stage = input.stage;
    vendorEntry.quoteAmount = input.quoteAmount;
    vendorEntry.note = input.note;
    if (typeof input.packageLabel !== "undefined") {
      vendorEntry.packageLabel = input.packageLabel;
    }
    if (typeof input.availability !== "undefined") {
      vendorEntry.availability = input.availability;
    }
    if (typeof input.contractStatus !== "undefined") {
      vendorEntry.contractStatus = input.contractStatus;
    }
    if (typeof input.paymentStatus !== "undefined") {
      vendorEntry.paymentStatus = input.paymentStatus;
    }
    if (typeof input.depositAmount !== "undefined") {
      vendorEntry.depositAmount = input.depositAmount;
    }
    if (typeof input.followUpOn !== "undefined") {
      vendorEntry.followUpOn = input.followUpOn;
    }
    vendorEntry.updatedAt = new Date().toISOString();
    workspace.updatedAt = vendorEntry.updatedAt;

    await this.writeState(state);
    return cloneWorkspace(workspace);
  }

  async addExpense(workspaceId: string, input: CreateExpenseInput) {
    const state = await this.readState();
    const workspace = state.workspaces.find((entry) => entry.id === workspaceId);

    if (!workspace) {
      return null;
    }

    const expense: PrototypeExpense = {
      id: randomUUID(),
      label: input.label,
      category: input.category,
      amount: input.amount,
      status: input.status,
      vendorName: input.vendorName
    };

    workspace.expenses.push(expense);
    workspace.updatedAt = new Date().toISOString();
    workspace.budgetOverview = calculateBudgetOverview(
      workspace.plan.budgetCategories,
      workspace.expenses
    );

    await this.writeState(state);
    return cloneWorkspace(workspace);
  }

  async setTaskCompletion(workspaceId: string, taskId: string, completed: boolean) {
    const state = await this.readState();
    const workspace = state.workspaces.find((entry) => entry.id === workspaceId);

    if (!workspace) {
      return null;
    }

    const task = workspace.tasks.find((entry) => entry.id === taskId);

    if (!task) {
      return null;
    }

    task.completed = completed;
    workspace.updatedAt = new Date().toISOString();
    workspace.progress = calculateProgress(workspace.tasks);

    await this.writeState(state);
    return cloneWorkspace(workspace);
  }
}

export function isCreateGuestInput(value: unknown): value is CreateGuestInput {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.name === "string" &&
    typeof candidate.household === "string" &&
    typeof candidate.email === "string" &&
    (typeof candidate.plusOneAllowed === "undefined" ||
      typeof candidate.plusOneAllowed === "boolean") &&
    (typeof candidate.childCount === "undefined" || typeof candidate.childCount === "number") &&
    (typeof candidate.songRequest === "undefined" || typeof candidate.songRequest === "string") &&
    Array.isArray(candidate.eventIds) &&
    candidate.eventIds.every((entry) => typeof entry === "string")
  );
}

export function isSetTaskCompletionInput(
  value: unknown
): value is Pick<PrototypeTask, "completed"> {
  if (!value || typeof value !== "object") {
    return false;
  }

  return typeof (value as Record<string, unknown>).completed === "boolean";
}

export function isUpdateGuestInput(value: unknown): value is UpdateGuestInput {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const status = candidate.rsvpStatus;
  const mealPreference = candidate.mealPreference;
  const hasKnownField =
    typeof status !== "undefined" ||
    typeof mealPreference !== "undefined" ||
    typeof candidate.dietaryNotes !== "undefined" ||
    typeof candidate.plusOneName !== "undefined" ||
    typeof candidate.childCount !== "undefined" ||
    typeof candidate.songRequest !== "undefined" ||
    typeof candidate.message !== "undefined";

  return (
    hasKnownField &&
    (typeof status === "undefined" ||
      status === "pending" ||
      status === "attending" ||
      status === "declined") &&
    (typeof mealPreference === "undefined" || isMealPreference(mealPreference)) &&
    (typeof candidate.dietaryNotes === "undefined" ||
      typeof candidate.dietaryNotes === "string") &&
    (typeof candidate.plusOneName === "undefined" ||
      typeof candidate.plusOneName === "string") &&
    (typeof candidate.childCount === "undefined" || typeof candidate.childCount === "number") &&
    (typeof candidate.songRequest === "undefined" || typeof candidate.songRequest === "string") &&
    (typeof candidate.message === "undefined" || typeof candidate.message === "string")
  );
}

export function isUpdateWebsiteInput(value: unknown): value is UpdateWebsiteInput {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.heroTitle === "string" &&
    typeof candidate.storyIntro === "string" &&
    typeof candidate.venueNote === "string" &&
    typeof candidate.travelNote === "string" &&
    typeof candidate.hotelNote === "string" &&
    typeof candidate.dressCode === "string" &&
    typeof candidate.rsvpDeadline === "string"
  );
}

export function isCreateExpenseInput(value: unknown): value is CreateExpenseInput {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const status = candidate.status;

  return (
    typeof candidate.label === "string" &&
    typeof candidate.category === "string" &&
    typeof candidate.amount === "number" &&
    (status === "planned" || status === "booked" || status === "paid") &&
    typeof candidate.vendorName === "string"
  );
}

export function isUpdateVendorInput(value: unknown): value is UpdateVendorInput {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const stage = candidate.stage;
  const quoteAmount = candidate.quoteAmount;
  const availability = candidate.availability;
  const contractStatus = candidate.contractStatus;
  const paymentStatus = candidate.paymentStatus;
  const depositAmount = candidate.depositAmount;
  const followUpOn = candidate.followUpOn;

  return (
    (stage === "suggested" ||
      stage === "contacted" ||
      stage === "quoted" ||
      stage === "booked" ||
      stage === "rejected") &&
    (quoteAmount === null || typeof quoteAmount === "number") &&
    typeof candidate.note === "string" &&
    (typeof candidate.packageLabel === "undefined" || typeof candidate.packageLabel === "string") &&
    (typeof availability === "undefined" ||
      availability === "unknown" ||
      availability === "requested" ||
      availability === "available" ||
      availability === "waitlist" ||
      availability === "unavailable") &&
    (typeof contractStatus === "undefined" ||
      contractStatus === "none" ||
      contractStatus === "received" ||
      contractStatus === "signed") &&
    (typeof paymentStatus === "undefined" ||
      paymentStatus === "none" ||
      paymentStatus === "deposit-due" ||
      paymentStatus === "deposit-paid" ||
      paymentStatus === "fully-paid") &&
    (typeof depositAmount === "undefined" ||
      depositAmount === null ||
      typeof depositAmount === "number") &&
    (typeof followUpOn === "undefined" || followUpOn === null || typeof followUpOn === "string")
  );
}
