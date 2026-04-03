import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  GuidedPlanningStepId,
  PrototypeWorkspace,
  WeddingConsultantTurn
} from "@wedding/shared";

export type ConsultationAssistantMode = "consultant" | "operator";

export interface ConsultantRuntimeMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
  createdAt: string;
  assistantMode: ConsultationAssistantMode;
}

export interface ConsultantWorkspaceContext {
  workspaceId: string;
  updatedAt: string;
  profile: {
    coupleName: string;
    targetDate: string;
    region: string;
    budgetTotal: number;
    guestCountTarget: number;
    plannedEvents: string[];
    disabledVendorCategories: string[];
  };
  planning: {
    openTaskTitles: string[];
    activeVenueNames: string[];
    trackedVendorCount: number;
    guestCountActual: number;
    budgetRemaining: number;
  };
  conversation: {
    lastUserMessages: string[];
    recentPriorities: string[];
    recentFacts: string[];
    extractedDrafts: string[];
  };
}

export interface ConsultantAgentJob {
  id: string;
  workspaceId: string;
  status: "pending" | "processing" | "completed" | "failed";
  createdAt: string;
  updatedAt: string;
  triggerMessageId: string;
  requestedMode: ConsultationAssistantMode;
  kind: "reply";
  request: {
    userMessage: string;
  };
}

export interface ConsultantSession {
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
  currentTurn: WeddingConsultantTurn | null;
  messages: ConsultantRuntimeMessage[];
  context: ConsultantWorkspaceContext;
  jobs: ConsultantAgentJob[];
}

export interface ConsultantSessionStore {
  getSession(workspaceId: string): Promise<ConsultantSession | null>;
  saveSession(session: ConsultantSession): Promise<ConsultantSession>;
  listJobs(
    status?: ConsultantAgentJob["status"]
  ): Promise<ConsultantAgentJob[]>;
}

interface PersistedConsultantState {
  sessions: ConsultantSession[];
}

function cloneSession(session: ConsultantSession): ConsultantSession {
  return structuredClone(session);
}

function createRecentFacts(workspace: PrototypeWorkspace): string[] {
  return [
    `Region: ${workspace.onboarding.region}`,
    `Datum: ${workspace.onboarding.targetDate}`,
    `Gästeziel: ${workspace.onboarding.guestCountTarget}`,
    `Budget: ${workspace.onboarding.budgetTotal.toLocaleString("de-DE")} EUR`
  ];
}

function createExtractedDrafts(messages: ConsultantRuntimeMessage[]): string[] {
  return messages
    .filter((entry) => entry.role === "user")
    .map((entry) => entry.content.trim())
    .filter((entry) =>
      /wir (wollen|möchten|brauchen|müssen)|bitte|lass uns/i.test(entry)
    )
    .slice(-3);
}

function getVenueName(workspace: PrototypeWorkspace, vendorId: string) {
  return workspace.plan.vendorMatches.find((vendor) => vendor.id === vendorId)?.name;
}

function createConversationContext(
  workspace: PrototypeWorkspace,
  messages: ConsultantRuntimeMessage[]
): ConsultantWorkspaceContext {
  const activeVenueNames = workspace.vendorTracker
    .filter(
      (entry) =>
        entry.stage !== "suggested" &&
        entry.stage !== "rejected" &&
        workspace.plan.vendorMatches.some(
          (vendor) => vendor.id === entry.vendorId && vendor.category === "venue"
        )
    )
    .map((entry) => getVenueName(workspace, entry.vendorId))
    .filter((name): name is string => Boolean(name))
    .slice(0, 5);
  const openTaskTitles = workspace.tasks
    .filter((task) => !task.completed)
    .map((task) => task.title)
    .slice(0, 5);
  const lastUserMessages = messages
    .filter((entry) => entry.role === "user")
    .map((entry) => entry.content)
    .slice(-3);

  return {
    workspaceId: workspace.id,
    updatedAt: new Date().toISOString(),
    profile: {
      coupleName: workspace.coupleName,
      targetDate: workspace.onboarding.targetDate,
      region: workspace.onboarding.region,
      budgetTotal: workspace.onboarding.budgetTotal,
      guestCountTarget: workspace.onboarding.guestCountTarget,
      plannedEvents: workspace.onboarding.plannedEvents,
      disabledVendorCategories: workspace.onboarding.disabledVendorCategories ?? []
    },
    planning: {
      openTaskTitles,
      activeVenueNames,
      trackedVendorCount: workspace.vendorTracker.filter(
        (entry) => entry.stage !== "suggested" && entry.stage !== "rejected"
      ).length,
      guestCountActual: workspace.guests.length,
      budgetRemaining: workspace.budgetOverview.overall.remaining
    },
    conversation: {
      lastUserMessages,
      recentPriorities: openTaskTitles.slice(0, 3),
      recentFacts: createRecentFacts(workspace),
      extractedDrafts: createExtractedDrafts(messages)
    }
  };
}

