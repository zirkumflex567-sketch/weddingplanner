import cors from "@fastify/cors";
import Fastify from "fastify";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  continueWeddingConsultantConversation,
  createBootstrapPlan,
  createWeddingConsultantOpening,
  isWeddingBootstrapInput,
  type PrototypeWorkspace,
  type WeddingConsultantTurn,
  type VendorSearchCategory
} from "@wedding/shared";
import {
  AiOrchestratorHttpClient,
  type AssistantChatMessage,
  type VoiceSynthesisResponse,
  type VoiceTranscriptionResponse
} from "@wedding/ai-orchestrator";
import {
  createVendorConnectorPreview,
  type DirectoryDiscoveryResultInput,
  type GooglePlacesResultInput,
  type VendorWebsitePageInput
} from "@wedding/ingestion";
import {
  InMemoryPrototypeWorkspaceStore,
  type CreateSeatTableInput,
  isCreateExpenseInput,
  isCreateGuestInput,
  isSetTaskCompletionInput,
  isUpdateGuestInput,
  isUpdateVendorInput,
  type UpdateSeatTableInput,
  type PrototypeWorkspaceStore
} from "./prototype-store";
import {
  InMemoryVendorRefreshStore,
  isVendorRefreshRequest,
  type VendorRefreshStore
} from "./vendor-refresh-store";
import {
  InMemoryConsultantRuntimeStore,
  type ConsultantRuntimeStore,
  type ConsultantWorkspaceContext
} from "./consultant-runtime-store";
import {
  runWorkspaceAgent,
  type AssistantTier,
  type WorkspaceAgentCommandTarget,
  type WorkspaceAgentReply
} from "./workspace-agent";

interface BuildAppOptions {
  workspaceStore?: PrototypeWorkspaceStore;
  vendorRefreshStore?: VendorRefreshStore;
  consultantRuntimeStore?: ConsultantRuntimeStore;
  consultantResponder?: WeddingConsultantResponder;
  consultantVoiceService?: ConsultantVoiceService;
}

type AssistantMode = "consultant" | "operator";
type ToggleableVendorCategory = Exclude<
  PrototypeWorkspace["plan"]["vendorMatches"][number]["category"],
  "venue"
>;

const optionalVendorCategoryLabelById = {
  photography: "Fotografie",
  catering: "Catering",
  music: "Musik",
  florals: "Floristik",
  attire: "Styling & Outfit"
} satisfies Record<ToggleableVendorCategory, string>;

interface WeddingConsultantReplyPayload {
  workspace: PrototypeWorkspace;
  currentTurn: WeddingConsultantTurn;
  messages: AssistantChatMessage[];
  userMessage: string;
  assistantMode?: AssistantMode;
  assistantTier?: AssistantTier;
  contextSnapshot?: ConsultantWorkspaceContext | null;
}

interface WeddingConsultantResponse {
  turn: WeddingConsultantTurn;
  provider:
    | "deterministic"
    | "ollama"
    | "fallback"
    | "openclaw"
    | "openrouter"
    | "gemini";
  model: string;
  workspace?: PrototypeWorkspace;
}

interface WeddingConsultantResponder {
  respond(payload: WeddingConsultantReplyPayload): Promise<WeddingConsultantResponse>;
}

interface WeddingConsultantVoiceTranscriptionPayload {
  audioBase64: string;
  mimeType?: string;
  languageHint?: string;
  assistantTier?: AssistantTier;
}

interface WeddingConsultantVoiceSynthesisPayload {
  text: string;
}

interface ConsultantVoiceService {
  transcribe(
    payload: WeddingConsultantVoiceTranscriptionPayload
  ): Promise<VoiceTranscriptionResponse>;
  speak(payload: WeddingConsultantVoiceSynthesisPayload): Promise<VoiceSynthesisResponse>;
}

const currentDir = dirname(fileURLToPath(import.meta.url));

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

function normalizeConsultantText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeAssistantMode(value: unknown): AssistantMode {
  return value === "operator" ? "operator" : "consultant";
}

function normalizeAssistantTier(value: unknown): AssistantTier {
  return value === "premium" ? "premium" : "free";
}

function buildOperatorTurn(
  workspace: PrototypeWorkspace,
  stepId: WeddingConsultantTurn["stepId"],
  focusArea: WeddingConsultantTurn["focusArea"],
  assistantMessage: string
): WeddingConsultantTurn {
  const opening = createWeddingConsultantOpening(workspace, stepId);

  return {
    ...opening,
    focusArea,
    assistantMessage
  };
}

function buildAgentWorkspaceTurn(
  payload: WeddingConsultantReplyPayload,
  reply: WorkspaceAgentReply
) {
  return buildOperatorTurn(
    reply.workspace,
    payload.currentTurn.stepId,
    payload.currentTurn.focusArea,
    reply.assistantMessage
  );
}

function inferHouseholdFromName(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);

  return parts.length > 1 ? parts[parts.length - 1] : name;
}

function formatTrackedVendorCount(workspace: PrototypeWorkspace) {
  return workspace.vendorTracker.filter(
    (entry) => entry.stage !== "suggested" && entry.stage !== "rejected"
  ).length;
}

function formatOptionalVendorCategoryLabel(category: ToggleableVendorCategory) {
  return optionalVendorCategoryLabelById[category];
}

function extractGuestImports(userMessage: string) {
  const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

  return userMessage
    .split(/\r?\n|;/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const email = line.match(emailRegex)?.[0]?.toLowerCase();

      if (!email) {
        return null;
      }

      const segments = line
        .replace(email, "")
        .split(/[|,]/)
        .map((segment) => segment.trim())
        .filter(Boolean);
      const name =
        segments.find((segment) => /[a-zA-Z]/.test(segment) && !/\d/.test(segment)) ?? "";
      const household = segments.find((segment) => segment !== name) ?? inferHouseholdFromName(name);

      if (!name) {
        return null;
      }

      return {
        name,
        household,
        email
      };
    })
    .filter((entry): entry is { name: string; household: string; email: string } => Boolean(entry));
}

function findVendorFromMessage(workspace: PrototypeWorkspace, userMessage: string) {
  const normalizedMessage = normalizeConsultantText(userMessage);

  return [...workspace.plan.vendorMatches]
    .sort((left, right) => right.name.length - left.name.length)
    .find((vendor) => normalizedMessage.includes(normalizeConsultantText(vendor.name)));
}

function findExplicitOptionalVendorCategory(
  userMessage: string
): ToggleableVendorCategory | null {
  const normalizedMessage = normalizeConsultantText(userMessage);

  if (/(cater|essen|menue|menu|buffet)/.test(normalizedMessage)) {
    return "catering";
  }

  if (/(foto|fotograf|fotografie|video|videograf)/.test(normalizedMessage)) {
    return "photography";
  }

  if (/(musik|dj|band|saenger|sanger)/.test(normalizedMessage)) {
    return "music";
  }

  if (/(flor|blumen|deko|dekoration)/.test(normalizedMessage)) {
    return "florals";
  }

  if (/(styling|braut|makeup|hair|kleid|outfit|attire)/.test(normalizedMessage)) {
    return "attire";
  }

  return null;
}

