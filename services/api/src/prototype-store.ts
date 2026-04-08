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
  summarizeGuests,
  type PlannedEventId,
  type PrototypeExpense,
  type PrototypeGuest,
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

const expenseCategories = new Set<PrototypeExpense["category"]>([
  "venue",
  "photography",
  "catering",
  "music",
  "florals",
  "attire",
  "stationery-admin"
]);

function normalizeExpenseInput(input: CreateExpenseInput): CreateExpenseInput {
  return {
    ...input,
    label: input.label.trim(),
    vendorName: input.vendorName.trim()
  };
}

export interface UpdateVendorInput {
  stage: PrototypeVendorStage;
  quoteAmount: number | null;
  note: string;
}

export interface PrototypeWorkspaceStore {
  listWorkspaces(
    ownerId: string,
    options?: { includeAll?: boolean; ownerEmailFilter?: string }
  ): Promise<Array<PrototypeWorkspaceProfile & { ownerEmail: string | null; ownerId: string | null }>>;
  createWorkspace(
    ownerId: string,
    input: WeddingBootstrapInput,
    ownerEmail?: string
  ): Promise<PrototypeWorkspace>;
  getWorkspace(ownerId: string, id: string): Promise<PrototypeWorkspace | null>;
  deleteWorkspace(ownerId: string, id: string): Promise<boolean>;
  updateWorkspace(
    ownerId: string,
    id: string,
    input: WeddingBootstrapInput
  ): Promise<PrototypeWorkspace | null>;
  addGuest(ownerId: string, id: string, input: CreateGuestInput): Promise<PrototypeWorkspace | null>;
  updateGuest(
    ownerId: string,
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
    ownerId: string,
    workspaceId: string,
    vendorId: string,
    input: UpdateVendorInput
  ): Promise<PrototypeWorkspace | null>;
  addExpense(
    ownerId: string,
    workspaceId: string,
    input: CreateExpenseInput
  ): Promise<PrototypeWorkspace | null>;
  setTaskCompletion(
    ownerId: string,
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
  return {
    guest: structuredClone(guest),
    context: {
      coupleName: workspace.coupleName,
      targetDate: workspace.onboarding.targetDate,
      region: workspace.onboarding.region,
      invitationCopy: workspace.onboarding.invitationCopy,
      invitedEvents: workspace.plan.eventBlueprints.filter((event) =>
        guest.eventIds.includes(event.id)
      )
    }
  };
}

function normalizeWorkspace(workspace: PrototypeWorkspace): PrototypeWorkspace {
  const plan = (() => {
    try {
      return createBootstrapPlan(workspace.onboarding);
    } catch {
      return workspace.plan;
    }
  })();
  const tasks = mergeTasks(workspace.tasks ?? [], createPrototypeTasks(plan));
  const guests = (workspace.guests ?? []).map((guest) => normalizeGuest(guest));
  const expenses = workspace.expenses ?? [];

  return {
    ...workspace,
    coupleName: workspace.onboarding.coupleName,
    plan,
    tasks,
    guests,
    guestSummary: summarizeGuests(guests),
    progress: calculateProgress(tasks),
    expenses,
    seatingPlan: workspace.seatingPlan ?? { tables: [] },
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
    seatingPlan: {
      tables: []
    },
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

const PROFILE_ACTIVE_CAP = 12;

function normalizeProfileField(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function buildDedupeKey(profile: PrototypeWorkspaceProfile): string | null {
  const normalizedCouple = normalizeProfileField(profile.coupleName);
  const normalizedTargetDate = normalizeProfileField(profile.targetDate);
  const normalizedRegion = normalizeProfileField(profile.region);

  if (!normalizedCouple || !normalizedTargetDate || !normalizedRegion) {
    return null;
  }

  return `${normalizedCouple}|${normalizedTargetDate}|${normalizedRegion}`;
}

function sortProfilesDeterministically(
  profiles: PrototypeWorkspaceProfile[]
): PrototypeWorkspaceProfile[] {
  return [...profiles].sort((left, right) => {
    const updatedDelta = right.updatedAt.localeCompare(left.updatedAt);

    if (updatedDelta !== 0) {
      return updatedDelta;
    }

    return left.id.localeCompare(right.id);
  });
}

function projectWorkspaceProfiles(
  profiles: PrototypeWorkspaceProfile[]
): PrototypeWorkspaceProfile[] {
  const sorted = sortProfilesDeterministically(profiles);
  const dedupeKeyCounts = new Map<string, number>();

  for (const profile of sorted) {
    const dedupeKey = buildDedupeKey(profile);

    if (!dedupeKey) {
      continue;
    }

    dedupeKeyCounts.set(dedupeKey, (dedupeKeyCounts.get(dedupeKey) ?? 0) + 1);
  }

  return sorted.map((profile, index) => {
    const dedupeKey = buildDedupeKey(profile);
    const dedupeCount = dedupeKey ? (dedupeKeyCounts.get(dedupeKey) ?? 0) : 0;
    const highConfidence = Boolean(dedupeKey);
    const isArchived = index >= PROFILE_ACTIVE_CAP;

    return {
      ...profile,
      hygiene: {
        lifecycleStatus: isArchived ? "archived" : "active",
        capReason: isArchived ? "archived-by-cap" : "within-cap",
        dedupeSafety: highConfidence && dedupeCount > 1 ? "merge-safe" : "non-merge-safe",
        dedupeConfidence: highConfidence ? "high" : "low",
        dedupeKey
      }
    };
  });
}

export class InMemoryPrototypeWorkspaceStore implements PrototypeWorkspaceStore {
  private readonly workspaces = new Map<string, PrototypeWorkspace>();
  private readonly workspaceOwners = new Map<string, string>();
  private readonly workspaceOwnerEmails = new Map<string, string>();

  async listWorkspaces(
    ownerId: string,
    options: { includeAll?: boolean; ownerEmailFilter?: string } = {}
  ) {
    const normalizedOwnerEmailFilter = options.ownerEmailFilter?.trim().toLowerCase();
    const visibleWorkspaces = [...this.workspaces.values()].filter((workspace) => {
      if (!options.includeAll && this.workspaceOwners.get(workspace.id) !== ownerId) {
        return false;
      }

      if (!normalizedOwnerEmailFilter) {
        return true;
      }

      const ownerEmail = this.workspaceOwnerEmails.get(workspace.id) ?? "";
      return ownerEmail.toLowerCase().includes(normalizedOwnerEmailFilter);
    });

    const projectedProfiles = projectWorkspaceProfiles(
      visibleWorkspaces.map((workspace) => createPrototypeWorkspaceProfile(workspace))
    );

    return projectedProfiles.map((profile) => ({
      ...profile,
      ownerId: this.workspaceOwners.get(profile.id) ?? null,
      ownerEmail: this.workspaceOwnerEmails.get(profile.id) ?? null
    }));
  }

  async createWorkspace(ownerId: string, input: WeddingBootstrapInput, ownerEmail?: string) {
    const workspace = createWorkspaceRecord(input);
    this.workspaces.set(workspace.id, workspace);
    this.workspaceOwners.set(workspace.id, ownerId);
    this.workspaceOwnerEmails.set(workspace.id, ownerEmail ?? "");
    return cloneWorkspace(workspace);
  }

  async getWorkspace(ownerId: string, id: string) {
    if (this.workspaceOwners.get(id) !== ownerId) {
      return null;
    }

    const workspace = this.workspaces.get(id);
    return workspace ? cloneWorkspace(workspace) : null;
  }

  async deleteWorkspace(ownerId: string, id: string) {
    if (this.workspaceOwners.get(id) !== ownerId) {
      return false;
    }

    this.workspaceOwners.delete(id);
    this.workspaceOwnerEmails.delete(id);
    return this.workspaces.delete(id);
  }

  async updateWorkspace(ownerId: string, id: string, input: WeddingBootstrapInput) {
    if (this.workspaceOwners.get(id) !== ownerId) {
      return null;
    }

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

  async addGuest(ownerId: string, id: string, input: CreateGuestInput) {
    if (this.workspaceOwners.get(id) !== ownerId) {
      return null;
    }

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

  async updateGuest(ownerId: string, workspaceId: string, guestId: string, input: UpdateGuestInput) {
    if (this.workspaceOwners.get(workspaceId) !== ownerId) {
      return null;
    }

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

  async updateVendor(ownerId: string, workspaceId: string, vendorId: string, input: UpdateVendorInput) {
    if (this.workspaceOwners.get(workspaceId) !== ownerId) {
      return null;
    }

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

  async addExpense(ownerId: string, workspaceId: string, input: CreateExpenseInput) {
    if (this.workspaceOwners.get(workspaceId) !== ownerId) {
      return null;
    }

    const workspace = this.workspaces.get(workspaceId);

    if (!workspace) {
      return null;
    }

    const normalizedInput = normalizeExpenseInput(input);

    const expense: PrototypeExpense = {
      id: randomUUID(),
      label: normalizedInput.label,
      category: normalizedInput.category,
      amount: normalizedInput.amount,
      status: normalizedInput.status,
      vendorName: normalizedInput.vendorName
    };

    workspace.expenses.push(expense);
    workspace.updatedAt = new Date().toISOString();
    workspace.budgetOverview = calculateBudgetOverview(
      workspace.plan.budgetCategories,
      workspace.expenses
    );

    return cloneWorkspace(workspace);
  }

  async setTaskCompletion(ownerId: string, workspaceId: string, taskId: string, completed: boolean) {
    if (this.workspaceOwners.get(workspaceId) !== ownerId) {
      return null;
    }

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
  workspaceOwners: Record<string, string>;
  workspaceOwnerEmails: Record<string, string>;
}

export class FilePrototypeWorkspaceStore implements PrototypeWorkspaceStore {
  constructor(private readonly filePath: string) {}

  private async readState(): Promise<PersistedPrototypeState> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as PersistedPrototypeState;
      const normalizedWorkspaces = (parsed.workspaces ?? []).map((workspace) =>
        normalizeWorkspace(workspace)
      );
      const workspaceOwners = { ...(parsed.workspaceOwners ?? {}) };
      const workspaceOwnerEmails = { ...(parsed.workspaceOwnerEmails ?? {}) };

      for (const workspace of normalizedWorkspaces) {
        if (!workspaceOwners[workspace.id]) {
          workspaceOwners[workspace.id] =
            process.env.NODE_ENV === "test" ? "test-user" : "legacy-unassigned";
        }

        if (!workspaceOwnerEmails[workspace.id]) {
          workspaceOwnerEmails[workspace.id] =
            process.env.NODE_ENV === "test" ? "test@example.com" : "legacy-unassigned@example.com";
        }
      }

      return {
        workspaces: normalizedWorkspaces,
        workspaceOwners,
        workspaceOwnerEmails
      };
    } catch {
      return { workspaces: [], workspaceOwners: {}, workspaceOwnerEmails: {} };
    }
  }

  private async writeState(state: PersistedPrototypeState) {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(state, null, 2), "utf8");
  }

  async listWorkspaces(
    ownerId: string,
    options: { includeAll?: boolean; ownerEmailFilter?: string } = {}
  ) {
    const state = await this.readState();
    const normalizedOwnerEmailFilter = options.ownerEmailFilter?.trim().toLowerCase();
    const visibleWorkspaces = state.workspaces.filter((workspace) => {
      if (!options.includeAll && state.workspaceOwners[workspace.id] !== ownerId) {
        return false;
      }

      if (!normalizedOwnerEmailFilter) {
        return true;
      }

      const ownerEmail = state.workspaceOwnerEmails[workspace.id] ?? "";
      return ownerEmail.toLowerCase().includes(normalizedOwnerEmailFilter);
    });

    const projectedProfiles = projectWorkspaceProfiles(
      visibleWorkspaces.map((workspace) => createPrototypeWorkspaceProfile(workspace))
    );

    return projectedProfiles.map((profile) => ({
      ...profile,
      ownerId: state.workspaceOwners[profile.id] ?? null,
      ownerEmail: state.workspaceOwnerEmails[profile.id] ?? null
    }));
  }

  async createWorkspace(ownerId: string, input: WeddingBootstrapInput, ownerEmail?: string) {
    const state = await this.readState();
    const workspace = createWorkspaceRecord(input);
    state.workspaces.push(workspace);
    state.workspaceOwners[workspace.id] = ownerId;
    state.workspaceOwnerEmails[workspace.id] = ownerEmail ?? "";
    await this.writeState(state);
    return cloneWorkspace(workspace);
  }

  async getWorkspace(ownerId: string, id: string) {
    const state = await this.readState();

    if (state.workspaceOwners[id] !== ownerId) {
      return null;
    }

    const workspace = state.workspaces.find((entry) => entry.id === id);
    return workspace ? cloneWorkspace(workspace) : null;
  }

  async deleteWorkspace(ownerId: string, id: string) {
    const state = await this.readState();

    if (state.workspaceOwners[id] !== ownerId) {
      return false;
    }

    const nextWorkspaces = state.workspaces.filter((entry) => entry.id !== id);

    if (nextWorkspaces.length === state.workspaces.length) {
      return false;
    }

    delete state.workspaceOwners[id];
    delete state.workspaceOwnerEmails[id];
    await this.writeState({
      workspaces: nextWorkspaces,
      workspaceOwners: state.workspaceOwners,
      workspaceOwnerEmails: state.workspaceOwnerEmails
    });
    return true;
  }

  async updateWorkspace(ownerId: string, id: string, input: WeddingBootstrapInput) {
    const state = await this.readState();

    if (state.workspaceOwners[id] !== ownerId) {
      return null;
    }

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

  async addGuest(ownerId: string, id: string, input: CreateGuestInput) {
    const state = await this.readState();

    if (state.workspaceOwners[id] !== ownerId) {
      return null;
    }

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

  async updateGuest(ownerId: string, workspaceId: string, guestId: string, input: UpdateGuestInput) {
    const state = await this.readState();

    if (state.workspaceOwners[workspaceId] !== ownerId) {
      return null;
    }

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

  async updateVendor(ownerId: string, workspaceId: string, vendorId: string, input: UpdateVendorInput) {
    const state = await this.readState();

    if (state.workspaceOwners[workspaceId] !== ownerId) {
      return null;
    }

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

  async addExpense(ownerId: string, workspaceId: string, input: CreateExpenseInput) {
    const state = await this.readState();

    if (state.workspaceOwners[workspaceId] !== ownerId) {
      return null;
    }

    const workspace = state.workspaces.find((entry) => entry.id === workspaceId);

    if (!workspace) {
      return null;
    }

    const normalizedInput = normalizeExpenseInput(input);

    const expense: PrototypeExpense = {
      id: randomUUID(),
      label: normalizedInput.label,
      category: normalizedInput.category,
      amount: normalizedInput.amount,
      status: normalizedInput.status,
      vendorName: normalizedInput.vendorName
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

  async setTaskCompletion(ownerId: string, workspaceId: string, taskId: string, completed: boolean) {
    const state = await this.readState();

    if (state.workspaceOwners[workspaceId] !== ownerId) {
      return null;
    }

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
    typeof status !== "undefined" ||
    typeof mealPreference !== "undefined" ||
    typeof candidate.dietaryNotes !== "undefined" ||
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
    candidate.label.trim().length > 0 &&
    typeof candidate.category === "string" &&
    expenseCategories.has(candidate.category as PrototypeExpense["category"]) &&
    typeof candidate.amount === "number" &&
    Number.isFinite(candidate.amount) &&
    candidate.amount > 0 &&
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
