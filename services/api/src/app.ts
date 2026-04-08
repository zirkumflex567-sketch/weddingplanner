import { readFile } from "node:fs/promises";
import path from "node:path";
import cors from "@fastify/cors";
import Fastify from "fastify";
import {
  createBootstrapPlan,
  createGuidedPlanningSession,
  createWeddingConsultantOpening,
  continueWeddingConsultantConversation,
  type GuidedPlanningStepId,
  type WeddingBootstrapInput,
  type PrototypeWorkspace,
  type WeddingConsultantTurn,
  isWeddingBootstrapInput,
  type VendorSearchCategory
} from "@wedding/shared";
import {
  createVendorConnectorPreview,
  createVendorRefreshExecutor,
  germanSweepCategories,
  germanSweepRegions,
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
  InMemoryVendorRefreshStore,
  isVendorRefreshRequest,
  type VendorRefreshStore
} from "./vendor-refresh-store";
import { authenticateRequest, type AuthenticatedUser } from "./auth";

declare module "fastify" {
  interface FastifyRequest {
    authUser?: AuthenticatedUser;
  }
}

interface BuildAppOptions {
  workspaceStore?: PrototypeWorkspaceStore;
  vendorRefreshStore?: VendorRefreshStore;
  vendorRefreshExecutor?: VendorRefreshExecutor;
}

type ConsultationAssistantMode = "consultant" | "operator";
type ConsultationAssistantTier = "free" | "premium";

interface ConsultantRuntimeMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
  createdAt: string;
  assistantMode: ConsultationAssistantMode;
}

interface ConsultantWorkspaceContext {
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

interface ConsultantSession {
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
  currentTurn: WeddingConsultantTurn | null;
  messages: ConsultantRuntimeMessage[];
  context: ConsultantWorkspaceContext;
  jobs: Array<{
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
  }>;
  pendingConfirmation?: {
    type: "vendor-stage";
    payload: {
      vendorId: string;
      stage: "suggested" | "contacted" | "quoted" | "booked" | "rejected";
      quoteAmount: number | null;
      note: string;
      summary: string;
    };
    createdAt: string;
  };
}

interface ConsultantReplyRequest {
  workspace?: PrototypeWorkspace;
  workspaceId?: string;
  currentTurn?: WeddingConsultantTurn;
  messages?: Array<{ id?: string; role?: "assistant" | "user"; content?: string }>;
  userMessage?: string;
  assistantMode?: ConsultationAssistantMode;
  assistantTier?: ConsultationAssistantTier;
}

export function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({ logger: false });
  const workspaceStore =
    options.workspaceStore ?? new InMemoryPrototypeWorkspaceStore();
  const vendorRefreshStore =
    options.vendorRefreshStore ?? new InMemoryVendorRefreshStore();
  const vendorRefreshExecutor =
    options.vendorRefreshExecutor ?? createVendorRefreshExecutor();
  const consultantSessions = new Map<string, ConsultantSession>();

  app.register(cors, {
    origin: true
  });

  app.addHook("preHandler", async (request, reply) => {
    if (!request.url.startsWith("/prototype")) {
      return;
    }

    const authUser = await authenticateRequest(
      request.headers.authorization,
      request.headers["x-test-user"] as string | undefined
    );

    if (!authUser) {
      return reply.code(401).send({ error: "Authentication required" });
    }

    request.authUser = authUser;
  });

  app.get("/health", async () => ({
    status: "ok"
  }));

  app.get("/prototype/ingestion/coverage", async () => {
    const coverage = await buildIngestionCoverageSnapshot();
    return coverage;
  });

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

    const workspace = await workspaceStore.createWorkspace(request.authUser!.id, request.body);