function findVendorCategoryFromMessage(
  workspace: PrototypeWorkspace,
  userMessage: string
): PrototypeWorkspace["plan"]["vendorMatches"][number]["category"] | null {
  const matchedVendor = findVendorFromMessage(workspace, userMessage);

  if (matchedVendor) {
    return matchedVendor.category;
  }

  const normalizedMessage = normalizeConsultantText(userMessage);

  if (/(cater|essen|menue|menu|buffet)/.test(normalizedMessage)) {
    return "catering";
  }

  if (/(foto|fotograf|fotografie|video|videograf)/.test(normalizedMessage)) {
    return "photography";
  }

  if (/(musik|dj|band|saenger|sanger)/.test(normalizedMessage)) {
    return "music";
  }

  if (/(flor|blumen|deko|dekoration)/.test(normalizedMessage)) {
    return "florals";
  }

  if (/(styling|braut|makeup|hair|kleid|outfit|attire)/.test(normalizedMessage)) {
    return "attire";
  }

  if (/(venue|venues|location|locations|schloss|gut|feierlocation)/.test(normalizedMessage)) {
    return "venue";
  }

  return null;
}

function formatVendorContactBlock(
  vendor: PrototypeWorkspace["plan"]["vendorMatches"][number]
) {
  const contactTokens = [
    vendor.contactPhone ? `Tel. ${vendor.contactPhone}` : null,
    vendor.contactEmail ? `Mail ${vendor.contactEmail}` : null,
    vendor.addressLine
      ? `Adresse ${vendor.addressLine}`
      : vendor.city || vendor.postalCode
        ? `Adresse ${[vendor.postalCode, vendor.city].filter(Boolean).join(" ")}`
        : null,
    vendor.openingHours?.length ? `Oeffnungszeiten ${vendor.openingHours.join(" / ")}` : null,
    vendor.pricingSourceLabel ? `Preisquelle ${vendor.pricingSourceLabel}` : null
  ].filter(Boolean);

  return `${vendor.name}: ${contactTokens.join(" | ") || "aktuell nur Website/Quelllink vorhanden"}`;
}

function estimateVendorTotal(
  vendor: PrototypeWorkspace["plan"]["vendorMatches"][number],
  guestCount: number
) {
  const priceMin = vendor.priceMin ?? 0;
  const priceMax = vendor.priceMax ?? 0;

  if (vendor.pricingModel === "per-person") {
    return {
      min: priceMin * guestCount,
      max: priceMax * guestCount
    };
  }

  if (vendor.pricingModel === "per-person-plus-fixed") {
    return {
      min: (vendor.baseFeeMin ?? 0) + priceMin * guestCount,
      max: (vendor.baseFeeMax ?? vendor.baseFeeMin ?? 0) + priceMax * guestCount
    };
  }

  return {
    min: priceMin,
    max: priceMax
  };
}

function formatEuroRange(min: number, max: number) {
  const formatter = new Intl.NumberFormat("de-DE");

  if (min === max) {
    return `${formatter.format(min)} EUR`;
  }

  return `${formatter.format(min)}-${formatter.format(max)} EUR`;
}

function createInquiryDraft(
  workspace: PrototypeWorkspace,
  vendor: PrototypeWorkspace["plan"]["vendorMatches"][number]
) {
  const eventLabels = workspace.onboarding.plannedEvents.join(", ");
  const subject = `Hochzeitsanfrage ${workspace.coupleName} - ${workspace.onboarding.targetDate}`;
  const body = [
    `Liebes Team von ${vendor.name},`,
    "",
    `wir planen unsere Hochzeit fuer den ${workspace.onboarding.targetDate} in ${workspace.onboarding.region}.`,
    `Aktuell rechnen wir mit etwa ${workspace.onboarding.guestCountTarget} Gaesten und interessieren uns fuer euer Angebot.`,
    "",
    `Kurz zu unserem Rahmen:`,
    `- Paar: ${workspace.coupleName}`,
    `- Geplante Events: ${eventLabels}`,
    `- Aktuelle Stilrichtung: ${workspace.onboarding.stylePreferences.join(", ") || "offen"}`,
    "",
    `Koennt ihr uns bitte eine erste Rueckmeldung geben zu Verfuegbarkeit, Preisrahmen, enthaltenen Leistungen und dem sinnvollsten naechsten Schritt?`,
    "",
    `Vielen Dank und herzliche Gruesse`,
    workspace.coupleName
  ].join("\n");

  return {
    subject,
    body
  };
}

function createInvitationCopyPatch(userMessage: string) {
  const normalizedMessage = normalizeConsultantText(userMessage);

  if (!/(einladung|invite|rsvp)/.test(normalizedMessage)) {
    return null;
  }

  const headlineMatch =
    userMessage.match(/(?:headline|titel)\s*:\s*([^\n]+)/i) ??
    userMessage.match(/(?:ueberschrift)\s*:\s*([^\n]+)/i);
  const bodyMatch =
    userMessage.match(/(?:body|text|nachricht|einladungstext)\s*:\s*([\s\S]*?)(?:\n\s*(?:footer|fusszeile|gruss)\s*:|$)/i) ??
    userMessage.match(/(?:einladung)\s*:\s*([\s\S]*?)(?:\n\s*(?:footer|fusszeile|gruss)\s*:|$)/i);
  const footerMatch =
    userMessage.match(/(?:footer|fusszeile|gruss)\s*:\s*([\s\S]+)$/i) ??
    userMessage.match(/(?:abschluss)\s*:\s*([\s\S]+)$/i);

  const patch = {
    ...(headlineMatch?.[1]?.trim() ? { headline: headlineMatch[1].trim() } : {}),
    ...(bodyMatch?.[1]?.trim() ? { body: bodyMatch[1].trim() } : {}),
    ...(footerMatch?.[1]?.trim() ? { footer: footerMatch[1].trim() } : {})
  };

  return Object.keys(patch).length > 0 ? patch : null;
}

