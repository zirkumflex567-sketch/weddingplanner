import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type {
  BudgetCategory,
  GuidedPlanningStepId,
  PlannedEventId,
  PrototypeExpense,
  PrototypeGuest,
  VendorMatch,
  PrototypeWorkspace,
  PrototypeWorkspaceProfile,
  PrototypeVendorStage,
  WeddingConsultantTurn,
  WeddingBootstrapInput
} from "@wedding/shared";
import {
  createGuidedPlanningSession,
  createWeddingConsultantOpening
} from "@wedding/shared";
import {
  addExpense,
  addGuest,
  createWorkspace,
  deleteWorkspace,
  getWorkspace,
  listWorkspaceProfiles,
  replyWithWeddingConsultant,
  setTaskCompleted,
  updateGuestRsvp,
  updateVendorLead,
  updateWorkspace
} from "./lib/api";
import {
  ConsultationPanel,
  type ConsultationMessage
} from "./components/ConsultationPanel";
import { PublicRsvpPage } from "./PublicRsvpPage";
import "./app.css";

type FormState = {
  coupleName: string;
  targetDate: string;
  region: string;
  guestCountTarget: number;
  budgetTotal: number;
  stylePreferences: string;
  noGoPreferences: string;
  plannedEvents: PlannedEventId[];
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

type StoredConsultationSession = {
  currentTurn: WeddingConsultantTurn;
  messages: ConsultationMessage[];
};

type AppView = "library" | "guided";
type CoreVendorCategory = Exclude<VendorMatch["category"], "venue">;
type CoreVendorFilterMode = "all" | "portfolio" | "active";

const storageKey = "wedding.prototype.workspaceId";
const consultationStorageKeyPrefix = "wedding.prototype.consultation.";

const initialInput: WeddingBootstrapInput = {
  coupleName: "Alina & Jonas",
  targetDate: "2027-08-21",
  region: "67454 Hassloch",
  guestCountTarget: 70,
  budgetTotal: 24000,
  stylePreferences: ["natural", "romantic"],
  noGoPreferences: ["ballroom"],
  plannedEvents: ["civil-ceremony", "celebration"]
};

const eventOptions: Array<{ id: PlannedEventId; label: string }> = [
  { id: "civil-ceremony", label: "Standesamt" },
  { id: "free-ceremony", label: "Freie Trauung" },
  { id: "celebration", label: "Feier" },
  { id: "brunch", label: "Brunch" }
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
  "guest-experience": "Gaesteliste & RSVP",
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
    noGoPreferences: input.noGoPreferences.join(", ")
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
    plannedEvents: form.plannedEvents
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

function createConsultationStorageKey(workspaceId: string) {
  return `${consultationStorageKeyPrefix}${workspaceId}`;
}

function parseStoredConsultationSession(
  value: string | null
): StoredConsultationSession | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<StoredConsultationSession>;

    if (
      !parsed.currentTurn ||
      !Array.isArray(parsed.messages) ||
      parsed.messages.some(
        (message) =>
          typeof message?.id !== "string" ||
          (message?.role !== "assistant" && message?.role !== "user") ||
          typeof message?.content !== "string"
      )
    ) {
      return null;
    }

    return {
      currentTurn: parsed.currentTurn,
      messages: parsed.messages
    };
  } catch {
    return null;
  }
}

function formatProfileMeta(profile: PrototypeWorkspaceProfile) {
  return `${profile.region} / ${profile.targetDate} / ${profile.guestCountTarget} Gaeste / ${profile.budgetTotal.toLocaleString("de-DE")} EUR`;
}

interface ProfileFormProps {
  form: FormState;
  disabled: boolean;
  primaryLabel: string;
  onChange(updater: (current: FormState) => FormState): void;
  onSubmit(event: FormEvent<HTMLFormElement>): void;
  onCancel?(): void;
}

