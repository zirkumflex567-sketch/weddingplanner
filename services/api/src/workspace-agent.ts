import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import type {
  PlannedEventId,
  PrototypeGuest,
  PrototypeVendorStage,
  PrototypeWorkspace,
  WeddingBootstrapInput
} from "@wedding/shared";
import type {
  CreateExpenseInput,
  CreateGuestInput,
  PrototypeWorkspaceStore,
  UpdateGuestInput,
  UpdateVendorInput
} from "./prototype-store";

export type AssistantTier = "free" | "premium";

export interface WorkspaceAgentReply {
  assistantMessage: string;
  workspace: PrototypeWorkspace;
  provider: "openclaw" | "fallback";
  model: string;
}

type WorkspaceAgentOperation =
  | {
      type: "update_profile";
      patch: Partial<WeddingBootstrapInput>;
    }
  | {
      type: "add_guest";
      guest: CreateGuestInput;
    }
  | {
      type: "update_guest";
      selector: {
        guestId?: string;
        name?: string;
        email?: string;
      };
      patch: UpdateGuestInput & Partial<Pick<PrototypeGuest, "name" | "household" | "email" | "eventIds">>;
    }
  | {
      type: "add_expense";
      expense: CreateExpenseInput;
    }
  | {
      type: "update_vendor";
      selector: {
        vendorId?: string;
        vendorName?: string;
      };
      patch: UpdateVendorInput;
    }
  | {
      type: "set_task_completion";
      selector: {
        taskId?: string;
        title?: string;
      };
      completed: boolean;
    };