    return reply.code(201).send({ workspace });
  });

  app.get("/prototype/workspaces", async (request) => {
    const profiles = await workspaceStore.listWorkspaces(request.authUser!.id);

    return { profiles };
  });

  app.get("/prototype/workspaces/:id", async (request, reply) => {
    const params = request.params as { id: string };
    const workspace = await workspaceStore.getWorkspace(request.authUser!.id, params.id);

    if (!workspace) {
      return reply.code(404).send({ error: "Workspace not found" });
    }

    return { workspace };
  });

  app.delete("/prototype/workspaces/:id", async (request, reply) => {
    const params = request.params as { id: string };
    const deleted = await workspaceStore.deleteWorkspace(request.authUser!.id, params.id);

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

    const workspace = await workspaceStore.updateWorkspace(
      request.authUser!.id,
      params.id,
      request.body
    );

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

    const workspace = await workspaceStore.addGuest(request.authUser!.id, params.id, request.body);

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
      request.authUser!.id,
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

  app.get("/prototype/consultant/sessions/:workspaceId", async (request, reply) => {
    const params = request.params as { workspaceId: string };
    const workspace = await workspaceStore.getWorkspace(request.authUser!.id, params.workspaceId);

    if (!workspace) {
      return reply.code(404).send({ error: "Workspace not found" });
    }

    const session = ensureConsultantSession(consultantSessions, workspace);
    return { session };
  });

  app.get("/prototype/consultant/jobs", async () => {
    const jobs = [...consultantSessions.values()].flatMap((session) => session.jobs);
    return { jobs };
  });

  app.post("/prototype/consultant/reply", async (request, reply) => {
    if (!isConsultantReplyRequest(request.body)) {
      return reply.code(400).send({ error: "Invalid consultant payload" });
    }

    const workspaceId = request.body.workspaceId ?? request.body.workspace?.id;

    if (!workspaceId) {
      return reply.code(400).send({ error: "Workspace id is required" });
    }

    let workspace = await workspaceStore.getWorkspace(request.authUser!.id, workspaceId);

    if (!workspace) {
      return reply.code(404).send({ error: "Workspace not found" });
    }

    const assistantMode = request.body.assistantMode ?? "consultant";
    const assistantTier = request.body.assistantTier ?? "free";
    const userMessage = (request.body.userMessage ?? "").trim();
    if (!userMessage) {
      return reply.code(400).send({ error: "User message is required" });
    }

    const session = ensureConsultantSession(consultantSessions, workspace);
    const now = new Date().toISOString();

    const currentStepId = normalizeStepId(
      request.body.currentTurn?.stepId ?? session.currentTurn?.stepId,
      workspace
    );

    session.messages.push({
      id: crypto.randomUUID(),
      role: "user",
      content: userMessage,
      createdAt: now,
      assistantMode
    });

    let operatorActionNote = "";
    if (assistantMode === "operator") {
      const operatorResult = await applyOperatorMessageToWorkspace(
        workspaceStore,
        request.authUser!.id,
        session,
        workspace,
        userMessage
      );
      workspace = operatorResult.workspace;
      operatorActionNote = operatorResult.note;
    }

    const turn = continueWeddingConsultantConversation(workspace, currentStepId, {
      text: userMessage
    });
    const assistantMessageRaw =
      assistantMode === "operator" && operatorActionNote
        ? `${operatorActionNote}\n\nWenn ihr möchtet, übernehme ich als Nächstes direkt den passenden Folgepunkt (z. B. Anfrage-Text, Budgetnotiz oder nächste Priorität).`
        : operatorActionNote
          ? `${turn.assistantMessage}\n\n${operatorActionNote}`
          : turn.assistantMessage;
    const normalizedTurn = normalizeConsultantTurnText({
      ...turn,
      assistantMessage: assistantMessageRaw
    });
    const assistantMessage = normalizedTurn.assistantMessage;

    session.messages.push({
      id: crypto.randomUUID(),
      role: "assistant",
      content: assistantMessage,
      createdAt: now,
      assistantMode
    });
    session.currentTurn = normalizedTurn;
    session.updatedAt = now;
    session.context = buildConsultantWorkspaceContext(workspace, session.messages);

    const provider = assistantTier === "premium" ? "openclaw" : "deterministic";
    const model =
      assistantTier === "premium" ? "openclaw-consultant-runtime" : "rule-based-consultant";

    return {
      turn: normalizedTurn,
      provider,
      model,
      workspace,
      session
    };
  });

  app.post("/prototype/consultant/transcribe", async (request, reply) => {
    if (!isConsultantTranscribeRequest(request.body)) {
      return reply.code(400).send({ error: "Invalid transcription payload" });
    }

    const hasAudio = request.body.audioBase64.trim().length > 0;
    return {
      text: hasAudio
        ? "Ich habe eure Sprachnachricht erhalten. Sagt mir kurz, womit wir weitermachen sollen."
        : "",
      language: request.body.languageHint ?? "de",
      durationSeconds: null
    };
  });

  app.post("/prototype/consultant/speak", async (request, reply) => {
    if (!isConsultantSpeakRequest(request.body)) {
      return reply.code(400).send({ error: "Invalid speech payload" });
    }

    // Tiny valid WAV (mono, PCM 16-bit, 8kHz, short silence) to keep UI voice flow stable.
    const silentWavBase64 =
      "UklGRlQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YTAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

    return {
      audioBase64: silentWavBase64,
      mimeType: "audio/wav",
      sampleRate: 8000
    };
  });

  app.post("/prototype/workspaces/:id/expenses", async (request, reply) => {
    const params = request.params as { id: string };

    if (!isCreateExpenseInput(request.body)) {
      return reply.code(400).send({ error: "Invalid expense payload" });
    }

    const workspace = await workspaceStore.addExpense(request.authUser!.id, params.id, request.body);

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
      request.authUser!.id,
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
      request.authUser!.id,
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

function isConsultantReplyRequest(value: unknown): value is ConsultantReplyRequest {
  if (!isPlainObject(value)) {
    return false;
  }

  if (
    value.workspaceId !== undefined &&
    typeof value.workspaceId !== "string"
  ) {
    return false;
  }

  if (value.workspace !== undefined && !isPlainObject(value.workspace)) {
    return false;
  }

  if (value.userMessage !== undefined && typeof value.userMessage !== "string") {
    return false;
  }

  if (
    value.assistantMode !== undefined &&
    value.assistantMode !== "consultant" &&
    value.assistantMode !== "operator"
  ) {
    return false;
  }

  if (
    value.assistantTier !== undefined &&
    value.assistantTier !== "free" &&
    value.assistantTier !== "premium"
  ) {
    return false;
  }

  return true;
}

function isConsultantTranscribeRequest(
  value: unknown
): value is { audioBase64: string; languageHint?: string } {
  return (
    isPlainObject(value) &&
    typeof value.audioBase64 === "string" &&
    (value.languageHint === undefined || typeof value.languageHint === "string")
  );
}

function isConsultantSpeakRequest(value: unknown): value is { text: string } {
  return isPlainObject(value) && typeof value.text === "string";
}

function normalizeStepId(
  stepId: string | undefined,
  workspace: PrototypeWorkspace
): GuidedPlanningStepId {
  const knownSteps = new Set<GuidedPlanningStepId>(
    createGuidedPlanningSession(workspace).steps.map((step) => step.id)
  );

  if (stepId && knownSteps.has(stepId as GuidedPlanningStepId)) {
    return stepId as GuidedPlanningStepId;
  }

  return createGuidedPlanningSession(workspace).currentStepId;
}

function normalizeConsultantTurnText<T extends { assistantMessage: string; suggestedReplies?: Array<{ id: string; label: string }> }>(
  turn: T
): T {
  return {
    ...turn,
    assistantMessage: softenConsultantTone(replaceCommonGermanUmlauts(turn.assistantMessage)),
    suggestedReplies: turn.suggestedReplies?.map((entry) => ({
      ...entry,
      label: softenConsultantTone(replaceCommonGermanUmlauts(entry.label))
    }))
  };
}

function softenConsultantTone(input: string): string {
  const replacements: Array<[RegExp, string]> = [
    [/\bEuer naechster Hebel ist jetzt\b/g, "Als nächstes würde ich euch empfehlen"],
    [/\bEuer nächster Hebel ist jetzt\b/g, "Als nächstes würde ich euch empfehlen"],
    [/\bEuer naechster Hebel\b/g, "Als nächster sinnvoller Schritt"],
    [/\bEuer nächster Hebel\b/g, "Als nächster sinnvoller Schritt"],
    [/\bHebel\b/g, "Schritt"],
    [/\bwie in einer Beratung\b/g, "wie in einem guten Beratungsgespräch"],
    [/\bblind weiterzuschieben\b/g, "ohne Plan weiterzugehen"],
    [/\bKern-Vendoren\b/g, "wichtigen Dienstleister"]
  ];

  let text = input;
  for (const [pattern, replacement] of replacements) {
    text = text.replace(pattern, replacement);
  }
  return text;
}

function replaceCommonGermanUmlauts(input: string): string {
  const replacements: Array<[RegExp, string]> = [
    [/\bGaeste\b/g, "Gäste"],
    [/\bgaeste\b/g, "gäste"],
    [/\bGaesteliste\b/g, "Gästeliste"],
    [/\bRueckmeldungen\b/g, "Rückmeldungen"],
    [/\bfrueh\b/g, "früh"],
    [/\bfuer\b/g, "für"],
    [/\bkoennen\b/g, "können"],
    [/\bkoennt\b/g, "könnt"],
    [/\bwoechentlich\b/g, "wöchentlich"],
    [/\boeffnen\b/g, "öffnen"],
    [/\bschliessen\b/g, "schließen"],
    [/\bnaechste\b/g, "nächste"],
    [/\bnaechster\b/g, "nächster"],
    [/\bnaechstes\b/g, "nächstes"],
    [/\bnaechsten\b/g, "nächsten"],
    [/\bueber\b/g, "über"],
    [/\bmoeglich\b/g, "möglich"],
    [/\bAenderung\b/g, "Änderung"],
    [/\baenderung\b/g, "änderung"],
    [/\bvernuenftig\b/g, "vernünftig"],
    [/\bwaere\b/g, "wäre"],
    [/\bWaere\b/g, "Wäre"],
    [/\bgrossen\b/g, "großen"],
    [/\bgroesste\b/g, "größte"],
    [/\bGroesste\b/g, "Größte"]
  ];

  let text = input;
  for (const [pattern, replacement] of replacements) {
    text = text.replace(pattern as RegExp, replacement as string);
  }
  return text;
}

function ensureConsultantSession(
  sessionMap: Map<string, ConsultantSession>,
  workspace: PrototypeWorkspace
) {
  const existing = sessionMap.get(workspace.id);
  if (existing) {
    return existing;
  }

  const now = new Date().toISOString();
  const opening = normalizeConsultantTurnText(createWeddingConsultantOpening(workspace));
  const session: ConsultantSession = {
    workspaceId: workspace.id,
    createdAt: now,
    updatedAt: now,
    currentTurn: opening,
    messages: [
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: opening.assistantMessage,
        createdAt: now,
        assistantMode: "consultant"
      }
    ],
    context: buildConsultantWorkspaceContext(workspace, []),
    jobs: []
  };
  sessionMap.set(workspace.id, session);
  return session;
}

function buildConsultantWorkspaceContext(
  workspace: PrototypeWorkspace,
  messages: ConsultantRuntimeMessage[]
): ConsultantWorkspaceContext {
  const budgetSpent = workspace.expenses.reduce((sum, item) => sum + item.amount, 0);
  const recentUserMessages = messages
    .filter((message) => message.role === "user")
    .slice(-6)
    .map((message) => message.content);

  return {
    workspaceId: workspace.id,
    updatedAt: new Date().toISOString(),
    profile: {
      coupleName: workspace.onboarding.coupleName,
      targetDate: workspace.onboarding.targetDate,
      region: workspace.onboarding.region,
      budgetTotal: workspace.onboarding.budgetTotal,
      guestCountTarget: workspace.onboarding.guestCountTarget,
      plannedEvents: [...workspace.onboarding.plannedEvents],
      disabledVendorCategories: [...(workspace.onboarding.disabledVendorCategories ?? [])]
    },
    planning: {
      openTaskTitles: workspace.tasks.filter((task) => !task.completed).map((task) => task.title),
      activeVenueNames: workspace.plan.vendorMatches
        .filter((vendor) => vendor.category === "venue")
        .map((vendor) => vendor.name),
      trackedVendorCount: workspace.vendorTracker.filter(
        (entry) => entry.stage !== "suggested" && entry.stage !== "rejected"
      ).length,
      guestCountActual: workspace.guests.length,
      budgetRemaining: Math.max(workspace.onboarding.budgetTotal - budgetSpent, 0)
    },
    conversation: {
      lastUserMessages: recentUserMessages,
      recentPriorities: workspace.tasks.filter((task) => !task.completed).slice(0, 3).map((task) => task.title),
      recentFacts: [
        `${workspace.onboarding.guestCountTarget} Gäste geplant`,
        `Budgetziel ${workspace.onboarding.budgetTotal} EUR`,
        `Region ${workspace.onboarding.region}`
      ],
      extractedDrafts: []
    }
  };
}

async function applyOperatorMessageToWorkspace(
  workspaceStore: PrototypeWorkspaceStore,
  ownerId: string,
  session: ConsultantSession,
  workspace: PrototypeWorkspace,
  userMessage: string
) {
  const text = userMessage.toLowerCase();
  const now = new Date().toISOString();

  if (session.pendingConfirmation) {
    if (isCancelMessage(text)) {
      delete session.pendingConfirmation;
      return {
        workspace,
        note: "Operator-Update: Alles gut, ich habe die ausstehende Änderung verworfen."
      };
    }

    if (!isConfirmationMessage(text)) {
      return {
        workspace,
        note:
          "Operator-Hinweis: Für die ausstehende riskantere Änderung brauche ich eine klare Bestätigung. " +
          "Antwortet mit `bestätigen` oder `abbrechen`."
      };
    }

    const pending = session.pendingConfirmation;
    delete session.pendingConfirmation;
    if (pending.type === "vendor-stage") {
      const updatedWorkspace = await workspaceStore.updateVendor(
        ownerId,
        workspace.id,
        pending.payload.vendorId,
        {
          stage: pending.payload.stage,
          quoteAmount: pending.payload.quoteAmount,
          note: pending.payload.note
        }
      );
      if (updatedWorkspace) {
        return {
          workspace: updatedWorkspace,
          note: `Operator-Update: Bestätigt. ${pending.payload.summary}.`
        };
      }

      return {
        workspace,
        note: "Operator-Hinweis: Die bestätigte Änderung konnte gerade nicht gespeichert werden."
      };
    }
  }
  const wantsDeactivate =
    /\bdeaktivier(?:e|en|t)?\b/.test(text) ||
    /\bausschlie(?:ss|ß)e(?:n)?\b/.test(text) ||
    /\bentfern(?:e|en)\b/.test(text);
  const wantsActivate =
    !wantsDeactivate &&
    (/\baktivier(?:e|en|t)?\b/.test(text) ||
      /\breaktivier(?:e|en|t)?\b/.test(text) ||
      text.includes("wieder rein") ||
      text.includes("wieder aktiv"));
  const nextDisabled = new Set(workspace.onboarding.disabledVendorCategories ?? []);
  const changed: string[] = [];

  const rules: Array<{
    category: "photography" | "catering" | "music" | "florals" | "attire";
    aliases: string[];
    label: string;
  }> = [
    { category: "photography", aliases: ["foto", "fotografie"], label: "Fotografie" },
    { category: "catering", aliases: ["catering", "essen", "menue"], label: "Catering" },
    { category: "music", aliases: ["musik", "dj", "band"], label: "Musik" },
    { category: "florals", aliases: ["floristik", "blumen", "deko"], label: "Floristik" },
    { category: "attire", aliases: ["styling", "outfit", "kleid", "anzug"], label: "Styling & Outfit" }
  ];

  for (const rule of rules) {
    const mentionsCategory = rule.aliases.some((alias) => text.includes(alias));
    if (!mentionsCategory) {
      continue;
    }

    if (wantsDeactivate) {
      if (!nextDisabled.has(rule.category)) {
        nextDisabled.add(rule.category);
        changed.push(`${rule.label} deaktiviert`);
      }
    }

    if (wantsActivate) {
      if (nextDisabled.delete(rule.category)) {
        changed.push(`${rule.label} aktiviert`);
      }
    }
  }

  const manualVendorIntent = parseManualVendorIntent(userMessage);
  if (manualVendorIntent.intentDetected) {
    if (!manualVendorIntent.name || !manualVendorIntent.category) {
      const missing = [
        manualVendorIntent.name ? null : "Name des Anbieters",
        manualVendorIntent.category ? null : "Kategorie (z. B. DJ/Musik, Catering, Foto)"
      ].filter(Boolean);

      return {
        workspace,
        note:
          `Operator-Hinweis: Ich trage den Anbieter gern für dieses Paar ein. ` +
          `Mir fehlt noch: ${missing.join(" und ")}. ` +
          `Optional direkt mitsenden: Telefon, E-Mail, Adresse.`
      };
    }

    const detailParts = [
      manualVendorIntent.phone ? `Telefon: ${manualVendorIntent.phone}` : null,
      manualVendorIntent.email ? `E-Mail: ${manualVendorIntent.email}` : null,
      manualVendorIntent.address ? `Adresse: ${manualVendorIntent.address}` : null
    ].filter(Boolean);
    const detailText = detailParts.length > 0 ? ` (${detailParts.join(" | ")})` : "";

    const withExpense = await workspaceStore.addExpense(ownerId, workspace.id, {
      label: `Manuell ergänzt: ${manualVendorIntent.name}${detailText}`,
      category: manualVendorIntent.category,
      amount: 0,
      status: "planned",
      vendorName: manualVendorIntent.name
    });

    if (!withExpense) {
      return {
        workspace,
        note: "Operator-Hinweis: Ich konnte den manuellen Anbieter gerade nicht speichern."
      };
    }

    workspace = withExpense;
    changed.push(
      `${manualVendorIntent.name} wurde manuell in ${mapCategoryToLabel(
        manualVendorIntent.category
      )} gespeichert`
    );
  }

  const onboardingChanges = parseOnboardingUpdates(userMessage, workspace.onboarding);
  if (onboardingChanges) {
    const updatedWorkspace = await workspaceStore.updateWorkspace(ownerId, workspace.id, {
      ...workspace.onboarding,
      ...onboardingChanges.patch
    });
    if (updatedWorkspace) {
      workspace = updatedWorkspace;
      changed.push(...onboardingChanges.notes);
    }
  }

  const taskUpdate = findTaskIntent(userMessage, workspace.tasks);
  if (taskUpdate) {
    const updatedWorkspace = await workspaceStore.setTaskCompletion(
      ownerId,
      workspace.id,
      taskUpdate.taskId,
      taskUpdate.completed
    );
    if (updatedWorkspace) {
      workspace = updatedWorkspace;
      changed.push(taskUpdate.note);
    }
  }

  const vendorStageUpdate = findVendorStageIntent(userMessage, workspace);
  if (vendorStageUpdate) {
    if (vendorStageUpdate.stage === "rejected") {
      session.pendingConfirmation = {
        type: "vendor-stage",
        payload: vendorStageUpdate,
        createdAt: now
      };
      return {
        workspace,
        note:
          `Operator-Hinweis: Das Ablehnen von ${vendorStageUpdate.vendorName} ` +
          "ist eine riskantere Änderung. Bitte mit `bestätigen` freigeben oder mit `abbrechen` verwerfen."
      };
    }

    const updatedWorkspace = await workspaceStore.updateVendor(
      ownerId,
      workspace.id,
      vendorStageUpdate.vendorId,
      {
        stage: vendorStageUpdate.stage,
        quoteAmount: vendorStageUpdate.quoteAmount,
        note: vendorStageUpdate.note
      }
    );
    if (updatedWorkspace) {
      workspace = updatedWorkspace;
      changed.push(vendorStageUpdate.summary);
    }
  }

  const expenseIntent = parseExpenseIntent(userMessage);
  if (expenseIntent) {
    const updatedWorkspace = await workspaceStore.addExpense(ownerId, workspace.id, expenseIntent);
    if (updatedWorkspace) {
      workspace = updatedWorkspace;
      changed.push(
        `Budgeteintrag ergänzt: ${expenseIntent.label} (${expenseIntent.amount.toLocaleString("de-DE")} EUR, ${mapCategoryToLabel(expenseIntent.category)})`
      );
    }
  }

  const guestIntent = parseGuestCreateIntent(userMessage);
  if (guestIntent.intentDetected) {
    if (!guestIntent.name || !guestIntent.email) {
      return {
        workspace,
        note:
          "Operator-Hinweis: Für einen neuen Gast brauche ich mindestens Name und E-Mail. " +
          "Optional: Haushalt und Event-Wünsche."
      };
    }

    const updatedWorkspace = await workspaceStore.addGuest(ownerId, workspace.id, {
      name: guestIntent.name,
      email: guestIntent.email,
      household: guestIntent.household ?? "Haushalt",
      eventIds: workspace.plan.eventBlueprints.map((event) => event.id)
    });
    if (updatedWorkspace) {
      workspace = updatedWorkspace;
      changed.push(`Gast ergänzt: ${guestIntent.name}`);
    }
  }

  if (changed.length === 0) {
    return {
      workspace,
      note:
        "Operator-Hinweis: Ich habe noch keine konkrete Änderung erkannt. " +
        "Wenn ihr wollt, formuliere ich euch direkt ein passendes Beispiel."
    };
  }

  const updated = await workspaceStore.updateWorkspace(ownerId, workspace.id, {
    ...workspace.onboarding,
    disabledVendorCategories: [...nextDisabled]
  });

  if (!updated) {
    return {
      workspace,
      note: "Operator-Hinweis: Ich konnte die Änderung gerade nicht speichern."
    };
  }

  return {
    workspace: updated,
    note: `Operator-Update: ${changed.join(", ")}.`
  };
}

function parseOnboardingUpdates(
  message: string,
  onboarding: WeddingBootstrapInput
): {
  patch: Partial<WeddingBootstrapInput>;
  notes: string[];
} | null {
  const lower = message.toLowerCase();
  const patch: Partial<typeof onboarding> = {};
  const notes: string[] = [];

  const budgetMatch = message.match(/(?:budget|gesamtbudget)\D{0,20}(\d{3,7})/i);
  if (budgetMatch) {
    const nextBudget = Number(budgetMatch[1]);
    if (Number.isFinite(nextBudget) && nextBudget > 0) {
      patch.budgetTotal = nextBudget;
      notes.push(`Budget auf ${nextBudget.toLocaleString("de-DE")} EUR gesetzt`);
    }
  }

  const guestMatch = message.match(/(?:gaeste|gäste|personen)\D{0,20}(\d{1,4})/i);
  if (guestMatch) {
    const nextCount = Number(guestMatch[1]);
    if (Number.isFinite(nextCount) && nextCount > 0) {
      patch.guestCountTarget = nextCount;
      notes.push(`Gästezahl auf ${nextCount} gesetzt`);
    }
  }

  const dateMatch = message.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  const extractedDate = dateMatch?.[1];
  if (extractedDate) {
    patch.targetDate = extractedDate;
    notes.push(`Datum auf ${extractedDate} gesetzt`);
  }

  const regionMatch = message.match(/\b(?:ort|region)\b\s*(?:ist|auf)?\s*[:\-]?\s*([^,.\n]{3,80})/i);
  if (regionMatch) {
    const region = cleanExtract(regionMatch[1]);
    if (region) {
      patch.region = region;
      notes.push(`Region auf ${region} gesetzt`);
    }
  }

  if (Object.keys(patch).length === 0) {
    return null;
  }

  return { patch, notes };
}

function findTaskIntent(
  message: string,
  tasks: Array<{ id: string; title: string; completed: boolean }>
): { taskId: string; completed: boolean; note: string } | null {
  const lower = message.toLowerCase();
  const wantsDone = /\b(erledigt|abgehakt|fertig|done)\b/.test(lower);
  const wantsOpen = /\b(offen|zurueck|zurück|wieder offen|undo)\b/.test(lower);
  if (!wantsDone && !wantsOpen) {
    return null;
  }

  const match = tasks.find((task) =>
    task.title
      .toLowerCase()
      .split(/\s+/)
      .some((token) => token.length > 5 && lower.includes(token))
  );
  if (!match) {
    return null;
  }

  const completed = wantsDone && !wantsOpen;
  return {
    taskId: match.id,
    completed,
    note: `Aufgabe ${completed ? "erledigt" : "wieder geöffnet"}: ${match.title}`
  };
}

function findVendorStageIntent(
  message: string,
  workspace: PrototypeWorkspace
): { vendorName: string; vendorId: string; stage: "suggested" | "contacted" | "quoted" | "booked" | "rejected"; quoteAmount: number | null; note: string; summary: string } | null {
  const lower = message.toLowerCase();
  const vendor =
    workspace.plan.vendorMatches.find((entry) => lower.includes(entry.name.toLowerCase())) ??
    workspace.plan.vendorMatches.find((entry) => {
      const tokens = entry.name
        .toLowerCase()
        .split(/\s+/)
        .filter((token) => token.length >= 4);
      const tokenHits = tokens.filter((token) => lower.includes(token)).length;
      return tokenHits >= Math.min(2, tokens.length);
    });
  const phraseVendorName = cleanExtract(
    extractByLabel(message, /^([^,\n]{3,80})\s+(?:ist|wurde)\s+(?:kontaktiert|angefragt|gebucht|abgesagt|abgelehnt)/i)
  );
  const vendorFromPhrase =
    !vendor && phraseVendorName
      ? workspace.plan.vendorMatches.find((entry) =>
          entry.name.toLowerCase().includes(phraseVendorName.toLowerCase())
        )
      : null;
  const finalVendor = vendor ?? vendorFromPhrase;
  if (!finalVendor) {
    return null;
  }

  let stage: "suggested" | "contacted" | "quoted" | "booked" | "rejected" | null = null;
  if (/\b(kontaktiert|angefragt|anfrage)\b/.test(lower)) {
    stage = "contacted";
  } else if (/\b(angebot|quote)\b/.test(lower)) {
    stage = "quoted";
  } else if (/\b(gebucht|fix|beauftragt)\b/.test(lower)) {
    stage = "booked";
  } else if (/\b(absagen|ablehnen|raus|streichen|streich)\b/.test(lower) || lower.includes("aus unserer liste")) {
    stage = "rejected";
  }
  if (!stage) {
    return null;
  }

  const quoteMatch = message.match(/(\d{3,7})\s*(?:eur|euro)?/i);
  const quoteAmount = quoteMatch ? Number(quoteMatch[1]) : null;

  return {
    vendorName: finalVendor.name,
    vendorId: finalVendor.id,
    stage,
    quoteAmount: Number.isFinite(quoteAmount as number) ? quoteAmount : null,
    note: `Per Operator gesetzt (${stage})`,
    summary: `${finalVendor.name} auf Status ${stage} gesetzt`
  };
}

function parseExpenseIntent(message: string): {
  label: string;
  category: "venue" | "catering" | "photography" | "music" | "attire" | "florals" | "stationery-admin";
  amount: number;
  status: "planned" | "booked" | "paid";
  vendorName: string;
} | null {
  const lower = message.toLowerCase();
  if (!/\b(kosten|ausgabe|budgeteintrag|betrag)\b/.test(lower)) {
    return null;
  }

  const amountMatch = message.match(/(\d{2,7})\s*(?:eur|euro)?/i);
  if (!amountMatch) {
    return null;
  }
  const amount = Number(amountMatch[1]);
  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }

  const category = detectVendorCategory(lower) ?? "stationery-admin";
  const vendorName =
    extractByLabel(message, /(?:bei|an|fuer|für)\s+([^,.\n]{3,80})/i) ?? "Manueller Eintrag";
  const status = /\bbezahlt|paid\b/.test(lower) ? "paid" : /\bgebucht|fix\b/.test(lower) ? "booked" : "planned";

  return {
    label: `Manueller Budgeteintrag: ${vendorName}`,
    category,
    amount,
    status,
    vendorName
  };
}

function parseGuestCreateIntent(message: string): {
  intentDetected: boolean;
  name?: string;
  email?: string;
  household?: string;
} {
  const lower = message.toLowerCase();
  const intentDetected =
    /\b(gast|gäst|einladen|gaesteliste|gästeliste)\b/.test(lower) &&
    /\b(hinzuf|hinzu|eintragen|neu)\b/.test(lower);
  const name = cleanExtract(
    extractByLabel(message, /\bname\s*[:\-]?\s*([^,.\n]{3,80})/i) ??
      extractByLabel(message, /\bgast\s*[:\-]?\s*([^,.\n]{3,80})/i)
  );
  const email = cleanExtract(extractByLabel(message, /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i));
  const household = cleanExtract(extractByLabel(message, /(?:haushalt|familie)\s*[:\-]?\s*([^,.\n]{2,80})/i));

  const result: {
    intentDetected: boolean;
    name?: string;
    email?: string;
    household?: string;
  } = { intentDetected };
  const cleanedName = name?.replace(/\s+email\s+\S+$/i, "").trim();
  if (cleanedName) {
    result.name = cleanedName;
  }
  if (email) {
    result.email = email;
  }
  if (household) {
    result.household = household;
  }
  return result;
}

function mapCategoryToLabel(
  category: "venue" | "catering" | "photography" | "music" | "attire" | "florals" | "stationery-admin"
) {
  switch (category) {
    case "venue":
      return "Location";
    case "catering":
      return "Catering";
    case "photography":
      return "Fotografie";
    case "music":
      return "Musik";
    case "attire":
      return "Styling & Outfit";
    case "florals":
      return "Floristik";
    case "stationery-admin":
      return "Papeterie & Admin";
    default:
      return category;
  }
}

function parseManualVendorIntent(userMessage: string): {
  intentDetected: boolean;
  category?: "venue" | "catering" | "photography" | "music" | "attire" | "florals" | "stationery-admin";
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
} {
  const text = userMessage.trim();
  const lower = text.toLowerCase();
  const hasActionWord = /\b(manuell|hinzuf|eintragen|gefunden|gebucht)\b/.test(lower);
  const hasVendorHint =
    /\b(dj|dienstleister|anbieter|fotograf|catering|band|floristik|styling|location)\b/.test(lower) ||
    lower.includes("nicht im sortiment");
  const intentDetected = hasActionWord && hasVendorHint;

  const category = detectVendorCategory(lower);
  let name =
    extractDjName(text) ??
    extractByLabel(
      text,
      /(?:anbieter|dienstleister|fotograf(?:in)?|band|cater(?:er|ing)?|location)\s*[:\-]?\s*([^,.\n]+)/i
    ) ??
    extractByLabel(text, /(?:haben|gefunden|gebucht)\s+(?:schon\s+)?([^,.\n]{3,80})/i);
  if (name && /\b(gefunden|gebucht|manuell|hinzu|eintragen)\b/i.test(name)) {
    name =
      extractByLabel(
        text,
        /(?:fuege|füge|trag|trage)[^.\n]*?\bdj\s+([^,.\n]+?)(?:\s+manuell|\s+hinzu|,|\.|$)/i
      ) ?? name;
  }
  const phone = extractByLabel(
    text,
    /(?:telefon|tel\.?|mobil|phone)\s*[:\-]?\s*([+()0-9\/\-\s]{6,})/i
  );
  const email = extractByLabel(text, /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
  const addressRaw = extractByLabel(
    text,
    /(?:adresse|anschrift)\s*(?:ist\s*)?[:\-]?\s*([^.\n]{5,160})/i
  );
  const address = addressRaw
    ?.replace(/^(?:ist\s*[:\-]?\s*)/i, "")
    .replace(/,\s*(?:telefon|tel\.?|mobil|phone)\b.*$/i, "")
    .trim();

  const result: {
    intentDetected: boolean;
    category?: "venue" | "catering" | "photography" | "music" | "attire" | "florals" | "stationery-admin";
    name?: string;
    phone?: string;
    email?: string;
    address?: string;
  } = { intentDetected };
  const cleanName = cleanExtract(name);
  const cleanPhone = cleanExtract(phone);
  const cleanEmail = cleanExtract(email);
  const cleanAddress = cleanExtract(address);
  if (category) {
    result.category = category;
  }
  if (cleanName) {
    result.name = cleanName;
  }
  if (cleanPhone) {
    result.phone = cleanPhone;
  }
  if (cleanEmail) {
    result.email = cleanEmail;
  }
  if (cleanAddress) {
    result.address = cleanAddress;
  }
  return result;
}

function detectVendorCategory(
  lower: string
): "venue" | "catering" | "photography" | "music" | "attire" | "florals" | "stationery-admin" | undefined {
  if (/\b(dj|musik|band)\b/.test(lower)) {
    return "music";
  }
  if (/\b(catering|essen|menue)\b/.test(lower)) {
    return "catering";
  }
  if (/\b(foto|fotograf)\b/.test(lower)) {
    return "photography";
  }
  if (/\b(floristik|blumen|deko)\b/.test(lower)) {
    return "florals";
  }
  if (/\b(styling|kleid|anzug|outfit)\b/.test(lower)) {
    return "attire";
  }
  if (/\b(location|venue|saal)\b/.test(lower)) {
    return "venue";
  }
  return undefined;
}

function extractByLabel(text: string, pattern: RegExp): string | undefined {
  const match = text.match(pattern);
  return match?.[1];
}

function extractDjName(text: string): string | undefined {
  const matches = [...text.matchAll(/\bdj\s+([^\n,\.]{2,80})/gi)];
  if (matches.length === 0) {
    return undefined;
  }

  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const raw = matches[index]?.[1];
    if (!raw) {
      continue;
    }
    const candidate = raw
      .replace(/\b(manuell|hinzu|eintragen|bitte)\b.*$/i, "")
      .trim();
    if (!candidate || /\b(gefunden|gebucht)\b/i.test(candidate)) {
      continue;
    }
    return candidate;
  }

  return undefined;
}

function cleanExtract(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const next = value.replace(/\s+/g, " ").trim();
  return next.length > 0 ? next : undefined;
}

function isConfirmationMessage(lowerText: string) {
  return /\b(bestätigen|bestaetigen|ja mach|ja bitte|ok mach|freigeben)\b/.test(lowerText);
}

function isCancelMessage(lowerText: string) {
  return /\b(abbrechen|stop|nein|verwerfen|doch nicht)\b/.test(lowerText);
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

interface IngestionCoverageRecord {
  id?: string;
  name?: string;
  category?: string;
  region?: string;
  websiteUrl?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  sourcePortalId?: string;
  ratingValue?: number;
  ratingCount?: number;
  sourceQualityScore?: number;
  quarantineReason?: string;
  freshnessTimestamp?: string;
}

async function buildIngestionCoverageSnapshot() {
  const ingestionOutputRoot = path.resolve(process.cwd(), "../ingestion/output/ingestion");
  const dbPath = path.resolve(ingestionOutputRoot, "vendor-discovery-db.json");
  const quarantinePath = path.resolve(
    ingestionOutputRoot,
    "vendor-discovery-quarantine.json"
  );
  const continuousStatePath = path.resolve(
    ingestionOutputRoot,
    "continuous-runner-state.json"
  );

  const records = await readJsonFile<IngestionCoverageRecord[]>(dbPath, []);
  const quarantined = await readJsonFile<IngestionCoverageRecord[]>(quarantinePath, []);
  const continuousState = await readJsonFile<Record<string, unknown>>(
    continuousStatePath,
    {}
  );

  const observedRecords = [...records, ...quarantined];

  const regions = germanSweepRegions.map((region) => {
    const matching = observedRecords.filter((record) => record.region === region);
    const freshest = matching
      .map((record) => record.freshnessTimestamp ?? "")
      .sort()
      .at(-1);

    return {
      name: region,
      covered: matching.length > 0,
      recordCount: matching.length,
      ...(freshest ? { lastUpdatedAt: freshest } : {})
    };
  });

  const categories = germanSweepCategories.map((category) => {
    const matching = observedRecords.filter((record) => record.category === category);
    return {
      name: category,
      covered: matching.length > 0,
      recordCount: matching.length
    };
  });

  const recentSamples = (records.length > 0 ? records : quarantined)
    .slice()
    .sort((a, b) =>
      (b.freshnessTimestamp ?? "").localeCompare(a.freshnessTimestamp ?? "")
    )
    .slice(0, 25)
    .map((record) => ({
      name: record.name ?? "Unbekannt",
      category: record.category ?? "unknown",
      region: record.region ?? "unknown",
      sourcePortalId: record.sourcePortalId ?? "unknown",
      ...(record.contactEmail ? { contactEmail: record.contactEmail } : {}),
      ...(record.contactPhone ? { contactPhone: record.contactPhone } : {}),
      ...(record.address ? { address: record.address } : {}),
      ...(record.websiteUrl ? { websiteUrl: record.websiteUrl } : {}),
      ...(record.quarantineReason ? { quarantineReason: record.quarantineReason } : {}),
      ...(typeof record.ratingValue === "number" ? { ratingValue: record.ratingValue } : {}),
      ...(typeof record.ratingCount === "number" ? { ratingCount: record.ratingCount } : {}),
      ...(typeof record.sourceQualityScore === "number"
        ? { sourceQualityScore: record.sourceQualityScore }
        : {}),
      ...(record.freshnessTimestamp ? { freshnessTimestamp: record.freshnessTimestamp } : {})
    }));

  const coveredRegions = regions.filter((entry) => entry.covered).length;
  const coveredCategories = categories.filter((entry) => entry.covered).length;

  return {
    generatedAt: new Date().toISOString(),
    runner: {
      active: Boolean(continuousState.active),
      ...(typeof continuousState.pid === "number" ? { pid: continuousState.pid } : {}),
      ...(typeof continuousState.cycles === "number"
        ? { cycles: continuousState.cycles }
        : {}),
      ...(typeof continuousState.lastHeartbeatAt === "string"
        ? { lastHeartbeatAt: continuousState.lastHeartbeatAt }
        : {}),
      ...(typeof continuousState.lastCycleStartedAt === "string"
        ? { lastCycleStartedAt: continuousState.lastCycleStartedAt }
        : {}),
      ...(typeof continuousState.lastCycleCompletedAt === "string"
        ? { lastCycleCompletedAt: continuousState.lastCycleCompletedAt }
        : {}),
      ...(typeof continuousState.lastError === "string" && continuousState.lastError.length > 0
        ? { lastError: continuousState.lastError }
        : {})
    },
    coverage: {
      regionsTotal: regions.length,
      regionsCovered: coveredRegions,
      regionsCoveragePercent:
        regions.length > 0 ? Math.round((coveredRegions / regions.length) * 100) : 0,
      categoriesTotal: categories.length,
      categoriesCovered: coveredCategories,
      categoriesCoveragePercent:
        categories.length > 0
          ? Math.round((coveredCategories / categories.length) * 100)
          : 0,
      recordsTotal: records.length,
      quarantinedTotal: quarantined.length,
      observedTotal: observedRecords.length
    },
    regions,
    categories,
    samples: recentSamples
  };
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const content = await readFile(filePath, "utf-8");
    return JSON.parse(content) as T;
  } catch {
    return fallback;
  }
}
