import cors from "@fastify/cors";
import Fastify from "fastify";
import {
  continueWeddingConsultantConversation,
  createBootstrapPlan,
  isWeddingBootstrapInput,
  type PrototypeWorkspace,
  type WeddingConsultantTurn,
  type VendorSearchCategory
} from "@wedding/shared";
import {
  AiOrchestratorHttpClient,
  type AssistantChatMessage
} from "@wedding/ai-orchestrator";
import {
  createVendorConnectorPreview,
  type DirectoryDiscoveryResultInput,
  type GooglePlacesResultInput,
  type VendorWebsitePageInput
} from "@wedding/ingestion";
import {
  InMemoryPrototypeWorkspaceStore,
  isCreateExpenseInput,
  isCreateGuestInput,
  isSetTaskCompletionInput,
  isUpdateGuestInput,
  isUpdateVendorInput,
  type PrototypeWorkspaceStore
} from "./prototype-store";
import {
  InMemoryVendorRefreshStore,
  isVendorRefreshRequest,
  type VendorRefreshStore
} from "./vendor-refresh-store";

interface BuildAppOptions {
  workspaceStore?: PrototypeWorkspaceStore;
  vendorRefreshStore?: VendorRefreshStore;
  consultantResponder?: WeddingConsultantResponder;
}

interface WeddingConsultantReplyPayload {
  workspace: PrototypeWorkspace;
  currentTurn: WeddingConsultantTurn;
  messages: AssistantChatMessage[];
  userMessage: string;
}

interface WeddingConsultantResponse {
  turn: WeddingConsultantTurn;
  provider: "deterministic" | "ollama" | "fallback";
  model: string;
}

interface WeddingConsultantResponder {
  respond(payload: WeddingConsultantReplyPayload): Promise<WeddingConsultantResponse>;
}

export function shouldUseAiConsultantRewrite(
  userMessage: string,
  baselineTurn: WeddingConsultantTurn
) {
  const normalizedUserMessage = userMessage.toLowerCase();
  const asksForLongList =
    /liste|alle venues|alle locations|alle anbieter|zeige mir alle|gib mir alle|uebersicht/i.test(
      normalizedUserMessage
    );
  const baselineLooksListHeavy =
    baselineTurn.assistantMessage.length > 320 ||
    /(?:^|\n)\s*\d+\./.test(baselineTurn.assistantMessage) ||
    baselineTurn.assistantMessage.split(",").length >= 5;

  return !(asksForLongList && baselineLooksListHeavy);
}

class DeterministicWeddingConsultantResponder implements WeddingConsultantResponder {
  async respond(payload: WeddingConsultantReplyPayload): Promise<WeddingConsultantResponse> {
    return {
      turn: continueWeddingConsultantConversation(
        payload.workspace,
        payload.currentTurn.stepId,
        {
          text: payload.userMessage
        }
      ),
      provider: "deterministic",
      model: "rules"
    };
  }
}

class AiWeddingConsultantResponder implements WeddingConsultantResponder {
  private readonly client: AiOrchestratorHttpClient;

  constructor(baseUrl: string) {
    this.client = new AiOrchestratorHttpClient({ baseUrl });
  }

  async respond(payload: WeddingConsultantReplyPayload): Promise<WeddingConsultantResponse> {
    const baselineTurn = continueWeddingConsultantConversation(
      payload.workspace,
      payload.currentTurn.stepId,
      {
        text: payload.userMessage
      }
    );

    if (!shouldUseAiConsultantRewrite(payload.userMessage, baselineTurn)) {
      return {
        turn: baselineTurn,
        provider: "deterministic",
        model: "rules"
      };
    }

    const rewritten = await this.client.rewriteWeddingConsultantReply({
      workspace: payload.workspace,
      baselineTurn,
      messages: payload.messages,
      userMessage: payload.userMessage
    });

    return {
      turn: {
        ...baselineTurn,
        assistantMessage: rewritten.assistantMessage
      },
      provider:
        rewritten.provider === "ollama" ? "ollama" : "fallback",
      model: rewritten.model
    };
  }
}