function extractFirstNumber(userMessage: string) {
  const match = userMessage.match(/(\d+[.,]?\d*)/);

  if (!match) {
    return null;
  }

  const normalized = (match[1] ?? "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function findGuestFromMessage(
  workspace: PrototypeWorkspace,
  userMessage: string
) {
  const normalizedMessage = normalizeConsultantText(userMessage);

  return [...workspace.guests]
    .sort((left, right) => right.name.length - left.name.length)
    .find((guest) => normalizedMessage.includes(normalizeConsultantText(guest.name)));
}

async function maybeHandleGuestUpdate(
  workspaceStore: PrototypeWorkspaceStore,
  payload: WeddingConsultantReplyPayload
) {
  const normalizedMessage = normalizeConsultantText(payload.userMessage);

  if (!/(gast|gaste|gaeste|rsvp|essen|vegetar|vegan|absag|zusag|email|haushalt|familie)/.test(normalizedMessage)) {
    return null;
  }

  const guest = findGuestFromMessage(payload.workspace, payload.userMessage);

  if (!guest) {
    return null;
  }

  const rsvpStatus =
    /(zugesagt|zusage|attending|kommt|dabei)/.test(normalizedMessage)
      ? "attending"
      : /(abgesagt|absage|declined|kommt nicht|nicht dabei)/.test(normalizedMessage)
        ? "declined"
        : /(offen|pending|noch offen)/.test(normalizedMessage)
          ? "pending"
          : undefined;
  const mealPreference =
    /(vegan)/.test(normalizedMessage)
      ? "vegan"
      : /(vegetar)/.test(normalizedMessage)
        ? "vegetarian"
        : /(kindergericht|kids)/.test(normalizedMessage)
          ? "kids"
          : /(standard)/.test(normalizedMessage)
            ? "standard"
            : undefined;
  const emailMatch = payload.userMessage.match(
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
  );
  const householdMatch =
    payload.userMessage.match(/(?:haushalt|familie)\s*:\s*([^\n]+)/i) ??
    payload.userMessage.match(/familie\s+([A-Za-z??????????????][^\n,]+)/i);
  const dietaryNotesMatch = payload.userMessage.match(
    /(?:allergie|allergien|unvertraeglich|unvertraeglichkeit|diary notes|hinweis|notiz)\s*:?\s*([^\n]+)/i
  );
  const messageMatch = payload.userMessage.match(/(?:nachricht|message)\s*:\s*([^\n]+)/i);
  const updatedWorkspace = await workspaceStore.updateGuest(payload.workspace.id, guest.id, {
    ...(rsvpStatus ? { rsvpStatus } : {}),
    ...(mealPreference ? { mealPreference } : {}),
    ...(emailMatch?.[0] ? { email: emailMatch[0].toLowerCase() } : {}),
    ...(householdMatch?.[1]?.trim() ? { household: householdMatch[1].trim() } : {}),
    ...(dietaryNotesMatch?.[1]?.trim()
      ? { dietaryNotes: dietaryNotesMatch[1].trim() }
      : {}),
    ...(messageMatch?.[1]?.trim() ? { message: messageMatch[1].trim() } : {})
  });

  if (!updatedWorkspace) {
    return null;
  }

  const refreshedGuest = updatedWorkspace.guests.find((entry) => entry.id === guest.id) ?? guest;

  return {
    turn: buildOperatorTurn(
      updatedWorkspace,
      "guest-experience",
      "guests",
      `Ich habe ${refreshedGuest.name} direkt aktualisiert. RSVP: ${refreshedGuest.rsvpStatus}, Essen: ${refreshedGuest.mealPreference}, Haushalt: ${refreshedGuest.household}.`
    ),
    provider: "deterministic" as const,
    model: "operator-v1",
    workspace: updatedWorkspace
  };
}

async function maybeHandleExpenseCreate(
  workspaceStore: PrototypeWorkspaceStore,
  payload: WeddingConsultantReplyPayload
) {
  const normalizedMessage = normalizeConsultantText(payload.userMessage);

  if (!/(budget|kosten|ausgabe|expense|eintrag|posten|bezahlt|gebucht|geplant)/.test(normalizedMessage)) {
    return null;
  }

  const amount = extractFirstNumber(payload.userMessage);

  if (!amount || amount <= 0) {
    return null;
  }

  const category =
    /(location|venue|schloss|gut|raum)/.test(normalizedMessage)
      ? "venue"
      : /(cater|essen|menue|buffet)/.test(normalizedMessage)
        ? "catering"
        : /(foto|fotograf|video)/.test(normalizedMessage)
          ? "photography"
          : /(musik|dj|band)/.test(normalizedMessage)
            ? "music"
            : /(styling|kleid|makeup|outfit)/.test(normalizedMessage)
              ? "attire"
              : /(flor|blumen|deko)/.test(normalizedMessage)
                ? "florals"
                : "stationery-admin";
  const status =
    /(bezahlt|paid)/.test(normalizedMessage)
      ? "paid"
      : /(gebucht|booked)/.test(normalizedMessage)
        ? "booked"
        : "planned";
  const vendor = findVendorFromMessage(payload.workspace, payload.userMessage);
  const labelMatch =
    payload.userMessage.match(/(?:budgetposten|eintrag|label|titel)\s*:\s*([^\n]+)/i) ??
    payload.userMessage.match(/(?:fuer|f??r)\s+([^\n,]+)/i);
  const label = labelMatch?.[1]?.trim() || vendor?.name || "Neuer Budgeteintrag";
  const vendorName = vendor?.name ?? label;
  const updatedWorkspace = await workspaceStore.addExpense(payload.workspace.id, {
    label,
    category,
    amount,
    status,
    vendorName
  });

  if (!updatedWorkspace) {
    return null;
  }

  return {
    turn: buildOperatorTurn(
      updatedWorkspace,
      "final-control-room",
      "budget",
      `Ich habe den Budgeteintrag "${label}" mit ${amount.toLocaleString("de-DE")} EUR als ${status} angelegt. Neuer Restspielraum: ${updatedWorkspace.budgetOverview.overall.remaining.toLocaleString("de-DE")} EUR.`
    ),
    provider: "deterministic" as const,
    model: "operator-v1",
    workspace: updatedWorkspace
  };
}

async function maybeHandleVendorUpdate(
  workspaceStore: PrototypeWorkspaceStore,
  payload: WeddingConsultantReplyPayload
) {
  const normalizedMessage = normalizeConsultantText(payload.userMessage);
  const vendor = findVendorFromMessage(payload.workspace, payload.userMessage);

  if (!vendor || !/(vendor|angebot|quote|kontaktiert|gebucht|verworfen|abgelehnt|notiz|stage)/.test(normalizedMessage)) {
    return null;
  }

  const stage =
    /(gebucht|booked)/.test(normalizedMessage)
      ? "booked"
      : /(angebot|quote|quoted)/.test(normalizedMessage)
        ? "quoted"
        : /(kontaktiert|contacted)/.test(normalizedMessage)
          ? "contacted"
          : /(verworfen|abgelehnt|rejected)/.test(normalizedMessage)
            ? "rejected"
            : undefined;
  const quoteAmount = /(angebot|quote|quoted|eur|euro)/.test(normalizedMessage)
    ? extractFirstNumber(payload.userMessage)
    : null;
  const noteMatch = payload.userMessage.match(/(?:notiz|note)\s*:\s*([^\n]+)/i);
  const trackerEntry =
    payload.workspace.vendorTracker.find((entry) => entry.vendorId === vendor.id) ?? null;

  if (!stage && quoteAmount === null && !noteMatch?.[1]?.trim()) {
    return null;
  }

  const updatedWorkspace = await workspaceStore.updateVendor(payload.workspace.id, vendor.id, {
    stage: stage ?? trackerEntry?.stage ?? "suggested",
    quoteAmount:
      typeof quoteAmount === "number" && Number.isFinite(quoteAmount)
        ? quoteAmount
        : trackerEntry?.quoteAmount ?? null,
    note: noteMatch?.[1]?.trim() ?? trackerEntry?.note ?? ""
  });

  if (!updatedWorkspace) {
    return null;
  }

  const refreshedEntry =
    updatedWorkspace.vendorTracker.find((entry) => entry.vendorId === vendor.id) ?? trackerEntry;

  return {
    turn: buildOperatorTurn(
      updatedWorkspace,
      vendor.category === "venue" ? "venue-and-date" : "core-vendors",
      "vendors",
      `Ich habe ${vendor.name} aktualisiert. Stage: ${refreshedEntry?.stage ?? "suggested"}${typeof refreshedEntry?.quoteAmount === "number" ? `, Angebot: ${refreshedEntry.quoteAmount.toLocaleString("de-DE")} EUR` : ""}${refreshedEntry?.note ? `, Notiz: ${refreshedEntry.note}` : ""}.`
    ),
    provider: "deterministic" as const,
    model: "operator-v1",
    workspace: updatedWorkspace
  };
}

async function maybeHandleTaskCompletion(
  workspaceStore: PrototypeWorkspaceStore,
  payload: WeddingConsultantReplyPayload
) {
  const normalizedMessage = normalizeConsultantText(payload.userMessage);

  if (!/(aufgabe|task|todo|to do|erledigt|abhaken|offen|wieder aufmachen)/.test(normalizedMessage)) {
    return null;
  }

  const task = [...payload.workspace.tasks]
    .sort((left, right) => right.title.length - left.title.length)
    .find((entry) => normalizedMessage.includes(normalizeConsultantText(entry.title)));

  if (!task) {
    return null;
  }

  const completed =
    /(erledigt|abhaken|done|abgeschlossen)/.test(normalizedMessage) &&
    !/(offen|wieder aufmachen|reopen)/.test(normalizedMessage)
      ? true
      : /(offen|wieder aufmachen|reopen)/.test(normalizedMessage)
        ? false
        : null;

  if (completed === null) {
    return null;
  }

  const updatedWorkspace = await workspaceStore.setTaskCompletion(
    payload.workspace.id,
    task.id,
    completed
  );

  if (!updatedWorkspace) {
    return null;
  }

  return {
    turn: buildOperatorTurn(
      updatedWorkspace,
      "final-control-room",
      "timeline",
      completed
        ? `Ich habe die Aufgabe "${task.title}" als erledigt markiert.`
        : `Ich habe die Aufgabe "${task.title}" wieder geoeffnet.`
    ),
    provider: "deterministic" as const,
    model: "operator-v1",
    workspace: updatedWorkspace
  };
}

function createOperatorSummaryMessage(
  payload: WeddingConsultantReplyPayload,
  baselineTurn: WeddingConsultantTurn
) {
  const openTasks = payload.workspace.tasks
    .filter((task) => !task.completed)
    .slice(0, 3)
    .map((task) => task.title);
  const disabledVendorLabels = (payload.workspace.onboarding.disabledVendorCategories ?? []).map(
    (category) => formatOptionalVendorCategoryLabel(category)
  );
  const topVenues = payload.workspace.plan.vendorMatches
    .filter((vendor) => vendor.category === "venue")
    .slice(0, 3)
    .map((vendor) => vendor.name);

  return [
    `Ich arbeite hier direkt auf eurem Workspace mit echten Daten statt als generischer Chatbot.`,
    `Aktuell stehen ${payload.workspace.budgetOverview.overall.remaining.toLocaleString("de-DE")} EUR Restspielraum, ${payload.workspace.guests.length}/${payload.workspace.onboarding.guestCountTarget} angelegte Gaeste und ${formatTrackedVendorCount(payload.workspace)} aktive Vendor-Vorgaenge im System.`,
    disabledVendorLabels.length > 0
      ? `Ausgeblendete Vendor-Kategorien: ${disabledVendorLabels.join(", ")}.`
      : `Die aktive Vendor-Schiene laeuft aktuell ueber ${topVenues.join(", ")} und eure Kernkategorien.`,
    openTasks.length > 0
      ? `Naechste sinnvolle Schritte fuer euch: ${openTasks.join(" / ")}.`
      : `Die Kernaufgaben wirken sauber angelegt, jetzt koennen wir direkt operativ nachziehen.`,
    `Ich kann jetzt sofort Gastlisten importieren, Vendor-Kategorien an- oder ausschalten, Kontaktdaten zusammenziehen, grobe Preisrechnungen machen und konkrete Anfrageentwuerfe schreiben.`,
    `Fuer den inhaltlichen Blick bleibe ich in "${baselineTurn.stepId}".`
  ].join(" ");
}

function createConsultantContextSummary(contextSnapshot: ConsultantWorkspaceContext | null) {
  if (!contextSnapshot) {
    return null;
  }

  const details = [
    contextSnapshot.conversation.recentPriorities.length > 0
      ? `Ich habe aus eurem Verlauf vor allem diese Themen im Blick: ${contextSnapshot.conversation.recentPriorities.join(", ")}.`
      : null,
    contextSnapshot.conversation.recentFacts[0] ?? null,
    contextSnapshot.planning.openTaskTitles.length > 0
      ? `Offene Punkte, die ich dabei mitdenke: ${contextSnapshot.planning.openTaskTitles
          .slice(0, 3)
          .join(" / ")}.`
      : null
  ].filter(Boolean);

  return details.length > 0 ? details.join(" ") : null;
}

async function maybeHandleVendorCategoryToggle(
  workspaceStore: PrototypeWorkspaceStore,
  payload: WeddingConsultantReplyPayload
) {
  const normalizedMessage = normalizeConsultantText(payload.userMessage);
  const category =
    findExplicitOptionalVendorCategory(payload.userMessage) ??
    findVendorCategoryFromMessage(payload.workspace, payload.userMessage);

  if (!category || category === "venue") {
    return null;
  }

  const shouldDisable =
    /(\bdeaktiv|\babschalt|\bausblend|\bausblenden|brauch.*kein|kein.*noetig|nicht noetig|\bohne\b)/.test(
      normalizedMessage
    ) &&
    !/(\bdoch\b|\bwieder\b|\breaktiv|\baktivier|\beinschalt)/.test(normalizedMessage);
  const shouldEnable = /(\baktivier|\beinschalt|\bwieder\b|\bdoch\b|\bzuruckholen\b|\breaktiv)/.test(
    normalizedMessage
  );

  if (!shouldDisable && !shouldEnable) {
    return null;
  }

  const currentDisabled = new Set(payload.workspace.onboarding.disabledVendorCategories ?? []);
  const label = formatOptionalVendorCategoryLabel(category);

  if (shouldDisable) {
    if (currentDisabled.has(category)) {
      return {
        turn: buildOperatorTurn(
          payload.workspace,
          "core-vendors",
          "vendors",
          `${label} ist bereits deaktiviert. Ich lasse die Kategorie weiterhin aus Budget, Vendor-Desk und Shortlists heraus.`
        ),
        provider: "deterministic" as const,
        model: "operator-v1"
      };
    }

    currentDisabled.add(category);
  } else {
    if (!currentDisabled.has(category)) {
      return {
        turn: buildOperatorTurn(
          payload.workspace,
          "core-vendors",
          "vendors",
          `${label} ist bereits aktiv. Ich lasse die Kategorie also ganz normal im Workspace sichtbar.`
        ),
        provider: "deterministic" as const,
        model: "operator-v1"
      };
    }

    currentDisabled.delete(category);
  }

  const updatedWorkspace = await workspaceStore.updateWorkspace(payload.workspace.id, {
    ...payload.workspace.onboarding,
    disabledVendorCategories: [...currentDisabled]
  });

  if (!updatedWorkspace) {
    return null;
  }

  return {
    turn: buildOperatorTurn(
      updatedWorkspace,
      "core-vendors",
      "vendors",
      shouldDisable
        ? `${label} ist jetzt deaktiviert. Ich nehme die Kategorie direkt aus Budgetverteilung, Vendor-Desk und automatischen Vorschlaegen heraus.`
        : `${label} ist wieder aktiv. Die Kategorie erscheint ab jetzt wieder im Budget, in euren Vendor-Karten und in den automatischen Vorschlaegen.`
    ),
    provider: "deterministic" as const,
    model: "operator-v1",
    workspace: updatedWorkspace
  };
}

async function maybeHandleInvitationCopyUpdate(
  workspaceStore: PrototypeWorkspaceStore,
  payload: WeddingConsultantReplyPayload
) {
  const patch = createInvitationCopyPatch(payload.userMessage);

  if (!patch) {
    return null;
  }

  const updatedWorkspace = await workspaceStore.updateWorkspace(payload.workspace.id, {
    ...payload.workspace.onboarding,
    invitationCopy: {
      ...payload.workspace.onboarding.invitationCopy,
      ...patch
    }
  });

  if (!updatedWorkspace) {
    return null;
  }

  const updatedFields = [
    patch.headline ? "Headline" : null,
    patch.body ? "Einladungstext" : null,
    patch.footer ? "Fusszeile" : null
  ].filter(Boolean);

  return {
    turn: buildOperatorTurn(
      updatedWorkspace,
      "guest-experience",
      "guests",
      `Ich habe eure Einladung direkt im Workspace aktualisiert: ${updatedFields.join(", ")}. Die neue Fassung ist sofort in den RSVP-Einladungen hinterlegt.`
    ),
    provider: "deterministic" as const,
    model: "operator-v1",
    workspace: updatedWorkspace
  };
}

function maybeHandleVendorContactDigest(payload: WeddingConsultantReplyPayload) {
  const normalizedMessage = normalizeConsultantText(payload.userMessage);

  if (!/(kontakt|kontaktdaten|telefon|email|adresse|oeffnungszeiten|preisquelle|preise)/.test(normalizedMessage)) {
    return null;
  }

  const vendor = findVendorFromMessage(payload.workspace, payload.userMessage);

  if (vendor) {
    return {
      turn: buildOperatorTurn(
        payload.workspace,
        vendor.category === "venue" ? "venue-and-date" : "core-vendors",
        "vendors",
        formatVendorContactBlock(vendor)
      ),
      provider: "deterministic" as const,
      model: "operator-v1"
    };
  }

  const category = findVendorCategoryFromMessage(payload.workspace, payload.userMessage);

  if (!category) {
    return null;
  }

  const vendors = payload.workspace.plan.vendorMatches
    .filter((entry) => entry.category === category)
    .slice(0, 6);

  if (vendors.length === 0) {
    return null;
  }

  return {
    turn: buildOperatorTurn(
      payload.workspace,
      category === "venue" ? "venue-and-date" : "core-vendors",
      "vendors",
      [
        `Hier sind die aktuell besten ${category === "venue" ? "Venue-" : ""}Kontaktdaten fuer ${category === "venue" ? "eure Locations" : formatOptionalVendorCategoryLabel(category as ToggleableVendorCategory)}:`,
        "",
        ...vendors.map((entry) => formatVendorContactBlock(entry))
      ].join("\n")
    ),
    provider: "deterministic" as const,
    model: "operator-v1"
  };
}

function maybeHandleOperatorWorkspaceSummary(
  payload: WeddingConsultantReplyPayload,
  baselineTurn: WeddingConsultantTurn
) {
  const normalizedMessage = normalizeConsultantText(payload.userMessage);

  if (
    payload.assistantMode !== "operator" &&
    !/(status|ueberblick|priorisier|naechste schritte|arbeite mit mir|organisier|plan bitte)/.test(
      normalizedMessage
    )
  ) {
    return null;
  }

  return {
    turn: buildOperatorTurn(
      payload.workspace,
      baselineTurn.stepId,
      baselineTurn.focusArea,
      createOperatorSummaryMessage(payload, baselineTurn)
    ),
    provider: "fallback" as const,
    model: "operator-fallback-v1"
  };
}

async function maybeHandleGuestImport(
  workspaceStore: PrototypeWorkspaceStore,
  payload: WeddingConsultantReplyPayload
) {
  const normalizedMessage = normalizeConsultantText(payload.userMessage);

  if (!/(gast|gaste|gaeste|liste|kontakt|email|import|anlegen|hinzufugen|uebernehmen)/.test(normalizedMessage)) {
    return null;
  }

  const extractedGuests = extractGuestImports(payload.userMessage);

  if (extractedGuests.length === 0) {
    return null;
  }

  const existingEmails = new Set(payload.workspace.guests.map((guest) => guest.email.toLowerCase()));
  let nextWorkspace = payload.workspace;
  const addedNames: string[] = [];
  const skippedNames: string[] = [];

  for (const guest of extractedGuests) {
    if (existingEmails.has(guest.email)) {
      skippedNames.push(guest.name);
      continue;
    }

    const updatedWorkspace = await workspaceStore.addGuest(payload.workspace.id, {
      name: guest.name,
      household: guest.household,
      email: guest.email,
      eventIds: payload.workspace.onboarding.plannedEvents
    });

    if (!updatedWorkspace) {
      continue;
    }

    nextWorkspace = updatedWorkspace;
    existingEmails.add(guest.email);
    addedNames.push(guest.name);
  }

  if (addedNames.length === 0) {
    return {
      turn: buildOperatorTurn(
        payload.workspace,
        "guest-experience",
        "guests",
        `Ich habe ${extractedGuests.length} Gastzeilen erkannt, aber keine neue Person angelegt, weil alle E-Mail-Adressen bereits im Workspace vorhanden sind.`
      ),
      provider: "deterministic" as const,
      model: "operator-v1"
    };
  }

  return {
    turn: buildOperatorTurn(
      nextWorkspace,
      "guest-experience",
      "guests",
      `Ich habe ${addedNames.length} Gaeste direkt aus deiner Liste uebernommen: ${addedNames.join(", ")}.${skippedNames.length ? ` Bereits vorhanden und deshalb uebersprungen: ${skippedNames.join(", ")}.` : ""}`
    ),
    provider: "deterministic" as const,
    model: "operator-v1",
    workspace: nextWorkspace
  };
}

function maybeHandleVenueEstimate(payload: WeddingConsultantReplyPayload) {
  const normalizedMessage = normalizeConsultantText(payload.userMessage);
  const adultCount = Number(normalizedMessage.match(/(\d+)\s*(?:erwachsene|erwachsener|adults?)/)?.[1] ?? 0);
  const childCount = Number(normalizedMessage.match(/(\d+)\s*(?:kinder|kind|kids?)/)?.[1] ?? 0);
  const fallbackGuestCount = Number(normalizedMessage.match(/(\d+)\s*(?:gaste|gaeste|personen)/)?.[1] ?? 0);
  const totalGuests = adultCount + childCount || fallbackGuestCount;
  const vendor = findVendorFromMessage(payload.workspace, payload.userMessage);

  if (!vendor || totalGuests <= 0 || !/(preis|kosten|gesamt|rechn|kalk|ca)/.test(normalizedMessage)) {
    return null;
  }

  const estimate = estimateVendorTotal(vendor, totalGuests);
  const note =
    childCount > 0
      ? "Ich rechne Kinder hier mangels eigener Kinderstaffel erst einmal voll mit."
      : "Das ist eine erste Orientierung bis zum echten Angebot.";
  const sourceHint =
    vendor.pricingSourceLabel || vendor.sourceLabel
      ? ` Preisquelle: ${vendor.pricingSourceLabel ?? vendor.sourceLabel}.`
      : "";

  return {
    turn: buildOperatorTurn(
      payload.workspace,
      vendor.category === "venue" ? "venue-and-date" : "core-vendors",
      "budget",
      `Fuer ${vendor.name} komme ich mit ${adultCount || totalGuests} Erwachsenen${childCount ? ` und ${childCount} Kindern` : ""} aktuell grob auf ${formatEuroRange(estimate.min, estimate.max)}. ${note}${sourceHint}`
    ),
    provider: "deterministic" as const,
    model: "operator-v1"
  };
}

function maybeHandleInquiryDraft(payload: WeddingConsultantReplyPayload) {
  const normalizedMessage = normalizeConsultantText(payload.userMessage);
  const vendor = findVendorFromMessage(payload.workspace, payload.userMessage);

  if (!vendor || !/(anfrage|mail|email|nachricht|anschreiben|kontakttext)/.test(normalizedMessage)) {
    return null;
  }

  const draft = createInquiryDraft(payload.workspace, vendor);
  const recipientLine = vendor.contactEmail
    ? `Empfaenger: ${vendor.contactEmail}`
    : vendor.contactPhone
      ? `Direkter Kontakt: ${vendor.contactPhone}`
      : "Kein direkter Mailkontakt im Seed, nutze bitte die Kontaktseite im Vendor-Desk.";

  return {
    turn: buildOperatorTurn(
      payload.workspace,
      vendor.category === "venue" ? "venue-and-date" : "core-vendors",
      "vendors",
      `Ich habe einen ersten Anfrageentwurf fuer ${vendor.name} vorbereitet.\n\n${recipientLine}\nBetreff: ${draft.subject}\n\n${draft.body}`
    ),
    provider: "deterministic" as const,
    model: "operator-v1"
  };
}

async function resolveOperatorIntent(
  workspaceStore: PrototypeWorkspaceStore,
  payload: WeddingConsultantReplyPayload
) {
  return (
    (await maybeHandleGuestUpdate(workspaceStore, payload)) ??
    (await maybeHandleExpenseCreate(workspaceStore, payload)) ??
    (await maybeHandleVendorUpdate(workspaceStore, payload)) ??
    (await maybeHandleTaskCompletion(workspaceStore, payload)) ??
    (await maybeHandleVendorCategoryToggle(workspaceStore, payload)) ??
    (await maybeHandleInvitationCopyUpdate(workspaceStore, payload)) ??
    (await maybeHandleGuestImport(workspaceStore, payload)) ??
    maybeHandleVenueEstimate(payload) ??
    maybeHandleVendorContactDigest(payload) ??
    maybeHandleInquiryDraft(payload)
  );
}

function createBaselineTurn(payload: WeddingConsultantReplyPayload) {
  return continueWeddingConsultantConversation(payload.workspace, payload.currentTurn.stepId, {
    text: payload.userMessage
  });
}

function createLocalFallbackResponse(
  payload: WeddingConsultantReplyPayload,
  baselineTurn: WeddingConsultantTurn
): WeddingConsultantResponse {
  if (payload.assistantTier === "free" && payload.assistantMode === "operator") {
    return {
      turn: {
        ...baselineTurn,
        assistantMessage:
          "Im Free-Modus bleibe ich bewusst beratend. Ich sage dir genau, welche Schritte du im Workspace setzen solltest, fuehre aber keine direkten Aenderungen aus."
      },
      provider: "fallback",
      model: "free-consultant-guardrail-v1"
    };
  }

  const operatorSummary = maybeHandleOperatorWorkspaceSummary(payload, baselineTurn);

  if (operatorSummary) {
    return operatorSummary;
  }

  const contextSummary =
    payload.assistantMode === "consultant"
      ? createConsultantContextSummary(payload.contextSnapshot ?? null)
      : null;

  if (contextSummary) {
    return {
      turn: {
        ...baselineTurn,
        assistantMessage: `${contextSummary} ${baselineTurn.assistantMessage}`.trim()
      },
      provider: "deterministic",
      model: "rules+context"
    };
  }

  return {
    turn: baselineTurn,
    provider: "deterministic",
    model: "rules"
  };
}

function createWorkspaceAgentCommandChain(
  tier: AssistantTier
): WorkspaceAgentCommandTarget[] {
  const primary =
    tier === "premium"
      ? process.env.PREMIUM_WORKSPACE_AGENT_COMMAND ??
        process.env.FREE_WORKSPACE_AGENT_COMMAND ??
        ""
      : process.env.FREE_WORKSPACE_AGENT_COMMAND ?? "";
  const providerFallback =
    tier === "premium"
      ? process.env.PREMIUM_WORKSPACE_AGENT_FALLBACK_COMMAND ??
        process.env.FREE_WORKSPACE_AGENT_FALLBACK_COMMAND ??
        process.env.OPENROUTER_WORKSPACE_AGENT_COMMAND ??
        ""
      : process.env.FREE_WORKSPACE_AGENT_FALLBACK_COMMAND ??
        process.env.OPENROUTER_WORKSPACE_AGENT_COMMAND ??
        "";
  const hasGeminiKey =
    process.env.ENABLE_GEMINI_WORKSPACE_AGENT_FALLBACK === "1" &&
    Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
  const geminiFallbackCommand =
    tier === "premium"
      ? process.env.PREMIUM_GEMINI_WORKSPACE_AGENT_COMMAND ??
        process.env.FREE_GEMINI_WORKSPACE_AGENT_COMMAND ??
        (hasGeminiKey ? `node ${resolveGeminiWorkspaceAgentScript()}` : "")
      : process.env.FREE_GEMINI_WORKSPACE_AGENT_COMMAND ??
        (hasGeminiKey ? `node ${resolveGeminiWorkspaceAgentScript()}` : "");

  return [
    primary.trim()
      ? ({
          command: primary.trim(),
          provider: "openclaw"
        } satisfies WorkspaceAgentCommandTarget)
      : null,
    providerFallback.trim()
      ? ({
          command: providerFallback.trim(),
          provider: "openrouter"
        } satisfies WorkspaceAgentCommandTarget)
      : null,
    geminiFallbackCommand.trim()
      ? ({
          command: geminiFallbackCommand.trim(),
          provider: "gemini"
        } satisfies WorkspaceAgentCommandTarget)
      : null
  ].filter((value): value is WorkspaceAgentCommandTarget => Boolean(value));
}

class DeterministicWeddingConsultantResponder implements WeddingConsultantResponder {
  constructor(private readonly workspaceStore: PrototypeWorkspaceStore) {}

  async respond(payload: WeddingConsultantReplyPayload): Promise<WeddingConsultantResponse> {
    const normalizedPayload = {
      ...payload,
      assistantMode: normalizeAssistantMode(payload.assistantMode),
      assistantTier: normalizeAssistantTier(payload.assistantTier)
    } satisfies WeddingConsultantReplyPayload;

    if (
      normalizedPayload.assistantTier === "free" &&
      normalizedPayload.assistantMode === "operator"
    ) {
      const baselineTurn = createBaselineTurn(normalizedPayload);
      return createLocalFallbackResponse(normalizedPayload, baselineTurn);
    }

    const commandChain = createWorkspaceAgentCommandChain(
      normalizedPayload.assistantTier ?? "free"
    );
    if (commandChain.length > 0) {
      try {
        const agentReply = await runWorkspaceAgent({
          workspaceStore: this.workspaceStore,
          workspace: normalizedPayload.workspace,
          userMessage: normalizedPayload.userMessage,
          tier: normalizedPayload.assistantTier ?? "free",
          commands: commandChain
        });

        return {
          turn:
            normalizedPayload.assistantMode === "operator" &&
            normalizedPayload.assistantTier === "premium"
              ? buildAgentWorkspaceTurn(normalizedPayload, agentReply)
              : {
                  ...createBaselineTurn(normalizedPayload),
                  assistantMessage: agentReply.assistantMessage
                },
          provider: agentReply.provider,
          model: agentReply.model,
          ...(normalizedPayload.assistantTier === "premium" &&
          normalizedPayload.assistantMode === "operator"
            ? { workspace: agentReply.workspace }
            : {})
        };
      } catch {
        // Fall through to local deterministic behavior.
      }
    }

    const operatorResult = await resolveOperatorIntent(this.workspaceStore, normalizedPayload);

    if (operatorResult) {
      return operatorResult;
    }

    const baselineTurn = createBaselineTurn(normalizedPayload);
    return createLocalFallbackResponse(normalizedPayload, baselineTurn);
  }
}

class AiWeddingConsultantResponder implements WeddingConsultantResponder {
  private readonly client: AiOrchestratorHttpClient;

  constructor(
    baseUrl: string,
    private readonly workspaceStore: PrototypeWorkspaceStore
  ) {
    this.client = new AiOrchestratorHttpClient({ baseUrl });
  }

  async respond(payload: WeddingConsultantReplyPayload): Promise<WeddingConsultantResponse> {
    const normalizedPayload = {
      ...payload,
      assistantMode: normalizeAssistantMode(payload.assistantMode),
      assistantTier: normalizeAssistantTier(payload.assistantTier)
    } satisfies WeddingConsultantReplyPayload;

    const commandChain = createWorkspaceAgentCommandChain(
      normalizedPayload.assistantTier ?? "premium"
    );

    if (
      normalizedPayload.assistantTier === "premium" &&
      normalizedPayload.assistantMode === "operator" &&
      commandChain.length > 0
    ) {
      try {
        const agentReply = await runWorkspaceAgent({
          workspaceStore: this.workspaceStore,
          workspace: normalizedPayload.workspace,
          userMessage: normalizedPayload.userMessage,
          tier: "premium",
          commands: commandChain
        });

        return {
          turn: buildAgentWorkspaceTurn(normalizedPayload, agentReply),
          provider: agentReply.provider,
          model: agentReply.model,
          workspace: agentReply.workspace
        };
      } catch {
        // Fall through to the normal premium reply path.
      }
    }

    const operatorResult = await resolveOperatorIntent(this.workspaceStore, normalizedPayload);

    if (operatorResult) {
      return operatorResult;
    }

    const baselineTurn = createBaselineTurn(normalizedPayload);

    if (!shouldUseAiConsultantRewrite(payload.userMessage, baselineTurn)) {
      return createLocalFallbackResponse(normalizedPayload, baselineTurn);
    }

    try {
      const rewritten = await this.client.rewriteWeddingConsultantReply({
        workspace: normalizedPayload.workspace,
        baselineTurn,
        messages: normalizedPayload.messages,
        userMessage: normalizedPayload.userMessage
      });

      if (rewritten.provider !== "ollama") {
        return createLocalFallbackResponse(normalizedPayload, baselineTurn);
      }

      return {
        turn: {
          ...baselineTurn,
          assistantMessage: rewritten.assistantMessage
        },
        provider: "ollama",
        model: rewritten.model
      };
    } catch {
      return createLocalFallbackResponse(normalizedPayload, baselineTurn);
    }
  }
}

class AiWeddingConsultantVoiceService implements ConsultantVoiceService {
  private readonly client: AiOrchestratorHttpClient;

  constructor(baseUrl: string) {
    this.client = new AiOrchestratorHttpClient({ baseUrl });
  }

  async transcribe(payload: WeddingConsultantVoiceTranscriptionPayload) {
    return this.client.transcribeVoice(payload);
  }

  async speak(payload: WeddingConsultantVoiceSynthesisPayload) {
    return this.client.synthesizeVoice({
      text: payload.text,
      voice: "consultant"
    });
  }
}

class FasterWhisperConsultantVoiceService implements ConsultantVoiceService {
  constructor(
    private readonly pythonPath: string,
    private readonly scriptPath: string
  ) {}

  async transcribe(payload: WeddingConsultantVoiceTranscriptionPayload) {
    return new Promise<VoiceTranscriptionResponse>((resolvePromise, reject) => {
      const child = spawn(this.pythonPath, [this.scriptPath], {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env
        }
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
      child.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(stderr || `faster-whisper exited with ${code ?? 1}`));
          return;
        }

        try {
          resolvePromise(JSON.parse(stdout) as VoiceTranscriptionResponse);
        } catch (error) {
          reject(error);
        }
      });
      child.stdin.write(JSON.stringify(payload));
      child.stdin.end();
    });
  }

  async speak(_payload: WeddingConsultantVoiceSynthesisPayload): Promise<VoiceSynthesisResponse> {
    throw new Error("Speech synthesis unavailable in faster-whisper mode");
  }
}

