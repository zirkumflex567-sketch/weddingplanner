import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import {
  calculateBudgetOverview,
  calculateProgress,
  createBootstrapPlan,
  createPrototypeWorkspaceProfile,
  createPrototypeTasks,
  createPrototypeVendorTracker,
  mergePrototypeVendorTracker,
  normalizeWeddingBootstrapInput,
  summarizeGuests,
  type PlannedEventId,
  type PrototypeExpense,
  type PrototypeGuest,
  type PrototypeSeatTable,
  type PrototypeTableShape,
  type PrototypeMealPreference,
  type PrototypePublicRsvpSession,
  type PrototypeTask,
  type PrototypeVendorStage,
  type PrototypeWorkspaceProfile,
  type PrototypeWorkspace,
  type WeddingBootstrapInput
} from "@wedding/shared";

export interface CreateGuestInput {
  name: string;
  household: string;
  email: string;
  eventIds: PlannedEventId[];
}

export interface UpdateGuestInput {
  name?: string;
  household?: string;
  email?: string;
  eventIds?: PlannedEventId[];
  rsvpStatus?: PrototypeGuest["rsvpStatus"];
  mealPreference?: PrototypeGuest["mealPreference"];
  dietaryNotes?: string;
  message?: string;
}

export interface CreateExpenseInput {
  label: string;
  category: PrototypeExpense["category"];
  amount: number;
  status: PrototypeExpense["status"];
  vendorName: string;
}

export interface CreateSeatTableInput {
  name: string;
  shape: PrototypeTableShape;
  capacity: number;
}

export interface UpdateSeatTableInput {
  name?: string;
  shape?: PrototypeTableShape;
  capacity?: number;
}

export interface UpdateVendorInput {
  stage: PrototypeVendorStage;
  quoteAmount: number | null;
  note: string;
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
  updateVendor(
    workspaceId: string,
    vendorId: string,
    input: UpdateVendorInput
  ): Promise<PrototypeWorkspace | null>;
  addExpense(
    workspaceId: string,
    input: CreateExpenseInput
  ): Promise<PrototypeWorkspace | null>;
  addSeatTable(
    workspaceId: string,
    input: CreateSeatTableInput
  ): Promise<PrototypeWorkspace | null>;
  updateSeatTable(
    workspaceId: string,
    tableId: string,
    input: UpdateSeatTableInput
  ): Promise<PrototypeWorkspace | null>;
  assignGuestToSeatTable(
    workspaceId: string,
    guestId: string,
    tableId: string | null
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
    mealPreference: isMealPreference(guest.mealPreference)
      ? guest.mealPreference
      : "undecided",
    dietaryNotes: typeof guest.dietaryNotes === "string" ? guest.dietaryNotes : "",
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
    rsvpStatus: "pending",
    mealPreference: "undecided",
    dietaryNotes: "",
    message: "",
    eventIds: input.eventIds
  };
}

function applyGuestUpdate(guest: PrototypeGuest, input: UpdateGuestInput) {
  if (typeof input.name !== "undefined") {
    guest.name = input.name;
  }

  if (typeof input.household !== "undefined") {
    guest.household = input.household;
  }

  if (typeof input.email !== "undefined") {
    guest.email = input.email;
  }

  if (typeof input.eventIds !== "undefined") {
    guest.eventIds = input.eventIds;
  }

  if (typeof input.rsvpStatus !== "undefined") {
    guest.rsvpStatus = input.rsvpStatus;
  }

  if (typeof input.mealPreference !== "undefined") {
    guest.mealPreference = input.mealPreference;
  }

  if (typeof input.dietaryNotes !== "undefined") {
    guest.dietaryNotes = input.dietaryNotes;
  }

  if (typeof input.message !== "undefined") {
    guest.message = input.message;
  }
}