function isAssistantChatMessage(value: unknown): value is AssistantChatMessage {
  return Boolean(
    value &&
      typeof value === "object" &&
      ((value as Record<string, unknown>).role === "assistant" ||
        (value as Record<string, unknown>).role === "user") &&
      typeof (value as Record<string, unknown>).content === "string"
  );
}

function isWeddingConsultantReplyPayload(
  value: unknown
): value is WeddingConsultantReplyPayload {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as Record<string, unknown>).workspace &&
      (value as Record<string, unknown>).currentTurn &&
      Array.isArray((value as Record<string, unknown>).messages) &&
      ((value as Record<string, unknown>).messages as unknown[]).every(
        isAssistantChatMessage
      ) &&
      typeof (value as Record<string, unknown>).userMessage === "string"
  );
}

export function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({ logger: false });
  const workspaceStore =
    options.workspaceStore ?? new InMemoryPrototypeWorkspaceStore();
  const vendorRefreshStore =
    options.vendorRefreshStore ?? new InMemoryVendorRefreshStore();
  const consultantResponder =
    options.consultantResponder ??
    (process.env.AI_ORCHESTRATOR_URL
      ? new AiWeddingConsultantResponder(process.env.AI_ORCHESTRATOR_URL)
      : new DeterministicWeddingConsultantResponder());

  app.register(cors, {
    origin: true
  });

  app.get("/health", async () => ({
    status: "ok"
  }));

  app.post("/planning/bootstrap", async (request, reply) => {
    if (!isWeddingBootstrapInput(request.body)) {
      return reply.code(400).send({
        error: "Invalid onboarding payload"
      });
    }

    return {
      plan: createBootstrapPlan(request.body)
    };
  });

  app.post("/prototype/consultant/reply", async (request, reply) => {
    if (!isWeddingConsultantReplyPayload(request.body)) {
      return reply.code(400).send({
        error: "Invalid consultant payload"
      });
    }

    const response = await consultantResponder.respond(request.body);
    return response;
  });

  app.post("/prototype/vendor-refresh-jobs", async (request, reply) => {
    if (!isVendorRefreshRequest(request.body)) {
      return reply.code(400).send({
        error: "Invalid vendor refresh payload"
      });
    }

    const job = await vendorRefreshStore.createJob(request.body);
    return reply.code(201).send({ job });
  });

  app.get("/prototype/vendor-refresh-jobs", async () => {
    const jobs = await vendorRefreshStore.listJobs();
    return { jobs };
  });

  app.get("/prototype/vendor-refresh-jobs/:id", async (request, reply) => {
    const params = request.params as { id: string };
    const job = await vendorRefreshStore.getJob(params.id);

    if (!job) {
      return reply.code(404).send({ error: "Vendor refresh job not found" });
    }

    return { job };
  });

  app.post("/prototype/vendor-refresh-jobs/:id/preview", async (request, reply) => {
    const params = request.params as { id: string };
    const job = await vendorRefreshStore.getJob(params.id);

    if (!job) {
      return reply.code(404).send({ error: "Vendor refresh job not found" });
    }

    if (!isVendorConnectorPreviewPayload(request.body)) {
      return reply.code(400).send({ error: "Invalid vendor connector preview payload" });
    }

    const preview = createVendorConnectorPreview({
      category: request.body.category,
      region: job.request.region,
      requestedAt: request.body.requestedAt,
      ...(request.body.directoryResults
        ? { directoryResults: request.body.directoryResults }
        : {}),
      ...(request.body.googlePlacesResults
        ? { googlePlacesResults: request.body.googlePlacesResults }
        : {}),
      ...(request.body.websitePages ? { websitePages: request.body.websitePages } : {})
    });

    return { preview };
  });

  app.post("/prototype/workspaces", async (request, reply) => {
    if (!isWeddingBootstrapInput(request.body)) {
      return reply.code(400).send({
        error: "Invalid onboarding payload"
      });
    }

    const workspace = await workspaceStore.createWorkspace(request.body);

    return reply.code(201).send({ workspace });
  });

  app.get("/prototype/workspaces", async () => {
    const profiles = await workspaceStore.listWorkspaces();

    return { profiles };
  });

  app.get("/prototype/workspaces/:id", async (request, reply) => {
    const params = request.params as { id: string };
    const workspace = await workspaceStore.getWorkspace(params.id);

    if (!workspace) {
      return reply.code(404).send({ error: "Workspace not found" });
    }

    return { workspace };
  });

  app.delete("/prototype/workspaces/:id", async (request, reply) => {
    const params = request.params as { id: string };
    const deleted = await workspaceStore.deleteWorkspace(params.id);

    if (!deleted) {
      return reply.code(404).send({ error: "Workspace not found" });
    }

    return reply.code(204).send();
  });

  app.patch("/prototype/workspaces/:id/onboarding", async (request, reply) => {
    const params = request.params as { id: string };

    if (!isWeddingBootstrapInput(request.body)) {
      return reply.code(400).send({
        error: "Invalid onboarding payload"
      });
    }

    const workspace = await workspaceStore.updateWorkspace(params.id, request.body);

    if (!workspace) {
      return reply.code(404).send({ error: "Workspace not found" });
    }

    return { workspace };
  });

  app.post("/prototype/workspaces/:id/guests", async (request, reply) => {
    const params = request.params as { id: string };

    if (!isCreateGuestInput(request.body)) {
      return reply.code(400).send({ error: "Invalid guest payload" });
    }

    const workspace = await workspaceStore.addGuest(params.id, request.body);

    if (!workspace) {
      return reply.code(404).send({ error: "Workspace not found" });
    }

    return reply.code(201).send({ workspace });
  });

  app.patch("/prototype/workspaces/:id/guests/:guestId", async (request, reply) => {
    const params = request.params as { id: string; guestId: string };

    if (!isUpdateGuestInput(request.body)) {
      return reply.code(400).send({ error: "Invalid guest update payload" });
    }

    const workspace = await workspaceStore.updateGuest(
      params.id,
      params.guestId,
      request.body
    );

    if (!workspace) {
      return reply.code(404).send({ error: "Workspace or guest not found" });
    }

    return { workspace };
  });

  app.get("/public/rsvp/:token", async (request, reply) => {
    const params = request.params as { token: string };
    const session = await workspaceStore.getPublicRsvpSession(params.token);

    if (!session) {
      return reply.code(404).send({ error: "Guest invitation not found" });
    }

    return session;
  });

  app.patch("/public/rsvp/:token", async (request, reply) => {
    const params = request.params as { token: string };

    if (!isUpdateGuestInput(request.body)) {
      return reply.code(400).send({ error: "Invalid public rsvp payload" });
    }

    const session = await workspaceStore.updatePublicRsvp(params.token, request.body);

    if (!session) {
      return reply.code(404).send({ error: "Guest invitation not found" });
    }

    return session;
  });

  app.post("/prototype/workspaces/:id/expenses", async (request, reply) => {
    const params = request.params as { id: string };

    if (!isCreateExpenseInput(request.body)) {
      return reply.code(400).send({ error: "Invalid expense payload" });
    }

    const workspace = await workspaceStore.addExpense(params.id, request.body);

    if (!workspace) {
      return reply.code(404).send({ error: "Workspace not found" });
    }

    return reply.code(201).send({ workspace });
  });

  app.patch("/prototype/workspaces/:id/vendors/:vendorId", async (request, reply) => {
    const params = request.params as { id: string; vendorId: string };

    if (!isUpdateVendorInput(request.body)) {
      return reply.code(400).send({ error: "Invalid vendor payload" });
    }

    const workspace = await workspaceStore.updateVendor(
      params.id,
      params.vendorId,
      request.body
    );

    if (!workspace) {
      return reply.code(404).send({ error: "Workspace or vendor not found" });
    }

    return { workspace };
  });

  app.patch("/prototype/workspaces/:id/tasks/:taskId", async (request, reply) => {
    const params = request.params as { id: string; taskId: string };

    if (!isSetTaskCompletionInput(request.body)) {
      return reply.code(400).send({ error: "Invalid task payload" });
    }

    const workspace = await workspaceStore.setTaskCompletion(
      params.id,
      params.taskId,
      request.body.completed
    );

    if (!workspace) {
      return reply.code(404).send({ error: "Workspace or task not found" });
    }

    return { workspace };
  });

  return app;
}