export function createInitialSession(
  workspace: PrototypeWorkspace,
  openingTurn: WeddingConsultantTurn
): ConsultantSession {
  const now = new Date().toISOString();
  const messages: ConsultantRuntimeMessage[] = [
    {
      id: crypto.randomUUID(),
      role: "assistant",
      content: openingTurn.assistantMessage,
      createdAt: now,
      assistantMode: "consultant"
    }
  ];

  return {
    workspaceId: workspace.id,
    createdAt: now,
    updatedAt: now,
    currentTurn: openingTurn,
    messages,
    context: createConversationContext(workspace, messages),
    jobs: []
  };
}

export function appendConsultantTurn(input: {
  session: ConsultantSession;
  workspace: PrototypeWorkspace;
  userMessage: string;
  assistantMode: ConsultationAssistantMode;
  turn: WeddingConsultantTurn;
}): {
  session: ConsultantSession;
  job: ConsultantAgentJob;
} {
  const now = new Date().toISOString();
  const userEntry: ConsultantRuntimeMessage = {
    id: crypto.randomUUID(),
    role: "user",
    content: input.userMessage,
    createdAt: now,
    assistantMode: input.assistantMode
  };
  const assistantEntry: ConsultantRuntimeMessage = {
    id: crypto.randomUUID(),
    role: "assistant",
    content: input.turn.assistantMessage,
    createdAt: now,
    assistantMode: input.assistantMode
  };
  const job: ConsultantAgentJob = {
    id: crypto.randomUUID(),
    workspaceId: input.workspace.id,
    status: "completed",
    createdAt: now,
    updatedAt: now,
    triggerMessageId: userEntry.id,
    requestedMode: input.assistantMode,
    kind: "reply",
    request: {
      userMessage: input.userMessage
    }
  };
  const messages = [...input.session.messages, userEntry, assistantEntry].slice(-60);
  const nextSession: ConsultantSession = {
    ...input.session,
    updatedAt: now,
    currentTurn: input.turn,
    messages,
    context: createConversationContext(input.workspace, messages),
    jobs: [...input.session.jobs, job].slice(-40)
  };

  return {
    session: nextSession,
    job
  };
}

export class InMemoryConsultantSessionStore implements ConsultantSessionStore {
  private readonly sessions = new Map<string, ConsultantSession>();

  async getSession(workspaceId: string) {
    const session = this.sessions.get(workspaceId);
    return session ? cloneSession(session) : null;
  }

  async saveSession(session: ConsultantSession) {
    this.sessions.set(session.workspaceId, cloneSession(session));
    return cloneSession(session);
  }

  async listJobs(status?: ConsultantAgentJob["status"]) {
    const jobs = [...this.sessions.values()]
      .flatMap((session) => session.jobs)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    return status ? jobs.filter((job) => job.status === status) : jobs;
  }
}

export class FileConsultantSessionStore implements ConsultantSessionStore {
  constructor(private readonly filePath: string) {}

  private async readState(): Promise<PersistedConsultantState> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as PersistedConsultantState;
      return {
        sessions: parsed.sessions ?? []
      };
    } catch {
      return { sessions: [] };
    }
  }

  private async writeState(state: PersistedConsultantState) {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(state, null, 2), "utf8");
  }

  async getSession(workspaceId: string) {
    const state = await this.readState();
    const session = state.sessions.find((entry) => entry.workspaceId === workspaceId);
    return session ? cloneSession(session) : null;
  }

  async saveSession(session: ConsultantSession) {
    const state = await this.readState();
    const nextSessions = state.sessions.filter(
      (entry) => entry.workspaceId !== session.workspaceId
    );
    nextSessions.push(cloneSession(session));
    await this.writeState({ sessions: nextSessions });
    return cloneSession(session);
  }

  async listJobs(status?: ConsultantAgentJob["status"]) {
    const state = await this.readState();
    const jobs = state.sessions
      .flatMap((session) => session.jobs ?? [])
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    return status ? jobs.filter((job) => job.status === status) : jobs;
  }
}

export function isGuidedPlanningStepId(value: unknown): value is GuidedPlanningStepId {
  return (
    value === "foundation" ||
    value === "venue-and-date" ||
    value === "core-vendors" ||
    value === "guest-experience" ||
    value === "legal-admin" ||
    value === "final-control-room"
  );
}