interface WorkspaceAgentPlan {
  summary: string;
  userFacingReply: string;
  operations: WorkspaceAgentOperation[];
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeEvents(input: unknown): PlannedEventId[] | undefined {
  if (!Array.isArray(input)) {
    return undefined;
  }

  const allowed = new Set<PlannedEventId>([
    "civil-ceremony",
    "free-ceremony",
    "celebration",
    "brunch"
  ]);
  const values = input.filter(
    (value): value is PlannedEventId => typeof value === "string" && allowed.has(value as PlannedEventId)
  );

  return values.length > 0 ? values : undefined;
}

function sanitizeBootstrapPatch(
  current: WeddingBootstrapInput,
  patch: Partial<WeddingBootstrapInput>
): WeddingBootstrapInput {
  return {
    coupleName:
      typeof patch.coupleName === "string" && patch.coupleName.trim()
        ? patch.coupleName.trim()
        : current.coupleName,
    targetDate:
      typeof patch.targetDate === "string" && patch.targetDate.trim()
        ? patch.targetDate.trim()
        : current.targetDate,
    region:
      typeof patch.region === "string" && patch.region.trim() ? patch.region.trim() : current.region,
    guestCountTarget:
      typeof patch.guestCountTarget === "number" && Number.isFinite(patch.guestCountTarget)
        ? patch.guestCountTarget
        : current.guestCountTarget,
    budgetTotal:
      typeof patch.budgetTotal === "number" && Number.isFinite(patch.budgetTotal)
        ? patch.budgetTotal
        : current.budgetTotal,
    stylePreferences: Array.isArray(patch.stylePreferences)
      ? patch.stylePreferences.map((value) => String(value).trim()).filter(Boolean)
      : current.stylePreferences,
    noGoPreferences: Array.isArray(patch.noGoPreferences)
      ? patch.noGoPreferences.map((value) => String(value).trim()).filter(Boolean)
      : current.noGoPreferences,
    plannedEvents: normalizeEvents(patch.plannedEvents) ?? current.plannedEvents,
    disabledVendorCategories: Array.isArray(patch.disabledVendorCategories)
      ? (patch.disabledVendorCategories.map((value) => String(value)) as NonNullable<
          WeddingBootstrapInput["disabledVendorCategories"]
        >)
      : ([...(current.disabledVendorCategories ?? [])] as NonNullable<
          WeddingBootstrapInput["disabledVendorCategories"]
        >),
    invitationCopy: {
      headline:
        typeof patch.invitationCopy?.headline === "string" && patch.invitationCopy.headline.trim()
          ? patch.invitationCopy.headline.trim()
          : current.invitationCopy.headline,
      body:
        typeof patch.invitationCopy?.body === "string" && patch.invitationCopy.body.trim()
          ? patch.invitationCopy.body.trim()
          : current.invitationCopy.body,
      footer:
        typeof patch.invitationCopy?.footer === "string" && patch.invitationCopy.footer.trim()
          ? patch.invitationCopy.footer.trim()
          : current.invitationCopy.footer
    }
  };
}

function findGuest(
  workspace: PrototypeWorkspace,
  selector: { guestId?: string; name?: string; email?: string }
) {
  if (selector.guestId) {
    return workspace.guests.find((guest) => guest.id === selector.guestId) ?? null;
  }

  if (selector.email) {
    const normalizedEmail = selector.email.trim().toLowerCase();
    return workspace.guests.find((guest) => guest.email.toLowerCase() === normalizedEmail) ?? null;
  }

  if (selector.name) {
    const normalizedName = normalizeText(selector.name);
    return (
      workspace.guests.find((guest) => normalizeText(guest.name) === normalizedName) ??
      workspace.guests.find((guest) => normalizeText(guest.name).includes(normalizedName)) ??
      null
    );
  }

  return null;
}

function findVendor(
  workspace: PrototypeWorkspace,
  selector: { vendorId?: string; vendorName?: string }
) {
  if (selector.vendorId) {
    return workspace.plan.vendorMatches.find((vendor) => vendor.id === selector.vendorId) ?? null;
  }

  if (selector.vendorName) {
    const normalizedName = normalizeText(selector.vendorName);
    return (
      workspace.plan.vendorMatches.find((vendor) => normalizeText(vendor.name) === normalizedName) ??
      workspace.plan.vendorMatches.find((vendor) => normalizeText(vendor.name).includes(normalizedName)) ??
      null
    );
  }

  return null;
}

function findTask(
  workspace: PrototypeWorkspace,
  selector: { taskId?: string; title?: string }
) {
  if (selector.taskId) {
    return workspace.tasks.find((task) => task.id === selector.taskId) ?? null;
  }

  if (selector.title) {
    const normalizedTitle = normalizeText(selector.title);
    return (
      workspace.tasks.find((task) => normalizeText(task.title) === normalizedTitle) ??
      workspace.tasks.find((task) => normalizeText(task.title).includes(normalizedTitle)) ??
      null
    );
  }

  return null;
}

function buildWorkspaceSnapshot(workspace: PrototypeWorkspace) {
  return {
    workspaceId: workspace.id,
    coupleName: workspace.coupleName,
    onboarding: workspace.onboarding,
    tasks: workspace.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      completed: task.completed
    })),
    guests: workspace.guests.map((guest) => ({
      id: guest.id,
      name: guest.name,
      household: guest.household,
      email: guest.email,
      rsvpStatus: guest.rsvpStatus,
      mealPreference: guest.mealPreference,
      eventIds: guest.eventIds
    })),
    vendors: workspace.plan.vendorMatches.map((vendor) => ({
      id: vendor.id,
      name: vendor.name,
      category: vendor.category
    })),
    vendorTracker: workspace.vendorTracker,
    expenses: workspace.expenses,
    budgetRemaining: workspace.budgetOverview.overall.remaining
  };
}