class CompositeConsultantVoiceService implements ConsultantVoiceService {
  constructor(
    private readonly options: {
      freeTranscriber?: ConsultantVoiceService | null;
      premiumVoice?: ConsultantVoiceService | null;
    }
  ) {}

  async transcribe(payload: WeddingConsultantVoiceTranscriptionPayload) {
    if (payload.assistantTier === "free" && this.options.freeTranscriber) {
      try {
        return await this.options.freeTranscriber.transcribe(payload);
      } catch {
        // fall through to premium/default path
      }
    }

    if (this.options.premiumVoice) {
      return this.options.premiumVoice.transcribe(payload);
    }

    if (this.options.freeTranscriber) {
      return this.options.freeTranscriber.transcribe(payload);
    }

    throw new Error("Voice service unavailable");
  }

  async speak(payload: WeddingConsultantVoiceSynthesisPayload) {
    if (!this.options.premiumVoice) {
      throw new Error("Voice synthesis unavailable");
    }

    return this.options.premiumVoice.speak(payload);
  }
}

function resolveFasterWhisperPython() {
  return (
    process.env.FASTER_WHISPER_PYTHON ??
    resolve(
      currentDir,
      "../../../vendor/faster-whisper/vendor/faster-whisper/.venv/bin/python"
    )
  );
}

