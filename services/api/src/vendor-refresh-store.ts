import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  createVendorRefreshJob,
  type PublishableVendorRecord,
  type VendorRefreshJob,
  type VendorRefreshRequest,
  type VendorRefreshRun
} from "@wedding/ingestion";

export interface VendorReviewCandidate {
  id: string;
  jobId: string;
  runId: string;
  category: VendorRefreshRun["category"];
  name: string;
  region: string;
  record: PublishableVendorRecord;
  reviewStatus: "pending" | "approved" | "rejected";
  publicationStatus: "unpublished" | "published";
  qualityStatus: VendorRefreshRun["quality"]["status"];
  qualityIssues: VendorRefreshRun["quality"]["issues"];
  createdAt: string;
  reviewedAt?: string;
  reviewNote?: string;
}

export interface PublishedVendorCatalogRecord extends PublishableVendorRecord {
  id: string;
  sourceCandidateId: string;
  jobId: string;
  runId: string;
  publicationSource: "vendor-refresh-review";
  publishedAt: string;
}

export interface VendorRefreshStore {
  createJob(input: VendorRefreshRequest): Promise<VendorRefreshJob>;
  listJobs(): Promise<VendorRefreshJob[]>;
  getJob(id: string): Promise<VendorRefreshJob | null>;
  saveRun(run: VendorRefreshRun): Promise<VendorRefreshRun>;
  listRuns(jobId: string): Promise<VendorRefreshRun[]>;
  getRun(jobId: string, runId: string): Promise<VendorRefreshRun | null>;
  listCandidates(jobId: string): Promise<VendorReviewCandidate[]>;
  getCandidate(jobId: string, candidateId: string): Promise<VendorReviewCandidate | null>;
  updateCandidate(
    jobId: string,
    candidateId: string,
    input: {
      reviewStatus: "approved" | "rejected";
      reviewNote?: string;
    }
  ): Promise<VendorReviewCandidate | null>;
  publishApprovedCandidates(jobId: string): Promise<PublishedVendorCatalogRecord[]>;
  listPublishedRecords(): Promise<PublishedVendorCatalogRecord[]>;
}

export class InMemoryVendorRefreshStore implements VendorRefreshStore {
  private readonly jobs = new Map<string, VendorRefreshJob>();
  private readonly runsByJobId = new Map<string, VendorRefreshRun[]>();
  private readonly candidatesByJobId = new Map<string, VendorReviewCandidate[]>();
  private readonly publishedRecords: PublishedVendorCatalogRecord[] = [];

  async createJob(input: VendorRefreshRequest) {
    const job = createVendorRefreshJob(input);
    this.jobs.set(job.id, job);
    return structuredClone(job);
  }

  async listJobs() {
    return [...this.jobs.values()]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((job) => structuredClone(job));
  }

  async getJob(id: string) {
    const job = this.jobs.get(id);
    return job ? structuredClone(job) : null;
  }

  async saveRun(run: VendorRefreshRun) {
    const runs = this.runsByJobId.get(run.jobId) ?? [];
    runs.unshift(run);
    this.runsByJobId.set(run.jobId, runs);
    this.upsertCandidatesForRun(run);
    return structuredClone(run);
  }

  async listRuns(jobId: string) {
    const runs = this.runsByJobId.get(jobId) ?? [];
    return runs.map((run) => structuredClone(run));
  }

  async getRun(jobId: string, runId: string) {
    const runs = this.runsByJobId.get(jobId) ?? [];
    const run = runs.find((entry) => entry.id === runId);
    return run ? structuredClone(run) : null;
  }

  async listCandidates(jobId: string) {
    const candidates = this.candidatesByJobId.get(jobId) ?? [];
    return candidates.map((candidate) => structuredClone(candidate));
  }

  async getCandidate(jobId: string, candidateId: string) {
    const candidates = this.candidatesByJobId.get(jobId) ?? [];
    const candidate = candidates.find((entry) => entry.id === candidateId);
    return candidate ? structuredClone(candidate) : null;
  }

  async updateCandidate(
    jobId: string,
    candidateId: string,
    input: { reviewStatus: "approved" | "rejected"; reviewNote?: string }
  ) {
    const candidates = this.candidatesByJobId.get(jobId) ?? [];
    const candidate = candidates.find((entry) => entry.id === candidateId);

    if (!candidate) {
      return null;
    }

    candidate.reviewStatus = input.reviewStatus;
    candidate.reviewedAt = new Date().toISOString();
    if (input.reviewNote) {
      candidate.reviewNote = input.reviewNote;
    }

    return structuredClone(candidate);
  }

