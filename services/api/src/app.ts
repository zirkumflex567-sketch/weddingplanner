import { readFile } from "node:fs/promises";
import path from "node:path";
import cors from "@fastify/cors";
import Fastify from "fastify";
import {
  createBootstrapPlan,
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

interface BuildAppOptions {
  workspaceStore?: PrototypeWorkspaceStore;
  vendorRefreshStore?: VendorRefreshStore;
  vendorRefreshExecutor?: VendorRefreshExecutor;
}

export function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({ logger: false });
  const workspaceStore =
    options.workspaceStore ?? new InMemoryPrototypeWorkspaceStore();
  const vendorRefreshStore =
    options.vendorRefreshStore ?? new InMemoryVendorRefreshStore();
  const vendorRefreshExecutor =
    options.vendorRefreshExecutor ?? createVendorRefreshExecutor();

  app.register(cors, {
    origin: true
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
  freshnessTimestamp?: string;
}

async function buildIngestionCoverageSnapshot() {
  const ingestionOutputRoot = path.resolve(process.cwd(), "../ingestion/output/ingestion");
  const dbPath = path.resolve(ingestionOutputRoot, "vendor-discovery-db.json");
  const continuousStatePath = path.resolve(
    ingestionOutputRoot,
    "continuous-runner-state.json"
  );

  const records = await readJsonFile<IngestionCoverageRecord[]>(dbPath, []);
  const continuousState = await readJsonFile<Record<string, unknown>>(
    continuousStatePath,
    {}
  );

  const regions = germanSweepRegions.map((region) => {
    const matching = records.filter((record) => record.region === region);
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
    const matching = records.filter((record) => record.category === category);
    return {
      name: category,
      covered: matching.length > 0,
      recordCount: matching.length
    };
  });

  const recentSamples = records
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
      recordsTotal: records.length
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