function resolveFasterWhisperScript() {
  return (
    process.env.FASTER_WHISPER_SCRIPT ??
    resolve(currentDir, "../../../scripts/transcribe_faster_whisper.py")
  );
}

function resolveGeminiWorkspaceAgentScript() {
  return (
    process.env.GEMINI_WORKSPACE_AGENT_SCRIPT ??
    resolve(currentDir, "../../../scripts/workspace-agent-gemini.mjs")
  );
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
      typeof (value as Record<string, unknown>).userMessage === "string" &&
      ((value as Record<string, unknown>).assistantMode === undefined ||
        (value as Record<string, unknown>).assistantMode === "consultant" ||
        (value as Record<string, unknown>).assistantMode === "operator") &&
      ((value as Record<string, unknown>).assistantTier === undefined ||
        (value as Record<string, unknown>).assistantTier === "free" ||
        (value as Record<string, unknown>).assistantTier === "premium")
  );
}

function isWeddingConsultantVoiceTranscriptionPayload(
  value: unknown
): value is WeddingConsultantVoiceTranscriptionPayload {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as Record<string, unknown>).audioBase64 === "string" &&
      ((value as Record<string, unknown>).mimeType === undefined ||
        typeof (value as Record<string, unknown>).mimeType === "string") &&
      ((value as Record<string, unknown>).languageHint === undefined ||
        typeof (value as Record<string, unknown>).languageHint === "string") &&
      ((value as Record<string, unknown>).assistantTier === undefined ||
        (value as Record<string, unknown>).assistantTier === "free" ||
        (value as Record<string, unknown>).assistantTier === "premium")
  );
}

