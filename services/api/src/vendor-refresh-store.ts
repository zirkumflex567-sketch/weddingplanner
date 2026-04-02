import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  createVendorRefreshJob,
  type VendorRefreshJob,
  type VendorRefreshRequest
} from "@wedding/ingestion";

export interface VendorRefreshStore {
  createJob(input: VendorRefreshRequest): Promise<VendorRefreshJob>;
  listJobs(): Promise<VendorRefreshJob[]>;
  getJob(id: string): Promise<VendorRefreshJob | null>;
}

export class InMemoryVendorRefreshStore implements VendorRefreshStore {
  private readonly jobs = new Map<string, VendorRefreshJob>();

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
}

interface PersistedVendorRefreshState {
  jobs: VendorRefreshJob[];
}

export class FileVendorRefreshStore implements VendorRefreshStore {
  constructor(private readonly filePath: string) {}

  private async readState(): Promise<PersistedVendorRefreshState> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as PersistedVendorRefreshState;
      return {
        jobs: parsed.jobs ?? []
      };
    } catch {
      return { jobs: [] };
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
