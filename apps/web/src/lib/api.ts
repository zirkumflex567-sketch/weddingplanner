import type {
  PlannedEventId,
  PrototypeExpense,
  PrototypeGuest,
  PrototypePublicRsvpSession,
  PrototypeVendorStage,
  PrototypeWorkspaceProfile,
  PrototypeWorkspace,
  WeddingBootstrapInput
} from "@wedding/shared";

interface WorkspaceResponse {
  workspace: PrototypeWorkspace;
}

interface WorkspaceProfilesResponse {
  profiles: PrototypeWorkspaceProfile[];
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

async function requestJson<T>(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

export function createWorkspace(input: WeddingBootstrapInput) {
  return requestJson<WorkspaceResponse>("/api/prototype/workspaces", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
}

export function listWorkspaceProfiles() {
  return requestJson<WorkspaceProfilesResponse>("/api/prototype/workspaces");
}

export function getWorkspace(id: string) {
  return requestJson<WorkspaceResponse>(`/api/prototype/workspaces/${id}`);
}

export async function deleteWorkspace(id: string) {
  const response = await fetch(`/api/prototype/workspaces/${id}`, {
    method: "DELETE",
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }
}

export function getPublicRsvpSession(token: string) {
  return requestJson<PrototypePublicRsvpSession>(`/api/public/rsvp/${token}`);
}

export function updateWorkspace(id: string, input: WeddingBootstrapInput) {
  return requestJson<WorkspaceResponse>(`/api/prototype/workspaces/${id}/onboarding`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
}

export function addGuest(workspaceId: string, input: CreateGuestInput) {
  return requestJson<WorkspaceResponse>(`/api/prototype/workspaces/${workspaceId}/guests`, {
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
    `/api/prototype/workspaces/${workspaceId}/guests/${guestId}`,
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
  return requestJson<PrototypePublicRsvpSession>(`/api/public/rsvp/${token}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
}

export function addExpense(workspaceId: string, input: CreateExpenseInput) {
  return requestJson<WorkspaceResponse>(`/api/prototype/workspaces/${workspaceId}/expenses`, {
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
    `/api/prototype/workspaces/${workspaceId}/vendors/${vendorId}`,
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
    `/api/prototype/workspaces/${workspaceId}/tasks/${taskId}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ completed })
    }
  );
}
