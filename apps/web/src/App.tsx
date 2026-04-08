import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactElement } from "react";
import type {
  BudgetCategory,
  GuidedPlanningStepId,
  OptionalVendorCategory,
  PlannedEventId,
  PrototypeExpense,
  PrototypeGuest,
  PrototypeVendorStage,
  PrototypeWorkspace,
  PrototypeWorkspaceProfile,
  VendorMatch,
  WeddingConsultantTurn,
  WeddingBootstrapInput
} from "@wedding/shared";
import {
  createGuidedPlanningSession,
  createWeddingConsultantOpening
} from "@wedding/shared";
import {
  addExpense,
  addSeatTable,
  addGuest,
  assignGuestToSeatTable,
  type ConsultationAssistantMode,
  type ConsultationAssistantTier,
  type ConsultantSession,
  createWorkspace,
  deleteWorkspace,
  getWeddingConsultantSession,
  getWorkspace,
  listWorkspaceProfiles,
  replyWithWeddingConsultant,
  setTaskCompleted,
  setApiAuthToken,
  synthesizeWeddingConsultantVoice,
  transcribeWeddingConsultantVoice,
  updateGuestRsvp,
  updateVendorLead,
  updateWorkspace
} from "./lib/api";
import {
  ConsultationPanel,
  type ConsultationMessage
} from "./components/ConsultationPanel";
import { PublicRsvpPage } from "./PublicRsvpPage";
import { IngestionCoveragePage } from "./IngestionCoveragePage";
import "./app.css";
import "./app-atelier.css";

type FormState = {
  coupleName: string;
  targetDate: string;
  region: string;
  guestCountTarget: number;
  budgetTotal: number;
  stylePreferences: string;
  noGoPreferences: string;
  plannedEvents: PlannedEventId[];
  disabledVendorCategories: OptionalVendorCategory[];
  invitationHeadline: string;
  invitationBody: string;
  invitationFooter: string;
};

type GuestDraft = {
  name: string;
  household: string;
  email: string;
  eventIds: PlannedEventId[];
};

type ExpenseDraft = {
  label: string;
  category: BudgetCategory["category"];
  amount: number;
  status: PrototypeExpense["status"];
  vendorName: string;
};

type VendorDraft = {
  stage: PrototypeVendorStage;
  quoteAmount: string;
  note: string;
};

type SeatTableDraft = {
  name: string;
  shape: "round" | "rect";
  capacity: number;
};

type AppView = "library" | "guided";
type AppPageId = "dashboard" | "timeline" | "vendors" | "budget" | "guests" | "admin";
type CoreVendorCategory = Exclude<VendorMatch["category"], "venue">;
type CoreVendorFilterMode = "all" | "portfolio" | "active";
type ConsultationVoiceStatus = "idle" | "recording" | "transcribing" | "speaking";
type GuestFilterMode = "all" | PrototypeGuest["rsvpStatus"];

const pageLabelById: Record<AppPageId, string> = {
  dashboard: "Dashboard",
  timeline: "Timeline",
  vendors: "Vendors",
  budget: "Budget",
  guests: "Gäste",
  admin: "Admin"
};

const pageShortLabelById: Record<AppPageId, string> = {
  dashboard: "Start",
  timeline: "Plan",
  vendors: "Vendoren",
  budget: "Budget",
  guests: "Gäste",
  admin: "Admin"
};

const pageForStepById: Record<GuidedPlanningStepId, AppPageId> = {
  foundation: "admin",
  "venue-and-date": "dashboard",
  "core-vendors": "vendors",
  "guest-experience": "guests",
  "legal-admin": "admin",
  "final-control-room": "timeline"
};

async function blobToBase64(blob: Blob) {
  const buffer = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);

  for (const value of bytes) {
    binary += String.fromCharCode(value);
  }

  return window.btoa(binary);
}

function base64ToBlob(base64: string, mimeType: string) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mimeType });
}

const storageKey = "wedding.prototype.workspaceId";
const initialInput: WeddingBootstrapInput = {
  coupleName: "Alina & Jonas",
  targetDate: "2027-08-21",
  region: "67454 Hassloch",
  guestCountTarget: 70,
  budgetTotal: 24000,
  stylePreferences: ["natural", "romantic"],
  noGoPreferences: ["ballroom"],
  plannedEvents: ["civil-ceremony", "celebration"],
  disabledVendorCategories: [],
  invitationCopy: {
    headline: "{paar} freut sich auf eure Rückmeldung",
    body:
      "{gast}, ihr seid eingeladen für {datum} in {ort}. Bitte gebt kurz Bescheid, ob ihr dabei seid und ob es Essenshinweise gibt.",
    footer: "Wir freuen uns sehr auf euch."
  }
};

const eventOptions: Array<{ id: PlannedEventId; label: string }> = [
  { id: "civil-ceremony", label: "Standesamt" },
  { id: "free-ceremony", label: "Freie Trauung" },
  { id: "celebration", label: "Feier" },
  { id: "brunch", label: "Brunch" }
];

const optionalVendorCategoryOptions: Array<{
  id: OptionalVendorCategory;
  label: string;
  copy: string;
}> = [
  {
    id: "photography",
    label: "Fotografie",
    copy: "Nur aktiv lassen, wenn ihr aktiv nach Foto- oder Videobegleitung sucht."
  },
  {
    id: "catering",
    label: "Catering",
    copy: "Deaktivieren, wenn Venue oder Familie das Essen übernimmt."
  },
  {
    id: "music",
    label: "Musik",
    copy: "Deaktivieren, wenn DJ, Band oder Technik aktuell kein Thema sind."
  },
  {
    id: "florals",
    label: "Floristik",
    copy: "Deaktivieren, wenn Deko/Blumen extern oder intern geklärt sind."
  },
  {
    id: "attire",
    label: "Styling & Outfit",
    copy: "Deaktivieren, wenn Kleider, Styling oder Hair/Make-up hier keine Rolle spielen."
  }
];

const rsvpLabels: Record<PrototypeGuest["rsvpStatus"], string> = {
  pending: "Offen",
  attending: "Zugesagt",
  declined: "Abgesagt"
};

const expenseStatusLabels: Record<PrototypeExpense["status"], string> = {
  planned: "Geplant",
  booked: "Gebucht",
  paid: "Bezahlt"
};

const mealPreferenceLabels: Record<PrototypeGuest["mealPreference"], string> = {
  undecided: "noch offen",
  standard: "Standard",
  vegetarian: "Vegetarisch",
  vegan: "Vegan",
  kids: "Kindergericht"
};

const vendorStageLabels: Record<PrototypeVendorStage, string> = {
  suggested: "Neu",
  contacted: "Kontaktiert",
  quoted: "Angebot",
  booked: "Gebucht",
  rejected: "Verworfen"
};

const displayStepTitleById: Record<GuidedPlanningStepId, string> = {
  foundation: "Profilfundament",
  "venue-and-date": "Location-Shortlist",
  "core-vendors": "Kern-Vendoren",
  "guest-experience": "Gästeliste & RSVP",
  "legal-admin": "Standesamt & Admin",
  "final-control-room": "Control Room"
};

const vendorCategoryLabels: Record<VendorMatch["category"], string> = {
  venue: "Locations",
  photography: "Fotografie",
  catering: "Catering",
  music: "Musik",
  florals: "Floristik",
  attire: "Styling & Outfit"
};

const coreVendorCategoryOrder: CoreVendorCategory[] = [
  "photography",
  "catering",
  "music",
  "florals",
  "attire"
];

const vendorPortfolioFallbackLabels: Record<VendorMatch["category"], string> = {
  venue: "Galerie",
  photography: "Portfolio",
  catering: "Referenzen",
  music: "Showcase",
  florals: "Impressionen",
  attire: "Looks & Auswahl"
};

const appBasePath = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toTagArray(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function toFormState(input: WeddingBootstrapInput): FormState {
  return {
    ...input,
    stylePreferences: input.stylePreferences.join(", "),
    noGoPreferences: input.noGoPreferences.join(", "),
    disabledVendorCategories: [...(input.disabledVendorCategories ?? [])],
    invitationHeadline: input.invitationCopy.headline,
    invitationBody: input.invitationCopy.body,
    invitationFooter: input.invitationCopy.footer
  };
}

function toBootstrapInput(form: FormState): WeddingBootstrapInput {
  return {
    coupleName: form.coupleName,
    targetDate: form.targetDate,
    region: form.region,
    guestCountTarget: Number(form.guestCountTarget),
    budgetTotal: Number(form.budgetTotal),
    stylePreferences: toTagArray(form.stylePreferences),
    noGoPreferences: toTagArray(form.noGoPreferences),
    plannedEvents: form.plannedEvents,
    disabledVendorCategories: form.disabledVendorCategories,
    invitationCopy: {
      headline: form.invitationHeadline.trim(),
      body: form.invitationBody.trim(),
      footer: form.invitationFooter.trim()
    }
  };
}

function createGuestDraft(eventIds: PlannedEventId[]): GuestDraft {
  return {
    name: "",
    household: "",
    email: "",
    eventIds
  };
}

function createExpenseDraft(
  category: BudgetCategory["category"] = "venue"
): ExpenseDraft {
  return {
    label: "",
    category,
    amount: 0,
    status: "booked",
    vendorName: ""
  };
}

function createVendorDraft(): VendorDraft {
  return {
    stage: "suggested",
    quoteAmount: "",
    note: ""
  };
}

function createSeatTableDraft(): SeatTableDraft {
  return {
    name: "",
    shape: "round",
    capacity: 8
  };
}

function createVendorDraftMap(workspace: PrototypeWorkspace | null) {
  return Object.fromEntries(
    (workspace?.vendorTracker ?? []).map((entry) => [
      entry.vendorId,
      {
        stage: entry.stage,
        quoteAmount:
          typeof entry.quoteAmount === "number" ? String(entry.quoteAmount) : "",
        note: entry.note
      }
    ])
  ) as Record<string, VendorDraft>;
}

function createGuestRsvpPath(accessToken: string) {
  return `${appBasePath}/rsvp/${accessToken}`;
}

function getPublicRsvpTokenFromPath(pathname: string) {
  const basePrefix = appBasePath.length > 0 ? escapeRegex(appBasePath) : "";
  const match = pathname.match(new RegExp(`^${basePrefix}/rsvp/([^/]+)$`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function createConsultationMessage(
  role: ConsultationMessage["role"],
  content: string
): ConsultationMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content
  };
}

function toConsultationMessages(session: ConsultantSession): ConsultationMessage[] {
  return session.messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content
  }));
}

function resolveConsultationLane(
  provider:
    | "deterministic"
    | "ollama"
    | "fallback"
    | "openclaw"
    | "openrouter"
    | "gemini"
): "agent" | "provider-fallback" | "fallback" | "rules" {
  if (provider === "ollama" || provider === "openclaw") {
    return "agent";
  }

  if (provider === "openrouter" || provider === "gemini") {
    return "provider-fallback";
  }

  if (provider === "fallback") {
    return "fallback";
  }

  return "rules";
}

function formatProfileMeta(profile: PrototypeWorkspaceProfile) {
  return `${profile.region} / ${profile.targetDate} / ${profile.guestCountTarget} Gäste / ${profile.budgetTotal.toLocaleString("de-DE")} EUR`;
}

function formatLongDate(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).format(parsed);
}

function formatCurrency(value: number) {
  return `${value.toLocaleString("de-DE")} EUR`;
}