function isWeddingConsultantVoiceSynthesisPayload(
  value: unknown
): value is WeddingConsultantVoiceSynthesisPayload {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as Record<string, unknown>).text === "string"
  );
}

function isCreateSeatTableInput(value: unknown): value is CreateSeatTableInput {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as Record<string, unknown>).name === "string" &&
      ((value as Record<string, unknown>).shape === "round" ||
        (value as Record<string, unknown>).shape === "rect") &&
      typeof (value as Record<string, unknown>).capacity === "number"
  );
}

function isUpdateSeatTableInput(value: unknown): value is UpdateSeatTableInput {
  return Boolean(
    value &&
      typeof value === "object" &&
      ((value as Record<string, unknown>).name === undefined ||
        typeof (value as Record<string, unknown>).name === "string") &&
      ((value as Record<string, unknown>).shape === undefined ||
        (value as Record<string, unknown>).shape === "round" ||
        (value as Record<string, unknown>).shape === "rect") &&
      ((value as Record<string, unknown>).capacity === undefined ||
        typeof (value as Record<string, unknown>).capacity === "number")
  );
}

export function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({ logger: false });
  const workspaceStore =
    options.workspaceStore ?? new InMemoryPrototypeWorkspaceStore();
  const vendorRefreshStore =
    options.vendorRefreshStore ?? new InMemoryVendorRefreshStore();
  const consultantRuntimeStore =
    options.consultantRuntimeStore ?? new InMemoryConsultantRuntimeStore();
  const consultantResponder =
    options.consultantResponder ??
    new DeterministicWeddingConsultantResponder(workspaceStore);
  const freeTranscriber =
    process.env.FASTER_WHISPER_ENABLED === "1"
      ? new FasterWhisperConsultantVoiceService(
          resolveFasterWhisperPython(),
          resolveFasterWhisperScript()
        )
      : null;
  const premiumVoice = process.env.AI_ORCHESTRATOR_URL
    ? new AiWeddingConsultantVoiceService(process.env.AI_ORCHESTRATOR_URL)
    : null;
  const consultantVoiceService =
    options.consultantVoiceService ??
    (freeTranscriber || premiumVoice
      ? new CompositeConsultantVoiceService({
          freeTranscriber,
          premiumVoice
        })
      : null);

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

    const assistantMode = normalizeAssistantMode(request.body.assistantMode);
    const assistantTier = normalizeAssistantTier(request.body.assistantTier);
    const userSession = await consultantRuntimeStore.appendMessage({
      workspace: request.body.workspace,
      workspaceId: request.body.workspace.id,
      role: "user",
      content: request.body.userMessage,
      assistantMode,
      currentTurn: request.body.currentTurn
    });
    const triggerMessage =
      userSession.messages[userSession.messages.length - 1] ?? null;

    if (!triggerMessage) {
      return reply.code(500).send({ error: "Consultant session message missing" });
    }

    const queuedJob = await consultantRuntimeStore.enqueueReplyJob({
      workspace: request.body.workspace,
      workspaceId: request.body.workspace.id,
      triggerMessageId: triggerMessage.id,
      requestedMode: assistantMode,
      userMessage: request.body.userMessage
    });

    try {
      const response = await consultantResponder.respond({
        ...request.body,
        assistantMode,
        assistantTier,
        contextSnapshot: userSession.context
      });
      const responseWorkspace = response.workspace ?? request.body.workspace;
      const assistantSession = await consultantRuntimeStore.appendMessage({
        workspace: responseWorkspace,
        workspaceId: request.body.workspace.id,
        role: "assistant",
        content: response.turn.assistantMessage,
        assistantMode,
        currentTurn: response.turn
      });

      await consultantRuntimeStore.completeReplyJob({
        workspace: responseWorkspace,
        workspaceId: request.body.workspace.id,
        jobId: queuedJob.id,
        status: "completed"
      });

      return {
        ...response,
        session: assistantSession
      };
    } catch (error) {
      await consultantRuntimeStore.completeReplyJob({
        workspace: request.body.workspace,
        workspaceId: request.body.workspace.id,
        jobId: queuedJob.id,
        status: "failed"
      });
      throw error;
    }
  });

  app.get("/prototype/consultant/sessions/:workspaceId", async (request, reply) => {
    const params = request.params as { workspaceId: string };
    const session = await consultantRuntimeStore.getSession(params.workspaceId);
    return { session };
  });

  app.get("/prototype/consultant/jobs", async (request) => {
    const query = request.query as { status?: string };
    const status =
      query.status === "pending" ||
      query.status === "processing" ||
      query.status === "completed" ||
      query.status === "failed"
        ? query.status
        : undefined;
    const jobs = await consultantRuntimeStore.listJobs(status);
    return { jobs };
  });

  app.post("/prototype/consultant/transcribe", async (request, reply) => {
    if (!consultantVoiceService) {
      return reply.code(503).send({ error: "Voice service unavailable" });
    }

    if (!isWeddingConsultantVoiceTranscriptionPayload(request.body)) {
      return reply.code(400).send({ error: "Invalid consultant voice payload" });
    }

    return consultantVoiceService.transcribe(request.body);
  });

  app.post("/prototype/consultant/speak", async (request, reply) => {
    if (!consultantVoiceService) {
      return reply.code(503).send({ error: "Voice service unavailable" });
    }

    if (!isWeddingConsultantVoiceSynthesisPayload(request.body)) {
      return reply.code(400).send({ error: "Invalid consultant speech payload" });
    }

    return consultantVoiceService.speak(request.body);
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

  app.post("/prototype/workspaces/:id/seating/tables", async (request, reply) => {
    const params = request.params as { id: string };

    if (!isCreateSeatTableInput(request.body)) {
      return reply.code(400).send({ error: "Invalid seating table payload" });
    }

    const workspace = await workspaceStore.addSeatTable(params.id, request.body);

    if (!workspace) {
      return reply.code(404).send({ error: "Workspace not found" });
    }

    return reply.code(201).send({ workspace });
  });

  app.patch("/prototype/workspaces/:id/seating/tables/:tableId", async (request, reply) => {
    const params = request.params as { id: string; tableId: string };

    if (!isUpdateSeatTableInput(request.body)) {
      return reply.code(400).send({ error: "Invalid seating table update payload" });
    }

    const workspace = await workspaceStore.updateSeatTable(
      params.id,
      params.tableId,
      request.body
    );

    if (!workspace) {
      return reply.code(404).send({ error: "Workspace or table not found" });
    }

    return { workspace };
  });

  app.patch("/prototype/workspaces/:id/seating/guests/:guestId", async (request, reply) => {
    const params = request.params as { id: string; guestId: string };
    const body = request.body as { tableId?: string | null };

    if (
      !body ||
      typeof body !== "object" ||
      !("tableId" in body) ||
      !(
        body.tableId === null ||
        body.tableId === undefined ||
        typeof body.tableId === "string"
      )
    ) {
      return reply.code(400).send({ error: "Invalid seating assignment payload" });
    }

    const workspace = await workspaceStore.assignGuestToSeatTable(
      params.id,
      params.guestId,
      body.tableId ?? null
    );

    if (!workspace) {
      return reply.code(404).send({ error: "Workspace, guest or table not found" });
    }

    return { workspace };
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