function buildPlannerPrompt(
  workspace: PrototypeWorkspace,
  userMessage: string,
  tier: AssistantTier
) {
  return [
    "You are a strict wedding workspace operator.",
    "Interpret the user's intent semantically and return JSON only.",
    "Never modify anything outside the provided workspace.",
    "If the user asks for external actions, browsing, emails, phone calls, or vendor outreach, do not invent execution. You may mention it in userFacingReply, but operations must stay strictly inside the workspace data.",
    tier === "free"
      ? "FREE tier rule: do not create any mutation operations. Explain what to do, but operations must be an empty array."
      : "PREMIUM tier rule: you may propose mutation operations only inside the workspace schema below.",
    "Allowed operation types: update_profile, add_guest, update_guest, add_expense, update_vendor, set_task_completion.",
    "For update_guest, patch may include name, household, email, eventIds, rsvpStatus, mealPreference, dietaryNotes, message.",
    "For update_vendor, patch may include stage, quoteAmount, note.",
    "For update_profile, patch may include onboarding fields only: coupleName, targetDate, region, guestCountTarget, budgetTotal, stylePreferences, noGoPreferences, plannedEvents, disabledVendorCategories, invitationCopy.",
    "If you are unsure, prefer no operation and explain the ambiguity.",
    "Return exactly one JSON object with this shape:",
    JSON.stringify(
      {
        summary: "short internal summary",
        userFacingReply: "natural German reply",
        operations: [
          {
            type: "update_profile",
            patch: {
              coupleName: "string"
            }
          }
        ]
      },
      null,
      2
    ),
    "Workspace snapshot:",
    JSON.stringify(buildWorkspaceSnapshot(workspace), null, 2),
    "User message:",
    userMessage
  ].join("\n\n");
}

function extractJsonObject(raw: string) {
  const trimmed = raw.trim();

  if (!trimmed) {
    return null;
  }

  const directStart = trimmed.indexOf("{");
  const directEnd = trimmed.lastIndexOf("}");

  if (directStart >= 0 && directEnd > directStart) {
    try {
      return JSON.parse(trimmed.slice(directStart, directEnd + 1)) as WorkspaceAgentPlan;
    } catch {
      return null;
    }
  }

  return null;
}

async function runOpenClawPrompt(command: string, prompt: string) {
  return new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve, reject) => {
    const quotedPrompt = prompt.replace(/"/g, '\\"');
    const child = spawn(`${command} --message "${quotedPrompt}"`, {
      shell: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({ stdout, stderr, exitCode: exitCode ?? 1 });
    });
  });
}

async function planWithOpenClaw(
  command: string,
  workspace: PrototypeWorkspace,
  userMessage: string,
  tier: AssistantTier
) {
  const result = await runOpenClawPrompt(command, buildPlannerPrompt(workspace, userMessage, tier));

  if (result.exitCode !== 0) {
    throw new Error(result.stderr || `OpenClaw command failed with ${result.exitCode}`);
  }

  const shellResponse = extractJsonObject(result.stdout);

  if (!shellResponse) {
    throw new Error("OpenClaw response did not contain valid plan JSON");
  }

  return shellResponse;
}