function clampPercentage(value: number) {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

interface ProfileFormProps {
  form: FormState;
  disabled: boolean;
  primaryLabel: string;
  showInvitationFields?: boolean;
  onChange(updater: (current: FormState) => FormState): void;
  onSubmit(event: FormEvent<HTMLFormElement>): void;
  onCancel?(): void;
}

function ProfileForm({
  form,
  disabled,
  primaryLabel,
  showInvitationFields = false,
  onChange,
  onSubmit,
  onCancel
}: ProfileFormProps) {
  return (
    <form className="guided-form" onSubmit={onSubmit}>
      <label>
        Paarname
        <input
          aria-label="Paarname"
          value={form.coupleName}
          onChange={(event) =>
            onChange((current) => ({ ...current, coupleName: event.target.value }))
          }
        />
      </label>
      <div className="guided-two-up">
        <label>
          Hochzeitsdatum
          <input
            aria-label="Hochzeitsdatum"
            type="date"
            value={form.targetDate}
            onChange={(event) =>
              onChange((current) => ({ ...current, targetDate: event.target.value }))
            }
          />
        </label>
        <label>
          Region
          <input
            aria-label="Region"
            value={form.region}
            onChange={(event) =>
              onChange((current) => ({ ...current, region: event.target.value }))
            }
          />
        </label>
      </div>
      <div className="guided-two-up">
        <label>
          Gästeziel
          <input
            aria-label="Gästeziel"
            type="number"
            min="10"
            value={form.guestCountTarget}
            onChange={(event) =>
              onChange((current) => ({
                ...current,
                guestCountTarget: Number(event.target.value)
              }))
            }
          />
        </label>
        <label>
          Budget in EUR
          <input
            aria-label="Budget in EUR"
            type="number"
            min="1000"
            step="500"
            value={form.budgetTotal}
            onChange={(event) =>
              onChange((current) => ({
                ...current,
                budgetTotal: Number(event.target.value)
              }))
            }
          />
        </label>
      </div>
      <label>
        Stilpräferenzen
        <input
          aria-label="Stilpräferenzen"
          value={form.stylePreferences}
          onChange={(event) =>
            onChange((current) => ({ ...current, stylePreferences: event.target.value }))
          }
        />
      </label>
      <label>
        No-Gos
        <input
          aria-label="No-Gos"
          value={form.noGoPreferences}
          onChange={(event) =>
            onChange((current) => ({ ...current, noGoPreferences: event.target.value }))
          }
        />
      </label>
      <fieldset className="guided-events">
        <legend>Geplante Events</legend>
        <div className="guided-event-grid">
          {eventOptions.map((option) => {
            const active = form.plannedEvents.includes(option.id);

            return (
              <label
                key={option.id}
                className={`guided-event-chip ${active ? "guided-event-chip--active" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(event) =>
                    onChange((current) => ({
                      ...current,
                      plannedEvents: event.target.checked
                        ? [...current.plannedEvents, option.id]
                        : current.plannedEvents.filter((entry) => entry !== option.id)
                    }))
                  }
                />
                <span>{option.label}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <fieldset className="guided-events">
        <legend>Aktive Vendor-Kategorien</legend>
        <p className="guided-muted">
          Deaktivierte Kategorien verschwinden aus Vendor-Desk, Budgetrahmen und Guided Flow.
        </p>
        <div className="guided-event-grid">
          {optionalVendorCategoryOptions.map((option) => {
            const active = !form.disabledVendorCategories.includes(option.id);

            return (
              <label
                key={option.id}
                className={`guided-event-chip ${active ? "guided-event-chip--active" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(event) =>
                    onChange((current) => ({
                      ...current,
                      disabledVendorCategories: event.target.checked
                        ? current.disabledVendorCategories.filter((entry) => entry !== option.id)
                        : [...current.disabledVendorCategories, option.id]
                    }))
                  }
                />
                <span>{option.label}</span>
                <small>{option.copy}</small>
              </label>
            );
          })}
        </div>
      </fieldset>
      {showInvitationFields ? (
        <fieldset className="guided-events guided-events--copy">
          <legend>Einladungstext für RSVP</legend>
          <p className="guided-muted">
            Platzhalter: {"{paar}"}, {"{gast}"}, {"{datum}"}, {"{ort}"}, {"{events}"}
          </p>
          <label>
            Headline
            <input
              aria-label="Einladungs-Headline"
              value={form.invitationHeadline}
              onChange={(event) =>
                onChange((current) => ({
                  ...current,
                  invitationHeadline: event.target.value
                }))
              }
            />
          </label>
          <label>
            Einladungstext
            <textarea
              aria-label="Einladungstext"
              rows={5}
              value={form.invitationBody}
              onChange={(event) =>
                onChange((current) => ({
                  ...current,
                  invitationBody: event.target.value
                }))
              }
            />
          </label>
          <label>
            Fusszeile
            <textarea
              aria-label="Einladungs-Fusszeile"
              rows={3}
              value={form.invitationFooter}
              onChange={(event) =>
                onChange((current) => ({
                  ...current,
                  invitationFooter: event.target.value
                }))
              }
            />
          </label>
        </fieldset>
      ) : null}
      <div className="guided-form-actions">
        <button type="submit" className="primary-button" disabled={disabled}>
          {primaryLabel}
        </button>
        {onCancel ? (
          <button
            type="button"
            className="secondary-button"
            disabled={disabled}
            onClick={onCancel}
          >
            Abbrechen
          </button>
        ) : null}
      </div>
    </form>
  );
}

type WorkspaceLibraryProfile = PrototypeWorkspaceProfile & {
  ownerEmail: string | null;
  ownerId: string | null;
};

function DashboardApp({
  currentUserEmail,
  onLogout
}: {
  currentUserEmail: string;
  onLogout: () => void;
}) {
  const [view, setView] = useState<AppView>("library");
  const [profiles, setProfiles] = useState<WorkspaceLibraryProfile[]>([]);
  const [adminOwnerEmailFilter, setAdminOwnerEmailFilter] = useState("");
  const [showCreateProfile, setShowCreateProfile] = useState(false);
  const [form, setForm] = useState<FormState>(() => toFormState(initialInput));
  const [workspace, setWorkspace] = useState<PrototypeWorkspace | null>(null);
  const [guestDraft, setGuestDraft] = useState<GuestDraft>(() =>
    createGuestDraft(initialInput.plannedEvents)
  );
  const [expenseDraft, setExpenseDraft] = useState<ExpenseDraft>(() =>
    createExpenseDraft()
  );
  const [vendorDrafts, setVendorDrafts] = useState<Record<string, VendorDraft>>({});
  const [seatTableDraft, setSeatTableDraft] = useState<SeatTableDraft>(() => createSeatTableDraft());
  const [consultationTurn, setConsultationTurn] = useState<WeddingConsultantTurn | null>(null);
  const [consultationMessages, setConsultationMessages] = useState<ConsultationMessage[]>([]);
  const [consultationDraft, setConsultationDraft] = useState("");
  const [consultationStatus, setConsultationStatus] = useState<"idle" | "sending">("idle");
  const [consultationAssistantMode, setConsultationAssistantMode] =
    useState<ConsultationAssistantMode>("consultant");
  const [consultationAssistantTier, setConsultationAssistantTier] =
    useState<ConsultationAssistantTier>("free");
  const [consultationLane, setConsultationLane] = useState<
    "agent" | "provider-fallback" | "fallback" | "rules" | null
  >(null);
  const [consultationVoiceStatus, setConsultationVoiceStatus] =
    useState<ConsultationVoiceStatus>("idle");
  const [status, setStatus] = useState<"loading" | "ready" | "saving">("loading");
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<AppPageId>("dashboard");
  const [consultantOpen, setConsultantOpen] = useState(false);
  const [guestSearch, setGuestSearch] = useState("");
  const [guestFilterMode, setGuestFilterMode] = useState<GuestFilterMode>("all");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [activeCoreVendorCategory, setActiveCoreVendorCategory] =
    useState<CoreVendorCategory>("photography");
  const [coreVendorFilterMode, setCoreVendorFilterMode] =
    useState<CoreVendorFilterMode>("all");
  const [coreVendorSearch, setCoreVendorSearch] = useState("");
  const consultationRecorderRef = useRef<MediaRecorder | null>(null);
  const consultationSpeechRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const consultationStreamRef = useRef<MediaStream | null>(null);
  const consultationChunksRef = useRef<Blob[]>([]);
  const consultationAudioRef = useRef<HTMLAudioElement | null>(null);
  const consultationShouldSpeakNextReplyRef = useRef(false);
  const isAdmin = currentUserEmail.toLowerCase() === "zirkumlex666@gmail.com";

  async function refreshProfiles() {
    const response = await listWorkspaceProfiles({
      all: isAdmin,
      ...(isAdmin && adminOwnerEmailFilter.trim().length > 0
        ? { ownerEmail: adminOwnerEmailFilter }
        : {})
    });
    setProfiles(response.profiles);
    return response.profiles;
  }

  const guidedSession = workspace ? createGuidedPlanningSession(workspace) : null;
  const activeStepId = consultationTurn?.stepId ?? guidedSession?.currentStepId ?? "foundation";
  const activeStep = guidedSession?.steps.find((step) => step.id === activeStepId) ?? null;
  const budgetCategories = workspace?.plan.budgetCategories ?? [];
  const isExpenseDraftValid =
    expenseDraft.label.trim().length > 0 &&
    Number.isFinite(expenseDraft.amount) &&
    expenseDraft.amount > 0;
  const totalBudget = workspace?.onboarding.budgetTotal ?? 0;
  const totalSpent =
    workspace?.expenses.reduce((sum, expense) => sum + expense.amount, 0) ?? 0;
  const budgetUsage = totalBudget > 0 ? clampPercentage((totalSpent / totalBudget) * 100) : 0;
  const completedTasks =
    workspace?.tasks.filter((task) => task.completed).length ?? 0;
  const totalTasks = workspace?.tasks.length ?? 0;
  const taskUsage = totalTasks > 0 ? clampPercentage((completedTasks / totalTasks) * 100) : 0;
  const activeVendorCount =
    workspace?.vendorTracker.filter(
      (entry) => entry.stage !== "suggested" && entry.stage !== "rejected"
    ).length ?? 0;
  const guestResponseRatio =
    workspace && workspace.guestSummary.total > 0
      ? clampPercentage(
          ((workspace.guestSummary.attending + workspace.guestSummary.declined) /
            workspace.guestSummary.total) *
            100
        )
      : 0;
  const filteredGuests =
    workspace?.guests.filter((guest) => {
      if (guestFilterMode !== "all" && guest.rsvpStatus !== guestFilterMode) {
        return false;
      }

      const normalizedQuery = guestSearch.trim().toLowerCase();

      if (!normalizedQuery) {
        return true;
      }

      return [guest.name, guest.household, guest.email, guest.message, guest.dietaryNotes]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(normalizedQuery));
    }) ?? [];

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      setStatus("loading");
      setError(null);

      try {
        const profileResponse = await listWorkspaceProfiles({
          all: isAdmin,
          ...(isAdmin && adminOwnerEmailFilter.trim().length > 0
            ? { ownerEmail: adminOwnerEmailFilter }
            : {})
        });

        if (cancelled) {
          return;
        }

        setProfiles(profileResponse.profiles);

        const existingId = window.localStorage.getItem(storageKey);

        if (existingId) {
          try {
            const loaded = await getWorkspace(existingId);

            if (!cancelled) {
              hydrateWorkspace(loaded.workspace);
              setView("guided");
              setShowCreateProfile(false);
              setStatus("ready");
            }

            return;
          } catch {
            window.localStorage.removeItem(storageKey);
          }
        }

        setView("library");
        setShowCreateProfile(profileResponse.profiles.length === 0);
        setStatus("ready");
      } catch {
        if (!cancelled) {
          setError("Die Profilbibliothek konnte gerade nicht geladen werden.");
          setStatus("ready");
        }
      }
    }

    void boot();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isAdmin || view !== "library") {
      return;
    }

    void refreshProfiles();
  }, [isAdmin, adminOwnerEmailFilter, view]);

  useEffect(() => {
    const availableCategories = coreVendorCategoryOrder.filter((category) =>
      workspace?.plan.vendorMatches.some((vendor) => vendor.category === category)
    );

    if (availableCategories.length === 0) {
      return;
    }

    setActiveCoreVendorCategory((current) =>
      availableCategories.includes(current) ? current : (availableCategories[0] ?? current)
    );
  }, [workspace]);

  useEffect(() => {
    setCoreVendorFilterMode("all");
    setCoreVendorSearch("");
  }, [workspace?.id]);

  useEffect(() => {
    if (!workspace?.id) {
      setConsultationTurn(null);
      setConsultationMessages([]);
      setConsultationDraft("");
      setConsultationLane(null);
      return;
    }

    const currentWorkspace: PrototypeWorkspace = workspace;

    let active = true;

    async function loadConsultationSession() {
      try {
        const response = await getWeddingConsultantSession(currentWorkspace.id);

        if (!active) {
          return;
        }

        if (!response.session) {
          const opening = createWeddingConsultantOpening(
            currentWorkspace,
            guidedSession?.currentStepId
          );
          setConsultationTurn(opening);
          setConsultationMessages([createConsultationMessage("assistant", opening.assistantMessage)]);
          setConsultationDraft("");
          setConsultationLane(null);
          return;
        }

        const messages = toConsultationMessages(response.session);
        setConsultationTurn(
          response.session.currentTurn ??
            createWeddingConsultantOpening(currentWorkspace, guidedSession?.currentStepId)
        );
        setConsultationMessages(messages);
        setConsultationDraft("");
        setConsultationLane(null);
      } catch {
        if (!active) {
          return;
        }

        const opening = createWeddingConsultantOpening(
          currentWorkspace,
          guidedSession?.currentStepId
        );
        setConsultationTurn(opening);
        setConsultationMessages([createConsultationMessage("assistant", opening.assistantMessage)]);
        setConsultationDraft("");
        setConsultationLane(null);
      }
    }

    void loadConsultationSession();

    return () => {
      active = false;
    };
  }, [workspace?.id]);

  useEffect(() => {
    return () => {
      consultationRecorderRef.current?.stream.getTracks().forEach((track) => track.stop());
      consultationSpeechRecognitionRef.current?.stop();
      consultationStreamRef.current?.getTracks().forEach((track) => track.stop());
      consultationAudioRef.current?.pause();
      consultationAudioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;

    if (consultantOpen) {
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [consultantOpen]);

  useEffect(() => {
    if (!consultantOpen) {
      return;
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setConsultantOpen(false);
      }
    }

    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [consultantOpen]);

  useEffect(() => {
    if (!workspace?.id) {
      return;
    }

    let active = true;
    const workspaceId = workspace.id;

    async function refreshSnapshot() {
      if (status === "saving") {
        return;
      }

      try {
        const [workspaceResponse, profileResponse, consultationSessionResponse] = await Promise.all([
          getWorkspace(workspaceId),
          listWorkspaceProfiles({
            all: isAdmin,
            ...(isAdmin && adminOwnerEmailFilter.trim().length > 0
              ? { ownerEmail: adminOwnerEmailFilter }
              : {})
          }),
          getWeddingConsultantSession(workspaceId).catch(() => null)
        ]);

        if (!active) {
          return;
        }

        setProfiles(profileResponse.profiles);
        setWorkspace((current) =>
          current?.id === workspaceId ? workspaceResponse.workspace : current
        );
        if (consultationSessionResponse?.session) {
          const messages = toConsultationMessages(consultationSessionResponse.session);
          setConsultationMessages(messages);
          setConsultationTurn(
            consultationSessionResponse.session.currentTurn ??
              createWeddingConsultantOpening(
                workspaceResponse.workspace,
                guidedSession?.currentStepId
              )
          );
        }
      } catch {
        // Keep the current guided snapshot if background refresh fails.
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void refreshSnapshot();
      }
    }

    function handleFocus() {
      void refreshSnapshot();
    }

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshSnapshot();
      }
    }, 1500);

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [workspace?.id, status]);

  function hydrateWorkspace(
    nextWorkspace: PrototypeWorkspace,
    options?: {
      resetUi?: boolean;
    }
  ) {
    const initialStepId = createGuidedPlanningSession(nextWorkspace).currentStepId;
    setWorkspace(nextWorkspace);
    setVendorDrafts(createVendorDraftMap(nextWorkspace));
    setForm(toFormState(nextWorkspace.onboarding));
    setGuestDraft(createGuestDraft(nextWorkspace.onboarding.plannedEvents));
    setExpenseDraft(
      createExpenseDraft(nextWorkspace.plan.budgetCategories[0]?.category ?? "venue")
    );

    if (options?.resetUi === false) {
      return;
    }

    setCurrentPage(pageForStepById[initialStepId]);
    setConsultantOpen(false);
    setMobileNavOpen(false);
    setGuestSearch("");
    setGuestFilterMode("all");
  }

  async function openWorkspace(workspaceId: string) {
    setStatus("loading");
    setError(null);

    try {
      const loaded = await getWorkspace(workspaceId);
      hydrateWorkspace(loaded.workspace);
      window.localStorage.setItem(storageKey, loaded.workspace.id);
      setView("guided");
      setShowCreateProfile(false);
      await refreshProfiles();
      setStatus("ready");
    } catch {
      setError("Dieses Profil konnte gerade nicht geöffnet werden.");
      setStatus("ready");
    }
  }

  function showLibrary(openCreateForm: boolean) {
    setView("library");
    setShowCreateProfile(openCreateForm);
    setError(null);
    setConsultantOpen(false);
    setMobileNavOpen(false);

    if (openCreateForm) {
      setForm(toFormState(initialInput));
    }
  }

  async function handleCreateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setError(null);

    try {
      const created = await createWorkspace(toBootstrapInput(form));
      hydrateWorkspace(created.workspace);
      window.localStorage.setItem(storageKey, created.workspace.id);
      await refreshProfiles();
      setView("guided");
      setShowCreateProfile(false);
      setStatus("ready");
    } catch {
      setError("Das neue Beratungsprofil konnte nicht angelegt werden.");
      setStatus("ready");
    }
  }

  async function handleSaveProfile(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    if (!workspace) {
      return;
    }

    setStatus("saving");
    setError(null);

    try {
      const result = await updateWorkspace(workspace.id, toBootstrapInput(form));
      hydrateWorkspace(result.workspace, { resetUi: false });
      await refreshProfiles();
      setStatus("ready");
    } catch {
      setError("Das Profil konnte gerade nicht gespeichert werden.");
      setStatus("ready");
    }
  }

  async function handleDeleteProfile(profile: PrototypeWorkspaceProfile) {
    const confirmed = window.confirm(
      `Soll "${profile.coupleName}" wirklich gelöscht werden?`
    );

    if (!confirmed) {
      return;
    }

    setStatus("saving");
    setError(null);

    try {
      await deleteWorkspace(profile.id);
      window.localStorage.removeItem(storageKey);

      if (workspace?.id === profile.id) {
        setWorkspace(null);
      }

      const nextProfiles = await refreshProfiles();
      setView("library");
      setShowCreateProfile(nextProfiles.length === 0);
      setConsultantOpen(false);
      setMobileNavOpen(false);
      setStatus("ready");
    } catch {
      setError("Das Profil konnte gerade nicht gelöscht werden.");
      setStatus("ready");
    }
  }

  async function handleTaskToggle(taskId: string, completed: boolean) {
    if (!workspace) {
      return;
    }

    setStatus("saving");
    setError(null);

    try {
      const result = await setTaskCompleted(workspace.id, taskId, completed);
      hydrateWorkspace(result.workspace, { resetUi: false });
      await refreshProfiles();
      setStatus("ready");
    } catch {
      setError("Die Aufgabe konnte gerade nicht aktualisiert werden.");
      setStatus("ready");
    }
  }

  async function handleGuestSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!workspace) {
      return;
    }

    setStatus("saving");
    setError(null);

    try {
      const result = await addGuest(workspace.id, guestDraft);
      hydrateWorkspace(result.workspace, { resetUi: false });
      setGuestDraft(createGuestDraft(result.workspace.onboarding.plannedEvents));
      await refreshProfiles();
      setStatus("ready");
    } catch {
      setError("Der Gast konnte gerade nicht gespeichert werden.");
      setStatus("ready");
    }
  }

  async function handleGuestRsvp(
    guestId: string,
    rsvpStatus: PrototypeGuest["rsvpStatus"]
  ) {
    if (!workspace) {
      return;
    }

    setStatus("saving");
    setError(null);

    try {
      const result = await updateGuestRsvp(workspace.id, guestId, rsvpStatus);
      hydrateWorkspace(result.workspace, { resetUi: false });
      await refreshProfiles();
      setStatus("ready");
    } catch {
      setError("Der RSVP-Status konnte gerade nicht aktualisiert werden.");
      setStatus("ready");
    }
  }

  async function handleExpenseSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!workspace) {
      return;
    }

    if (!isExpenseDraftValid) {
      setError("Bitte Budgeteintrag und Betrag größer als 0 ausfüllen.");
      return;
    }

    setStatus("saving");
    setError(null);

    try {
      const result = await addExpense(workspace.id, {
        ...expenseDraft,
        amount: Number(expenseDraft.amount)
      });
      hydrateWorkspace(result.workspace, { resetUi: false });
      setExpenseDraft(
        createExpenseDraft(result.workspace.plan.budgetCategories[0]?.category ?? "venue")
      );
      await refreshProfiles();
      setStatus("ready");
    } catch {
      setError("Der Budgeteintrag konnte gerade nicht gespeichert werden.");
      setStatus("ready");
    }
  }

  async function handleVendorSave(vendorId: string) {
    if (!workspace) {
      return;
    }

    const draft = vendorDrafts[vendorId] ?? createVendorDraft();
    const parsedQuoteAmount =
      draft.quoteAmount.trim().length > 0 ? Number(draft.quoteAmount) : null;

    setStatus("saving");
    setError(null);

    try {
      const result = await updateVendorLead(workspace.id, vendorId, {
        stage: draft.stage,
        quoteAmount: Number.isFinite(parsedQuoteAmount) ? parsedQuoteAmount : null,
        note: draft.note.trim()
      });
      hydrateWorkspace(result.workspace, { resetUi: false });
      await refreshProfiles();
      setStatus("ready");
    } catch {
      setError("Der Vendor-Status konnte gerade nicht gespeichert werden.");
      setStatus("ready");
    }
  }

  async function handleSeatTableSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!workspace) {
      return;
    }

    setStatus("saving");
    setError(null);

    try {
      const result = await addSeatTable(workspace.id, seatTableDraft);
      hydrateWorkspace(result.workspace, { resetUi: false });
      setSeatTableDraft(createSeatTableDraft());
      await refreshProfiles();
      setStatus("ready");
    } catch {
      setError("Der Tisch konnte gerade nicht gespeichert werden.");
      setStatus("ready");
    }
  }

  async function handleGuestSeatAssignment(guestId: string, tableId: string | null) {
    if (!workspace) {
      return;
    }

    setStatus("saving");
    setError(null);

    try {
      const result = await assignGuestToSeatTable(workspace.id, guestId, tableId);
      hydrateWorkspace(result.workspace, { resetUi: false });
      await refreshProfiles();
      setStatus("ready");
    } catch {
      setError("Der Sitzplatz konnte gerade nicht aktualisiert werden.");
      setStatus("ready");
    }
  }

  function updateVendorDraft(vendorId: string, nextDraft: Partial<VendorDraft>) {
    setVendorDrafts((current) => ({
      ...current,
      [vendorId]: {
        ...(current[vendorId] ?? createVendorDraft()),
        ...nextDraft
      }
    }));
  }

  function formatVendorEvidence(vendor: VendorMatch) {
    if (vendor.sourceLabel && vendor.freshnessLabel) {
      return `${vendor.sourceLabel} / ${vendor.freshnessLabel}`;
    }

    return vendor.sourceLabel ?? vendor.freshnessLabel ?? null;
  }

  function getVendorTrackerEntry(vendorId: string) {
    return workspace?.vendorTracker.find((entry) => entry.vendorId === vendorId) ?? null;
  }

  function getGuestSeatTable(guestId: string) {
    return (
      workspace?.seatingPlan.tables.find((table) => table.guestIds.includes(guestId)) ?? null
    );
  }

  function getGuestNameById(guestId: string) {
    return workspace?.guests.find((entry) => entry.id === guestId)?.name ?? "Offener Platz";
  }

  function getVendorPortfolioLink(vendor: VendorMatch) {
    const href = vendor.portfolioUrl ?? vendor.websiteUrl ?? vendor.sourceUrl;

    if (!href) {
      return null;
    }

    return {
      href,
      label: vendor.portfolioLabel ?? vendorPortfolioFallbackLabels[vendor.category]
    };
  }

  function getVendorLinks(vendor: VendorMatch) {
    const links: Array<{ href: string; label: string; primary?: boolean }> = [];
    const seen = new Set<string>();
    const portfolioLink = getVendorPortfolioLink(vendor);

    function pushLink(href: string | undefined, label: string, primary = false) {
      if (!href || seen.has(href)) {
        return;
      }

      seen.add(href);
      links.push({ href, label, primary });
    }

    if (portfolioLink) {
      pushLink(portfolioLink.href, portfolioLink.label, true);
    }

    pushLink(vendor.mapsUrl, "Karte");
    pushLink(vendor.websiteUrl, "Website");
    pushLink(vendor.sourceUrl, vendor.sourceLabel ?? "Quelle");

    return links;
  }

  function matchesVendorSearch(vendor: VendorMatch, searchTerm: string) {
    const normalizedQuery = searchTerm.trim().toLowerCase();

    if (!normalizedQuery) {
      return true;
    }

    return [
      vendor.name,
      vendor.postalCode,
      vendor.city,
      vendor.region,
      vendor.serviceLabel,
      vendor.addressLine,
      vendor.contactEmail,
      vendor.contactPhone,
      vendor.openingHours?.join(" "),
      vendor.pricingNotes,
      vendor.pricingSourceLabel,
      vendor.reasonSummary
    ]
      .filter(Boolean)
      .some((value) => value?.toLowerCase().includes(normalizedQuery));
  }

  function getVendorAddressLabel(vendor: VendorMatch) {
    if (vendor.addressLine?.trim()) {
      return vendor.addressLine.trim();
    }

    const locality = [vendor.postalCode, vendor.city].filter(Boolean).join(" ");

    if (locality) {
      return locality;
    }

    return vendor.region;
  }

  function createVendorInquiryDraft(vendor: VendorMatch) {
    if (!workspace) {
      return null;
    }

    const eventLabels = workspace.onboarding.plannedEvents
      .map((eventId) => eventOptions.find((option) => option.id === eventId)?.label ?? eventId)
      .join(", ");
    const subject = `Hochzeitsanfrage ${workspace.coupleName} - ${formatLongDate(
      workspace.onboarding.targetDate
    )} - ca. ${workspace.onboarding.guestCountTarget} Gäste`;
    const body = [
      `Liebes Team von ${vendor.name},`,
      "",
      `wir planen unsere Hochzeit für den ${formatLongDate(
        workspace.onboarding.targetDate
      )} und interessieren uns für ${vendor.name}.`,
      "",
      `Kurz zu unserem Rahmen:`,
      `- Paar: ${workspace.coupleName}`,
      `- Region: ${workspace.onboarding.region}`,
      `- Geplante Events: ${eventLabels}`,
      `- Aktuelle Zielgröße: ca. ${workspace.onboarding.guestCountTarget} Gäste`,
      "",
      `Koennt ihr uns bitte kurz Rückmeldung geben zu:`,
      `- Verfügbarkeit am Wunschdatum`,
      `- grobem Preisrahmen bzw. Angebot`,
      `- enthaltenen Leistungen`,
      `- möglichen nächsten Schritten für eine Anfrage oder Besichtigung`,
      "",
      `Vielen Dank und herzliche Gruesse`,
      workspace.coupleName
    ].join("\n");

    return {
      subject,
      body,
      mailto: vendor.contactEmail
        ? `mailto:${encodeURIComponent(vendor.contactEmail)}?subject=${encodeURIComponent(
            subject
          )}&body=${encodeURIComponent(body)}`
        : null
    };
  }

  function renderVendorCard(vendor: VendorMatch, options?: { showCategory?: boolean }) {
    const trackerEntry = getVendorTrackerEntry(vendor.id);
    const vendorDraft = vendorDrafts[vendor.id] ?? createVendorDraft();
    const locationLabel = [vendor.postalCode, vendor.city, vendor.region]
      .filter(Boolean)
      .join(" / ");
    const metaTokens = [
      options?.showCategory ? vendorCategoryLabels[vendor.category] : null,
      locationLabel,
      vendor.serviceLabel ?? null
    ].filter(Boolean);
    const reviewLine = formatVendorEvidence(vendor);
    const vendorLinks = getVendorLinks(vendor);
    const addressLabel = getVendorAddressLabel(vendor);
    const inquiryDraft = createVendorInquiryDraft(vendor);

    return (
      <article key={vendor.id} className="guided-vendor-card">
        <div className="guided-vendor-head">
          <div>
            <strong>{vendor.name}</strong>
            <p className="guided-vendor-meta">{metaTokens.join(" / ")}</p>
            <p className="guided-vendor-price">
              {vendor.priceBandLabel} / {vendor.fitScore} Fit
            </p>
          </div>
          <span className={`stage-pill stage-pill--${trackerEntry?.stage ?? "suggested"}`}>
            {vendorStageLabels[trackerEntry?.stage ?? "suggested"]}
          </span>
        </div>
        <p>{vendor.reasonSummary}</p>
        {reviewLine ? <p className="guided-vendor-review">{reviewLine}</p> : null}
        <div className="guided-vendor-contact">
          <p className="guided-muted">
            <strong>Adresse:</strong> {addressLabel}
          </p>
          <div className="guided-links">
            {vendor.contactPhone?.trim() ? (
              <a className="text-link" href={`tel:${vendor.contactPhone.trim()}`}>
                {vendor.contactPhone.trim()}
              </a>
            ) : null}
            {vendor.contactEmail?.trim() ? (
              <a className="text-link" href={`mailto:${vendor.contactEmail.trim()}`}>
                {vendor.contactEmail.trim()}
              </a>
            ) : null}
            {vendor.contactSourceUrl ? (
              <a
                className="text-link"
                href={vendor.contactSourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                {vendor.contactSourceLabel ?? "Kontaktquelle"}
              </a>
            ) : null}
          </div>
        </div>
        {vendor.openingHours?.length ? (
          <div className="guided-vendor-contact">
            <p className="guided-muted">
              <strong>Oeffnungszeiten:</strong> {vendor.openingHours.join(" / ")}
            </p>
          </div>
        ) : null}
        {vendor.pricingNotes || vendor.pricingSourceUrl ? (
          <div className="guided-vendor-contact">
            {vendor.pricingNotes ? (
              <p className="guided-muted">
                <strong>Preisanker:</strong> {vendor.pricingNotes}
              </p>
            ) : null}
            {vendor.pricingSourceUrl ? (
              <a
                className="text-link"
                href={vendor.pricingSourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                {vendor.pricingSourceLabel ?? "Preisquelle"}
              </a>
            ) : null}
          </div>
        ) : null}
        <div className="guided-links">
          {vendorLinks.map((link) => (
            <a
              key={`${vendor.id}-${link.href}-${link.label}`}
              className={`text-link ${link.primary ? "guided-vendor-link--primary" : ""}`}
              href={link.href}
              target="_blank"
              rel="noreferrer"
            >
              {link.label}
            </a>
          ))}
          {inquiryDraft?.mailto ? (
            <a className="text-link guided-vendor-link--primary" href={inquiryDraft.mailto}>
              Anfrage per Mail vorbereiten
            </a>
          ) : null}
        </div>
        <div className="guided-vendor-editor">
          <label>
            Vendor-Status
            <select
              aria-label={`Vendor-Status für ${vendor.name}`}
              value={vendorDraft.stage}
              onChange={(event) =>
                updateVendorDraft(vendor.id, {
                  stage: event.target.value as PrototypeVendorStage
                })
              }
            >
              <option value="suggested">Neu</option>
              <option value="contacted">Kontaktiert</option>
              <option value="quoted">Angebot</option>
              <option value="booked">Gebucht</option>
              <option value="rejected">Verworfen</option>
            </select>
          </label>
          <label>
            Quote in EUR
            <input
              aria-label={`Quote in EUR für ${vendor.name}`}
              type="number"
              min="0"
              step="50"
              value={vendorDraft.quoteAmount}
              onChange={(event) =>
                updateVendorDraft(vendor.id, {
                  quoteAmount: event.target.value
                })
              }
            />
          </label>
          <label>
            Notiz
            <input
              aria-label={`Notiz für ${vendor.name}`}
              value={vendorDraft.note}
              onChange={(event) =>
                updateVendorDraft(vendor.id, {
                  note: event.target.value
                })
              }
            />
          </label>
        </div>
        <button
          type="button"
          className="secondary-button"
          disabled={status === "saving"}
          onClick={() => void handleVendorSave(vendor.id)}
        >
          Vendor speichern
        </button>
        {trackerEntry?.quoteAmount != null ? (
          <p className="guided-muted">
            {trackerEntry.quoteAmount.toLocaleString("de-DE")} EUR Quote
          </p>
        ) : null}
        {trackerEntry?.note ? <p className="guided-muted">{trackerEntry.note}</p> : null}
      </article>
    );
  }

  function scrollToSection(sectionId?: string) {
    if (!sectionId) {
      return;
    }

    window.setTimeout(() => {
      document.getElementById(sectionId)?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }, 120);
  }

  function setConsultationStep(
    stepId: GuidedPlanningStepId,
    options?: { announce?: boolean; syncPage?: boolean }
  ) {
    if (!workspace) {
      return;
    }

    const opening = createWeddingConsultantOpening(workspace, stepId);

    setConsultationTurn(opening);
    setConsultationDraft("");

    if (options?.syncPage !== false) {
      setCurrentPage(pageForStepById[stepId]);
    }

    if (options?.announce === false) {
      return;
    }

    const stepLabel = displayStepTitleById[stepId];

    setConsultationMessages((current) => [
      ...current,
      createConsultationMessage(
        "assistant",
        `Wir wechseln jetzt bewusst in "${stepLabel}". ${opening.assistantMessage}`
      )
    ]);
  }

  function goToPage(
    pageId: AppPageId,
    options?: {
      stepId?: GuidedPlanningStepId;
      sectionId?: string;
      openConsultant?: boolean;
      vendorCategory?: CoreVendorCategory;
    }
  ) {
    setCurrentPage(pageId);
    setMobileNavOpen(false);

    if (options?.vendorCategory) {
      setActiveCoreVendorCategory(options.vendorCategory);
    }

    if (options?.stepId) {
      setConsultationStep(options.stepId, {
        announce: false,
        syncPage: false
      });
    }

    if (options?.openConsultant) {
      setConsultantOpen(true);
    }

    scrollToSection(options?.sectionId);
  }

  function handleConsultationStepSelect(stepId: GuidedPlanningStepId) {
    setConsultationStep(stepId);
  }

  async function playConsultationVoiceReply(text: string) {
    if (!text.trim()) {
      return;
    }

    setConsultationVoiceStatus("speaking");

    try {
      const response = await synthesizeWeddingConsultantVoice({ text });
      const blob = base64ToBlob(response.audioBase64, response.mimeType);
      const audioUrl = URL.createObjectURL(blob);

      consultationAudioRef.current?.pause();
      consultationAudioRef.current = new Audio(audioUrl);
      consultationAudioRef.current.onended = () => {
        URL.revokeObjectURL(audioUrl);
      };

      await consultationAudioRef.current.play();
    } catch {
      setError(
        "Die Sprachantwort konnte gerade nicht erzeugt werden. Der Textchat funktioniert aber weiter."
      );
    } finally {
      setConsultationVoiceStatus("idle");
    }
  }

  async function submitConsultationMessage(
    message: string,
    options?: { speakReply?: boolean }
  ) {
    const trimmedMessage = message.trim();

    if (!workspace || !consultationTurn || trimmedMessage.length === 0) {
      return;
    }

    const nextUserMessage = createConsultationMessage("user", trimmedMessage);
    const nextMessages = [...consultationMessages, nextUserMessage];

    setConsultationMessages(nextMessages);
    setConsultationDraft("");

    setConsultationStatus("sending");

    try {
      const response = await replyWithWeddingConsultant({
        workspace,
        currentTurn: consultationTurn,
        messages: nextMessages,
        userMessage: trimmedMessage,
        assistantMode: consultationAssistantMode,
        assistantTier: consultationAssistantTier
      });

      setConsultationMessages(
        response.session ? toConsultationMessages(response.session) : [
          ...nextMessages,
          createConsultationMessage("assistant", response.turn.assistantMessage)
        ]
      );
      setConsultationTurn(response.turn);
      setConsultationLane(resolveConsultationLane(response.provider));

      if (response.workspace) {
        hydrateWorkspace(response.workspace, { resetUi: false });
        await refreshProfiles();
      }

      if (options?.speakReply) {
        await playConsultationVoiceReply(response.turn.assistantMessage);
      }
    } catch {
      setError(
        "Der KI-Consultant war gerade nicht erreichbar. Bitte versucht es in ein paar Sekunden noch einmal."
      );
    } finally {
      setConsultationStatus("idle");
    }
  }

  async function handleConsultationReply(optionId: string, label: string) {
    if (!workspace || !consultationTurn) {
      return;
    }

    void submitConsultationMessage(label);
  }

  async function handleConsultationSend() {
    await submitConsultationMessage(consultationDraft);
  }

  async function handleConsultationVoiceToggle() {
    if (consultationVoiceStatus === "recording") {
      consultationSpeechRecognitionRef.current?.stop();
      consultationRecorderRef.current?.stop();
      return;
    }

    if (
      consultationStatus === "sending" ||
      consultationVoiceStatus === "transcribing" ||
      consultationVoiceStatus === "speaking"
    ) {
      return;
    }

    if (
      typeof navigator === "undefined" ||
      (!navigator.mediaDevices?.getUserMedia && typeof window === "undefined")
    ) {
      setError("Sprachaufnahme wird in diesem Browser gerade nicht unterstützt.");
      return;
    }

    const SpeechRecognitionCtor =
      typeof window !== "undefined"
        ? ((window as typeof window & {
            SpeechRecognition?: new () => BrowserSpeechRecognition;
            webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
          }).SpeechRecognition ??
          (window as typeof window & {
            webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
          }).webkitSpeechRecognition)
        : undefined;

    if (SpeechRecognitionCtor) {
      try {
        const recognition = new SpeechRecognitionCtor();
        consultationSpeechRecognitionRef.current = recognition;
        consultationShouldSpeakNextReplyRef.current = true;
        recognition.lang = "de-DE";
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.onresult = async (event) => {
          const transcript = Array.from(event.results)
            .flatMap((result) => Array.from(result))
            .map((alternative) => alternative.transcript)
            .join(" ")
            .trim();

          if (!transcript) {
            setConsultationVoiceStatus("idle");
            return;
          }

          setConsultationDraft(transcript);
          await submitConsultationMessage(transcript, {
            speakReply: consultationShouldSpeakNextReplyRef.current
          });
        };
        recognition.onerror = () => {
          consultationShouldSpeakNextReplyRef.current = false;
          setConsultationVoiceStatus("idle");
        };
        recognition.onend = () => {
          consultationSpeechRecognitionRef.current = null;
          setConsultationVoiceStatus("idle");
        };
        recognition.start();
        setConsultationVoiceStatus("recording");
        return;
      } catch {
        consultationSpeechRecognitionRef.current = null;
      }
    }

    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Weder Geräte-Diktat noch Mikrofonaufnahme werden hier unterstützt.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMimeType = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus"
      ].find((candidate) => MediaRecorder.isTypeSupported(candidate));
      const recorder = preferredMimeType
        ? new MediaRecorder(stream, { mimeType: preferredMimeType })
        : new MediaRecorder(stream);

      consultationChunksRef.current = [];
      consultationStreamRef.current = stream;
      consultationRecorderRef.current = recorder;
      consultationShouldSpeakNextReplyRef.current = true;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          consultationChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const mimeType = recorder.mimeType || preferredMimeType || "audio/webm";
        const audioBlob = new Blob(consultationChunksRef.current, { type: mimeType });
        stream.getTracks().forEach((track) => track.stop());
        consultationStreamRef.current = null;
        consultationRecorderRef.current = null;
        setConsultationVoiceStatus("transcribing");

        try {
          const audioBase64 = await blobToBase64(audioBlob);
          const transcription = await transcribeWeddingConsultantVoice({
            audioBase64,
            mimeType,
            assistantTier: consultationAssistantTier
          });

          if (!transcription.text.trim()) {
            setError("Ich habe gerade keine klare Sprache erkannt. Versuch es bitte noch einmal.");
            setConsultationVoiceStatus("idle");
            return;
          }

          setConsultationDraft(transcription.text);
          await submitConsultationMessage(transcription.text, {
            speakReply: consultationShouldSpeakNextReplyRef.current
          });
        } catch {
          setError("Die Sprachaufnahme konnte gerade nicht verarbeitet werden.");
        } finally {
          consultationShouldSpeakNextReplyRef.current = false;
          setConsultationVoiceStatus("idle");
        }
      };

      recorder.start();
      setConsultationVoiceStatus("recording");
    } catch {
      setError("Das Mikrofon konnte gerade nicht geöffnet werden.");
      consultationShouldSpeakNextReplyRef.current = false;
    }
  }

  async function handleConsultationReplayAssistant() {
    const lastAssistantMessage = [...consultationMessages]
      .reverse()
      .find((message) => message.role === "assistant");

    if (!lastAssistantMessage) {
      return;
    }

    await playConsultationVoiceReply(lastAssistantMessage.content);
  }

  function renderWorkspaceLibrary() {
    const totalProfiles = profiles.length;
    const finishedTasks = profiles.reduce(
      (sum, profile) => sum + profile.progress.completedTasks,
      0
    );
    const trackedGuests = profiles.reduce(
      (sum, profile) => sum + profile.guestSummary.total,
      0
    );
    const lastProfile = profiles[0] ?? null;

    return (
      <main className="atelier-shell atelier-shell--library">
        <section className="panel-surface library-hero-card">
          <div className="library-hero-copy">
            <p className="eyebrow">Wedding Consultant</p>
            <h1>Eine kuratierte Planungsoberfläche statt einer überschallten Checklistenwand.</h1>
            <p className="library-body-copy">
              Ihr startet mit einem Profil, bekommt danach nur den jeweils sinnvollen nächsten
              Schritt und behaltet Budget, Vendoren, Gäste und RSVP in einer eleganten
              Arbeitsoberfläche zusammen.
            </p>
            <div className="hero-button-row">
              <button
                type="button"
                className="primary-button"
                onClick={() => showLibrary(true)}
                disabled={status === "saving"}
              >
                Neues Beratungsprofil
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={!lastProfile || status === "saving"}
                onClick={() => {
                  if (lastProfile) {
                    void openWorkspace(lastProfile.id);
                  }
                }}
              >
                Letztes Profil öffnen
              </button>
            </div>
          </div>

          <div className="library-hero-stack">
            <article className="library-metric-card">
              <p className="meta-label">Profilbibliothek</p>
              <strong>{totalProfiles}</strong>
              <span>aktive Planungsprofile</span>
            </article>
            <article className="library-metric-card">
              <p className="meta-label">Fortschritt</p>
              <strong>{finishedTasks}</strong>
              <span>Tasks über alle Profile</span>
            </article>
            <article className="library-metric-card">
              <p className="meta-label">Gäste im Blick</p>
              <strong>{trackedGuests}</strong>
              <span>verfolgte Einladungen</span>
            </article>
            <span className={`source-pill source-pill--${status}`}>
              {status === "loading"
                ? "Lädt"
                : status === "saving"
                  ? "Speichert"
                  : "Bereit"}
            </span>
          </div>
        </section>

        <section className="library-grid">
          <section className="panel-surface library-column">
            <div className="section-headline">
              <div>
                <p className="eyebrow">Profilbibliothek</p>
                <h2>Gespeicherte Profile</h2>
                <p className="section-copy">
                  Jedes Profil merkt sich den aktuellen Beratungsschritt, Budgetstand und RSVP-Lage.
                </p>
              </div>
            </div>

            {isAdmin ? (
              <div className="toolbar-row toolbar-row--compact">
                <label className="search-field">
                  <span>Nach Login-E-Mail filtern</span>
                  <input
                    type="search"
                    value={adminOwnerEmailFilter}
                    onChange={(event) => setAdminOwnerEmailFilter(event.target.value)}
                    placeholder="z. B. user@gmail.com"
                  />
                </label>
                <div className="toolbar-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setAdminOwnerEmailFilter("")}
                  >
                    Filter zurücksetzen
                  </button>
                  <button type="button" className="secondary-button" onClick={onLogout}>
                    Logout
                  </button>
                </div>
              </div>
            ) : null}

            <div className="library-profile-list">
              {profiles.map((profile) => (
                <article key={profile.id} className="library-profile-card">
                  <div className="library-profile-card__copy">
                    <p className="meta-label">Nächster Fokus</p>
                    <strong>{profile.coupleName}</strong>
                    <p>{formatProfileMeta(profile)}</p>
                    <p className="library-profile-step">
                      {displayStepTitleById[profile.currentStepId]} am {formatLongDate(profile.targetDate)}
                    </p>
                    <p className="library-profile-progress">
                      {profile.progress.completedTasks}/{profile.progress.totalTasks} Tasks erledigt
                    </p>
                    {isAdmin ? (
                      <p className="library-profile-progress">
                        Login: {profile.ownerEmail ?? "(unbekannt)"}
                      </p>
                    ) : null}
                  </div>
                  <div className="card-button-row">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => void openWorkspace(profile.id)}
                    >
                      Profil öffnen
                    </button>
                    <button
                      type="button"
                      className="secondary-button secondary-button--danger"
                      aria-label={`Profil löschen ${profile.coupleName}`}
                      onClick={() => void handleDeleteProfile(profile)}
                    >
                      Profil löschen
                    </button>
                  </div>
                </article>
              ))}
            </div>

            {profiles.length === 0 ? (
              <p className="empty-state empty-state--framed">
                Noch kein Beratungsprofil vorhanden. Startet mit eurem ersten Profil.
              </p>
            ) : null}
          </section>

          <section className="panel-surface library-column">
            <div className="section-headline">
              <div>
                <p className="eyebrow">Neues Profil</p>
                <h2>Beratung vorbereiten</h2>
                <p className="section-copy">
                  Paarname, Datum, Region, Budget und Stilrichtungen reichen für einen
                  belastbaren Start in den Guided Flow.
                </p>
              </div>
            </div>

            {showCreateProfile ? (
              <ProfileForm
                form={form}
                disabled={status === "saving"}
                primaryLabel="Beratung mit diesem Profil starten"
                onChange={(updater) => setForm((current) => updater(current))}
                onSubmit={handleCreateProfile}
                {...(profiles.length > 0
                  ? { onCancel: () => setShowCreateProfile(false) }
                  : {})}
              />
            ) : (
              <div className="library-briefing-card">
                <p>
                  Ihr könnt bestehende Profile wieder aufnehmen oder ein neues
                  Beratungsprofil anlegen. Danach führt euch der Consultant nur noch durch
                  den jeweils aktuellen Planungsschritt.
                </p>
                <div className="card-button-row">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setShowCreateProfile(true)}
                  >
                    Profilformular öffnen
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={!lastProfile}
                    onClick={() => {
                      if (lastProfile) {
                        void openWorkspace(lastProfile.id);
                      }
                    }}
                  >
                    Aktuellstes Profil öffnen
                  </button>
                </div>
              </div>
            )}
          </section>
        </section>

        {error ? <p className="error-text guided-error">{error}</p> : null}
      </main>
    );
  }

  function renderVenueStep() {
    const venueMatches =
      workspace?.plan.vendorMatches.filter((vendor) => vendor.category === "venue") ?? [];

    return (
      <div className="guided-step-body">
        <p className="guided-step-copy">
          Hier zieht ihr erst Venue, Stil und Budget sauber zusammen. Ihr seht die komplette
          lokale Venue-Auswahl mit Preisbild, Quellen und Freshness-Hinweisen, damit ihr
          bewusst vergleichen könnt statt nur eine Mini-Shortlist anzustarren.
        </p>
        <p className="guided-muted">{workspace?.plan.vendorSearchStrategy.note}</p>
        <div className="guided-card-stack guided-card-stack--vendors">
          {venueMatches.map((vendor) => renderVendorCard(vendor))}
        </div>
      </div>
    );
  }

  function renderBudgetEditorPanel() {
    return (
      <div className="guided-step-body">
        <div className="section-head">
          <div>
            <p className="eyebrow">Budget</p>
            <h3>Kernbudget mit echten Zahlen fuettern</h3>
          </div>
        </div>
        <form className="guided-form guided-form--compact" onSubmit={handleExpenseSubmit}>
          <label>
            Budgeteintrag
            <input
              aria-label="Budgeteintrag"
              placeholder="z. B. Foto Anzahlung"
              value={expenseDraft.label}
              onChange={(event) =>
                setExpenseDraft((current) => ({ ...current, label: event.target.value }))
              }
            />
          </label>
          <div className="guided-two-up">
            <label>
              Budgetkategorie
              <select
                aria-label="Budgetkategorie"
                value={expenseDraft.category}
                onChange={(event) =>
                  setExpenseDraft((current) => ({
                    ...current,
                    category: event.target.value as BudgetCategory["category"]
                  }))
                }
              >
                {budgetCategories.map((category) => (
                  <option key={category.category} value={category.category}>
                    {category.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Betrag
              <input
                aria-label="Betrag"
                type="number"
                min="0"
                step="50"
                value={expenseDraft.amount || ""}
                onChange={(event) =>
                  setExpenseDraft((current) => ({
                    ...current,
                    amount: event.target.valueAsNumber
                  }))
                }
              />
            </label>
          </div>
          <div className="guided-two-up">
            <label>
              Budget-Status
              <select
                aria-label="Budget-Status"
                value={expenseDraft.status}
                onChange={(event) =>
                  setExpenseDraft((current) => ({
                    ...current,
                    status: event.target.value as PrototypeExpense["status"]
                  }))
                }
              >
                <option value="planned">Geplant</option>
                <option value="booked">Gebucht</option>
                <option value="paid">Bezahlt</option>
              </select>
            </label>
            <label>
              Budget-Vendor
              <input
                aria-label="Budget-Vendor"
                value={expenseDraft.vendorName}
                onChange={(event) =>
                  setExpenseDraft((current) => ({
                    ...current,
                    vendorName: event.target.value
                  }))
                }
              />
            </label>
          </div>
          <button
            type="submit"
            className="secondary-button"
            disabled={status === "saving" || !isExpenseDraftValid}
          >
            Budgeteintrag speichern
          </button>
        </form>
        <div className="guided-budget-list">
          {(workspace?.expenses ?? []).map((expense) => (
            <article key={expense.id} className="guided-inline-card">
              <strong>{expense.label}</strong>
              <p>
                {expense.amount.toLocaleString("de-DE")} EUR / {expenseStatusLabels[expense.status]}
              </p>
            </article>
          ))}
          {!workspace?.expenses.length ? (
            <p className="empty-state">Noch keine Budgeteintraege vorhanden.</p>
          ) : null}
        </div>
      </div>
    );
  }

  function renderVendorExplorerPanel() {
    const vendorGroups = coreVendorCategoryOrder
      .map((category) => ({
        category,
        label: vendorCategoryLabels[category],
        vendors:
          workspace?.plan.vendorMatches.filter((vendor) => vendor.category === category) ?? []
      }))
      .filter((group) => group.vendors.length > 0);
    const selectedCategory =
      vendorGroups.find((group) => group.category === activeCoreVendorCategory)?.category ??
      vendorGroups[0]?.category ??
      "photography";
    const selectedGroup =
      vendorGroups.find((group) => group.category === selectedCategory) ?? null;
    const visibleVendors =
      selectedGroup?.vendors.filter((vendor) => {
        if (coreVendorFilterMode === "portfolio" && !getVendorPortfolioLink(vendor)) {
          return false;
        }

        if (
          coreVendorFilterMode === "active" &&
          (getVendorTrackerEntry(vendor.id)?.stage ?? "suggested") === "suggested"
        ) {
          return false;
        }

        return matchesVendorSearch(vendor, coreVendorSearch);
      }) ?? [];
    const selectedPortfolioCount =
      selectedGroup?.vendors.filter((vendor) => Boolean(getVendorPortfolioLink(vendor))).length ??
      0;
    const selectedActiveCount =
      selectedGroup?.vendors.filter(
        (vendor) => (getVendorTrackerEntry(vendor.id)?.stage ?? "suggested") !== "suggested"
      ).length ?? 0;

    return (
      <div className="guided-step-body">
        <div className="section-head">
          <div>
            <p className="eyebrow">Vendoren</p>
            <h3>Lokale Vendor-Auswahl</h3>
          </div>
        </div>
        <p className="guided-step-copy">
          Statt einer langen Gruppenwand arbeitet ihr hier jetzt bewusst je Vendor-Kategorie.
          Wechselt hart zwischen Foto, Catering, Musik, Floristik und Styling, filtert
          innerhalb der aktiven Kategorie und springt direkt in Portfolio, Referenzen oder
          die jeweils belastbarste Quelle.
        </p>
        <p className="guided-muted">{workspace?.plan.vendorSearchStrategy.note}</p>
        <div className="guided-vendor-filter-bar">
          <div className="guided-vendor-filter-tabs" role="tablist" aria-label="Vendor-Kategorien">
            {vendorGroups.map((group) => (
              <button
                key={group.category}
                type="button"
                role="tab"
                aria-selected={selectedCategory === group.category}
                className={`guided-filter-chip ${
                  selectedCategory === group.category ? "guided-filter-chip--active" : ""
                }`}
                onClick={() => setActiveCoreVendorCategory(group.category)}
              >
                {group.label} <span>{group.vendors.length}</span>
              </button>
            ))}
          </div>

          <div className="guided-filter-toolbar">
            <label className="guided-filter-search">
              Kern-Vendoren durchsuchen
              <input
                aria-label="Kern-Vendoren durchsuchen"
                placeholder="Name, Ort oder Leistung"
                value={coreVendorSearch}
                onChange={(event) => setCoreVendorSearch(event.target.value)}
              />
            </label>

            <div className="guided-chip-row" aria-label="Vendor-Sichtfilter">
              <button
                type="button"
                className={`guided-filter-chip ${
                  coreVendorFilterMode === "all" ? "guided-filter-chip--active" : ""
                }`}
                onClick={() => setCoreVendorFilterMode("all")}
              >
                Alle
              </button>
              <button
                type="button"
                className={`guided-filter-chip ${
                  coreVendorFilterMode === "portfolio" ? "guided-filter-chip--active" : ""
                }`}
                onClick={() => setCoreVendorFilterMode("portfolio")}
              >
                Nur mit Portfolio
              </button>
              <button
                type="button"
                className={`guided-filter-chip ${
                  coreVendorFilterMode === "active" ? "guided-filter-chip--active" : ""
                }`}
                onClick={() => setCoreVendorFilterMode("active")}
              >
                In Bearbeitung
              </button>
            </div>
          </div>
        </div>

        {selectedGroup ? (
          <section className="guided-vendor-group">
            <div className="guided-vendor-group-head">
              <div>
                <p className="eyebrow">{visibleVendors.length} sichtbar</p>
                <h4>{selectedGroup.label}</h4>
              </div>
              <p className="guided-filter-summary">
                {selectedGroup.vendors.length} lokal gematcht / {selectedPortfolioCount} mit
                Portfolio / {selectedActiveCount} in Bearbeitung
              </p>
            </div>
            {visibleVendors.length > 0 ? (
              <div className="guided-card-stack guided-card-stack--vendors">
                {visibleVendors.map((vendor) =>
                  renderVendorCard(vendor, {
                    showCategory: false
                  })
                )}
              </div>
            ) : (
              <p className="empty-state guided-filter-empty">
                Für diesen Filter ist gerade kein Anbieter sichtbar. Nimm Suche oder Sichtfilter
                etwas weiter auf.
              </p>
            )}
          </section>
        ) : (
          <p className="empty-state guided-filter-empty">
            Aktuell sind alle optionalen Vendor-Kategorien deaktiviert. Aktiviert im Admin-Bereich
            wieder Foto, Catering, Musik, Floristik oder Styling, sobald ihr sie braucht.
          </p>
        )}
      </div>
    );
  }

  function renderGuestsPage() {
    return (
      <section className="page-stack">
        <header className="page-hero">
          <div>
            <p className="eyebrow">Ihre Hochzeitsgesellschaft</p>
            <h1>Gästeliste mit RSVP, Essenswünschen und direktem Selbstservice.</h1>
            <p className="page-copy">
              Alles bleibt in einem Fluss: neue Gäste anlegen, Status ändern, öffentliche
              RSVP-Links versenden und Antworten ohne Reload-Chaos wieder in den Workspace holen.
            </p>
          </div>
          <div className="hero-stat-row">
            <article className="hero-mini-stat hero-mini-stat--dark">
              <strong>{workspace?.guestSummary.total ?? 0}</strong>
              <span>Eingeladen</span>
            </article>
            <article className="hero-mini-stat">
              <strong>{workspace?.guestSummary.attending ?? 0}</strong>
              <span>Zugesagt</span>
            </article>
          </div>
        </header>

        <section className="toolbar-row">
          <label className="search-field">
            <span>Gäste durchsuchen</span>
            <input
              type="search"
              value={guestSearch}
              onChange={(event) => setGuestSearch(event.target.value)}
              placeholder="Name, Haushalt, E-Mail oder Notiz"
            />
          </label>
          <div className="toolbar-actions">
            <button
              type="button"
              className={`filter-pill ${guestFilterMode === "all" ? "filter-pill--active" : ""}`}
              onClick={() => setGuestFilterMode("all")}
            >
              Alle
            </button>
            <button
              type="button"
              className={`filter-pill ${
                guestFilterMode === "pending" ? "filter-pill--active" : ""
              }`}
              onClick={() => setGuestFilterMode("pending")}
            >
              Offen
            </button>
            <button
              type="button"
              className={`filter-pill ${
                guestFilterMode === "attending" ? "filter-pill--active" : ""
              }`}
              onClick={() => setGuestFilterMode("attending")}
            >
              Zugesagt
            </button>
            <button
              type="button"
              className={`filter-pill ${
                guestFilterMode === "declined" ? "filter-pill--active" : ""
              }`}
              onClick={() => setGuestFilterMode("declined")}
            >
              Abgesagt
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => scrollToSection("guest-form")}
            >
              Gast hinzufuegen
            </button>
          </div>
        </section>

        <div className="page-grid page-grid--guests">
          <section className="experience-panel" id="guest-form">
            <div className="section-headline">
              <div>
                <p className="eyebrow">Neuer Gast</p>
                <h2>Einladungen mit Event-Zuordnung anlegen</h2>
              </div>
            </div>
            <form className="guided-form guided-form--compact" onSubmit={handleGuestSubmit}>
              <label>
                Gastname
                <input
                  aria-label="Gastname"
                  value={guestDraft.name}
                  onChange={(event) =>
                    setGuestDraft((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </label>
              <div className="guided-two-up">
                <label>
                  Haushalt
                  <input
                    aria-label="Haushalt"
                    value={guestDraft.household}
                    onChange={(event) =>
                      setGuestDraft((current) => ({
                        ...current,
                        household: event.target.value
                      }))
                    }
                  />
                </label>
                <label>
                  E-Mail
                  <input
                    aria-label="E-Mail"
                    type="email"
                    value={guestDraft.email}
                    onChange={(event) =>
                      setGuestDraft((current) => ({ ...current, email: event.target.value }))
                    }
                  />
                </label>
              </div>
              <div className="guided-event-grid">
                {form.plannedEvents.map((eventId) => {
                  const label =
                    eventOptions.find((option) => option.id === eventId)?.label ?? eventId;
                  const active = guestDraft.eventIds.includes(eventId);

                  return (
                    <label
                      key={eventId}
                      className={`guided-event-chip ${active ? "guided-event-chip--active" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={(event) =>
                          setGuestDraft((current) => ({
                            ...current,
                            eventIds: event.target.checked
                              ? [...current.eventIds, eventId]
                              : current.eventIds.filter((entry) => entry !== eventId)
                          }))
                        }
                      />
                      <span>{label}</span>
                    </label>
                  );
                })}
              </div>
              <button type="submit" className="secondary-button" disabled={status === "saving"}>
                Gast speichern
              </button>
            </form>
          </section>

          <section className="experience-panel">
            <div className="section-headline">
              <div>
                <p className="eyebrow">Antwortstatus</p>
                <h2>RSVP-Lage in Echtzeit</h2>
              </div>
              <p className="section-copy">
                {filteredGuests.length} von {workspace?.guestSummary.total ?? 0} Gästen sichtbar
              </p>
            </div>
            <div className="guest-summary-pills">
              <span>Offen: {workspace?.guestSummary.pending ?? 0}</span>
              <span>Zugesagt: {workspace?.guestSummary.attending ?? 0}</span>
              <span>Abgesagt: {workspace?.guestSummary.declined ?? 0}</span>
            </div>

            <div className="guided-guest-list">
              {filteredGuests.map((guest) => (
                <article key={guest.id} className="guided-guest-card">
                  <div className="guided-vendor-head">
                    <div>
                      <strong>{guest.name}</strong>
                      <p>
                        {guest.household} / {guest.email}
                      </p>
                    </div>
                    <span className={`stage-pill stage-pill--${guest.rsvpStatus}`}>
                      {rsvpLabels[guest.rsvpStatus]}
                    </span>
                  </div>
                  <p>Essen: {mealPreferenceLabels[guest.mealPreference]}</p>
                  {guest.dietaryNotes ? <p>{guest.dietaryNotes}</p> : null}
                  {guest.message ? <p>{guest.message}</p> : null}
                  <p>
                    Sitzplatz: {getGuestSeatTable(guest.id)?.name ?? "Noch nicht gesetzt"}
                  </p>
                  <label className="portal-field">
                    Tischzuweisung
                    <select
                      value={getGuestSeatTable(guest.id)?.id ?? ""}
                      onChange={(event) =>
                        void handleGuestSeatAssignment(
                          guest.id,
                          event.target.value || null
                        )
                      }
                    >
                      <option value="">Noch offen</option>
                      {(workspace?.seatingPlan.tables ?? []).map((table) => (
                        <option key={table.id} value={table.id}>
                          {table.name} / {table.shape === "round" ? "Rund" : "Eckig"} /{" "}
                          {table.guestIds.length}/{table.capacity}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="guided-chip-row">
                    {(["pending", "attending", "declined"] as const).map((statusOption) => (
                      <button
                        key={statusOption}
                        type="button"
                        className={`chip-button ${
                          guest.rsvpStatus === statusOption ? "chip-button--active" : ""
                        }`}
                        onClick={() => void handleGuestRsvp(guest.id, statusOption)}
                      >
                        {rsvpLabels[statusOption]}
                      </button>
                    ))}
                  </div>
                  <a
                    className="text-link"
                    href={createGuestRsvpPath(guest.accessToken)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    RSVP-Link öffnen
                  </a>
                </article>
              ))}

              {!filteredGuests.length ? (
                <p className="empty-state">
                  Für diesen Filter ist gerade kein Gast sichtbar.
                </p>
              ) : null}
            </div>
          </section>

          <section className="experience-panel">
            <div className="section-headline">
              <div>
                <p className="eyebrow">Seating</p>
                <h2>Saalplan mit runden und eckigen Tischen</h2>
              </div>
              <p className="section-copy">
                Tische anlegen, Kapazitaeten setzen und Gäste direkt den Plaetzen zuordnen.
              </p>
            </div>
            <form className="guided-form guided-form--compact" onSubmit={handleSeatTableSubmit}>
              <label>
                Tischname
                <input
                  value={seatTableDraft.name}
                  onChange={(event) =>
                    setSeatTableDraft((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="Tisch 1 / Familie / Brautpaar"
                />
              </label>
              <div className="guided-two-up">
                <label>
                  Form
                  <select
                    value={seatTableDraft.shape}
                    onChange={(event) =>
                      setSeatTableDraft((current) => ({
                        ...current,
                        shape: event.target.value as "round" | "rect"
                      }))
                    }
                  >
                    <option value="round">Rund</option>
                    <option value="rect">Eckig</option>
                  </select>
                </label>
                <label>
                  Plaetze
                  <input
                    type="number"
                    min="2"
                    max="20"
                    value={seatTableDraft.capacity}
                    onChange={(event) =>
                      setSeatTableDraft((current) => ({
                        ...current,
                        capacity: Number(event.target.value || 0)
                      }))
                    }
                  />
                </label>
              </div>
              <button type="submit" className="secondary-button" disabled={status === "saving"}>
                Tisch anlegen
              </button>
            </form>

            <div className="guided-card-stack guided-card-stack--vendors">
              {(workspace?.seatingPlan.tables ?? []).map((table) => (
                <article key={table.id} className="guided-vendor-card">
                  <div className="guided-vendor-head">
                    <div>
                      <strong>{table.name}</strong>
                      <p>
                        {table.shape === "round" ? "Runder Tisch" : "Eckiger Tisch"} /{" "}
                        {table.guestIds.length} von {table.capacity} besetzt
                      </p>
                    </div>
                    <span className="stage-pill">
                      {table.guestIds.length}/{table.capacity}
                    </span>
                  </div>
                  <div className="guided-chip-row">
                    {table.guestIds.map((guestId) => {
                      const guest = workspace?.guests.find((entry) => entry.id === guestId);
                      return guest ? <span key={guestId}>{guest.name}</span> : null;
                    })}
                  </div>
                </article>
              ))}
              {(workspace?.seatingPlan.tables ?? []).length === 0 ? (
                <p className="empty-state guided-filter-empty">
                  Noch keine Tische angelegt. Startet mit euren Grundformen und weist danach die
                  ersten Gäste zu.
                </p>
              ) : null}
            </div>

            {(workspace?.seatingPlan.tables ?? []).length > 0 ? (
              <div className="floor-plan-grid" aria-label="Saalplan Vorschau">
                {(workspace?.seatingPlan.tables ?? []).map((table) => {
                  const emptySeats = Math.max(table.capacity - table.guestIds.length, 0);
                  const seatLabels = [
                    ...table.guestIds.map((guestId) => getGuestNameById(guestId)),
                    ...Array.from({ length: emptySeats }, () => "Frei")
                  ];

                  return (
                    <article
                      key={`${table.id}-floor-plan`}
                      className={`floor-plan-table floor-plan-table--${table.shape}`}
                    >
                      <div className="floor-plan-table__surface">
                        <strong>{table.name}</strong>
                        <span>
                          {table.shape === "round" ? "Rund" : "Eckig"} / {table.capacity} Plaetze
                        </span>
                      </div>
                      <div className="floor-plan-table__seats">
                        {seatLabels.map((label, index) => (
                          <span
                            key={`${table.id}-seat-${index}`}
                            className={
                              label === "Frei"
                                ? "floor-plan-seat floor-plan-seat--empty"
                                : "floor-plan-seat"
                            }
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : null}
          </section>
        </div>
      </section>
    );
  }

  function renderAdminStep() {
    const adminTasks = workspace?.tasks.filter((task) => task.category === "legal-admin") ?? [];

    return (
      <div className="guided-step-body">
        <div className="guided-card-stack">
          {(workspace?.plan.adminReminders ?? []).map((item) => {
            const task = adminTasks.find((entry) => entry.id === item.id);

            return (
              <article key={item.id} className="guided-inline-card">
                <strong>{item.title}</strong>
                <p>{item.dueDate}</p>
                <p>{item.rationale}</p>
                <label className="guided-inline-toggle">
                  <input
                    type="checkbox"
                    checked={task?.completed ?? false}
                    onChange={(event) => void handleTaskToggle(item.id, event.target.checked)}
                  />
                  <span>{task?.completed ? "Erledigt" : "Offen"}</span>
                </label>
              </article>
            );
          })}
        </div>
      </div>
    );
  }

  function renderControlRoomStep() {
    return (
      <div className="guided-step-body">
        <section className="guided-subpanel">
          <div className="section-head">
            <div>
              <p className="eyebrow">Tasklage</p>
              <h3>Finale Aufgaben</h3>
            </div>
          </div>
          <div className="guided-card-stack">
            {(workspace?.tasks ?? []).map((task) => (
              <label key={task.id} className="guided-inline-card guided-inline-toggle">
                <div>
                  <strong>{task.title}</strong>
                  <p>
                    {task.dueDate} / {task.sourceType}
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={task.completed}
                  onChange={(event) => void handleTaskToggle(task.id, event.target.checked)}
                />
              </label>
            ))}
          </div>
        </section>

        <section className="guided-subpanel">
          <div className="section-head">
            <div>
              <p className="eyebrow">Feierstruktur</p>
              <h3>Blueprint und Runtime</h3>
            </div>
          </div>
          <div className="guided-card-stack">
            {(workspace?.plan.eventBlueprints ?? []).map((item) => (
              <article key={item.id} className="guided-inline-card">
                <strong>{item.label}</strong>
                <p>{item.planningFocus}</p>
              </article>
            ))}
            <article className="guided-inline-card">
              <strong>Shadow und VPS</strong>
              <p>{workspace?.plan.runtimeTopology.note}</p>
            </article>
          </div>
        </section>
      </div>
    );
  }

  function renderDashboardPage() {
    const venueLead =
      workspace?.plan.vendorMatches.find((vendor) => vendor.category === "venue") ?? null;
    const adminLead = workspace?.plan.adminReminders[0] ?? null;
    const photoLead =
      workspace?.plan.vendorMatches.find((vendor) => vendor.category === "photography") ?? null;
    const dashboardMilestones = [
      {
        key: "venue",
        title: "Location shortlist",
        copy:
          venueLead?.reasonSummary ??
          "Venue, Stil und Preisbild in einem ruhigen Vergleich zusammenziehen.",
        image:
          "https://images.unsplash.com/photo-1519167758481-83f550bb49b3?q=80&w=2098&auto=format&fit=crop",
        buttonLabel: "Venue-Desk öffnen",
        action: () =>
          goToPage("vendors", {
            stepId: "venue-and-date",
            sectionId: "venue-gallery"
          })
      },
      {
        key: "legal",
        title: "Standesamt & Fristen",
        copy:
          adminLead?.rationale ??
          "Fristen, Dokumente und Erinnerungen liegen gesammelt im Admin-Bereich.",
        image:
          "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?q=80&w=2070&auto=format&fit=crop",
        buttonLabel: "Admin-Fokus öffnen",
        action: () =>
          goToPage("admin", {
            stepId: "legal-admin",
            sectionId: "admin-reminders"
          })
      },
      {
        key: "style",
        title: "Foto & Stil",
        copy:
          photoLead?.reasonSummary ??
          "Stilpräferenzen, Portfolio-Links und Fit-Scores bleiben direkt an den Vendoren.",
        image:
          "https://images.unsplash.com/photo-1511285560929-80b456fea0bc?q=80&w=2069&auto=format&fit=crop",
        buttonLabel: "Fotografie filtern",
        action: () =>
          goToPage("vendors", {
            stepId: "core-vendors",
            sectionId: "vendor-grid",
            vendorCategory: "photography"
          })
      }
    ];

    return (
      <section className="page-stack">
        <section className="hero-stage">
          <div className="hero-stage__copy">
            <p className="eyebrow">Aktives Beratungsprofil</p>
            <h1>{workspace?.coupleName}</h1>
            <p className="page-copy">
              {workspace?.onboarding.region} / {formatLongDate(workspace?.onboarding.targetDate ?? "")}
              {" / "}
              {workspace?.onboarding.guestCountTarget ?? 0} Gäste / {formatCurrency(totalBudget)}
            </p>
            <p className="hero-stage__note">{guidedSession?.headline}</p>
            <div className="hero-button-row">
              <button
                type="button"
                className="primary-button"
                onClick={() =>
                  goToPage(pageForStepById[activeStepId], {
                    stepId: activeStepId
                  })
                }
              >
                {displayStepTitleById[activeStepId]} öffnen
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  goToPage(currentPage, {
                    stepId: activeStepId,
                    openConsultant: true
                  })
                }
              >
                Concierge öffnen
              </button>
            </div>
          </div>

          <div className="hero-stage__visual">
            <img
              alt="Editorial wedding atmosphere"
              src="https://images.unsplash.com/photo-1522673607200-164d1b6ce486?q=80&w=2070&auto=format&fit=crop"
            />
            <div className="hero-stage__caption">
              <p className="meta-label">Aktueller Schritt</p>
              <strong>{displayStepTitleById[activeStepId]}</strong>
              <span>{activeStep?.summary}</span>
            </div>
          </div>
        </section>

        <section className="stat-grid">
          <article className="stat-card-panel">
            <p className="meta-label">Budget verbucht</p>
            <strong>{formatCurrency(totalSpent)}</strong>
            <span>{Math.round(budgetUsage)} % des gesetzten Rahmens</span>
          </article>
          <article className="stat-card-panel">
            <p className="meta-label">Gäste beantwortet</p>
            <strong>{Math.round(guestResponseRatio)} %</strong>
            <span>
              {workspace?.guestSummary.attending ?? 0} Zusagen / {workspace?.guestSummary.pending ?? 0} offen
            </span>
          </article>
          <article className="stat-card-panel">
            <p className="meta-label">Vendoren in Bewegung</p>
            <strong>{activeVendorCount}</strong>
            <span>kontaktiert, quoted oder gebucht</span>
          </article>
          <article className="stat-card-panel">
            <p className="meta-label">Tasks erledigt</p>
            <strong>
              {completedTasks}/{totalTasks}
            </strong>
            <span>{Math.round(taskUsage)} % Fortschritt</span>
          </article>
        </section>

        <section className="page-section">
          <div className="section-headline">
            <div>
              <p className="eyebrow">Nächste Meilensteine</p>
              <h2>Die drei Dinge, die gerade wirklich zählen</h2>
            </div>
          </div>

          <div className="milestone-grid">
            {dashboardMilestones.map((item) => (
              <article key={item.key} className="milestone-card">
                <img alt={item.title} src={item.image} />
                <div className="milestone-card__overlay" />
                <div className="milestone-card__copy">
                  <p className="meta-label">Fokus</p>
                  <strong>{item.title}</strong>
                  <p>{item.copy}</p>
                  <button
                    type="button"
                    className="secondary-button secondary-button--ghost"
                    onClick={item.action}
                  >
                    {item.buttonLabel}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <div className="page-grid page-grid--dashboard">
          <section className="experience-panel experience-panel--dark">
            <div className="section-headline">
              <div>
                <p className="eyebrow">Budget-Orientierung</p>
                <h2>Verbrauch gegen Zielbudget</h2>
              </div>
            </div>
            <div className="budget-ring-wrap">
              <div
                className="budget-ring"
                style={{ ["--usage" as string]: `${budgetUsage}%` }}
              >
                <div className="budget-ring__center">
                  <span>{Math.round(budgetUsage)} %</span>
                  <small>verplant</small>
                </div>
              </div>
              <div className="budget-ring-copy">
                <strong>{formatCurrency(totalBudget)}</strong>
                <p>Gesetztes Gesamtbudget</p>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => goToPage("budget", { sectionId: "budget-editor" })}
                >
                  Budget-Desk öffnen
                </button>
              </div>
            </div>
          </section>

          <section className="experience-panel">
            <div className="section-headline">
              <div>
                <p className="eyebrow">Rechtliches & Kontrolle</p>
                <h2>Fristen, die nicht untergehen dürfen</h2>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  goToPage("admin", {
                    stepId: "legal-admin",
                    sectionId: "admin-reminders"
                  })
                }
              >
                Admin öffnen
              </button>
            </div>
            <div className="timeline-mini-list">
              {(workspace?.plan.adminReminders ?? []).slice(0, 3).map((item) => (
                <article key={item.id} className="timeline-mini-item">
                  <span>{item.dueDate}</span>
                  <strong>{item.title}</strong>
                  <p>{item.rationale}</p>
                </article>
              ))}
            </div>
            <button
              type="button"
              className="primary-button"
              onClick={() =>
                goToPage("dashboard", {
                  stepId: "legal-admin",
                  openConsultant: true
                })
              }
            >
              Ask Co-Pilot für Fristen
            </button>
          </section>
        </div>
      </section>
    );
  }

  function renderTimelinePage() {
    return (
      <section className="page-stack">
        <header className="page-hero page-hero--centered">
          <div>
            <p className="eyebrow">Planungspfad</p>
            <h1>Jeder Schritt bekommt seinen eigenen, lesbaren Raum.</h1>
            <p className="page-copy">
              Statt alles gleichzeitig zu sehen, lauft ihr durch einen klaren Zeitpfad:
              Fundament, Venue, Vendoren, Gäste, Admin und finaler Control Room.
            </p>
          </div>
        </header>

        <section className="timeline-column">
          {guidedSession?.steps.map((step, index) => (
            <article
              key={step.id}
              className={`timeline-card timeline-card--${step.status} ${
                activeStepId === step.id ? "timeline-card--active" : ""
              }`}
            >
              <div className="timeline-card__rail">
                <span>{String(index + 1).padStart(2, "0")}</span>
              </div>
              <div className="timeline-card__body">
                <p className="meta-label">{displayStepTitleById[step.id]}</p>
                <h2>{step.title}</h2>
                <p>{step.summary}</p>
                <div className="timeline-chip-row">
                  {step.checklist.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
                <div className="card-button-row">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() =>
                      goToPage(pageForStepById[step.id], {
                        stepId: step.id
                      })
                    }
                  >
                    Schritt öffnen
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() =>
                      goToPage(pageForStepById[step.id], {
                        stepId: step.id,
                        openConsultant: true
                      })
                    }
                  >
                    Mit Consultant klaeren
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>

        <section className="experience-panel" id="timeline-blueprint">
          <div className="section-headline">
            <div>
              <p className="eyebrow">Feierstruktur</p>
              <h2>Blueprints und Runtime-Gedanken</h2>
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                goToPage("admin", {
                  stepId: "final-control-room",
                  sectionId: "control-room"
                })
              }
            >
              Control Room öffnen
            </button>
          </div>
          <div className="blueprint-grid">
            {(workspace?.plan.eventBlueprints ?? []).map((item) => (
              <article key={item.id} className="guided-inline-card">
                <strong>{item.label}</strong>
                <p>{item.planningFocus}</p>
              </article>
            ))}
            <article className="guided-inline-card">
              <strong>Shadow und VPS</strong>
              <p>{workspace?.plan.runtimeTopology.note}</p>
            </article>
          </div>
        </section>
      </section>
    );
  }

  function renderVendorsPage() {
    const venueLead =
      workspace?.plan.vendorMatches.find((vendor) => vendor.category === "venue") ?? null;
    const photoLead =
      workspace?.plan.vendorMatches.find((vendor) => vendor.category === "photography") ?? null;
    const floralsLead =
      workspace?.plan.vendorMatches.find((vendor) => vendor.category === "florals") ?? null;
    const vendorSpotlights = [
      {
        key: "venue",
        label: "Locations",
        title: venueLead?.name ?? "Venue-Shortlist",
        copy: venueLead?.reasonSummary ?? "Kompletter Vergleich für Ort, Preis und Quellenlage.",
        image:
          "https://images.unsplash.com/photo-1519167758481-83f550bb49b3?q=80&w=2098&auto=format&fit=crop",
        action: () =>
          goToPage("vendors", {
            stepId: "venue-and-date",
            sectionId: "venue-gallery"
          })
      },
      {
        key: "photo",
        label: "Fotografie",
        title: photoLead?.name ?? "Portfolio mit Stilfit",
        copy: photoLead?.reasonSummary ?? "Portfolio-Links, Preisanker und Statuspflege in einem Raster.",
        image:
          "https://images.unsplash.com/photo-1511285560929-80b456fea0bc?q=80&w=2069&auto=format&fit=crop",
        action: () =>
          goToPage("vendors", {
            stepId: "core-vendors",
            sectionId: "vendor-grid",
            vendorCategory: "photography"
          })
      },
      {
        key: "florals",
        label: "Floristik",
        title: floralsLead?.name ?? "Kuratiertes Ensemble",
        copy: floralsLead?.reasonSummary ?? "Floristik, Stimmung und Preisbild im selben Blick.",
        image:
          "https://images.unsplash.com/photo-1507692049790-de58290a4334?q=80&w=2070&auto=format&fit=crop",
        action: () =>
          goToPage("vendors", {
            stepId: "core-vendors",
            sectionId: "vendor-grid",
            vendorCategory: "florals"
          })
      }
    ];

    return (
      <section className="page-stack">
        <header className="page-hero page-hero--single">
          <div>
            <p className="eyebrow">Kuratiertes Ensemble</p>
            <h1>Venue-Shortlist und Kern-Vendoren im selben stilvollen Workspace.</h1>
            <p className="page-copy">
              Echte Links, Quellenbelege, Preisanker, Fit-Scores und Statuspflege bleiben direkt
              in den Karten, damit aus Recherche echte Entscheidungen werden.
            </p>
          </div>
          <button
            type="button"
            className="primary-button"
            onClick={() =>
              goToPage("vendors", {
                stepId: "core-vendors",
                openConsultant: true
              })
            }
          >
            Concierge für Vendoren öffnen
          </button>
        </header>

        <div className="milestone-grid milestone-grid--tall">
          {vendorSpotlights.map((item) => (
            <article key={item.key} className="milestone-card milestone-card--tall">
              <img alt={item.title} src={item.image} />
              <div className="milestone-card__overlay" />
              <div className="milestone-card__copy">
                <p className="meta-label">{item.label}</p>
                <strong>{item.title}</strong>
                <p>{item.copy}</p>
                <button
                  type="button"
                  className="secondary-button secondary-button--ghost"
                  onClick={item.action}
                >
                  {item.label} öffnen
                </button>
              </div>
            </article>
          ))}
        </div>

        <section className="category-spotlight-grid">
          {[
            { label: "Locations", action: () => goToPage("vendors", { sectionId: "venue-gallery" }) },
            {
              label: "Catering",
              action: () =>
                goToPage("vendors", {
                  sectionId: "vendor-grid",
                  vendorCategory: "catering"
                })
            },
            {
              label: "Fotografie",
              action: () =>
                goToPage("vendors", {
                  sectionId: "vendor-grid",
                  vendorCategory: "photography"
                })
            },
            {
              label: "Floristik",
              action: () =>
                goToPage("vendors", {
                  sectionId: "vendor-grid",
                  vendorCategory: "florals"
                })
            }
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              className="category-spotlight-card"
              onClick={item.action}
            >
              <strong>{item.label}</strong>
              <span>Direkt in den passenden Arbeitsbereich springen</span>
            </button>
          ))}
        </section>

        <div className="page-grid page-grid--vendors">
          <section className="experience-panel" id="venue-gallery">
            <div className="section-headline">
              <div>
                <p className="eyebrow">Venue-Shortlist</p>
                <h2>Alle lokalen Venue-Matches mit Quelle und Status</h2>
              </div>
            </div>
            {renderVenueStep()}
          </section>

          <section className="experience-panel" id="vendor-grid">
            <div className="section-headline">
              <div>
                <p className="eyebrow">Vendor-Desk</p>
                <h2>Kategorien, Filter und Bearbeitungsstand</h2>
              </div>
            </div>
            {renderVendorExplorerPanel()}
          </section>
        </div>
      </section>
    );
  }

  function renderBudgetPage() {
    const categorySpend = budgetCategories.map((category) => {
      const spent =
        workspace?.expenses
          .filter((expense) => expense.category === category.category)
          .reduce((sum, expense) => sum + expense.amount, 0) ?? 0;

      return {
        ...category,
        spent,
        percentage:
          totalBudget > 0 ? clampPercentage((spent / totalBudget) * 100) : 0
      };
    });

    return (
      <section className="page-stack">
        <header className="page-hero page-hero--single">
          <div>
            <p className="eyebrow">Finanzielles Fundament</p>
            <h1>Budgetplanung mit echtem Verbrauch statt reiner Wunschsumme.</h1>
            <p className="page-copy">
              Budgetkategorien, laufende Ausgaben und der Gesamtverbrauch bleiben in einer
              editorialen Ansicht lesbar, aber trotzdem direkt editierbar.
            </p>
          </div>
          <button
            type="button"
            className="secondary-button"
            onClick={() => goToPage("vendors", { sectionId: "vendor-grid" })}
          >
            Vendoren mit Budget verknuepfen
          </button>
        </header>

        <div className="page-grid page-grid--budget">
          <section className="experience-panel experience-panel--dark">
            <div className="section-headline">
              <div>
                <p className="eyebrow">Budget-Vorschau</p>
                <h2>Gesamtrahmen vs. verbuchter Stand</h2>
              </div>
            </div>
            <div className="budget-ring-wrap">
              <div
                className="budget-ring"
                style={{ ["--usage" as string]: `${budgetUsage}%` }}
              >
                <div className="budget-ring__center">
                  <span>{Math.round(budgetUsage)} %</span>
                  <small>verbucht</small>
                </div>
              </div>
              <div className="budget-ring-copy">
                <strong>{formatCurrency(totalSpent)}</strong>
                <p>bereits als Angebot, Buchung oder Zahlung erfasst</p>
                <span className="budget-caption">
                  Restbudget: {formatCurrency(Math.max(totalBudget - totalSpent, 0))}
                </span>
              </div>
            </div>
          </section>

          <section className="experience-panel">
            <div className="section-headline">
              <div>
                <p className="eyebrow">Verteilung</p>
                <h2>Welche Kategorien schon Gewicht bekommen</h2>
              </div>
            </div>
            <div className="allocation-list">
              {categorySpend.map((category) => (
                <article key={category.category} className="allocation-row">
                  <div>
                    <strong>{category.label}</strong>
                    <span>{formatCurrency(category.spent)}</span>
                  </div>
                  <div className="allocation-row__bar">
                    <span style={{ width: `${category.percentage}%` }} />
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="experience-panel" id="budget-editor">
            {renderBudgetEditorPanel()}
          </section>

          <section className="experience-panel">
            <div className="section-headline">
              <div>
                <p className="eyebrow">Zuletzt bearbeitet</p>
                <h2>Letzte Budgeteintraege</h2>
              </div>
            </div>
            <div className="transaction-list">
              {(workspace?.expenses ?? []).slice().reverse().map((expense) => (
                <article key={expense.id} className="transaction-row">
                  <div>
                    <strong>{expense.label}</strong>
                    <p>{expense.vendorName || "ohne Vendor-Zuordnung"}</p>
                  </div>
                  <div>
                    <strong>{formatCurrency(expense.amount)}</strong>
                    <span>{expenseStatusLabels[expense.status]}</span>
                  </div>
                </article>
              ))}
              {!workspace?.expenses.length ? (
                <p className="empty-state">Noch keine Budgeteintraege vorhanden.</p>
              ) : null}
            </div>
          </section>
        </div>
      </section>
    );
  }

  function renderAdminPage() {
    return (
      <section className="page-stack">
        <header className="page-hero">
          <div>
            <p className="eyebrow">Zentrale</p>
            <h1>Profilfundament, Admin-Fristen und finaler Control Room in einer Ansicht.</h1>
            <p className="page-copy">
              Hier pflegt ihr die Grunddaten, schaut auf rechtliche Erinnerungen und hakt den
              finalen Aufgabenstand der Feier sauber durch.
            </p>
          </div>
          <div className="hero-stat-row">
            <article className="hero-mini-stat">
              <strong>{status === "ready" ? "Online" : "Sync"}</strong>
              <span>Workspace-Status</span>
            </article>
            <article className="hero-mini-stat hero-mini-stat--dark">
              <strong>{consultationVoiceStatus === "idle" ? "Bereit" : "Aktiv"}</strong>
              <span>Voice-Consultant</span>
            </article>
          </div>
        </header>

        <section className="toolbar-row toolbar-row--compact">
          <div className="toolbar-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => scrollToSection("foundation-form")}
            >
              Allgemeine Praeferenzen
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => scrollToSection("admin-reminders")}
            >
              Benachrichtigungen & Fristen
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                goToPage("admin", {
                  stepId: "legal-admin",
                  openConsultant: true
                })
              }
            >
              Consultant starten
            </button>
          </div>
        </section>

        <div className="page-grid page-grid--admin">
          <section className="experience-panel" id="foundation-form">
            <div className="section-headline">
              <div>
                <p className="eyebrow">Profilfundament</p>
                <h2>Stil, Budget, Datum und Event-Setup pflegen</h2>
              </div>
            </div>
            <ProfileForm
              form={form}
              disabled={status === "saving"}
              primaryLabel="Profil speichern"
              showInvitationFields
              onChange={(updater) => setForm((current) => updater(current))}
              onSubmit={handleSaveProfile}
            />
          </section>

          <section className="experience-panel" id="admin-reminders">
            <div className="section-headline">
              <div>
                <p className="eyebrow">Standesamt & Admin</p>
                <h2>Fristen mit direktem Erledigt-Status</h2>
              </div>
            </div>
            {renderAdminStep()}
          </section>

          <section className="experience-panel" id="control-room">
            <div className="section-headline">
              <div>
                <p className="eyebrow">Control Room</p>
                <h2>Finale Aufgaben und Feierstruktur</h2>
              </div>
            </div>
            {renderControlRoomStep()}
          </section>
        </div>
      </section>
    );
  }

  function renderCurrentPage() {
    switch (currentPage) {
      case "dashboard":
        return renderDashboardPage();
      case "timeline":
        return renderTimelinePage();
      case "vendors":
        return renderVendorsPage();
      case "budget":
        return renderBudgetPage();
      case "guests":
        return renderGuestsPage();
      case "admin":
        return renderAdminPage();
    }
  }

  function renderGuidedWorkspace() {
    const activeStep = guidedSession?.steps.find((step) => step.id === activeStepId);

    if (!workspace || !guidedSession || !activeStep) {
      return null;
    }

    const navigationItems: AppPageId[] = [
      "dashboard",
      "timeline",
      "vendors",
      "budget",
      "guests",
      "admin"
    ];

    const activeProfileSummary = `${workspace.onboarding.region} / ${formatLongDate(
      workspace.onboarding.targetDate
    )}`;
    return (
        <div
          className={`workspace-shell workspace-shell--${currentPage} ${
            mobileNavOpen ? "workspace-shell--mobile-nav-open" : ""
          }`}
        >
        <header className="workspace-topbar">
          <button
            type="button"
            className="brand-lockup"
            onClick={() => goToPage("dashboard", { stepId: activeStepId })}
          >
            <span className="brand-lockup__eyebrow">Linden & Lace</span>
            <strong>Wedding Co-Pilot</strong>
          </button>

          <nav className="topbar-links" aria-label="Schnellnavigation">
            <button
              type="button"
              onClick={() =>
                goToPage("admin", {
                  stepId: "foundation",
                  sectionId: "foundation-form"
                })
              }
            >
              Inspiration
            </button>
            <button
              type="button"
              onClick={() =>
                goToPage(currentPage, {
                  stepId: activeStepId,
                  openConsultant: true
                })
              }
            >
              Concierge
            </button>
            <button
              type="button"
              onClick={() =>
                goToPage("timeline", {
                  stepId: activeStepId
                })
              }
            >
              Plan Your Day
            </button>
          </nav>

          <div className="topbar-meta-card" aria-label="Profilzusammenfassung">
            <span>{activeProfileSummary}</span>
            <strong>{workspace.coupleName}</strong>
            <small>{workspace.guestSummary.attending} Zusagen live im Blick</small>
          </div>

          <div className="topbar-actions">
            <button
              type="button"
              className="secondary-button secondary-button--compact"
              onClick={() =>
                goToPage("admin", {
                  stepId: "legal-admin",
                  sectionId: "admin-reminders"
                })
              }
            >
              Fristen
            </button>
            <button
              type="button"
              className="secondary-button secondary-button--compact"
              onClick={() => showLibrary(false)}
            >
              Profilbibliothek
            </button>
            <button
              type="button"
              className="secondary-button secondary-button--compact workspace-menu-toggle"
              onClick={() => setMobileNavOpen((current) => !current)}
            >
              Menue
            </button>
          </div>

          <section className="step-ribbon step-ribbon--topbar">
            {guidedSession.steps.map((step) => (
              <button
                key={step.id}
                type="button"
                className={`step-ribbon__item step-ribbon__item--${step.status} ${
                  activeStepId === step.id ? "step-ribbon__item--active" : ""
                }`}
                onClick={() =>
                  goToPage(pageForStepById[step.id], {
                    stepId: step.id
                  })
                }
              >
                <span>{displayStepTitleById[step.id]}</span>
                <small>
                  {step.status === "done"
                    ? "Erledigt"
                    : step.status === "active"
                      ? "Jetzt dran"
                      : "Später"}
                </small>
              </button>
            ))}
          </section>
        </header>

        {/*
          Mobile pointer contract (<= 820px):
          - menu closed: topbar + mobile dock own taps; rail + underlay must not intercept
            (`workspace-rail` without `--open`, `workspace-underlay` without `--visible`).
          - menu open: rail owns navigation taps, underlay owns outside-tap close target,
            while topbar toggle/dock remain above underlay for deterministic recovery.
          Keep `mobileNavOpen` as the single source of truth for these class toggles.
        */}
        <div
          className={`workspace-underlay ${mobileNavOpen ? "workspace-underlay--visible" : ""}`}
          onClick={() => setMobileNavOpen(false)}
        />

        <aside className={`workspace-rail ${mobileNavOpen ? "workspace-rail--open" : ""}`}>
          <div className="rail-profile-card">
            <p className="meta-label">Aktives Profil</p>
            <strong>{workspace.coupleName}</strong>
            <span>{activeProfileSummary}</span>
            <span>{formatCurrency(totalBudget)}</span>
          </div>

          <article className="rail-briefing-card">
            <p className="meta-label">Heute wichtig</p>
            <strong>{displayStepTitleById[activeStepId]}</strong>
            <p>
              {activeStep.summary ??
                "Die nächste Aufgabe bleibt direkt griffbereit im Workspace."}
            </p>
            <button
              type="button"
              className="secondary-button secondary-button--compact"
              onClick={() => goToPage(pageForStepById[activeStepId], { stepId: activeStepId })}
            >
              Zum aktiven Schritt
            </button>
          </article>

          <nav className="rail-nav" aria-label="Hauptnavigation">
            {navigationItems.map((pageId) => (
              <button
                key={pageId}
                type="button"
                className={`rail-nav__item ${
                  currentPage === pageId ? "rail-nav__item--active" : ""
                }`}
                onClick={() => goToPage(pageId, { stepId: activeStepId })}
              >
                <strong>{pageLabelById[pageId]}</strong>
                <span>{pageShortLabelById[pageId]}</span>
              </button>
            ))}
          </nav>

          <div className="rail-cta">
            <button
              type="button"
              className="primary-button"
              onClick={() =>
                goToPage("vendors", {
                  stepId: "core-vendors",
                  sectionId: "vendor-grid"
                })
              }
            >
              Vendoren priorisieren
            </button>
          </div>
        </aside>

        <main className="workspace-main">
          {error ? <p className="error-text workspace-error">{error}</p> : null}

          {renderCurrentPage()}
        </main>

        <nav className="mobile-dock" aria-label="Mobile Navigation">
          {navigationItems.map((pageId) => (
            <button
              key={pageId}
              type="button"
              className={`mobile-dock__item ${
                currentPage === pageId ? "mobile-dock__item--active" : ""
              }`}
              onClick={() => goToPage(pageId, { stepId: activeStepId })}
            >
              <strong>{pageShortLabelById[pageId]}</strong>
              <span>{pageLabelById[pageId]}</span>
            </button>
          ))}
        </nav>

        {consultantOpen ? (
          <div
            className="consultant-drawer-backdrop"
            onClick={() => setConsultantOpen(false)}
            role="presentation"
          >
            <div
              className="consultant-drawer"
              role="dialog"
              aria-modal="true"
              aria-label="Wedding Concierge"
              onClick={(event) => event.stopPropagation()}
            >
              <ConsultationPanel
                mode="standalone"
                isOpen
                isSending={consultationStatus === "sending"}
                isRecording={consultationVoiceStatus === "recording"}
                isTranscribing={consultationVoiceStatus === "transcribing"}
                isSpeaking={consultationVoiceStatus === "speaking"}
                assistantTier={consultationAssistantTier}
                assistantMode={consultationAssistantMode}
                assistantLane={consultationLane}
                guidedSession={guidedSession}
                currentTurn={consultationTurn}
                messages={consultationMessages}
                draft={consultationDraft}
                onDraftChange={setConsultationDraft}
                onAssistantTierChange={(tier) => {
                  setConsultationAssistantTier(tier);
                  if (tier === "free") {
                    setConsultationAssistantMode("consultant");
                  }
                }}
                onAssistantModeChange={setConsultationAssistantMode}
                onStart={() => undefined}
                onClose={() => setConsultantOpen(false)}
                onStepSelect={handleConsultationStepSelect}
                onReplySelect={handleConsultationReply}
                onSend={handleConsultationSend}
                onToggleRecording={() => void handleConsultationVoiceToggle()}
                onReplayAssistant={() => void handleConsultationReplayAssistant()}
              />
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  if (view === "library" || !workspace) {
    return renderWorkspaceLibrary();
  }

  return renderGuidedWorkspace();
}

export default function App() {
  if (/\/wedding\/v2\/?$/.test(window.location.pathname)) {
    window.location.replace("/wedding/");
    return null;
  }

  const publicRsvpToken = getPublicRsvpTokenFromPath(window.location.pathname);
  const isCoveragePath = window.location.pathname.endsWith("/coverage");
  if (isCoveragePath) {
    return <IngestionCoveragePage />;
  }

  if (publicRsvpToken) {
    return <PublicRsvpPage token={publicRsvpToken} />;
  }

  return (
    <GoogleAuthGate>
      {({ userEmail, onLogout }) => (
        <DashboardApp currentUserEmail={userEmail} onLogout={onLogout} />
      )}
    </GoogleAuthGate>
  );
}

type GoogleAuthGateProps = {
  children: (props: { userEmail: string; onLogout: () => void }) => ReactElement;
};

type GoogleCredentialResponse = {
  credential?: string;
};

type GoogleAccounts = {
  accounts: {
    id: {
      initialize(config: {
        client_id: string;
        callback: (response: GoogleCredentialResponse) => void;
        auto_select?: boolean;
      }): void;
      renderButton(
        element: HTMLElement,
        options: {
          theme?: "outline" | "filled_blue" | "filled_black";
          size?: "large" | "medium" | "small";
          text?: "signin_with" | "signup_with" | "continue_with" | "signin";
          shape?: "rectangular" | "pill" | "circle" | "square";
        }
      ): void;
    };
  };
};

declare global {
  interface Window {
    google?: GoogleAccounts;
  }
}

function GoogleAuthGate({ children }: GoogleAuthGateProps) {
  const [idToken, setIdToken] = useState<string | null>(() =>
    window.localStorage.getItem("wedding.idToken")
  );
  const [authError, setAuthError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(() => decodeGoogleEmail(idToken));
  const buttonHostRef = useRef<HTMLDivElement | null>(null);
  const googleClientId =
    import.meta.env.VITE_GOOGLE_CLIENT_ID ??
    "669658333594-qoni0sjaj1egsa5egabjb91laie0k6fi.apps.googleusercontent.com";

  useEffect(() => {
    setApiAuthToken(idToken);
  }, [idToken]);

  useEffect(() => {
    function handleExpiredAuth() {
      setIdToken(null);
      setUserEmail(null);
      setAuthError("Deine Anmeldung ist abgelaufen. Bitte melde dich erneut an.");
    }

    window.addEventListener("wedding:auth-expired", handleExpiredAuth);

    return () => {
      window.removeEventListener("wedding:auth-expired", handleExpiredAuth);
    };
  }, []);

  useEffect(() => {
    if (idToken || !buttonHostRef.current) {
      return;
    }

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://accounts.google.com/gsi/client"]'
    );

    function renderButton() {
      if (!buttonHostRef.current || !window.google) {
        return;
      }

      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: (response: GoogleCredentialResponse) => {
          if (!response.credential) {
            setAuthError("Google-Login konnte nicht abgeschlossen werden.");
            return;
          }

          window.localStorage.setItem("wedding.idToken", response.credential);
          setIdToken(response.credential);
          setUserEmail(decodeGoogleEmail(response.credential));
          setAuthError(null);
        },
        auto_select: false
      });

      buttonHostRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(buttonHostRef.current, {
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "pill"
      });
    }

    if (existingScript) {
      if (window.google) {
        renderButton();
      } else {
        existingScript.addEventListener("load", renderButton, { once: true });
      }
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.addEventListener("load", renderButton, { once: true });
    script.addEventListener("error", () => {
      setAuthError("Google-Login konnte nicht geladen werden.");
    });
    document.head.appendChild(script);
  }, [idToken, googleClientId]);

  function handleLogout() {
    window.localStorage.removeItem("wedding.idToken");
    setApiAuthToken(null);
    setIdToken(null);
    setUserEmail(null);
  }

  if (idToken && userEmail) {
    return children({ userEmail, onLogout: handleLogout });
  }

  return (
    <main className="atelier-shell atelier-shell--library">
      <section className="panel-surface library-hero-card">
        <div className="library-hero-copy">
          <p className="eyebrow">Sicherer Zugang</p>
          <h1>Login erforderlich</h1>
          <p className="library-body-copy">
            Melde dich mit Google an, damit du nur deine eigenen Buchungsprofile siehst.
          </p>
          <div ref={buttonHostRef} />
          {authError ? <p className="error-text">{authError}</p> : null}
        </div>
      </section>
    </main>
  );
}

function decodeGoogleEmail(token: string | null): string | null {
  if (!token) {
    return null;
  }

  const parts = token.split(".");

  if (parts.length < 2) {
    return null;
  }

  try {
    const payloadBase64 = parts[1]!.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = window.atob(payloadBase64);
    const payload = JSON.parse(jsonPayload) as { email?: string };
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}
type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: {
    results: ArrayLike<ArrayLike<{ transcript: string }>>;
  }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};