  async publishApprovedCandidates(jobId: string) {
    const candidates = this.candidatesByJobId.get(jobId) ?? [];
    const publishedAt = new Date().toISOString();
    const newlyPublished: PublishedVendorCatalogRecord[] = [];

    for (const candidate of candidates) {
      if (
        candidate.reviewStatus !== "approved" ||
        candidate.publicationStatus === "published" ||
        this.publishedRecords.some((record) => record.sourceCandidateId === candidate.id)
      ) {
        continue;
      }

      candidate.publicationStatus = "published";
      const publishedRecord: PublishedVendorCatalogRecord = {
        id: `${candidate.runId}:${candidate.id}`,
        sourceCandidateId: candidate.id,
        jobId: candidate.jobId,
        runId: candidate.runId,
        publicationSource: "vendor-refresh-review",
        publishedAt,
        ...structuredClone(candidate.record)
      };
      this.publishedRecords.unshift(publishedRecord);
      newlyPublished.push(publishedRecord);
    }

    return structuredClone(newlyPublished);
  }

  async listPublishedRecords() {
    return this.publishedRecords.map((record) => structuredClone(record));
  }

  private upsertCandidatesForRun(run: VendorRefreshRun) {
    const existingCandidates = this.candidatesByJobId.get(run.jobId) ?? [];
    const nextCandidates = run.preview.publishableRecords.map((record, index) => {
      const existingCandidate = existingCandidates.find(
        (candidate) =>
          candidate.runId === run.id &&
          candidate.record.name === record.name &&
          candidate.record.websiteUrl === record.websiteUrl
      );

      if (existingCandidate) {
        existingCandidate.record = structuredClone(record);
        existingCandidate.qualityStatus = run.quality.status;
        existingCandidate.qualityIssues = structuredClone(run.quality.issues);
        return existingCandidate;
      }

      return {
        id: `${run.id}:candidate:${index + 1}`,
        jobId: run.jobId,
        runId: run.id,
        category: run.category,
        name: record.name,
        region: record.region,
        record: structuredClone(record),
        reviewStatus: "pending" as const,
        publicationStatus: "unpublished" as const,
        qualityStatus: run.quality.status,
        qualityIssues: structuredClone(run.quality.issues),
        createdAt: run.completedAt
      };
    });

    const untouchedCandidates = existingCandidates.filter(
      (candidate) => candidate.runId !== run.id
    );

    this.candidatesByJobId.set(run.jobId, [...nextCandidates, ...untouchedCandidates]);
  }
}

interface PersistedVendorRefreshState {
  jobs: VendorRefreshJob[];
  runs: VendorRefreshRun[];
  candidates: VendorReviewCandidate[];
  publishedRecords: PublishedVendorCatalogRecord[];
}

export class FileVendorRefreshStore implements VendorRefreshStore {
  constructor(private readonly filePath: string) {}

