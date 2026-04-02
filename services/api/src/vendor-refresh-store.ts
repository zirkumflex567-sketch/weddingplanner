import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  createVendorRefreshJob,
  type VendorRefreshJob,
  type VendorRefreshRequest,
  type VendorRefreshRun
} from "@wedding/ingestion";

export interface VendorRefreshStore {
  createJob(input: VendorRefreshRequest): Promise<VendorRefreshJob>;
  listJobs(): Promise<VendorRefreshJob[]>;
  getJob(id: string): Promise<VendorRefreshJob | null>;
  saveRun(run: VendorRefreshRun): Promise<VendorRefreshRun>;
  listRuns(jobId: string): Promise<VendorRefreshRun[]>;
  getRun(jobId: string, runId: string): Promise<VendorRefreshRun | null>;
}

export class InMemoryVendorRefreshStore implements VendorRefreshStore {
  private readonly jobs = new Map<string, VendorRefreshJob>();
  private readonly runsByJobId = new Map<string, VendorRefreshRun[]>();

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
}

interface PersistedVendorRefreshState {
  jobs: VendorRefreshJob[];
  runs: VendorRefreshRun[];
}

export class FileVendorRefreshStore implements VendorRefreshStore {
  constructor(private readonly filePath: string) {}

  private async readState(): Promise<PersistedVendorRefreshState> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as PersistedVendorRefreshState;
      return {
        jobs: parsed.jobs ?? [],
        runs: parsed.runs ?? []
      };
    } catch {
      return { jobs: [], runs: [] };
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