function createPublicRsvpSession(
  workspace: PrototypeWorkspace,
  guest: PrototypeGuest
): PrototypePublicRsvpSession {
  const seatingAssignment =
    workspace.seatingPlan.tables.find((table) => table.guestIds.includes(guest.id)) ?? null;
  const primaryVenue =
    workspace.plan.vendorMatches.find(
      (vendor) =>
        vendor.category === "venue" &&
        workspace.vendorTracker.some(
          (entry) => entry.vendorId === vendor.id && entry.stage === "booked"
        )
    ) ??
    workspace.plan.vendorMatches.find((vendor) => vendor.category === "venue") ??
    null;
  const fallbackDestination = [primaryVenue?.addressLine, primaryVenue?.postalCode, primaryVenue?.city]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(", ");
  const destination = primaryVenue?.addressLine ?? fallbackDestination;
  const staySuggestions = workspace.plan.vendorMatches
    .filter((vendor) => {
      const haystack = [vendor.name, vendor.serviceLabel, vendor.reasonSummary]
        .filter(Boolean)
        .join(" ");
      return /hotel|uebernacht|ubernacht|schlosshotel|guesthouse|hof/i.test(haystack);
    })
    .slice(0, 3)
    .map((vendor) => ({
      name: vendor.name,
      note:
        vendor.serviceLabel ??
        vendor.reasonSummary ??
        "Moegliche Uebernachtung in der Naehe der Feier.",
      ...(vendor.websiteUrl ? { url: vendor.websiteUrl } : {})
    }));

  return {
    guest: structuredClone(guest),
    context: {
      coupleName: workspace.coupleName,
      targetDate: workspace.onboarding.targetDate,
      region: workspace.onboarding.region,
      invitedEvents: workspace.plan.eventBlueprints.filter((event) =>
        guest.eventIds.includes(event.id)
      ),
      invitationCopy: workspace.onboarding.invitationCopy,
      ...(seatingAssignment
        ? {
            seatingAssignment: {
              tableName: seatingAssignment.name,
              tableShape: seatingAssignment.shape
            }
          }
        : {}),
      ...(destination
        ? {
            routePlanningLink:
              primaryVenue?.mapsUrl ??
              `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`
          }
        : {}),
      ...(staySuggestions.length > 0 ? { staySuggestions } : {})
    }
  };
}

function normalizeWorkspace(workspace: PrototypeWorkspace): PrototypeWorkspace {
  const onboarding = normalizeWeddingBootstrapInput(workspace.onboarding);
  const plan = createBootstrapPlan(onboarding);
  const tasks = mergeTasks(workspace.tasks ?? [], createPrototypeTasks(plan));
  const guests = (workspace.guests ?? []).map((guest) => normalizeGuest(guest));
  const expenses = workspace.expenses ?? [];
  const seatingPlan = workspace.seatingPlan ?? { tables: [] };

  return {
    ...workspace,
    coupleName: onboarding.coupleName,
    onboarding,
    plan,
    tasks,
    guests,
    guestSummary: summarizeGuests(guests),
    progress: calculateProgress(tasks),
    expenses,
    seatingPlan,
    vendorTracker: mergePrototypeVendorTracker(
      workspace.vendorTracker ?? [],
      plan.vendorMatches,
      workspace.updatedAt
    ),
    budgetOverview:
      workspace.budgetOverview ??
      calculateBudgetOverview(plan.budgetCategories, expenses)
  };
}

function createWorkspaceRecord(input: WeddingBootstrapInput): PrototypeWorkspace {
  const now = new Date().toISOString();
  const onboarding = normalizeWeddingBootstrapInput(input);
  const plan = createBootstrapPlan(onboarding);
  const tasks = createPrototypeTasks(plan);

  return {
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    coupleName: onboarding.coupleName,
    onboarding: structuredClone(onboarding),
    plan,
    tasks,
    guests: [],
    guestSummary: summarizeGuests([]),
    progress: calculateProgress(tasks),
    expenses: [],
    seatingPlan: {
      tables: []
    },
    vendorTracker: createPrototypeVendorTracker(plan.vendorMatches, now),
    budgetOverview: calculateBudgetOverview(plan.budgetCategories, [])
  };
}

function createSeatTableRecord(input: CreateSeatTableInput): PrototypeSeatTable {
  return {
    id: randomUUID(),
    name: input.name,
    shape: input.shape,
    capacity: input.capacity,
    guestIds: []
  };
}

