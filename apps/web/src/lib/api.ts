import type {
  PlannedEventId,
  PrototypeExpense,
  PrototypeGuest,
  PrototypePublicRsvpSession,
  PrototypeVendorStage,
  PrototypeWorkspaceProfile,
  PrototypeWorkspace,
  WeddingBootstrapInput,
  WeddingConsultantTurn
} from "@wedding/shared";
import type { ConsultationMessage } from "../components/ConsultationPanel";

interface WorkspaceResponse {
  workspace: PrototypeWorkspace;
}

interface WorkspaceProfilesResponse {
  profiles: PrototypeWorkspaceProfile[];
}

export interface VendorRefreshJob {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: "queued";
  request: {
    paidOrderId: string;
    region: string;
    categories: string[];
    requestedBy: "customer-payment";
  };
  plan: {
    strategy: {
      mode: "curated-plus-refresh" | "refresh-only";
      requiresPaidRefresh: boolean;
      note: string;
    };
  };
}

interface VendorRefreshJobsResponse {
  jobs: VendorRefreshJob[];
}

export interface VendorRefreshRun {
  id: string;
  jobId: string;
  category: string;
  createdAt: string;
  completedAt: string;
  status: "completed" | "completed-with-gaps" | "failed";
  connectorResults: Array<{
    connectorId: string;
    status: "success" | "skipped" | "failed";
    executedAt: string;
    itemCount: number;
    note?: string;
  }>;
  quality: {
    status: "ready-for-review" | "needs-attention";
    publishableRecordCount: number;
    issues: Array<{
      severity: "warning" | "error";
      code: string;
      message: string;
      recordName?: string;
    }>;
  };
}

interface VendorRefreshRunResponse {
  run: VendorRefreshRun;
}

interface VendorRefreshRunsResponse {
  runs: VendorRefreshRun[];
}

export interface VendorReviewCandidate {
  id: string;
  jobId: string;
  runId: string;
  category: string;
  name: string;
  region: string;
  reviewStatus: "pending" | "approved" | "rejected";
  publicationStatus: "unpublished" | "published";
  qualityStatus: "ready-for-review" | "needs-attention";
  qualityIssues: Array<{
    severity: "warning" | "error";
    code: string;
    message: string;
    recordName?: string;
  }>;
  reviewNote?: string;
  record: {
    name: string;
    category: string;
    region: string;
    websiteUrl?: string;
    contactEmail?: string;
    contactPhone?: string;
    address?: string;
    mapsUrl?: string;
    priceAnchors: string[];
    serviceHints: string[];
    sourceProvenance: string[];
    freshnessTimestamp: string;
    blockedFieldAudit: string[];
  };
}

interface VendorReviewCandidatesResponse {
  candidates: VendorReviewCandidate[];
}

interface VendorReviewCandidateResponse {
  candidate: VendorReviewCandidate;
}

export interface PublishedVendorCatalogRecord {
  id: string;
  sourceCandidateId: string;
  jobId: string;
  runId: string;
  publicationSource: "vendor-refresh-review";
  publishedAt: string;
  name: string;
  category: string;
  region: string;
  websiteUrl?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  mapsUrl?: string;
  priceAnchors: string[];
  serviceHints: string[];
  sourceProvenance: string[];
  freshnessTimestamp: string;
  blockedFieldAudit: string[];
}

interface PublishedVendorCatalogResponse {
  records: PublishedVendorCatalogRecord[];
}

interface PublishedVendorCatalogPublishResponse {
  publishedRecords: PublishedVendorCatalogRecord[];
}

interface CreateGuestInput {
  name: string;
  household: string;
  email: string;
  eventIds: PlannedEventId[];
}

interface CreateExpenseInput {
  label: PrototypeExpense["label"];
  category: PrototypeExpense["category"];
  amount: PrototypeExpense["amount"];
  status: PrototypeExpense["status"];
  vendorName: PrototypeExpense["vendorName"];
}

interface UpdateVendorInput {
  stage: PrototypeVendorStage;
  quoteAmount: number | null;
  note: string;
}

interface UpdatePublicRsvpInput {
  rsvpStatus?: PrototypeGuest["rsvpStatus"];
  mealPreference?: PrototypeGuest["mealPreference"];
  dietaryNotes?: string;
  message?: string;
}

interface ConsultantReplyResponse {
  turn: WeddingConsultantTurn;
  provider: "deterministic" | "ollama" | "fallback";
  model: string;
}

export interface ConsultantVoiceTranscriptionResponse {
  text: string;
  language: string;
  durationSeconds?: number | null;
}

export interface ConsultantVoiceSynthesisResponse {
  audioBase64: string;
  mimeType: string;
  sampleRate: number;
}

const appBasePath = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
const apiBasePath = `${appBasePath}/api`;

function createApiPath(path: string) {
  return `${apiBasePath}${path}`;
}