function ProfileForm({
  form,
  disabled,
  primaryLabel,
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
          Gaesteziel
          <input
            aria-label="Gaesteziel"
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
        Stilpraeferenzen
        <input
          aria-label="Stilpraeferenzen"
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

function DashboardApp() {
  const [view, setView] = useState<AppView>("library");
  const [profiles, setProfiles] = useState<PrototypeWorkspaceProfile[]>([]);
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
  const [consultationTurn, setConsultationTurn] = useState<WeddingConsultantTurn | null>(null);
  const [consultationMessages, setConsultationMessages] = useState<ConsultationMessage[]>([]);
  const [consultationDraft, setConsultationDraft] = useState("");
  const [consultationStatus, setConsultationStatus] = useState<"idle" | "sending">("idle");
  const [status, setStatus] = useState<"loading" | "ready" | "saving">("loading");
  const [error, setError] = useState<string | null>(null);
  const [activeCoreVendorCategory, setActiveCoreVendorCategory] =
    useState<CoreVendorCategory>("photography");
  const [coreVendorFilterMode, setCoreVendorFilterMode] =
    useState<CoreVendorFilterMode>("all");
  const [coreVendorSearch, setCoreVendorSearch] = useState("");

  const guidedSession = workspace ? createGuidedPlanningSession(workspace) : null;
  const activeStepId = consultationTurn?.stepId ?? guidedSession?.currentStepId ?? "foundation";
  const activeStep = guidedSession?.steps.find((step) => step.id === activeStepId) ?? null;
  const budgetCategories = workspace?.plan.budgetCategories ?? [];

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      setStatus("loading");
      setError(null);

      try {
        const profileResponse = await listWorkspaceProfiles();

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
    setVendorDrafts(createVendorDraftMap(workspace));
  }, [workspace]);

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
      return;
    }

    const storedSession = parseStoredConsultationSession(
      window.localStorage.getItem(createConsultationStorageKey(workspace.id))
    );

    if (storedSession) {
      setConsultationTurn(storedSession.currentTurn);
      setConsultationMessages(storedSession.messages);
      setConsultationDraft("");
      return;
    }

    const opening = createWeddingConsultantOpening(workspace, guidedSession?.currentStepId);
    setConsultationTurn(opening);
    setConsultationMessages([createConsultationMessage("assistant", opening.assistantMessage)]);
    setConsultationDraft("");
  }, [workspace?.id]);

  useEffect(() => {
    if (!workspace) {
      return;
    }

    const storageId = createConsultationStorageKey(workspace.id);

    if (!consultationTurn || consultationMessages.length === 0) {
      window.localStorage.removeItem(storageId);
      return;
    }

    window.localStorage.setItem(
      storageId,
      JSON.stringify({
        currentTurn: consultationTurn,
        messages: consultationMessages
      } satisfies StoredConsultationSession)
    );
  }, [workspace, consultationTurn, consultationMessages]);

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
        const [workspaceResponse, profileResponse] = await Promise.all([
          getWorkspace(workspaceId),
          listWorkspaceProfiles()
        ]);

        if (!active) {
          return;
        }

        setProfiles(profileResponse.profiles);
        setWorkspace((current) =>
          current?.id === workspaceId ? workspaceResponse.workspace : current
        );
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

  function hydrateWorkspace(nextWorkspace: PrototypeWorkspace) {
    setWorkspace(nextWorkspace);
    setForm(toFormState(nextWorkspace.onboarding));
    setGuestDraft(createGuestDraft(nextWorkspace.onboarding.plannedEvents));
    setExpenseDraft(
      createExpenseDraft(nextWorkspace.plan.budgetCategories[0]?.category ?? "venue")
    );
  }

  async function refreshProfiles() {
    const response = await listWorkspaceProfiles();
    setProfiles(response.profiles);
    return response.profiles;
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
      setError("Dieses Profil konnte gerade nicht geoeffnet werden.");
      setStatus("ready");
    }
  }

  function showLibrary(openCreateForm: boolean) {
    setView("library");
    setShowCreateProfile(openCreateForm);
    setError(null);

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
      hydrateWorkspace(result.workspace);
      await refreshProfiles();
      setStatus("ready");
    } catch {
      setError("Das Profil konnte gerade nicht gespeichert werden.");
      setStatus("ready");
    }
  }

  async function handleDeleteProfile(profile: PrototypeWorkspaceProfile) {
    const confirmed = window.confirm(
      `Soll "${profile.coupleName}" wirklich geloescht werden?`
    );

    if (!confirmed) {
      return;
    }

    setStatus("saving");
    setError(null);

    try {
      await deleteWorkspace(profile.id);
      window.localStorage.removeItem(storageKey);
      window.localStorage.removeItem(createConsultationStorageKey(profile.id));

      if (workspace?.id === profile.id) {
        setWorkspace(null);
      }

      const nextProfiles = await refreshProfiles();
      setView("library");
      setShowCreateProfile(nextProfiles.length === 0);
      setStatus("ready");
    } catch {
      setError("Das Profil konnte gerade nicht geloescht werden.");
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
      hydrateWorkspace(result.workspace);
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
      hydrateWorkspace(result.workspace);
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
      hydrateWorkspace(result.workspace);
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

    setStatus("saving");
    setError(null);

    try {
      const result = await addExpense(workspace.id, {
        ...expenseDraft,
        amount: Number(expenseDraft.amount)
      });
      hydrateWorkspace(result.workspace);
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
      hydrateWorkspace(result.workspace);
      await refreshProfiles();
      setStatus("ready");
    } catch {
      setError("Der Vendor-Status konnte gerade nicht gespeichert werden.");
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
      vendor.city,
      vendor.region,
      vendor.serviceLabel,
      vendor.reasonSummary
    ]
      .filter(Boolean)
      .some((value) => value?.toLowerCase().includes(normalizedQuery));
  }

  function renderVendorCard(vendor: VendorMatch, options?: { showCategory?: boolean }) {
    const trackerEntry = getVendorTrackerEntry(vendor.id);
    const vendorDraft = vendorDrafts[vendor.id] ?? createVendorDraft();
    const locationLabel = vendor.city ? `${vendor.city} / ${vendor.region}` : vendor.region;
    const metaTokens = [
      options?.showCategory ? vendorCategoryLabels[vendor.category] : null,
      locationLabel,
      vendor.serviceLabel ?? null
    ].filter(Boolean);
    const reviewLine = formatVendorEvidence(vendor);
    const vendorLinks = getVendorLinks(vendor);

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
        </div>
        <div className="guided-vendor-editor">
          <label>
            Vendor-Status
            <select
              aria-label={`Vendor-Status fuer ${vendor.name}`}
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
              aria-label={`Quote in EUR fuer ${vendor.name}`}
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
              aria-label={`Notiz fuer ${vendor.name}`}
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

  function handleConsultationStepSelect(stepId: GuidedPlanningStepId) {
    if (!workspace) {
      return;
    }

    const opening = createWeddingConsultantOpening(workspace, stepId);
    const stepLabel = displayStepTitleById[stepId];

    setConsultationTurn(opening);
    setConsultationMessages((current) => [
      ...current,
      createConsultationMessage(
        "assistant",
        `Wir wechseln jetzt bewusst in "${stepLabel}". ${opening.assistantMessage}`
      )
    ]);
    setConsultationDraft("");
  }

  async function handleConsultationReply(optionId: string, label: string) {
    if (!workspace || !consultationTurn) {
      return;
    }

    const nextUserMessage = createConsultationMessage("user", label);
    const nextMessages = [...consultationMessages, nextUserMessage];

    setConsultationStatus("sending");

    try {
      const response = await replyWithWeddingConsultant({
        workspace,
        currentTurn: consultationTurn,
        messages: nextMessages,
        userMessage: label
      });

      setConsultationMessages([
        ...nextMessages,
        createConsultationMessage("assistant", response.turn.assistantMessage)
      ]);
      setConsultationTurn(response.turn);
      setConsultationDraft("");
    } catch {
      setError(
        "Der KI-Consultant war gerade nicht erreichbar. Bitte versucht es in ein paar Sekunden noch einmal."
      );
    } finally {
      setConsultationStatus("idle");
    }
  }

  async function handleConsultationSend() {
    const message = consultationDraft.trim();

    if (!workspace || !consultationTurn || message.length === 0) {
      return;
    }

    const nextUserMessage = createConsultationMessage("user", message);
    const nextMessages = [...consultationMessages, nextUserMessage];

    setConsultationStatus("sending");

    try {
      const response = await replyWithWeddingConsultant({
        workspace,
        currentTurn: consultationTurn,
        messages: nextMessages,
        userMessage: message
      });

      setConsultationMessages([
        ...nextMessages,
        createConsultationMessage("assistant", response.turn.assistantMessage)
      ]);
      setConsultationTurn(response.turn);
      setConsultationDraft("");
    } catch {
      setError(
        "Der KI-Consultant war gerade nicht erreichbar. Bitte versucht es in ein paar Sekunden noch einmal."
      );
    } finally {
      setConsultationStatus("idle");
    }
  }

  function renderWorkspaceLibrary() {
    return (
      <main className="guided-shell guided-shell--library">
        <section className="panel guided-library-hero">
          <div>
            <p className="eyebrow">Wedding Consultant</p>
            <h1>Hochzeitsberatung, Schritt fuer Schritt</h1>
            <p className="guided-library-copy">
              Keine ueberladene Planungswand mehr: Ihr startet mit einem Profil und werdet
              dann nur noch durch den jeweils naechsten sinnvollen Schritt gefuehrt.
            </p>
          </div>
          <div className="guided-library-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => showLibrary(true)}
              disabled={status === "saving"}
            >
              Neues Beratungsprofil
            </button>
            <span className={`source-pill source-pill--${status}`}>
              {status === "loading"
                ? "Laedt"
                : status === "saving"
                  ? "Speichert"
                  : "Bereit"}
            </span>
          </div>
        </section>

        <section className="guided-library-grid">
          <section className="panel guided-library-panel">
            <div className="section-head">
              <div>
                <p className="eyebrow">Profilbibliothek</p>
                <h2>Gespeicherte Profile</h2>
              </div>
            </div>

            <div className="profile-library-list">
              {profiles.map((profile) => (
                <article key={profile.id} className="profile-library-card">
                  <div>
                    <p className="meta-label">Naechster Fokus</p>
                    <strong>{profile.coupleName}</strong>
                    <p>{formatProfileMeta(profile)}</p>
                    <p className="profile-library-step">
                      {displayStepTitleById[profile.currentStepId]}
                    </p>
                    <p className="profile-library-progress">
                      {profile.progress.completedTasks}/{profile.progress.totalTasks} Tasks erledigt
                    </p>
                  </div>
                  <div className="profile-library-card-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => void openWorkspace(profile.id)}
                    >
                      Profil oeffnen
                    </button>
                    <button
                      type="button"
                      className="secondary-button secondary-button--danger"
                      aria-label={`Profil loeschen ${profile.coupleName}`}
                      onClick={() => void handleDeleteProfile(profile)}
                    >
                      Profil loeschen
                    </button>
                  </div>
                </article>
              ))}
            </div>

            {profiles.length === 0 ? (
              <p className="empty-state">
                Noch kein Beratungsprofil vorhanden. Startet mit eurem ersten Profil.
              </p>
            ) : null}
          </section>

          <section className="panel guided-library-panel">
            <div className="section-head">
              <div>
                <p className="eyebrow">Neues Profil</p>
                <h2>Beratung vorbereiten</h2>
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
              <div className="guided-library-info">
                <p>
                  Ihr koennt bestehende Profile wieder aufnehmen oder ein neues
                  Beratungsprofil anlegen. Danach fuehrt euch der Consultant nur noch durch
                  den jeweils aktuellen Planungsschritt.
                </p>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowCreateProfile(true)}
                >
                  Profilformular oeffnen
                </button>
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
          bewusst vergleichen koennt statt nur eine Mini-Shortlist anzustarren.
        </p>
        <p className="guided-muted">{workspace?.plan.vendorSearchStrategy.note}</p>
        <div className="guided-card-stack guided-card-stack--vendors">
          {venueMatches.map((vendor) => renderVendorCard(vendor))}
        </div>
      </div>
    );
  }

  function renderCoreVendorsStep() {
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
        <section className="guided-subpanel">
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
                      amount: Number(event.target.value)
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
            <button type="submit" className="secondary-button" disabled={status === "saving"}>
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
        </section>

        <section className="guided-subpanel">
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
                  Fuer diesen Filter ist gerade kein Anbieter sichtbar. Nimm Suche oder Sichtfilter
                  etwas weiter auf.
                </p>
              )}
            </section>
          ) : null}
        </section>
      </div>
    );
  }

  function renderGuestStep() {
    return (
      <div className="guided-step-body">
        <div className="guided-guest-summary">
          <span>Offen: {workspace?.guestSummary.pending ?? 0}</span>
          <span>Zugesagt: {workspace?.guestSummary.attending ?? 0}</span>
          <span>Abgesagt: {workspace?.guestSummary.declined ?? 0}</span>
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
                  setGuestDraft((current) => ({ ...current, household: event.target.value }))
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

        <div className="guided-guest-list">
          {(workspace?.guests ?? []).map((guest) => (
            <article key={guest.id} className="guided-guest-card">
              <div className="guided-vendor-head">
                <div>
                  <strong>{guest.name}</strong>
                  <p>
                    {guest.household} / {guest.email}
                  </p>
                </div>
                <span className="stage-pill stage-pill--contacted">{rsvpLabels[guest.rsvpStatus]}</span>
              </div>
              <p>Essen: {mealPreferenceLabels[guest.mealPreference]}</p>
              {guest.dietaryNotes ? <p>{guest.dietaryNotes}</p> : null}
              {guest.message ? <p>{guest.message}</p> : null}
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
                RSVP-Link oeffnen
              </a>
            </article>
          ))}

          {!workspace?.guests.length ? (
            <p className="empty-state">Noch keine Gaeste angelegt.</p>
          ) : null}
        </div>
      </div>
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

  function renderActiveWorkbench() {
    switch (activeStepId) {
      case "foundation":
        return (
          <ProfileForm
            form={form}
            disabled={status === "saving"}
            primaryLabel="Profil speichern"
            onChange={(updater) => setForm((current) => updater(current))}
            onSubmit={handleSaveProfile}
          />
        );
      case "venue-and-date":
        return renderVenueStep();
      case "core-vendors":
        return renderCoreVendorsStep();
      case "guest-experience":
        return renderGuestStep();
      case "legal-admin":
        return renderAdminStep();
      case "final-control-room":
        return renderControlRoomStep();
    }
  }

  function renderGuidedWorkspace() {
    if (!workspace || !guidedSession || !activeStep) {
      return null;
    }

    return (
      <main className="guided-shell">
        <header className="panel guided-header">
          <div>
            <p className="eyebrow">Aktives Beratungsprofil</p>
            <h1>{workspace.coupleName}</h1>
            <p className="guided-header-copy">
              {workspace.onboarding.region} / {workspace.onboarding.targetDate} /{" "}
              {workspace.onboarding.guestCountTarget} Gaeste /{" "}
              {workspace.onboarding.budgetTotal.toLocaleString("de-DE")} EUR
            </p>
          </div>
          <div className="guided-header-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => showLibrary(false)}
            >
              Profil wechseln
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={status === "saving"}
              onClick={() => void handleSaveProfile()}
            >
              Profil speichern
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => showLibrary(true)}
            >
              Neues Profil
            </button>
            <button
              type="button"
              className="secondary-button secondary-button--danger"
              onClick={() =>
                void handleDeleteProfile({
                  id: workspace.id,
                  coupleName: workspace.coupleName,
                  targetDate: workspace.onboarding.targetDate,
                  region: workspace.onboarding.region,
                  guestCountTarget: workspace.onboarding.guestCountTarget,
                  budgetTotal: workspace.onboarding.budgetTotal,
                  updatedAt: workspace.updatedAt,
                  progress: workspace.progress,
                  guestSummary: workspace.guestSummary,
                  currentStepId: guidedSession.currentStepId,
                  currentStepTitle: activeStep.title
                })
              }
            >
              Profil loeschen
            </button>
            <span className={`source-pill source-pill--${status}`}>
              {status === "loading"
                ? "Laedt"
                : status === "saving"
                  ? "Speichert"
                  : "Bereit"}
            </span>
          </div>
        </header>

        <section className="panel guided-path-panel">
          <div className="section-head">
            <div>
              <p className="eyebrow">Planungspfad</p>
              <h2>Ein Schritt nach dem anderen</h2>
            </div>
          </div>
          <div className="guided-step-strip">
            {guidedSession.steps.map((step) => (
              <button
                key={step.id}
                type="button"
                className={`guided-step-button guided-step-button--${step.status} ${
                  activeStepId === step.id ? "guided-step-button--active" : ""
                }`}
                onClick={() => handleConsultationStepSelect(step.id)}
              >
                <span>{displayStepTitleById[step.id]}</span>
                <small>
                  {step.status === "done"
                    ? "Erledigt"
                    : step.status === "active"
                      ? "Jetzt dran"
                      : "Spaeter"}
                </small>
              </button>
            ))}
          </div>
        </section>

        {error ? <p className="error-text guided-error">{error}</p> : null}

        <section className="guided-main-grid">
          <ConsultationPanel
            mode="embedded"
            isOpen
            isSending={consultationStatus === "sending"}
            guidedSession={guidedSession}
            currentTurn={consultationTurn}
            messages={consultationMessages}
            draft={consultationDraft}
            onDraftChange={setConsultationDraft}
            onStart={() => undefined}
            onClose={() => undefined}
            onStepSelect={handleConsultationStepSelect}
            onReplySelect={handleConsultationReply}
            onSend={handleConsultationSend}
          />

          <section className="panel guided-workbench">
            <p className="eyebrow">Aktueller Planungsschritt</p>
            <h2>{displayStepTitleById[activeStepId]}</h2>
            <p className="guided-workbench-copy">{activeStep.coachBrief}</p>
            {renderActiveWorkbench()}
          </section>
        </section>
      </main>
    );
  }

  if (view === "library" || !workspace) {
    return renderWorkspaceLibrary();
  }

  return renderGuidedWorkspace();
}

export default function App() {
  const publicRsvpToken = getPublicRsvpTokenFromPath(window.location.pathname);

  if (publicRsvpToken) {
    return <PublicRsvpPage token={publicRsvpToken} />;
  }

  return <DashboardApp />;
}
