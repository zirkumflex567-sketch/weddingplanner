import cors from "@fastify/cors";
import Fastify from "fastify";
import {
  continueWeddingConsultantConversation,
  createWeddingConsultantOpening,
  createBootstrapPlan,
  isWeddingBootstrapInput,
  type GuidedPlanningStepId,
  type VendorSearchCategory
} from "@wedding/shared";
import {
  createVendorConnectorPreview,
  createVendorRefreshExecutor,
  type DirectoryDiscoveryResultInput,
  type GooglePlacesResultInput,
  type VendorRefreshExecutor,
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
  appendConsultantTurn,
  createInitialSession,
  InMemoryConsultantSessionStore,
  isGuidedPlanningStepId,
  type ConsultationAssistantMode,
  type ConsultantSessionStore
} from "./consultant-session-store";
import {
  InMemoryVendorRefreshStore,
  isVendorRefreshRequest,
  type VendorRefreshStore
} from "./vendor-refresh-store";

interface BuildAppOptions {
  workspaceStore?: PrototypeWorkspaceStore;
  vendorRefreshStore?: VendorRefreshStore;
  vendorRefreshExecutor?: VendorRefreshExecutor;
  consultantSessionStore?: ConsultantSessionStore;
}

export function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({ logger: false });
  const workspaceStore =
    options.workspaceStore ?? new InMemoryPrototypeWorkspaceStore();
  const vendorRefreshStore =
    options.vendorRefreshStore ?? new InMemoryVendorRefreshStore();
  const vendorRefreshExecutor =
    options.vendorRefreshExecutor ?? createVendorRefreshExecutor();
  const consultantSessionStore =
    options.consultantSessionStore ?? new InMemoryConsultantSessionStore();

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

  app.post("/prototype/vendor-refresh-jobs/:id/runs", async (request, reply) => {
    const params = request.params as { id: string };
    const job = await vendorRefreshStore.getJob(params.id);

    if (!job) {
      return reply.code(404).send({ error: "Vendor refresh job not found" });
    }

    if (!isVendorRefreshRunRequest(request.body)) {
      return reply.code(400).send({ error: "Invalid vendor refresh run payload" });
    }

    if (!job.request.categories.includes(request.body.category)) {
      return reply.code(400).send({
        error: "Requested run category is not part of the paid vendor refresh job"
      });
    }

    const run = await vendorRefreshExecutor.executeJobRun({
      job,
      category: request.body.category
    });
    const savedRun = await vendorRefreshStore.saveRun(run);

    return reply.code(201).send({ run: savedRun });
  });

  app.get("/prototype/vendor-refresh-jobs/:id/runs", async (request, reply) => {
    const params = request.params as { id: string };
    const job = await vendorRefreshStore.getJob(params.id);

    if (!job) {
      return reply.code(404).send({ error: "Vendor refresh job not found" });
    }

    const runs = await vendorRefreshStore.listRuns(params.id);
    return { runs };
  });

  app.get("/prototype/vendor-refresh-jobs/:id/runs/:runId", async (request, reply) => {
    const params = request.params as { id: string; runId: string };
    const job = await vendorRefreshStore.getJob(params.id);

    if (!job) {
      return reply.code(404).send({ error: "Vendor refresh job not found" });
    }

    const run = await vendorRefreshStore.getRun(params.id, params.runId);

    if (!run) {
      return reply.code(404).send({ error: "Vendor refresh run not found" });
    }

    return { run };
  });

  app.get("/prototype/vendor-refresh-jobs/:id/candidates", async (request, reply) => {
    const params = request.params as { id: string };
    const job = await vendorRefreshStore.getJob(params.id);

    if (!job) {
      return reply.code(404).send({ error: "Vendor refresh job not found" });
    }

    const candidates = await vendorRefreshStore.listCandidates(params.id);
    return { candidates };
  });

  app.patch("/prototype/vendor-refresh-jobs/:id/candidates/:candidateId", async (request, reply) => {
    const params = request.params as { id: string; candidateId: string };
    const job = await vendorRefreshStore.getJob(params.id);

    if (!job) {
      return reply.code(404).send({ error: "Vendor refresh job not found" });
    }

    if (!isVendorReviewDecisionRequest(request.body)) {
      return reply.code(400).send({ error: "Invalid review decision payload" });
    }

    const candidate = await vendorRefreshStore.updateCandidate(
      params.id,
      params.candidateId,
      request.body
    );

    if (!candidate) {
      return reply.code(404).send({ error: "Vendor review candidate not found" });
    }

    return { candidate };
  });

  app.post("/prototype/vendor-refresh-jobs/:id/publish", async (request, reply) => {
    const params = request.params as { id: string };
    const job = await vendorRefreshStore.getJob(params.id);

    if (!job) {
      return reply.code(404).send({ error: "Vendor refresh job not found" });
    }

    const publishedRecords = await vendorRefreshStore.publishApprovedCandidates(params.id);
    return reply.code(201).send({ publishedRecords });
  });

  app.get("/prototype/vendor-catalog", async () => {
    const records = await vendorRefreshStore.listPublishedRecords();
    return { records };
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

  app.get("/prototype/consultant/sessions/:workspaceId", async (request, reply) => {
    const params = request.params as { workspaceId: string };
    const workspace = await workspaceStore.getWorkspace(params.workspaceId);

    if (!workspace) {
      return reply.code(404).send({ error: "Workspace not found" });
    }

    const existingSession = await consultantSessionStore.getSession(params.workspaceId);

    if (existingSession) {
      return { session: existingSession };
    }

    const opening = createWeddingConsultantOpening(workspace);
    const session = createInitialSession(workspace, opening);
    const savedSession = await consultantSessionStore.saveSession(session);

    return { session: savedSession };
  });

  app.get("/prototype/consultant/jobs", async (request) => {
    const query = request.query as { status?: "pending" | "processing" | "completed" | "failed" };
    const jobs = await consultantSessionStore.listJobs(query.status);
    return { jobs };
  });

  app.post("/prototype/consultant/reply", async (request, reply) => {
    if (!isConsultantReplyPayload(request.body)) {
      return reply.code(400).send({ error: "Invalid consultant reply payload" });
    }

    const workspace = await workspaceStore.getWorkspace(request.body.workspace.id);

    if (!workspace) {
      return reply.code(404).send({ error: "Workspace not found" });
    }

    const assistantMode: ConsultationAssistantMode =
      request.body.assistantMode === "operator" ? "operator" : "consultant";
    const userMessage = request.body.userMessage.trim();
    const deterministicTurn = continueWeddingConsultantConversation(
      workspace,
      request.body.currentTurn.stepId,
      { text: userMessage }
    );
    const { assistantMessage, provider, model } = await generateAssistantMessage({
      workspace,
      assistantMode,
      assistantTier: request.body.assistantTier,
      deterministicTurn,
      userMessage
    });
    const turn = {
      ...deterministicTurn,
      assistantMessage
    };
    const currentSession =
      (await consultantSessionStore.getSession(workspace.id)) ??
      createInitialSession(workspace, createWeddingConsultantOpening(workspace));
    const { session } = appendConsultantTurn({
      session: currentSession,
      workspace,
      userMessage,
      assistantMode,
      turn
    });
    const savedSession = await consultantSessionStore.saveSession(session);

    return {
      turn,
      provider,
      model,
      workspace,
      session: savedSession
    };
  });

  app.post("/prototype/consultant/transcribe", async (request, reply) => {
    if (!isConsultantTranscribePayload(request.body)) {
      return reply.code(400).send({ error: "Invalid consultant voice payload" });
    }

    return {
      text: "",
      language:
        typeof request.body.languageHint === "string" &&
        request.body.languageHint.length > 0
          ? request.body.languageHint
          : "de",
      durationSeconds: null
    };
  });

  app.post("/prototype/consultant/speak", async (request, reply) => {
    if (!isConsultantSpeakPayload(request.body)) {
      return reply.code(400).send({ error: "Invalid consultant speak payload" });
    }

    return reply.code(501).send({
      error: "Voice synthesis is not configured on this runtime"
    });
  });

  return app;
}

async function generateAssistantMessage(input: {
  workspace: {
    id: string;
    coupleName: string;
    onboarding: {
      region: string;
    };
  };
  assistantMode: ConsultationAssistantMode;
  assistantTier: "free" | "premium" | undefined;
  deterministicTurn: ReturnType<typeof continueWeddingConsultantConversation>;
  userMessage: string;
}) {
  const shouldPreferOpenClaw =
    input.assistantMode === "operator" || input.assistantTier === "premium";
  const openClawCandidate = shouldPreferOpenClaw
    ? await requestOpenClawReply({
        workspaceId: input.workspace.id,
        coupleName: input.workspace.coupleName,
        region: input.workspace.onboarding.region,
        stepId: input.deterministicTurn.stepId,
        userMessage: input.userMessage
      })
    : null;

  if (openClawCandidate) {
    return {
      assistantMessage: openClawCandidate,
      provider: "openclaw" as const,
      model: process.env.OPENCLAW_MODEL ?? "openclaw"
    };
  }

  return {
    assistantMessage: input.deterministicTurn.assistantMessage,
    provider: shouldPreferOpenClaw ? ("fallback" as const) : ("deterministic" as const),
    model: "wedding-shared-deterministic"
  };
}

async function requestOpenClawReply(input: {
  workspaceId: string;
  coupleName: string;
  region: string;
  stepId: string;
  userMessage: string;
}) {
  const endpoint = process.env.OPENCLAW_CHAT_URL;

  if (!endpoint) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        workspaceId: input.workspaceId,
        systemRole:
          "Du bist ein herzlicher, klarer Hochzeitsplaner mit echter Praxis. Antworte immer konkret, menschlich und ohne Fachjargon.",
        profile: {
          coupleName: input.coupleName,
          region: input.region,
          stepId: input.stepId
        },
        userMessage: input.userMessage
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as unknown;

    return getOpenClawMessage(payload);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function getOpenClawMessage(payload: unknown) {
  if (!isPlainObject(payload)) {
    return null;
  }

  const directMessage = payload.message;
  const nestedMessage =
    isPlainObject(payload.reply) && typeof payload.reply.text === "string"
      ? payload.reply.text
      : null;
  const assistantMessage =
    typeof payload.assistantMessage === "string" ? payload.assistantMessage : null;

  const candidate =
    typeof directMessage === "string"
      ? directMessage
      : assistantMessage ?? nestedMessage;

  if (typeof candidate !== "string") {
    return null;
  }

  const text = candidate.trim();

  return text.length > 0 ? text : null;
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

function isConsultantReplyPayload(
  value: unknown
): value is {
  workspace: { id: string };
  currentTurn: { stepId: GuidedPlanningStepId };
  userMessage: string;
  assistantMode?: ConsultationAssistantMode;
  assistantTier?: "free" | "premium";
} {
  return (
    isPlainObject(value) &&
    isPlainObject(value.workspace) &&
    typeof value.workspace.id === "string" &&
    isPlainObject(value.currentTurn) &&
    isGuidedPlanningStepId(value.currentTurn.stepId) &&
    typeof value.userMessage === "string" &&
    (value.assistantMode === undefined ||
      value.assistantMode === "consultant" ||
      value.assistantMode === "operator") &&
    (value.assistantTier === undefined ||
      value.assistantTier === "free" ||
      value.assistantTier === "premium")
  );
}

function isConsultantTranscribePayload(
  value: unknown
): value is {
  audioBase64: string;
  mimeType?: string;
  languageHint?: string;
} {
  return (
    isPlainObject(value) &&
    typeof value.audioBase64 === "string" &&
    (value.mimeType === undefined || typeof value.mimeType === "string") &&
    (value.languageHint === undefined || typeof value.languageHint === "string")
  );
}

function isConsultantSpeakPayload(
  value: unknown
): value is {
  text: string;
} {
  return isPlainObject(value) && typeof value.text === "string";
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

function isVendorRefreshRunRequest(
  value: unknown
): value is {
  category: VendorSearchCategory;
} {
  return isPlainObject(value) && isVendorSearchCategory(value.category);
}

function isVendorReviewDecisionRequest(
  value: unknown
): value is {
  reviewStatus: "approved" | "rejected";
  reviewNote?: string;
} {
  return (
    isPlainObject(value) &&
    (value.reviewStatus === "approved" || value.reviewStatus === "rejected") &&
    (value.reviewNote === undefined || typeof value.reviewNote === "string")
  );
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
