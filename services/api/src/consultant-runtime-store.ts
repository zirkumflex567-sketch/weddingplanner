import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { PrototypeWorkspace, WeddingConsultantTurn } from "@wedding/shared";

export type ConsultantMessageRole = "assistant" | "user";
export type ConsultantAssistantMode = "consultant" | "operator";
export type ConsultantJobStatus = "pending" | "processing" | "completed" | "failed";

export interface ConsultantRuntimeMessage {
  id: string;
  role: ConsultantMessageRole;
  content: string;
  createdAt: string;
  assistantMode: ConsultantAssistantMode;
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
  status: ConsultantJobStatus;
  createdAt: string;
  updatedAt: string;
  triggerMessageId: string;
  requestedMode: ConsultantAssistantMode;
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

export interface ConsultantRuntimeStore {
  getSession(workspaceId: string): Promise<ConsultantSession | null>;
  appendMessage(input: {
    workspace: PrototypeWorkspace;
    workspaceId: string;
    role: ConsultantMessageRole;
    content: string;
    assistantMode: ConsultantAssistantMode;
    currentTurn?: WeddingConsultantTurn | null;
  }): Promise<ConsultantSession>;
  enqueueReplyJob(input: {
    workspace: PrototypeWorkspace;
    workspaceId: string;
    triggerMessageId: string;
    requestedMode: ConsultantAssistantMode;
    userMessage: string;
  }): Promise<ConsultantAgentJob>;
  completeReplyJob(input: {
    workspace: PrototypeWorkspace;
    workspaceId: string;
    jobId: string;
    status: Extract<ConsultantJobStatus, "completed" | "failed">;
  }): Promise<ConsultantAgentJob | null>;
  listJobs(status?: ConsultantJobStatus): Promise<ConsultantAgentJob[]>;
}

interface PersistedConsultantRuntimeState {
  sessions: ConsultantSession[];
}

function cloneSession(session: ConsultantSession): ConsultantSession {
  return structuredClone(session);
}

function normalizeAssistantMode(value: unknown): ConsultantAssistantMode {
  return value === "operator" ? "operator" : "consultant";
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function extractRecentPriorities(messages: ConsultantRuntimeMessage[]) {
  const recentUserMessages = messages
    .filter((message) => message.role === "user")
    .slice(-12)
    .map((message) => message.content);
  const priorities: string[] = [];

  for (const message of recentUserMessages) {
    const normalized = normalizeWhitespace(message);

    if (
      /(budget|kosten|preis|restspielraum|angebote?)/i.test(normalized) &&
      !priorities.includes("Budget und Kostenklarheit")
    ) {
      priorities.push("Budget und Kostenklarheit");
    }

    if (
      /(gast|gaeste|sitz|tisch|rsvp|einladung)/i.test(normalized) &&
      !priorities.includes("Gaeste, RSVPs und Seating")
    ) {
      priorities.push("Gaeste, RSVPs und Seating");
    }

    if (
      /(location|venue|schloss|hambacher|termin|datum)/i.test(normalized) &&
      !priorities.includes("Venue-Entscheidung und Termin")
    ) {
      priorities.push("Venue-Entscheidung und Termin");
    }

    if (
      /(vendor|anbieter|fotograf|cater|musik|dj|flor|styling)/i.test(normalized) &&
      !priorities.includes("Vendor-Auswahl und Anfragen")
    ) {
      priorities.push("Vendor-Auswahl und Anfragen");
    }
  }

  return priorities.slice(0, 5);
}

function extractRecentFacts(
  workspace: PrototypeWorkspace,
  messages: ConsultantRuntimeMessage[]
) {
  const facts = [
    `${workspace.coupleName} plant aktuell fuer ${workspace.onboarding.guestCountTarget} Personen in ${workspace.onboarding.region}.`,
    `Zieldatum ist ${workspace.onboarding.targetDate} bei einem Budget von ${workspace.onboarding.budgetTotal.toLocaleString("de-DE")} EUR.`,
    `Der Workspace enthaelt ${workspace.guests.length} angelegte Gaeste und ${workspace.vendorTracker.filter((entry) => entry.stage !== "suggested" && entry.stage !== "rejected").length} aktive Vendor-Vorgaenge.`
  ];
  const recentUserMessages = messages
    .filter((message) => message.role === "user")
    .slice(-10)
    .map((message) => normalizeWhitespace(message.content));

  for (const message of recentUserMessages) {
    const countMatch = message.match(/(\d+)\s*(?:erwachsene|kinder|gaeste|personen)/i);

    if (countMatch) {
      facts.push(`Im Chat wurde zuletzt mit Personenangaben wie "${countMatch[0]}" gearbeitet.`);
      break;
    }
  }

  return facts.slice(0, 6);
}

function extractDraftMentions(messages: ConsultantRuntimeMessage[]) {
  return messages
    .filter((message) => message.role === "assistant")
    .slice(-12)
    .map((message) => normalizeWhitespace(message.content))
    .filter((message) => /(anfrageentwurf|einladung|kontaktdaten|preisquelle)/i.test(message))
    .slice(-4);
}

function buildContext(
  workspace: PrototypeWorkspace,
  messages: ConsultantRuntimeMessage[]
): ConsultantWorkspaceContext {
  return {
    workspaceId: workspace.id,
    updatedAt: new Date().toISOString(),
    profile: {
      coupleName: workspace.coupleName,
      targetDate: workspace.onboarding.targetDate,
      region: workspace.onboarding.region,
      budgetTotal: workspace.onboarding.budgetTotal,
      guestCountTarget: workspace.onboarding.guestCountTarget,
      plannedEvents: [...workspace.onboarding.plannedEvents],
      disabledVendorCategories: [...(workspace.onboarding.disabledVendorCategories ?? [])]
    },
    planning: {
      openTaskTitles: workspace.tasks
        .filter((task) => !task.completed)
        .slice(0, 5)
        .map((task) => task.title),
      activeVenueNames: workspace.plan.vendorMatches
        .filter((vendor) => vendor.category === "venue")
        .slice(0, 4)
        .map((vendor) => vendor.name),
      trackedVendorCount: workspace.vendorTracker.filter(
        (entry) => entry.stage !== "suggested" && entry.stage !== "rejected"
      ).length,
      guestCountActual: workspace.guests.length,
      budgetRemaining: workspace.budgetOverview.overall.remaining
    },
    conversation: {
      lastUserMessages: messages
        .filter((message) => message.role === "user")
        .slice(-6)
        .map((message) => message.content),
      recentPriorities: extractRecentPriorities(messages),
      recentFacts: extractRecentFacts(workspace, messages),
      extractedDrafts: extractDraftMentions(messages)
    }
  };
}

function createSession(workspace: PrototypeWorkspace): ConsultantSession {
  const now = new Date().toISOString();
  const messages: ConsultantRuntimeMessage[] = [];

  return {
    workspaceId: workspace.id,
    createdAt: now,
    updatedAt: now,
    currentTurn: null,
    messages,
    context: buildContext(workspace, messages),
    jobs: []
  };
}

function upsertSession(
  state: PersistedConsultantRuntimeState,
  workspace: PrototypeWorkspace
): ConsultantSession {
  const existing =
    state.sessions.find((session) => session.workspaceId === workspace.id) ?? null;

  if (existing) {
    existing.context = buildContext(workspace, existing.messages);
    existing.updatedAt = new Date().toISOString();
    return existing;
  }

  const next = createSession(workspace);
  state.sessions.push(next);
  return next;
}

export class InMemoryConsultantRuntimeStore implements ConsultantRuntimeStore {
  private readonly state: PersistedConsultantRuntimeState = {
    sessions: []
  };

  async getSession(workspaceId: string) {
    const session = this.state.sessions.find((entry) => entry.workspaceId === workspaceId);
    return session ? cloneSession(session) : null;
  }

  async appendMessage(input: {
    workspace: PrototypeWorkspace;
    workspaceId: string;
    role: ConsultantMessageRole;
    content: string;
    assistantMode: ConsultantAssistantMode;
    currentTurn?: WeddingConsultantTurn | null;
  }) {
    const session = upsertSession(this.state, input.workspace);
    const createdAt = new Date().toISOString();

    session.messages.push({
      id: randomUUID(),
      role: input.role,
      content: input.content,
      createdAt,
      assistantMode: normalizeAssistantMode(input.assistantMode)
    });
    session.updatedAt = createdAt;
    session.currentTurn = input.currentTurn ?? session.currentTurn;
    session.context = buildContext(input.workspace, session.messages);

    return cloneSession(session);
  }

  async enqueueReplyJob(input: {
    workspace: PrototypeWorkspace;
    workspaceId: string;
    triggerMessageId: string;
    requestedMode: ConsultantAssistantMode;
    userMessage: string;
  }) {
    const session = upsertSession(this.state, input.workspace);
    const now = new Date().toISOString();
    const job: ConsultantAgentJob = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      status: "pending",
      createdAt: now,
      updatedAt: now,
      triggerMessageId: input.triggerMessageId,
      requestedMode: normalizeAssistantMode(input.requestedMode),
      kind: "reply",
      request: {
        userMessage: input.userMessage
      }
    };

    session.jobs.push(job);
    session.updatedAt = now;
    return structuredClone(job);
  }

  async completeReplyJob(input: {
    workspace: PrototypeWorkspace;
    workspaceId: string;
    jobId: string;
    status: Extract<ConsultantJobStatus, "completed" | "failed">;
  }) {
    const session = upsertSession(this.state, input.workspace);
    const job = session.jobs.find((entry) => entry.id === input.jobId);

    if (!job) {
      return null;
    }

    job.status = input.status;
    job.updatedAt = new Date().toISOString();
    session.updatedAt = job.updatedAt;
    session.context = buildContext(input.workspace, session.messages);

    return structuredClone(job);
  }

  async listJobs(status?: ConsultantJobStatus) {
    return this.state.sessions
      .flatMap((session) => session.jobs)
      .filter((job) => (status ? job.status === status : true))
      .map((job) => structuredClone(job));
  }
}

export class FileConsultantRuntimeStore implements ConsultantRuntimeStore {
  constructor(private readonly filePath: string) {}