function removeGuestFromAllTables(workspace: PrototypeWorkspace, guestId: string) {
  for (const table of workspace.seatingPlan.tables) {
    table.guestIds = table.guestIds.filter((entry) => entry !== guestId);
  }
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

    const onboarding = normalizeWeddingBootstrapInput(input);
    const plan = createBootstrapPlan(onboarding);
    const tasks = mergeTasks(workspace.tasks, createPrototypeTasks(plan));

    workspace.updatedAt = new Date().toISOString();
    workspace.coupleName = onboarding.coupleName;
    workspace.onboarding = structuredClone(onboarding);
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

  async addSeatTable(workspaceId: string, input: CreateSeatTableInput) {
    const workspace = this.workspaces.get(workspaceId);

    if (!workspace) {
      return null;
    }

    workspace.seatingPlan.tables.push(createSeatTableRecord(input));
    workspace.updatedAt = new Date().toISOString();

    return cloneWorkspace(workspace);
  }

  async updateSeatTable(workspaceId: string, tableId: string, input: UpdateSeatTableInput) {
    const workspace = this.workspaces.get(workspaceId);

    if (!workspace) {
      return null;
    }

    const table = workspace.seatingPlan.tables.find((entry) => entry.id === tableId);

    if (!table) {
      return null;
    }

    if (typeof input.name === "string") {
      table.name = input.name;
    }

    if (input.shape === "round" || input.shape === "rect") {
      table.shape = input.shape;
    }

    if (typeof input.capacity === "number" && Number.isFinite(input.capacity) && input.capacity > 0) {
      table.capacity = input.capacity;
      table.guestIds = table.guestIds.slice(0, input.capacity);
    }

    workspace.updatedAt = new Date().toISOString();
    return cloneWorkspace(workspace);
  }

  async assignGuestToSeatTable(workspaceId: string, guestId: string, tableId: string | null) {
    const workspace = this.workspaces.get(workspaceId);

    if (!workspace) {
      return null;
    }

    const guest = workspace.guests.find((entry) => entry.id === guestId);

    if (!guest) {
      return null;
    }

    removeGuestFromAllTables(workspace, guestId);

    if (tableId) {
      const table = workspace.seatingPlan.tables.find((entry) => entry.id === tableId);

      if (!table) {
        return null;
      }

      if (!table.guestIds.includes(guestId) && table.guestIds.length < table.capacity) {
        table.guestIds.push(guestId);
      }
    }

    workspace.updatedAt = new Date().toISOString();
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

  async addSeatTable(workspaceId: string, input: CreateSeatTableInput) {
    const state = await this.readState();
    const workspace = state.workspaces.find((entry) => entry.id === workspaceId);

    if (!workspace) {
      return null;
    }

    workspace.seatingPlan.tables.push(createSeatTableRecord(input));
    workspace.updatedAt = new Date().toISOString();

    await this.writeState(state);
    return cloneWorkspace(workspace);
  }

  async updateSeatTable(workspaceId: string, tableId: string, input: UpdateSeatTableInput) {
    const state = await this.readState();
    const workspace = state.workspaces.find((entry) => entry.id === workspaceId);

    if (!workspace) {
      return null;
    }

    const table = workspace.seatingPlan.tables.find((entry) => entry.id === tableId);

    if (!table) {
      return null;
    }

    if (typeof input.name === "string") {
      table.name = input.name;
    }

    if (input.shape === "round" || input.shape === "rect") {
      table.shape = input.shape;
    }

    if (typeof input.capacity === "number" && Number.isFinite(input.capacity) && input.capacity > 0) {
      table.capacity = input.capacity;
      table.guestIds = table.guestIds.slice(0, input.capacity);
    }

    workspace.updatedAt = new Date().toISOString();
    await this.writeState(state);
    return cloneWorkspace(workspace);
  }

  async assignGuestToSeatTable(workspaceId: string, guestId: string, tableId: string | null) {
    const state = await this.readState();
    const workspace = state.workspaces.find((entry) => entry.id === workspaceId);

    if (!workspace) {
      return null;
    }

    const guest = workspace.guests.find((entry) => entry.id === guestId);

    if (!guest) {
      return null;
    }

    removeGuestFromAllTables(workspace, guestId);

    if (tableId) {
      const table = workspace.seatingPlan.tables.find((entry) => entry.id === tableId);

      if (!table) {
        return null;
      }

      if (!table.guestIds.includes(guestId) && table.guestIds.length < table.capacity) {
        table.guestIds.push(guestId);
      }
    }

    workspace.updatedAt = new Date().toISOString();
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

    const onboarding = normalizeWeddingBootstrapInput(input);
    const plan = createBootstrapPlan(onboarding);
    const tasks = mergeTasks(workspace.tasks, createPrototypeTasks(plan));

    workspace.updatedAt = new Date().toISOString();
    workspace.coupleName = onboarding.coupleName;
    workspace.onboarding = structuredClone(onboarding);
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
    typeof candidate.name !== "undefined" ||
    typeof candidate.household !== "undefined" ||
    typeof candidate.email !== "undefined" ||
    typeof candidate.eventIds !== "undefined" ||
    typeof status !== "undefined" ||
    typeof mealPreference !== "undefined" ||
    typeof candidate.dietaryNotes !== "undefined" ||
    typeof candidate.message !== "undefined";

  return (
    hasKnownField &&
    (typeof candidate.name === "undefined" || typeof candidate.name === "string") &&
    (typeof candidate.household === "undefined" ||
      typeof candidate.household === "string") &&
    (typeof candidate.email === "undefined" || typeof candidate.email === "string") &&
    (typeof candidate.eventIds === "undefined" ||
      (Array.isArray(candidate.eventIds) &&
        candidate.eventIds.every((entry) => typeof entry === "string"))) &&
    (typeof status === "undefined" ||
      status === "pending" ||
      status === "attending" ||
      status === "declined") &&
    (typeof mealPreference === "undefined" || isMealPreference(mealPreference)) &&
    (typeof candidate.dietaryNotes === "undefined" ||
      typeof candidate.dietaryNotes === "string") &&
    (typeof candidate.message === "undefined" || typeof candidate.message === "string")
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

  return (
    (stage === "suggested" ||
      stage === "contacted" ||
      stage === "quoted" ||
      stage === "booked" ||
      stage === "rejected") &&
    (quoteAmount === null || typeof quoteAmount === "number") &&
    typeof candidate.note === "string"
  );
}