export async function applyWorkspaceAgentPlan(
  workspaceStore: PrototypeWorkspaceStore,
  workspace: PrototypeWorkspace,
  plan: WorkspaceAgentPlan
) {
  let nextWorkspace = workspace;
  const appliedSummaries: string[] = [];

  for (const operation of plan.operations) {
    if (operation.type === "update_profile") {
      const updatedWorkspace = await workspaceStore.updateWorkspace(
        nextWorkspace.id,
        sanitizeBootstrapPatch(nextWorkspace.onboarding, operation.patch)
      );

      if (updatedWorkspace) {
        nextWorkspace = updatedWorkspace;
        appliedSummaries.push("Profil aktualisiert");
      }
      continue;
    }

    if (operation.type === "add_guest") {
      const guest = operation.guest;
      const updatedWorkspace = await workspaceStore.addGuest(nextWorkspace.id, {
        name: guest.name.trim(),
        household: guest.household.trim(),
        email: guest.email.trim(),
        eventIds: normalizeEvents(guest.eventIds) ?? nextWorkspace.onboarding.plannedEvents
      });

      if (updatedWorkspace) {
        nextWorkspace = updatedWorkspace;
        appliedSummaries.push(`Gast ${guest.name.trim()} angelegt`);
      }
      continue;
    }

    if (operation.type === "update_guest") {
      const guest = findGuest(nextWorkspace, operation.selector);

      if (!guest) {
        continue;
      }

      const patch = operation.patch;
      const guestPatch: UpdateGuestInput = {
        ...(typeof patch.name === "string" ? { name: patch.name.trim() } : {}),
        ...(typeof patch.household === "string"
          ? { household: patch.household.trim() }
          : {}),
        ...(typeof patch.email === "string" ? { email: patch.email.trim() } : {}),
        ...(patch.eventIds ? { eventIds: normalizeEvents(patch.eventIds) ?? guest.eventIds } : {}),
        ...(typeof patch.rsvpStatus === "string" ? { rsvpStatus: patch.rsvpStatus } : {}),
        ...(typeof patch.mealPreference === "string"
          ? { mealPreference: patch.mealPreference }
          : {}),
        ...(typeof patch.dietaryNotes === "string"
          ? { dietaryNotes: patch.dietaryNotes.trim() }
          : {}),
        ...(typeof patch.message === "string" ? { message: patch.message.trim() } : {})
      };
      const updatedWorkspace = await workspaceStore.updateGuest(
        nextWorkspace.id,
        guest.id,
        guestPatch
      );

      if (updatedWorkspace) {
        nextWorkspace = updatedWorkspace;
        appliedSummaries.push(`Gast ${guest.name} aktualisiert`);
      }
      continue;
    }

    if (operation.type === "add_expense") {
      const updatedWorkspace = await workspaceStore.addExpense(nextWorkspace.id, {
        label: operation.expense.label.trim(),
        category: operation.expense.category,
        amount: operation.expense.amount,
        status: operation.expense.status,
        vendorName: operation.expense.vendorName.trim()
      });

      if (updatedWorkspace) {
        nextWorkspace = updatedWorkspace;
        appliedSummaries.push(`Budgeteintrag ${operation.expense.label.trim()} angelegt`);
      }
      continue;
    }

    if (operation.type === "update_vendor") {
      const vendor = findVendor(nextWorkspace, operation.selector);

      if (!vendor) {
        continue;
      }

      const updatedWorkspace = await workspaceStore.updateVendor(nextWorkspace.id, vendor.id, {
        stage: operation.patch.stage,
        quoteAmount:
          typeof operation.patch.quoteAmount === "number" &&
          Number.isFinite(operation.patch.quoteAmount)
            ? operation.patch.quoteAmount
            : null,
        note: operation.patch.note.trim()
      });

      if (updatedWorkspace) {
        nextWorkspace = updatedWorkspace;
        appliedSummaries.push(`Vendor ${vendor.name} aktualisiert`);
      }
      continue;
    }

    if (operation.type === "set_task_completion") {
      const task = findTask(nextWorkspace, operation.selector);

      if (!task) {
        continue;
      }

      const updatedWorkspace = await workspaceStore.setTaskCompletion(
        nextWorkspace.id,
        task.id,
        operation.completed
      );

      if (updatedWorkspace) {
        nextWorkspace = updatedWorkspace;
        appliedSummaries.push(
          `${operation.completed ? "Aufgabe erledigt" : "Aufgabe wieder geoeffnet"}: ${task.title}`
        );
      }
    }
  }

  return {
    workspace: nextWorkspace,
    appliedSummaries
  };
}

export async function runWorkspaceAgent(input: {
  workspaceStore: PrototypeWorkspaceStore;
  workspace: PrototypeWorkspace;
  userMessage: string;
  tier: AssistantTier;
  command: string;
}) {
  const plan = await planWithOpenClaw(
    input.command,
    input.workspace,
    input.userMessage,
    input.tier
  );
  const execution = await applyWorkspaceAgentPlan(
    input.workspaceStore,
    input.workspace,
    {
      ...plan,
      operations: input.tier === "free" ? [] : plan.operations
    }
  );
  const appliedSuffix =
    execution.appliedSummaries.length > 0
      ? `\n\nDurchgefuehrte Aenderungen: ${execution.appliedSummaries.join(" / ")}.`
      : "";

  return {
    assistantMessage: `${plan.userFacingReply}${appliedSuffix}`.trim(),
    workspace: execution.workspace,
    provider: "openclaw" as const,
    model: `${input.tier}-workspace-agent-v1-${randomUUID().slice(0, 8)}`
  } satisfies WorkspaceAgentReply;
}