  private async readState(): Promise<PersistedConsultantRuntimeState> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as PersistedConsultantRuntimeState;

      return {
        sessions: (parsed.sessions ?? []).map((session) => ({
          ...session,
          messages: (session.messages ?? []).map((message) => ({
            ...message,
            assistantMode: normalizeAssistantMode(message.assistantMode)
          })),
          jobs: session.jobs ?? []
        }))
      };
    } catch {
      return { sessions: [] };
    }
  }

  private async writeState(state: PersistedConsultantRuntimeState) {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(state, null, 2), "utf8");
  }

  async getSession(workspaceId: string) {
    const state = await this.readState();
    const session = state.sessions.find((entry) => entry.workspaceId === workspaceId);
    return session ? cloneSession(session) : null;
  }

  async appendMessage(input: {
    workspace: PrototypeWorkspace;
    workspaceId: string;
    role: ConsultantMessageRole;
    content: string;
    assistantMode: ConsultantAssistantMode;
    currentTurn?: WeddingConsultantTurn | null;
  }) {
    const state = await this.readState();
    const session = upsertSession(state, input.workspace);
    const createdAt = new Date().toISOString();

    session.messages.push({
      id: randomUUID(),
      role: input.role,
      content: input.content,
      createdAt,
      assistantMode: normalizeAssistantMode(input.assistantMode)
    });
    session.updatedAt = createdAt;
    session.currentTurn = input.currentTurn ?? session.currentTurn;
    session.context = buildContext(input.workspace, session.messages);
    await this.writeState(state);

    return cloneSession(session);
  }

  async enqueueReplyJob(input: {
    workspace: PrototypeWorkspace;
    workspaceId: string;
    triggerMessageId: string;
    requestedMode: ConsultantAssistantMode;
    userMessage: string;
  }) {
    const state = await this.readState();
    const session = upsertSession(state, input.workspace);
    const now = new Date().toISOString();
    const job: ConsultantAgentJob = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      status: "pending",
      createdAt: now,
      updatedAt: now,
      triggerMessageId: input.triggerMessageId,
      requestedMode: normalizeAssistantMode(input.requestedMode),
      kind: "reply",
      request: {
        userMessage: input.userMessage
      }
    };

    session.jobs.push(job);
    session.updatedAt = now;
    await this.writeState(state);
    return structuredClone(job);
  }

  async completeReplyJob(input: {
    workspace: PrototypeWorkspace;
    workspaceId: string;
    jobId: string;
    status: Extract<ConsultantJobStatus, "completed" | "failed">;
  }) {
    const state = await this.readState();
    const session = upsertSession(state, input.workspace);
    const job = session.jobs.find((entry) => entry.id === input.jobId);

    if (!job) {
      return null;
    }

    job.status = input.status;
    job.updatedAt = new Date().toISOString();
    session.updatedAt = job.updatedAt;
    session.context = buildContext(input.workspace, session.messages);
    await this.writeState(state);

    return structuredClone(job);
  }

  async listJobs(status?: ConsultantJobStatus) {
    const state = await this.readState();

    return state.sessions
      .flatMap((session) => session.jobs)
      .filter((job) => (status ? job.status === status : true))
      .map((job) => structuredClone(job));
  }
}