async function requestJson<T>(path: string, init?: RequestInit) {
  const response = await fetch(createApiPath(path), {
    ...init,
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

export function createWorkspace(input: WeddingBootstrapInput) {
  return requestJson<WorkspaceResponse>("/prototype/workspaces", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
}

export function listWorkspaceProfiles() {
  return requestJson<WorkspaceProfilesResponse>("/prototype/workspaces");
}

export function listVendorRefreshJobs() {
  return requestJson<VendorRefreshJobsResponse>("/prototype/vendor-refresh-jobs");
}

export function createVendorRefreshJob(input: {
  paidOrderId: string;
  region: string;
  categories: string[];
  requestedBy: "customer-payment";
}) {
  return requestJson<{ job: VendorRefreshJob }>("/prototype/vendor-refresh-jobs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
}

export function runVendorRefreshJob(jobId: string, input: { category: string }) {
  return requestJson<VendorRefreshRunResponse>(`/prototype/vendor-refresh-jobs/${jobId}/runs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
}

export function listVendorRefreshRuns(jobId: string) {
  return requestJson<VendorRefreshRunsResponse>(`/prototype/vendor-refresh-jobs/${jobId}/runs`);
}

export function listVendorReviewCandidates(jobId: string) {
  return requestJson<VendorReviewCandidatesResponse>(
    `/prototype/vendor-refresh-jobs/${jobId}/candidates`
  );
}

export function updateVendorReviewCandidate(
  jobId: string,
  candidateId: string,
  input: {
    reviewStatus: "approved" | "rejected";
    reviewNote?: string;
  }
) {
  return requestJson<VendorReviewCandidateResponse>(
    `/prototype/vendor-refresh-jobs/${jobId}/candidates/${candidateId}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(input)
    }
  );
}

export function publishVendorRefreshJob(jobId: string) {
  return requestJson<PublishedVendorCatalogPublishResponse>(
    `/prototype/vendor-refresh-jobs/${jobId}/publish`,
    {
      method: "POST"
    }
  );
}

export function listPublishedVendorCatalog() {
  return requestJson<PublishedVendorCatalogResponse>("/prototype/vendor-catalog");
}

export function getWorkspace(id: string) {
  return requestJson<WorkspaceResponse>(`/prototype/workspaces/${id}`);
}

export async function deleteWorkspace(id: string) {
  const response = await fetch(createApiPath(`/prototype/workspaces/${id}`), {
    method: "DELETE",
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }
}

export function getPublicRsvpSession(token: string) {
  return requestJson<PrototypePublicRsvpSession>(`/public/rsvp/${token}`);
}

export function updateWorkspace(id: string, input: WeddingBootstrapInput) {
  return requestJson<WorkspaceResponse>(`/prototype/workspaces/${id}/onboarding`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
}

export function addGuest(workspaceId: string, input: CreateGuestInput) {
  return requestJson<WorkspaceResponse>(`/prototype/workspaces/${workspaceId}/guests`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
}

export function updateGuestRsvp(
  workspaceId: string,
  guestId: string,
  rsvpStatus: PrototypeGuest["rsvpStatus"]
) {
  return requestJson<WorkspaceResponse>(
    `/prototype/workspaces/${workspaceId}/guests/${guestId}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ rsvpStatus })
    }
  );
}

export function submitPublicRsvp(token: string, input: UpdatePublicRsvpInput) {
  return requestJson<PrototypePublicRsvpSession>(`/public/rsvp/${token}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
}

export function addExpense(workspaceId: string, input: CreateExpenseInput) {
  return requestJson<WorkspaceResponse>(`/prototype/workspaces/${workspaceId}/expenses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
}

export function updateVendorLead(
  workspaceId: string,
  vendorId: string,
  input: UpdateVendorInput
) {
  return requestJson<WorkspaceResponse>(
    `/prototype/workspaces/${workspaceId}/vendors/${vendorId}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(input)
    }
  );
}

export function setTaskCompleted(
  workspaceId: string,
  taskId: string,
  completed: boolean
) {
  return requestJson<WorkspaceResponse>(
    `/prototype/workspaces/${workspaceId}/tasks/${taskId}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ completed })
    }
  );
}

export function replyWithWeddingConsultant(input: {
  workspace: PrototypeWorkspace;
  currentTurn: WeddingConsultantTurn;
  messages: ConsultationMessage[];
  userMessage: string;
}) {
  return requestJson<ConsultantReplyResponse>("/prototype/consultant/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
}

export function transcribeWeddingConsultantVoice(input: {
  audioBase64: string;
  mimeType?: string;
  languageHint?: string;
}) {
  return requestJson<ConsultantVoiceTranscriptionResponse>("/prototype/consultant/transcribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
}

export function synthesizeWeddingConsultantVoice(input: { text: string }) {
  return requestJson<ConsultantVoiceSynthesisResponse>("/prototype/consultant/speak", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
}