const vendorSearchCategories: VendorSearchCategory[] = [
  "venue",
  "photography",
  "catering",
  "music",
  "florals",
  "attire",
  "stationery",
  "cake",
  "transport",
  "lodging",
  "planner",
  "officiant",
  "videography",
  "photobooth",
  "magician",
  "live-artist",
  "childcare",
  "rentals"
];

function isVendorSearchCategory(value: unknown): value is VendorSearchCategory {
  return typeof value === "string" && vendorSearchCategories.includes(value as VendorSearchCategory);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isVendorConnectorPreviewPayload(
  value: unknown
): value is {
  category: VendorSearchCategory;
  requestedAt: string;
  directoryResults?: DirectoryDiscoveryResultInput[];
  googlePlacesResults?: GooglePlacesResultInput[];
  websitePages?: VendorWebsitePageInput[];
} {
  if (!isPlainObject(value)) {
    return false;
  }

  if (
    !isVendorSearchCategory(value.category) ||
    typeof value.requestedAt !== "string"
  ) {
    return false;
  }

  if (
    ("directoryResults" in value &&
      !isDirectoryDiscoveryResultInputArray(value.directoryResults)) ||
    ("googlePlacesResults" in value &&
      !isGooglePlacesResultInputArray(value.googlePlacesResults)) ||
    ("websitePages" in value && !isVendorWebsitePageInputArray(value.websitePages))
  ) {
    return false;
  }

  return true;
}

function isDirectoryDiscoveryResultInputArray(
  value: unknown
): value is DirectoryDiscoveryResultInput[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        isPlainObject(entry) &&
        typeof entry.title === "string" &&
        typeof entry.url === "string" &&
        typeof entry.directoryName === "string" &&
        (entry.location === undefined || typeof entry.location === "string") &&
        (entry.snippet === undefined || typeof entry.snippet === "string") &&
        (entry.rankingPosition === undefined || typeof entry.rankingPosition === "number")
    )
  );
}