  private async readState(): Promise<PersistedVendorRefreshState> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as PersistedVendorRefreshState;
      return {
        jobs: parsed.jobs ?? [],
        runs: parsed.runs ?? [],
        candidates: parsed.candidates ?? [],
        publishedRecords: parsed.publishedRecords ?? []
      };
    } catch {
      return { jobs: [], runs: [], candidates: [], publishedRecords: [] };
    }
  }

  private async writeState(state: PersistedVendorRefreshState) {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(state, null, 2), "utf8");
  }

  async createJob(input: VendorRefreshRequest) {
    const state = await this.readState();
    const job = createVendorRefreshJob(input);
    state.jobs.push(job);
    await this.writeState(state);
    return structuredClone(job);
  }

  async listJobs() {
    const state = await this.readState();
    return [...state.jobs]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((job) => structuredClone(job));
  }

  async getJob(id: string) {
    const state = await this.readState();
    const job = state.jobs.find((entry) => entry.id === id);
    return job ? structuredClone(job) : null;
  }

  async saveRun(run: VendorRefreshRun) {
    const state = await this.readState();
    state.runs.unshift(run);
    state.candidates = upsertPersistedCandidates(state.candidates, run);
    await this.writeState(state);
    return structuredClone(run);
  }

  async listRuns(jobId: string) {
    const state = await this.readState();
    return state.runs
      .filter((entry) => entry.jobId === jobId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((run) => structuredClone(run));
  }

  async getRun(jobId: string, runId: string) {
    const state = await this.readState();
    const run = state.runs.find(
      (entry) => entry.jobId === jobId && entry.id === runId
    );
    return run ? structuredClone(run) : null;
  }

  async listCandidates(jobId: string) {
    const state = await this.readState();
    return state.candidates
      .filter((candidate) => candidate.jobId === jobId)
      .map((candidate) => structuredClone(candidate));
  }

  async getCandidate(jobId: string, candidateId: string) {
    const state = await this.readState();
    const candidate = state.candidates.find(
      (entry) => entry.jobId === jobId && entry.id === candidateId
    );
    return candidate ? structuredClone(candidate) : null;
  }

  async updateCandidate(
    jobId: string,
    candidateId: string,
    input: { reviewStatus: "approved" | "rejected"; reviewNote?: string }
  ) {
    const state = await this.readState();
    const candidate = state.candidates.find(
      (entry) => entry.jobId === jobId && entry.id === candidateId
    );

    if (!candidate) {
      return null;
    }

    candidate.reviewStatus = input.reviewStatus;
    candidate.reviewedAt = new Date().toISOString();
    if (input.reviewNote) {
      candidate.reviewNote = input.reviewNote;
    }

    await this.writeState(state);
    return structuredClone(candidate);
  }

  async publishApprovedCandidates(jobId: string) {
    const state = await this.readState();
    const publishedAt = new Date().toISOString();
    const newlyPublished: PublishedVendorCatalogRecord[] = [];

    for (const candidate of state.candidates) {
      if (
        candidate.jobId !== jobId ||
        candidate.reviewStatus !== "approved" ||
        candidate.publicationStatus === "published" ||
        state.publishedRecords.some((record) => record.sourceCandidateId === candidate.id)
      ) {
        continue;
      }

      candidate.publicationStatus = "published";
      const publishedRecord: PublishedVendorCatalogRecord = {
        id: `${candidate.runId}:${candidate.id}`,
        sourceCandidateId: candidate.id,
        jobId: candidate.jobId,
        runId: candidate.runId,
        publicationSource: "vendor-refresh-review",
        publishedAt,
        ...structuredClone(candidate.record)
      };
      state.publishedRecords.unshift(publishedRecord);
      newlyPublished.push(publishedRecord);
    }

    await this.writeState(state);
    return structuredClone(newlyPublished);
  }

  async listPublishedRecords() {
    const state = await this.readState();
    return state.publishedRecords.map((record) => structuredClone(record));
  }
}

export function isVendorRefreshRequest(value: unknown): value is VendorRefreshRequest {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.paidOrderId === "string" &&
    typeof candidate.region === "string" &&
    Array.isArray(candidate.categories) &&
    candidate.categories.every((entry) => typeof entry === "string") &&
    candidate.requestedBy === "customer-payment"
  );
}

function upsertPersistedCandidates(
  existingCandidates: VendorReviewCandidate[],
  run: VendorRefreshRun
) {
  const nextCandidates = run.preview.publishableRecords.map((record, index) => {
    const existingCandidate = existingCandidates.find(
      (candidate) =>
        candidate.runId === run.id &&
        candidate.record.name === record.name &&
        candidate.record.websiteUrl === record.websiteUrl
    );

    if (existingCandidate) {
      existingCandidate.record = structuredClone(record);
      existingCandidate.qualityStatus = run.quality.status;
      existingCandidate.qualityIssues = structuredClone(run.quality.issues);
      return existingCandidate;
    }

    return {
      id: `${run.id}:candidate:${index + 1}`,
      jobId: run.jobId,
      runId: run.id,
      category: run.category,
      name: record.name,
      region: record.region,
      record: structuredClone(record),
      reviewStatus: "pending" as const,
      publicationStatus: "unpublished" as const,
      qualityStatus: run.quality.status,
      qualityIssues: structuredClone(run.quality.issues),
      createdAt: run.completedAt
    };
  });

  const untouchedCandidates = existingCandidates.filter(
    (candidate) => candidate.runId !== run.id
  );

  return [...nextCandidates, ...untouchedCandidates];
}