function isGooglePlacesResultInputArray(
  value: unknown
): value is GooglePlacesResultInput[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        isPlainObject(entry) &&
        typeof entry.id === "string" &&
        (entry.displayName === undefined ||
          (isPlainObject(entry.displayName) &&
            (entry.displayName.text === undefined ||
              typeof entry.displayName.text === "string"))) &&
        (entry.formattedAddress === undefined || typeof entry.formattedAddress === "string") &&
        (entry.websiteUri === undefined || typeof entry.websiteUri === "string") &&
        (entry.nationalPhoneNumber === undefined ||
          typeof entry.nationalPhoneNumber === "string") &&
        (entry.googleMapsUri === undefined || typeof entry.googleMapsUri === "string") &&
        (entry.primaryType === undefined || typeof entry.primaryType === "string") &&
        (entry.types === undefined ||
          (Array.isArray(entry.types) &&
            entry.types.every((item) => typeof item === "string"))) &&
        (entry.location === undefined ||
          (isPlainObject(entry.location) &&
            (entry.location.latitude === undefined ||
              typeof entry.location.latitude === "number") &&
            (entry.location.longitude === undefined ||
              typeof entry.location.longitude === "number"))) &&
        (entry.rating === undefined || typeof entry.rating === "number") &&
        (entry.userRatingCount === undefined || typeof entry.userRatingCount === "number")
    )
  );
}

function isVendorWebsitePageInputArray(
  value: unknown
): value is VendorWebsitePageInput[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        isPlainObject(entry) &&
        typeof entry.url === "string" &&
        typeof entry.html === "string" &&
        typeof entry.fetchedAt === "string"
    )
  );
}
