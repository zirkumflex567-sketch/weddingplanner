import {
  curatedVendorSeeds,
  type VendorPricingModel,
  type VendorSeed,
  type VendorSeedCategory
} from "./vendor-seeds";

export type PlannedEventId =
  | "civil-ceremony"
  | "free-ceremony"
  | "celebration"
  | "brunch";

export interface WeddingBootstrapInput {
  coupleName: string;
  targetDate: string;
  region: string;
  guestCountTarget: number;
  budgetTotal: number;
  stylePreferences: string[];
  noGoPreferences: string[];
  plannedEvents: PlannedEventId[];
}

export interface WeddingProfile {
  coupleName: string;
  targetDate: string;
  region: string;
  guestCountTarget: number;
  budgetTotal: number;
  stylePreferences: string[];
  noGoPreferences: string[];
  plannedEvents: PlannedEventId[];
  planningWindowMonths: number;
}

export interface PlanningMilestone {
  id: string;
  title: string;
  dueDate: string;
  category: "venue" | "photography" | "planning";
  rationale: string;
}

export interface BudgetCategory {
  category:
    | "venue"
    | "catering"
    | "photography"
    | "music"
    | "attire"
    | "florals"
    | "stationery-admin";
  label: string;
  plannedAmount: number;
  rationale: string;
}

export interface VendorStarterCategory {
  category: VendorSeedCategory;
  label: string;
  whyItMatters: string;
}

export interface AdminReminder {
  id: string;
  title: string;
  dueDate: string;
  category: "legal-admin";
  rationale: string;
}

export interface EventBlueprint {
  id: PlannedEventId;
  label: string;
  planningFocus: string;
}

export interface VendorMatch {
  id: string;
  name: string;
  category: VendorSeedCategory;
  region: string;
  city?: string;
  fitScore: number;
  priceBandLabel: string;
  reasonSummary: string;
  serviceLabel?: string;
  websiteUrl?: string;
  portfolioUrl?: string;
  portfolioLabel?: string;
  sourceUrl?: string;
  sourceLabel?: string;
  freshnessLabel?: string;
  reviewRatingValue?: number;
  reviewRatingScale?: number;
  reviewCount?: number;
  reviewSourceUrl?: string;
  reviewSourceLabel?: string;
}

export interface RuntimeTopology {
  aiExecution: "shadow-workstation";
  hosting: "vps-web-api-only";
  note: string;
}

export interface PrototypeTask {
  id: string;
  title: string;
  dueDate: string;
  category: PlanningMilestone["category"] | AdminReminder["category"];
  completed: boolean;
  sourceType: "milestone" | "admin-reminder";
}

export interface PrototypeGuest {
  id: string;
  accessToken: string;
  name: string;
  household: string;
  email: string;
  rsvpStatus: "pending" | "attending" | "declined";
  mealPreference: PrototypeMealPreference;
  dietaryNotes: string;
  message: string;
  eventIds: PlannedEventId[];
}

export type PrototypeMealPreference =
  | "undecided"
  | "standard"
  | "vegetarian"
  | "vegan"
  | "kids";

export interface PrototypeGuestSummary {
  total: number;
  pending: number;
  attending: number;
  declined: number;
}

export interface PrototypeProgress {
  completedTasks: number;
  totalTasks: number;
}

export interface PrototypeExpense {
  id: string;
  label: string;
  category: BudgetCategory["category"];
  amount: number;
  status: "planned" | "booked" | "paid";
  vendorName: string;
}

export type PrototypeVendorStage =
  | "suggested"
  | "contacted"
  | "quoted"
  | "booked"
  | "rejected";

export interface PrototypeVendorTrackerEntry {
  vendorId: string;
  stage: PrototypeVendorStage;
  quoteAmount: number | null;
  note: string;
  updatedAt: string;
}

export interface PrototypeBudgetCategoryOverview {
  category: BudgetCategory["category"];
  label: string;
  planned: number;
  committed: number;
  paid: number;
  remaining: number;
}

export interface PrototypeBudgetOverview {
  overall: {
    planned: number;
    committed: number;
    paid: number;
    remaining: number;
  };
  categories: PrototypeBudgetCategoryOverview[];
}

export interface PrototypeWorkspace {
  id: string;
  createdAt: string;
  updatedAt: string;
  coupleName: string;
  onboarding: WeddingBootstrapInput;
  plan: WeddingBootstrapPlan;
  tasks: PrototypeTask[];
  guests: PrototypeGuest[];
  guestSummary: PrototypeGuestSummary;
  progress: PrototypeProgress;
  expenses: PrototypeExpense[];
  vendorTracker: PrototypeVendorTrackerEntry[];
  budgetOverview: PrototypeBudgetOverview;
}

export interface PrototypeWorkspaceProfile {
  id: string;
  coupleName: string;
  targetDate: string;
  region: string;
  guestCountTarget: number;
  budgetTotal: number;
  updatedAt: string;
  progress: PrototypeProgress;
  guestSummary: PrototypeGuestSummary;
  currentStepId: GuidedPlanningStepId;
  currentStepTitle: string;
}

export interface PrototypePublicRsvpContext {
  coupleName: string;
  targetDate: string;
  region: string;
  invitedEvents: EventBlueprint[];
}

export interface PrototypePublicRsvpSession {
  guest: PrototypeGuest;
  context: PrototypePublicRsvpContext;
}

export type GuidedPlanningStepId =
  | "foundation"
  | "venue-and-date"
  | "core-vendors"
  | "guest-experience"
  | "legal-admin"
  | "final-control-room";

export type GuidedPlanningStepStatus = "done" | "active" | "upcoming";

export type GuidedPlanningFocusArea =
  | "profile"
  | "vendors"
  | "budget"
  | "guests"
  | "admin"
  | "timeline";

export interface GuidedPlanningStep {
  id: GuidedPlanningStepId;
  title: string;
  status: GuidedPlanningStepStatus;
  focusArea: GuidedPlanningFocusArea;
  primaryActionLabel: string;
  summary: string;
  coachBrief: string;
  checklist: string[];
}

export interface GuidedPlanningSession {
  headline: string;
  currentStepId: GuidedPlanningStepId;
  steps: GuidedPlanningStep[];
}

export interface WeddingConsultantReplyOption {
  id: string;
  label: string;
}

export interface WeddingConsultantTurn {
  stepId: GuidedPlanningStepId;
  focusArea: GuidedPlanningFocusArea;
  assistantMessage: string;
  suggestedReplies: WeddingConsultantReplyOption[];
}

export interface WeddingConsultantReplyInput {
  text?: string;
  actionId?: string;
}

export interface WeddingBootstrapPlan {
  profile: WeddingProfile;
  milestones: PlanningMilestone[];
  budgetCategories: BudgetCategory[];
  vendorStarterCategories: VendorStarterCategory[];
  adminReminders: AdminReminder[];
  eventBlueprints: EventBlueprint[];
  vendorMatches: VendorMatch[];
  runtimeTopology: RuntimeTopology;
  nextSteps: string[];
}

const budgetBlueprint = [
  {
    category: "venue",
    label: "Location",
    percentage: 40,
    rationale: "Venue und Termin blockieren den groessten Teil des operativen Rahmens."
  },
  {
    category: "catering",
    label: "Catering",
    percentage: 20,
    rationale: "Essens- und Getraenkekosten skalieren direkt mit der finalen Gaestezahl."
  },
  {
    category: "photography",
    label: "Foto",
    percentage: 10,
    rationale: "Fotografie wird frueh gebucht und ist stark vom Stilprofil abhaengig."
  },
  {
    category: "music",
    label: "Musik",
    percentage: 7,
    rationale: "Musik und Moderation steuern die Stimmung und den Ablauf am Tag selbst."
  },
  {
    category: "attire",
    label: "Outfits",
    percentage: 10,
    rationale: "Kleidung und Anpassungen benoetigen Vorlauf und passen selten in Restbudgets."
  },
  {
    category: "florals",
    label: "Floristik & Deko",
    percentage: 8,
    rationale: "Floristik und Dekor werden spaeter konkret, brauchen aber frueh einen Rahmen."
  },
  {
    category: "stationery-admin",
    label: "Papeterie & Admin",
    percentage: 5,
    rationale: "Papeterie, Standesamt, Dokumente und Kleinposten sollten frueh sichtbar sein."
  }
] as const satisfies ReadonlyArray<{
  category: BudgetCategory["category"];
  label: string;
  percentage: number;
  rationale: string;
}>;

const milestoneBlueprint = [
  {
    id: "venue-shortlist",
    title: "Location shortlist finalisieren",
    monthsBeforeWedding: 12,
    category: "venue",
    rationale: "Location und Termin bestimmen fast alle spaeteren Vendor-Entscheidungen."
  },
  {
    id: "photo-direction",
    title: "Foto- und Stilrichtung fixieren",
    monthsBeforeWedding: 10,
    category: "photography",
    rationale:
      "Fotografie ist in beliebten Zeitraeumen frueh ausgebucht und haengt stark vom Stilprofil ab."
  },
  {
    id: "guest-framework",
    title: "Gaeste- und Budgetrahmen absichern",
    monthsBeforeWedding: 6,
    category: "planning",
    rationale: "Gaestezahl und Budgetrahmen steuern Catering, Seating und Kommunikationsaufwand."
  }
] as const satisfies ReadonlyArray<{
  id: string;
  title: string;
  monthsBeforeWedding: number;
  category: PlanningMilestone["category"];
  rationale: string;
}>;

const eventBlueprintMap = {
  "civil-ceremony": {
    id: "civil-ceremony",
    label: "Standesamt",
    planningFocus: "Termin, Unterlagen und moegliche Sonderfaelle frueh absichern."
  },
  "free-ceremony": {
    id: "free-ceremony",
    label: "Freie Trauung",
    planningFocus: "Redner:in, Ablauf, Musik und Schlechtwetter-Plan frueh zusammenfuehren."
  },
  celebration: {
    id: "celebration",
    label: "Feier",
    planningFocus: "Venue, Catering, Musik und Ablauf als zusammenhaengenden Haupttag planen."
  },
  brunch: {
    id: "brunch",
    label: "Brunch",
    planningFocus: "Unterkuenfte, Reisewege und lockeren Folgetag fuer Gaeste mitdenken."
  }
} as const satisfies Record<PlannedEventId, EventBlueprint>;

function normalizeTags(values: string[]) {
  return values
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeSearchText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\u00df/g, "ss")
    .replace(/\u00e4/g, "ae")
    .replace(/\u00f6/g, "oe")
    .replace(/\u00fc/g, "ue")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeSearchText(value: string) {
  return normalizeSearchText(value)
    .split(" ")
    .filter(Boolean);
}

function pad(value: number) {
  return value.toString().padStart(2, "0");
}

function subtractMonths(dateString: string, months: number) {
  const [year, month, day] = dateString.split("-").map(Number);

  if (!year || !month || !day) {
    throw new Error("targetDate must use YYYY-MM-DD format");
  }

  const totalMonths = year * 12 + (month - 1) - months;
  const nextYear = Math.floor(totalMonths / 12);
  const nextMonth = (totalMonths % 12) + 1;
  const daysInTargetMonth = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
  const nextDay = Math.min(day, daysInTargetMonth);

  return `${nextYear}-${pad(nextMonth)}-${pad(nextDay)}`;
}

function createBudgetCategories(totalBudget: number): BudgetCategory[] {
  let allocated = 0;

  return budgetBlueprint.map((entry, index) => {
    const plannedAmount =
      index === budgetBlueprint.length - 1
        ? totalBudget - allocated
        : Math.round((totalBudget * entry.percentage) / 100);

    allocated += plannedAmount;

    return {
      category: entry.category,
      label: entry.label,
      plannedAmount,
      rationale: entry.rationale
    };
  });
}

function createMilestones(targetDate: string): PlanningMilestone[] {
  return milestoneBlueprint.map((entry) => ({
    id: entry.id,
    title: entry.title,
    dueDate: subtractMonths(targetDate, entry.monthsBeforeWedding),
    category: entry.category,
    rationale: entry.rationale
  }));
}

function createVendorStarterCategories(): VendorStarterCategory[] {
  return [
    {
      category: "venue",
      label: "Locations",
      whyItMatters: "Die Location setzt Stil, Kapazitaet, Zeitfenster und viele Folgeentscheidungen."
    },
    {
      category: "photography",
      label: "Fotografie",
      whyItMatters: "Fotografie ist stilpraegend und in Kernmonaten oft frueh ausgebucht."
    },
    {
      category: "catering",
      label: "Catering",
      whyItMatters: "Catering skaliert mit Gaestezahl und beeinflusst Budget und Tagesablauf direkt."
    },
    {
      category: "music",
      label: "Musik",
      whyItMatters: "Musik und Moderation bestimmen Energie, Uebergaenge und Abenddramaturgie."
    },
    {
      category: "florals",
      label: "Floristik",
      whyItMatters: "Floristik verbindet Stilprofil, Farbwelt und die Atmosphaere vor Ort."
    },
    {
      category: "attire",
      label: "Styling & Outfit",
      whyItMatters: "Styling, Brautmode und Look-Entscheidungen muessen frueh zum Gesamtbild passen."
    }
  ];
}

function createAdminReminders(targetDate: string): AdminReminder[] {
  return [
    {
      id: "documents-check",
      title: "Standesamt-Unterlagen vorpruefen",
      dueDate: subtractMonths(targetDate, 8),
      category: "legal-admin",
      rationale:
        "Fuer Deutschland sollten Ausweise, Geburtsregister und moegliche Sonderunterlagen frueh geklaert sein."
    },
    {
      id: "civil-registration-window",
      title: "Eheschliessung beim Standesamt anmelden",
      dueDate: subtractMonths(targetDate, 6),
      category: "legal-admin",
      rationale:
        "Die Anmeldung ist in Deutschland typischerweise fruehestens sechs Monate vor dem Termin moeglich."
    }
  ];
}

function createEventBlueprints(plannedEvents: PlannedEventId[]): EventBlueprint[] {
  return plannedEvents.map((eventId) => eventBlueprintMap[eventId]);
}

function formatCurrency(value: number) {
  return value.toLocaleString("de-DE");
}

function formatPriceBandLabel(
  pricingModel: VendorPricingModel,
  priceMin: number,
  priceMax: number,
  baseFeeMin?: number,
  baseFeeMax?: number
) {
  if (pricingModel === "per-person-plus-fixed") {
    const fixedLabel =
      typeof baseFeeMin === "number" && typeof baseFeeMax === "number"
        ? baseFeeMin === baseFeeMax
          ? `${formatCurrency(baseFeeMin)} EUR Raummiete`
          : `${formatCurrency(baseFeeMin)}-${formatCurrency(baseFeeMax)} EUR Grundfee`
        : "Grundfee auf Anfrage";

    return `${formatCurrency(priceMin)}-${formatCurrency(priceMax)} EUR p.P. + ${fixedLabel}`;
  }

  if (pricingModel === "per-person") {
    return `${formatCurrency(priceMin)}-${formatCurrency(priceMax)} EUR p.P.`;
  }

  const prefix = pricingModel === "estimated-total" ? "ca. " : "";
  return `${prefix}${formatCurrency(priceMin)}-${formatCurrency(priceMax)} EUR`;
}

function resolveCoverageAreaIds(region: string) {
  const normalizedRegion = normalizeSearchText(region);
  const coverageAreaIds: string[] = [];

  if (normalizedRegion.includes("berlin")) {
    coverageAreaIds.push("berlin-core");
  }

  if (normalizedRegion.includes("potsdam")) {
    coverageAreaIds.push("potsdam-core");
  }

  if (normalizedRegion.includes("67454") || normalizedRegion.includes("hassloch")) {
    coverageAreaIds.push("67454-radius-40km");
  }

  return coverageAreaIds;
}

function estimateBudgetRange(vendor: VendorSeed, guestCountTarget: number) {
  if (vendor.pricingModel === "per-person") {
    return {
      min: vendor.priceMin * guestCountTarget,
      max: vendor.priceMax * guestCountTarget
    };
  }

  if (vendor.pricingModel === "per-person-plus-fixed") {
    return {
      min: (vendor.baseFeeMin ?? 0) + vendor.priceMin * guestCountTarget,
      max: (vendor.baseFeeMax ?? vendor.baseFeeMin ?? 0) + vendor.priceMax * guestCountTarget
    };
  }

  return {
    min: vendor.priceMin,
    max: vendor.priceMax
  };
}

function hasCoverageAreaMatch(vendor: VendorSeed, coverageAreaIds: string[]) {
  return coverageAreaIds.some((coverageAreaId) => vendor.coverageAreaIds.includes(coverageAreaId));
}

function hasAliasMatch(vendor: VendorSeed, normalizedRegion: string, regionTokens: string[]) {
  return vendor.searchAliases.some((alias) => {
    const normalizedAlias = normalizeSearchText(alias);
    const aliasTokens = normalizedAlias.split(" ").filter(Boolean);

    return (
      normalizedRegion.includes(normalizedAlias) ||
      aliasTokens.some((token) => regionTokens.includes(token))
    );
  });
}

function createVendorMatches(
  profile: WeddingProfile,
  budgetCategories: BudgetCategory[]
): VendorMatch[] {
  const budgetByCategory = new Map(
    budgetCategories.map((category) => [category.category, category.plannedAmount])
  );
  const normalizedRegion = normalizeSearchText(profile.region);
  const regionTokens = tokenizeSearchText(profile.region);
  const coverageAreaIds = resolveCoverageAreaIds(profile.region);

  return curatedVendorSeeds
    .filter(
      (vendor) =>
        hasCoverageAreaMatch(vendor, coverageAreaIds) ||
        hasAliasMatch(vendor, normalizedRegion, regionTokens) ||
        normalizeSearchText(vendor.region) === normalizedRegion
    )
    .map((vendor) => {
      const styleOverlap = vendor.styleTags.filter((style) =>
        profile.stylePreferences.includes(style)
      ).length;
      const guestFit =
        profile.guestCountTarget >= vendor.supportedGuestsMin &&
        profile.guestCountTarget <= vendor.supportedGuestsMax;
      const categoryBudget = budgetByCategory.get(vendor.category);
      const estimatedBudget = estimateBudgetRange(vendor, profile.guestCountTarget);
      const budgetFit =
        typeof categoryBudget === "number" && categoryBudget >= estimatedBudget.min;

      const fitScore =
        50 +
        15 +
        (styleOverlap > 0 ? 10 : 0) +
        (guestFit ? 10 : 0) +
        (budgetFit ? 10 : 0);

      return {
        id: vendor.id,
        name: vendor.name,
        category: vendor.category,
        region: vendor.region,
        fitScore,
        priceBandLabel: formatPriceBandLabel(
          vendor.pricingModel,
          vendor.priceMin,
          vendor.priceMax,
          vendor.baseFeeMin,
          vendor.baseFeeMax
        ),
        reasonSummary: vendor.reasonSummary,
        ...(vendor.city ? { city: vendor.city } : {}),
        ...(vendor.serviceLabel ? { serviceLabel: vendor.serviceLabel } : {}),
        ...(vendor.websiteUrl ? { websiteUrl: vendor.websiteUrl } : {}),
        ...(vendor.portfolioUrl ? { portfolioUrl: vendor.portfolioUrl } : {}),
        ...(vendor.portfolioLabel ? { portfolioLabel: vendor.portfolioLabel } : {}),
        ...(vendor.sourceUrl ? { sourceUrl: vendor.sourceUrl } : {}),
        ...(vendor.sourceLabel ? { sourceLabel: vendor.sourceLabel } : {}),
        ...(vendor.freshnessLabel ? { freshnessLabel: vendor.freshnessLabel } : {}),
        ...(typeof vendor.reviewRatingValue === "number"
          ? { reviewRatingValue: vendor.reviewRatingValue }
          : {}),
        ...(typeof vendor.reviewRatingScale === "number"
          ? { reviewRatingScale: vendor.reviewRatingScale }
          : {}),
        ...(typeof vendor.reviewCount === "number" ? { reviewCount: vendor.reviewCount } : {}),
        ...(vendor.reviewSourceUrl ? { reviewSourceUrl: vendor.reviewSourceUrl } : {}),
        ...(vendor.reviewSourceLabel ? { reviewSourceLabel: vendor.reviewSourceLabel } : {})
      };
    })
    .sort((left, right) => {
      const fitDelta = right.fitScore - left.fitScore;

      if (fitDelta !== 0) {
        return fitDelta;
      }

      const leftReviewScore =
        typeof left.reviewRatingValue === "number" && typeof left.reviewRatingScale === "number"
          ? left.reviewRatingValue / left.reviewRatingScale
          : 0;
      const rightReviewScore =
        typeof right.reviewRatingValue === "number" && typeof right.reviewRatingScale === "number"
          ? right.reviewRatingValue / right.reviewRatingScale
          : 0;
      const reviewDelta = rightReviewScore - leftReviewScore;

      if (reviewDelta !== 0) {
        return reviewDelta;
      }

      const reviewCountDelta = (right.reviewCount ?? 0) - (left.reviewCount ?? 0);

      if (reviewCountDelta !== 0) {
        return reviewCountDelta;
      }

      return 0;
    });
}

function createRuntimeTopology(): RuntimeTopology {
  return {
    aiExecution: "shadow-workstation",
    hosting: "vps-web-api-only",
    note:
      "Inference, Dokumentenverarbeitung und spaetere Modell-Orchestrierung laufen auf Shadow; der VPS hostet Web und API."
  };
}

export function isWeddingBootstrapInput(value: unknown): value is WeddingBootstrapInput {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.coupleName === "string" &&
    typeof candidate.targetDate === "string" &&
    typeof candidate.region === "string" &&
    typeof candidate.guestCountTarget === "number" &&
    typeof candidate.budgetTotal === "number" &&
    Array.isArray(candidate.stylePreferences) &&
    candidate.stylePreferences.every((entry) => typeof entry === "string") &&
    Array.isArray(candidate.noGoPreferences) &&
    candidate.noGoPreferences.every((entry) => typeof entry === "string") &&
    Array.isArray(candidate.plannedEvents) &&
    candidate.plannedEvents.every((entry) => typeof entry === "string")
  );
}

export function createBootstrapPlan(input: WeddingBootstrapInput): WeddingBootstrapPlan {
  const profile: WeddingProfile = {
    coupleName: input.coupleName.trim(),
    targetDate: input.targetDate,
    region: input.region.trim(),
    guestCountTarget: input.guestCountTarget,
    budgetTotal: input.budgetTotal,
    stylePreferences: normalizeTags(input.stylePreferences),
    noGoPreferences: normalizeTags(input.noGoPreferences),
    plannedEvents: input.plannedEvents,
    planningWindowMonths: 12
  };

  const milestones = createMilestones(profile.targetDate);
  const budgetCategories = createBudgetCategories(profile.budgetTotal);

  return {
    profile,
    milestones,
    budgetCategories,
    vendorStarterCategories: createVendorStarterCategories(),
    adminReminders: createAdminReminders(profile.targetDate),
    eventBlueprints: createEventBlueprints(profile.plannedEvents),
    vendorMatches: createVendorMatches(profile, budgetCategories),
    runtimeTopology: createRuntimeTopology(),
    nextSteps: milestones.map((milestone) => milestone.title)
  };
}

export function createPrototypeTasks(plan: WeddingBootstrapPlan): PrototypeTask[] {
  const milestoneTasks = plan.milestones.map((milestone) => ({
    id: milestone.id,
    title: milestone.title,
    dueDate: milestone.dueDate,
    category: milestone.category,
    completed: false,
    sourceType: "milestone" as const
  }));

  const adminTasks = plan.adminReminders.map((reminder) => ({
    id: reminder.id,
    title: reminder.title,
    dueDate: reminder.dueDate,
    category: reminder.category,
    completed: false,
    sourceType: "admin-reminder" as const
  }));

  return [...milestoneTasks, ...adminTasks];
}

export function summarizeGuests(guests: PrototypeGuest[]): PrototypeGuestSummary {
  return guests.reduce<PrototypeGuestSummary>(
    (summary, guest) => {
      summary.total += 1;
      summary[guest.rsvpStatus] += 1;
      return summary;
    },
    {
      total: 0,
      pending: 0,
      attending: 0,
      declined: 0
    }
  );
}

export function calculateProgress(tasks: PrototypeTask[]): PrototypeProgress {
  return {
    completedTasks: tasks.filter((task) => task.completed).length,
    totalTasks: tasks.length
  };
}

export function createPrototypeVendorTracker(
  vendorMatches: VendorMatch[],
  updatedAt = new Date().toISOString()
): PrototypeVendorTrackerEntry[] {
  return vendorMatches.map((vendor) => ({
    vendorId: vendor.id,
    stage: "suggested",
    quoteAmount: null,
    note: "",
    updatedAt
  }));
}

export function mergePrototypeVendorTracker(
  current: PrototypeVendorTrackerEntry[],
  vendorMatches: VendorMatch[],
  updatedAt = new Date().toISOString()
): PrototypeVendorTrackerEntry[] {
  const currentByVendorId = new Map(current.map((entry) => [entry.vendorId, entry]));

  return vendorMatches.map((vendor) => {
    const existing = currentByVendorId.get(vendor.id);

    if (existing) {
      return existing;
    }

    return {
      vendorId: vendor.id,
      stage: "suggested" as const,
      quoteAmount: null,
      note: "",
      updatedAt
    };
  });
}

export function calculateBudgetOverview(
  budgetCategories: BudgetCategory[],
  expenses: PrototypeExpense[]
): PrototypeBudgetOverview {
  const categories = budgetCategories.map((category) => {
    const matchingExpenses = expenses.filter((expense) => expense.category === category.category);
    const committed = matchingExpenses
      .filter((expense) => expense.status === "booked" || expense.status === "paid")
      .reduce((sum, expense) => sum + expense.amount, 0);
    const paid = matchingExpenses
      .filter((expense) => expense.status === "paid")
      .reduce((sum, expense) => sum + expense.amount, 0);

    return {
      category: category.category,
      label: category.label,
      planned: category.plannedAmount,
      committed,
      paid,
      remaining: category.plannedAmount - committed
    };
  });

  const overall = categories.reduce(
    (summary, category) => ({
      planned: summary.planned + category.planned,
      committed: summary.committed + category.committed,
      paid: summary.paid + category.paid,
      remaining: summary.remaining + category.remaining
    }),
    {
      planned: 0,
      committed: 0,
      paid: 0,
      remaining: 0
    }
  );

  return {
    overall,
    categories
  };
}

function hasCompleteProfile(workspace: PrototypeWorkspace) {
  const profile = workspace.onboarding;

  return (
    profile.coupleName.trim().length > 0 &&
    profile.targetDate.trim().length > 0 &&
    profile.region.trim().length > 0 &&
    profile.guestCountTarget > 0 &&
    profile.budgetTotal > 0 &&
    profile.plannedEvents.length > 0
  );
}

function hasVenueProgress(workspace: PrototypeWorkspace) {
  const venueVendorIds = new Set(
    workspace.plan.vendorMatches
      .filter((vendor) => vendor.category === "venue")
      .map((vendor) => vendor.id)
  );

  return (
    workspace.vendorTracker.some(
      (entry) => venueVendorIds.has(entry.vendorId) && entry.stage !== "suggested"
    ) ||
    workspace.expenses.some((expense) => expense.category === "venue")
  );
}

function hasCoreVendorProgress(workspace: PrototypeWorkspace) {
  const vendorCategoryById = new Map(
    workspace.plan.vendorMatches.map((vendor) => [vendor.id, vendor.category])
  );
  const engagedCategories = new Set<
    Extract<VendorMatch["category"], "photography" | "catering" | "music" | "florals" | "attire">
  >();

  for (const entry of workspace.vendorTracker) {
    if (entry.stage === "suggested") {
      continue;
    }

    const category = vendorCategoryById.get(entry.vendorId);

    if (
      category === "photography" ||
      category === "catering" ||
      category === "music" ||
      category === "florals" ||
      category === "attire"
    ) {
      engagedCategories.add(category);
    }
  }

  for (const expense of workspace.expenses) {
    if (
      expense.category === "photography" ||
      expense.category === "catering" ||
      expense.category === "music" ||
      expense.category === "florals" ||
      expense.category === "attire"
    ) {
      engagedCategories.add(expense.category);
    }
  }

  return engagedCategories.size >= 2;
}

function hasGuestExperienceProgress(workspace: PrototypeWorkspace) {
  return workspace.guests.length > 0;
}

function hasLegalAdminProgress(workspace: PrototypeWorkspace) {
  const adminTasks = workspace.tasks.filter((task) => task.category === "legal-admin");

  return adminTasks.length > 0 && adminTasks.every((task) => task.completed);
}

function hasFinalControlRoomProgress(workspace: PrototypeWorkspace) {
  return workspace.tasks.length > 0 && workspace.tasks.every((task) => task.completed);
}

function createGuidedPlanningHeadline(stepId: GuidedPlanningStepId, workspace: PrototypeWorkspace) {
  switch (stepId) {
    case "foundation":
      return "Wir starten mit den Eckdaten, damit die Planung nicht ins Leere laeuft.";
    case "venue-and-date":
      return `Euer naechster Hebel ist jetzt die Location in ${workspace.onboarding.region}.`;
    case "core-vendors":
      return "Venue-Fit steht, jetzt ziehen Foto, Catering, Musik, Floristik und Styling mit echten Preisankern nach.";
    case "guest-experience":
      return "Jetzt wird aus Planung echte Kommunikation: Guestlist, Haushalte und RSVP.";
    case "legal-admin":
      return "Parallel zur Orga sichern wir jetzt die Standesamt- und Admin-Spur ab.";
    case "final-control-room":
      return "Jetzt geht die Planung in den Durchfuehrungsmodus mit finalem Control Room.";
  }
}

export function createGuidedPlanningSession(
  workspace: PrototypeWorkspace
): GuidedPlanningSession {
  const foundationDone = hasCompleteProfile(workspace);
  const venueDone = hasVenueProgress(workspace);
  const coreVendorsDone = hasCoreVendorProgress(workspace);
  const guestExperienceDone = hasGuestExperienceProgress(workspace);
  const legalAdminDone = hasLegalAdminProgress(workspace);
  const finalControlRoomDone = hasFinalControlRoomProgress(workspace);

  const statusById: Record<GuidedPlanningStepId, GuidedPlanningStepStatus> = {
    foundation: foundationDone ? "done" : "active",
    "venue-and-date": "upcoming",
    "core-vendors": "upcoming",
    "guest-experience": "upcoming",
    "legal-admin": "upcoming",
    "final-control-room": "upcoming"
  };

  if (statusById.foundation === "done") {
    statusById["venue-and-date"] = venueDone ? "done" : "active";
  }

  if (statusById["venue-and-date"] === "done") {
    statusById["core-vendors"] = coreVendorsDone ? "done" : "active";
  }

  if (statusById["core-vendors"] === "done") {
    statusById["guest-experience"] = guestExperienceDone ? "done" : "active";
  }

  if (statusById["guest-experience"] === "done") {
    statusById["legal-admin"] = legalAdminDone ? "done" : "active";
  }

  if (statusById["legal-admin"] === "done") {
    statusById["final-control-room"] = finalControlRoomDone ? "done" : "active";
  }

  const currentStepId =
    (Object.entries(statusById).find(([, status]) => status === "active")?.[0] as
      | GuidedPlanningStepId
      | undefined) ?? "final-control-room";

  const guestCompletionPercent =
    workspace.plan.profile.guestCountTarget > 0
      ? Math.round((workspace.guests.length / workspace.plan.profile.guestCountTarget) * 100)
      : 0;

  const steps: GuidedPlanningStep[] = [
    {
      id: "foundation",
      title: "Fundament klaeren",
      status: statusById.foundation,
      focusArea: "profile",
      primaryActionLabel: "Profil pruefen",
      summary: "Datum, Region, Budget und Eventform muessen als belastbare Basis sitzen.",
      coachBrief:
        "Ohne klare Eckdaten plant ihr in die falsche Richtung. Hier entscheidet sich, welche Vendors, Fristen und Budgets ueberhaupt Sinn ergeben.",
      checklist: [
        `Datum: ${workspace.onboarding.targetDate}`,
        `Region: ${workspace.onboarding.region}`,
        `Budget: ${workspace.onboarding.budgetTotal.toLocaleString("de-DE")} EUR`
      ]
    },
    {
      id: "venue-and-date",
      title: "Location und Datum festziehen",
      status: statusById["venue-and-date"],
      focusArea: "vendors",
      primaryActionLabel: "Location-Shortlist oeffnen",
      summary: "Die Location ist der groesste Hebel fuer Stil, Kapazitaet, Ablauf und Folgekosten.",
      coachBrief:
        "Vergleicht zuerst die passendsten Locations, setzt mindestens eine auf Kontaktiert und sammelt die ersten harten Rueckmeldungen, bevor ihr weitere Vendoren finalisiert.",
      checklist: [
        "Top-3 Venue-Matches vergleichen",
        "Mindestens eine Venue-Anfrage oder Kontaktaufnahme setzen",
        "Datums- und Kapazitaetsfit absichern"
      ]
    },
    {
      id: "core-vendors",
      title: "Kern-Vendoren absichern",
      status: statusById["core-vendors"],
      focusArea: "budget",
      primaryActionLabel: "Quotes einpflegen",
      summary:
        "Nach der Venue folgen die naechsten Vendor-Bloecke, damit Budget, Stil und Verfuegbarkeit realistisch werden.",
      coachBrief:
        "Sobald Venue-Fit da ist, braucht ihr zwei bis drei echte Preisanker aus mehreren Vendor-Kategorien. Erst damit wird aus Budgetwunsch eine tragfaehige Planung.",
      checklist: [
        "Mindestens zwei Vendor-Kategorien auf Kontaktiert oder Angebot setzen",
        "Mindestens zwei Quotes oder belastbare Preisanker im Tracker pflegen",
        "Budget-Rest gegen echte Angebote und Preisbilder pruefen"
      ]
    },
    {
      id: "guest-experience",
      title: "Gaeste und RSVP aufsetzen",
      status: statusById["guest-experience"],
      focusArea: "guests",
      primaryActionLabel: "Guestlist starten",
      summary: "Jetzt wird aus Orga Kommunikation: Haushalte, Einladungen und Rueckmeldungen.",
      coachBrief:
        "Legt zuerst die Kern-Gaeste an und nutzt dann die oeffentlichen RSVP-Links. So bekommt ihr frueh ein echtes Bild fuer Catering und Ablauf.",
      checklist: [
        `${workspace.guests.length} von ${workspace.plan.profile.guestCountTarget} Gaesten angelegt`,
        `${guestCompletionPercent}% der Ziel-Gaeste sind schon im Workspace`,
        "Erste RSVP-Links an Testgaeste pruefen"
      ]
    },
    {
      id: "legal-admin",
      title: "Standesamt und Admin sichern",
      status: statusById["legal-admin"],
      focusArea: "admin",
      primaryActionLabel: "Admin-Fristen oeffnen",
      summary: "DACH- und Deutschland-Fristen muessen parallel zur Feierplanung sauber laufen.",
      coachBrief:
        "Dieser Block ist kein Spaeter-Thema. Wenn Dokumente und Meldefenster verrutschen, bringt euch auch die beste Feierplanung nichts.",
      checklist: workspace.plan.adminReminders.map(
        (reminder) => `${reminder.title} bis ${reminder.dueDate}`
      )
    },
    {
      id: "final-control-room",
      title: "Finalen Control Room fahren",
      status: statusById["final-control-room"],
      focusArea: "timeline",
      primaryActionLabel: "Control Room oeffnen",
      summary: "Zum Schluss fuehrt euch der Copilot durch offene Tasks, Restzahlungen und den Hochzeitstag selbst.",
      coachBrief:
        "Hier verdichten wir alles auf eine letzte Durchfuehrungsrunde: offene To-dos, Ansprechpartner, Timings, Restzahlungen und Plan B.",
      checklist: [
        `${workspace.progress.completedTasks}/${workspace.progress.totalTasks} Tasks erledigt`,
        `${workspace.expenses.length} Budget-Eintraege erfasst`,
        `${workspace.vendorTracker.filter((entry) => entry.stage === "booked").length} Vendoren als gebucht markiert`
      ]
    }
  ];

  return {
    headline: createGuidedPlanningHeadline(currentStepId, workspace),
    currentStepId,
    steps
  };
}

export function createPrototypeWorkspaceProfile(
  workspace: PrototypeWorkspace
): PrototypeWorkspaceProfile {
  const guidedSession = createGuidedPlanningSession(workspace);
  const currentStep =
    guidedSession.steps.find((step) => step.id === guidedSession.currentStepId) ??
    guidedSession.steps[0];

  return {
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
    currentStepTitle: currentStep?.title ?? guidedSession.currentStepId
  };
}

function formatNameList(values: string[]) {
  if (values.length === 0) {
    return "aktuell noch ohne konkrete Empfehlung";
  }

  if (values.length === 1) {
    return values[0] ?? "";
  }

  if (values.length === 2) {
    return `${values[0]} und ${values[1]}`;
  }

  return `${values.slice(0, -1).join(", ")} und ${values[values.length - 1]}`;
}

function getTopVendorMatches(
  workspace: PrototypeWorkspace,
  category: VendorMatch["category"],
  limit = 3
) {
  return workspace.plan.vendorMatches.filter((vendor) => vendor.category === category).slice(0, limit);
}

function getAllVendorMatches(workspace: PrototypeWorkspace, category: VendorMatch["category"]) {
  return workspace.plan.vendorMatches.filter((vendor) => vendor.category === category);
}

function getTrackedVendorCount(
  workspace: PrototypeWorkspace,
  category: VendorMatch["category"],
  stages: PrototypeVendorStage[]
) {
  const vendorIds = new Set(
    workspace.plan.vendorMatches
      .filter((vendor) => vendor.category === category)
      .map((vendor) => vendor.id)
  );

  return workspace.vendorTracker.filter(
    (entry) => vendorIds.has(entry.vendorId) && stages.includes(entry.stage)
  ).length;
}

function hasAnyKeyword(normalizedText: string, keywords: string[]) {
  return keywords.some((keyword) => normalizedText.includes(keyword));
}

function isVenueListRequest(normalizedText: string) {
  return (
    hasAnyKeyword(normalizedText, [
      "venue",
      "venues",
      "location",
      "locations",
      "lokation",
      "lokations"
    ]) &&
    hasAnyKeyword(normalizedText, [
      "liste",
      "list",
      "alle",
      "uebersicht",
      "zeig",
      "nah",
      "nahe",
      "naehe",
      "umkreis"
    ])
  );
}

function formatVendorListForChat(matches: VendorMatch[]) {
  if (matches.length === 0) {
    return "aktuell noch keine sichtbaren Venue-Matches";
  }

  return matches
    .map((vendor, index) => {
      const cityLabel = vendor.city ? ` in ${vendor.city}` : "";
      const serviceLabel = vendor.serviceLabel ? `, ${vendor.serviceLabel}` : "";
      const reviewLabel =
        typeof vendor.reviewRatingValue === "number" && typeof vendor.reviewRatingScale === "number"
          ? `, Bewertung ${vendor.reviewRatingValue.toLocaleString("de-DE")}/${vendor.reviewRatingScale}${
              typeof vendor.reviewCount === "number" ? ` bei ${vendor.reviewCount} Reviews` : ""
            }`
          : "";

      return `${index + 1}. ${vendor.name}${cityLabel} (${vendor.priceBandLabel}${serviceLabel}${reviewLabel})`;
    })
    .join(" ");
}

function getActionOptions(stepId: GuidedPlanningStepId): WeddingConsultantReplyOption[] {
  switch (stepId) {
    case "foundation":
      return [
        { id: "foundation-budget", label: "Bitte Budget ehrlich einsortieren" },
        { id: "foundation-style", label: "Hilf uns beim Stilprofil" },
        { id: "foundation-next", label: "Wir gehen direkt zur Location" }
      ];
    case "venue-and-date":
      return [
        { id: "venue-style-fit", label: "Welche Location passt atmosphaerisch am besten?" },
        { id: "venue-budget-fit", label: "Bitte auf Location vs. Budget schauen" },
        { id: "venue-shortlist", label: "Mach uns eine Venue-Shortlist" },
        { id: "venue-next", label: "Okay, weiter zu den Vendoren" }
      ];
    case "core-vendors":
      return [
        { id: "vendors-photo-first", label: "Sollen wir Foto zuerst sichern?" },
        { id: "vendors-catering-first", label: "Lass uns Catering priorisieren" },
        { id: "vendors-budget-check", label: "Wie kritisch ist das Budget jetzt?" },
        { id: "vendors-next", label: "Wir gehen weiter zu den Gaesten" }
      ];
    case "guest-experience":
      return [
        { id: "guests-start-list", label: "Wie starten wir die Guestlist am besten?" },
        { id: "guests-rsvp-test", label: "Ich will den RSVP-Flow testen" },
        { id: "guests-count-check", label: "Bitte Ziel-Gaestezahl einordnen" },
        { id: "guests-next", label: "Weiter zu Standesamt und Admin" }
      ];
    case "legal-admin":
      return [
        { id: "admin-documents", label: "Welche Unterlagen sind als Naechstes relevant?" },
        { id: "admin-deadlines", label: "Zeig mir die wichtigsten Fristen" },
        { id: "admin-special-cases", label: "Was waere bei Sonderfaellen wichtig?" },
        { id: "admin-next", label: "Wir gehen in die finale Phase" }
      ];
    case "final-control-room":
      return [
        { id: "final-open-tasks", label: "Was wuerdest du jetzt zuerst absichern?" },
        { id: "final-budget-check", label: "Mach einen letzten Budget-Check" },
        { id: "final-day-brief", label: "Brief uns fuer den Hochzeitstag" }
      ];
  }
}

function inferActionIdFromReply(stepId: GuidedPlanningStepId, input: WeddingConsultantReplyInput) {
  if (input.actionId) {
    return input.actionId;
  }

  const normalizedText = normalizeSearchText(input.text ?? "");

  if (isVenueListRequest(normalizedText)) {
    return "venue-list-all";
  }

  if (stepId === "foundation") {
    if (normalizedText.includes("budget") || normalizedText.includes("kosten")) {
      return "foundation-budget";
    }

    if (normalizedText.includes("stil") || normalizedText.includes("romant") || normalizedText.includes("modern")) {
      return "foundation-style";
    }

    if (
      hasAnyKeyword(normalizedText, [
        "weiter",
        "naechst",
        "next",
        "direkt",
        "location",
        "venue",
        "termin"
      ])
    ) {
      return "foundation-next";
    }

    return "foundation-clarify";
  }

  if (stepId === "venue-and-date") {
    if (normalizedText.includes("budget") || normalizedText.includes("teuer") || normalizedText.includes("kosten")) {
      return "venue-budget-fit";
    }

    if (normalizedText.includes("stil") || normalizedText.includes("atmos") || normalizedText.includes("romant")) {
      return "venue-style-fit";
    }

    if (normalizedText.includes("short") || normalizedText.includes("vergleich") || normalizedText.includes("location")) {
      return "venue-shortlist";
    }

    if (hasAnyKeyword(normalizedText, ["weiter", "naechst", "next", "foto", "catering"])) {
      return "venue-next";
    }

    return "venue-clarify";
  }

  if (stepId === "core-vendors") {
    if (normalizedText.includes("foto") || normalizedText.includes("kamera")) {
      return "vendors-photo-first";
    }

    if (normalizedText.includes("catering") || normalizedText.includes("essen")) {
      return "vendors-catering-first";
    }

    if (normalizedText.includes("budget") || normalizedText.includes("kosten")) {
      return "vendors-budget-check";
    }

    if (hasAnyKeyword(normalizedText, ["weiter", "naechst", "next", "gaeste", "guest", "rsvp"])) {
      return "vendors-next";
    }

    return "vendors-clarify";
  }

  if (stepId === "guest-experience") {
    if (normalizedText.includes("rsvp") || normalizedText.includes("einladung")) {
      return "guests-rsvp-test";
    }

    if (normalizedText.includes("gaestezahl") || normalizedText.includes("gaeste") || normalizedText.includes("haushalt")) {
      return "guests-start-list";
    }

    if (normalizedText.includes("ziel") || normalizedText.includes("anzahl")) {
      return "guests-count-check";
    }

    if (hasAnyKeyword(normalizedText, ["weiter", "naechst", "next", "standesamt", "admin", "dokument", "frist"])) {
      return "guests-next";
    }

    return "guests-clarify";
  }

  if (stepId === "legal-admin") {
    if (normalizedText.includes("frist") || normalizedText.includes("deadline")) {
      return "admin-deadlines";
    }

    if (normalizedText.includes("sonder") || normalizedText.includes("ausland") || normalizedText.includes("urkunde")) {
      return "admin-special-cases";
    }

    if (normalizedText.includes("unterlag") || normalizedText.includes("dokument")) {
      return "admin-documents";
    }

    if (hasAnyKeyword(normalizedText, ["weiter", "naechst", "next", "final", "endspurt", "control room", "timeline"])) {
      return "admin-next";
    }

    return "admin-clarify";
  }

  if (normalizedText.includes("budget") || normalizedText.includes("kosten")) {
    return "final-budget-check";
  }

  if (normalizedText.includes("tag") || normalizedText.includes("ablauf") || normalizedText.includes("timeline")) {
    return "final-day-brief";
  }

  if (hasAnyKeyword(normalizedText, ["offen", "todo", "aufgabe", "prioritaet"])) {
    return "final-open-tasks";
  }

  return "final-clarify";
}

function createOpeningMessage(workspace: PrototypeWorkspace, stepId: GuidedPlanningStepId) {
  const guidedSession = createGuidedPlanningSession(workspace);
  const venueNames = formatNameList(
    getTopVendorMatches(workspace, "venue").map((vendor) => vendor.name)
  );

  switch (stepId) {
    case "foundation":
      return `Ich nehme euch jetzt wie in einer echten Beratung an die Hand. Fuer ${workspace.coupleName} halte ich erst das Fundament fest: ${workspace.onboarding.targetDate}, ${workspace.onboarding.region}, ${workspace.onboarding.guestCountTarget} Gaeste und ${workspace.onboarding.budgetTotal.toLocaleString("de-DE")} EUR. Was wollt ihr daran als Erstes gemeinsam scharfziehen?`;
    case "venue-and-date":
      return `Ich wuerde mit euch jetzt ganz bewusst die Location-Schicht sauber ziehen. Fuer ${workspace.onboarding.region} sehe ich aktuell ${venueNames} als erste relevante Gespraeche. ${guidedSession.headline} Was ist euch bei der Location gerade am wichtigsten?`;
    case "core-vendors":
      return `Gut, dann gehen wir wie in einer Beratung in die naechsten echten Vendor-Bloecke: Foto, Catering, Musik, Floristik und Styling. Sobald ihr dort Preisanker habt, wird der Plan belastbar. Womit soll ich euch zuerst durchfuehren?`;
    case "guest-experience":
      return `Jetzt kippt die Planung in Kommunikation. Ich wuerde mit euch jetzt Guestlist, Haushalte und RSVP so aufsetzen, dass Catering und Ablauf spaeter nicht raten muessen. Wo wollt ihr anfangen?`;
    case "legal-admin":
      return `Jetzt sichern wir parallel die Standesamt- und Admin-Spur. Das ist genau der Teil, den Paare gerne zu spaet anfassen. Wobei soll ich euch zuerst beraten?`;
    case "final-control-room":
      return `Ihr seid jetzt im letzten Beratungsabschnitt: offene Punkte, Restzahlungen, Ansprechpartner und Hochzeitstag. Ich kann euch jetzt wie eine Schlussbesprechung durch den Endspurt fuehren. Was braucht ihr zuerst?`;
  }
}

export function createWeddingConsultantOpening(
  workspace: PrototypeWorkspace,
  stepId = createGuidedPlanningSession(workspace).currentStepId
): WeddingConsultantTurn {
  const guidedSession = createGuidedPlanningSession(workspace);
  const activeStep =
    guidedSession.steps.find((step) => step.id === stepId) ??
    guidedSession.steps.find((step) => step.id === guidedSession.currentStepId);

  return {
    stepId,
    focusArea: activeStep?.focusArea ?? "timeline",
    assistantMessage: createOpeningMessage(workspace, stepId),
    suggestedReplies: getActionOptions(stepId)
  };
}

export function continueWeddingConsultantConversation(
  workspace: PrototypeWorkspace,
  stepId: GuidedPlanningStepId,
  input: WeddingConsultantReplyInput
): WeddingConsultantTurn {
  const actionId = inferActionIdFromReply(stepId, input);
  const venueBudget = workspace.plan.budgetCategories.find((item) => item.category === "venue");
  const photoBudget = workspace.plan.budgetCategories.find((item) => item.category === "photography");
  const cateringBudget = workspace.plan.budgetCategories.find((item) => item.category === "catering");
  const legalAdminDone = hasLegalAdminProgress(workspace);
  const topVenueNames = formatNameList(
    getTopVendorMatches(workspace, "venue").map((vendor) => vendor.name)
  );
  const allVenueMatches = formatVendorListForChat(getAllVendorMatches(workspace, "venue"));
  const topPhotoNames = formatNameList(
    getTopVendorMatches(workspace, "photography").map((vendor) => vendor.name)
  );
  const topCateringNames = formatNameList(
    getTopVendorMatches(workspace, "catering").map((vendor) => vendor.name)
  );

  switch (actionId) {
    case "foundation-clarify":
      return {
        stepId: "foundation",
        focusArea: "profile",
        assistantMessage: `Ich bleibe gerade noch beim Fundament und springe nicht blind weiter. Wenn ihr wollt, sortieren wir jetzt Budget, Stilprofil oder den sauberen Start in die Venue-Suche.`,
        suggestedReplies: getActionOptions("foundation")
      };
    case "foundation-budget":
      return {
        stepId: "foundation",
        focusArea: "budget",
        assistantMessage: `Wenn ich euch ehrlich berate, dann muessen wir aus ${workspace.onboarding.budgetTotal.toLocaleString("de-DE")} EUR zuerst einen machbaren Rahmen machen. Aktuell liegen davon ${venueBudget?.plannedAmount.toLocaleString("de-DE") ?? "0"} EUR auf Venue, ${cateringBudget?.plannedAmount.toLocaleString("de-DE") ?? "0"} EUR auf Catering und ${photoBudget?.plannedAmount.toLocaleString("de-DE") ?? "0"} EUR auf Foto. Bevor ihr weiter springt, sollte sich das fuer euch realistisch anfuehlen.`,
        suggestedReplies: getActionOptions("foundation")
      };
    case "foundation-style":
      return {
        stepId: "foundation",
        focusArea: "profile",
        assistantMessage: `Euer aktuelles Stilprofil wirkt auf mich wie ${workspace.onboarding.stylePreferences.join(" und ")}. Das ist schon brauchbar, aber ich wuerde es spaeter noch mit Bildsprache, No-Gos und Atmosphaere schaerfen, damit Venue, Foto und Deko nicht in unterschiedliche Richtungen laufen.`,
        suggestedReplies: getActionOptions("foundation")
      };
    case "foundation-next":
      return {
        stepId: "venue-and-date",
        focusArea: "vendors",
        assistantMessage: `Perfekt, dann gehen wir direkt in die erste echte Beratungsentscheidung: Venue. Fuer euer Profil wuerde ich jetzt ${topVenueNames} als erste Wave ansehen. Soll ich eher nach Stimmung, nach Budget oder nach einer praktischen Shortlist mit euch gehen?`,
        suggestedReplies: getActionOptions("venue-and-date")
      };
    case "venue-style-fit":
      return {
        stepId: "venue-and-date",
        focusArea: "vendors",
        assistantMessage: `Wenn ich nur auf Atmosphaere und Stil schaue, sehe ich fuer euch aktuell ${topVenueNames} vorne. Rebe Deidesheim wirkt fuer natuerlich-romantisch am rundesten, THE SPACE eher urbaner und kompakter, Hambacher Schloss klarer in Richtung grosse Kulisse. Ich wuerde euch zuerst diese drei gegeneinander halten lassen.`,
        suggestedReplies: getActionOptions("venue-and-date")
      };
    case "venue-budget-fit":
      return {
        stepId: "venue-and-date",
        focusArea: "budget",
        assistantMessage: `Budgetseitig habt ihr fuer die Location aktuell rund ${venueBudget?.plannedAmount.toLocaleString("de-DE") ?? "0"} EUR vorgesehen. Das ist fuer THE SPACE eher entspannt, fuer Rebe Deidesheim noch plausibel und fuer groessere Schloss- oder Hotelmodelle schnell enger. Genau deshalb sollte Venue jetzt vor Musik, Deko oder Nice-to-haves sauber sitzen.`,
        suggestedReplies: getActionOptions("venue-and-date")
      };
    case "venue-shortlist":
      return {
        stepId: "venue-and-date",
        focusArea: "vendors",
        assistantMessage: `Meine erste Venue-Shortlist fuer euch waere: 1. Rebe Deidesheim fuer Weinberg- und Romantik-Fit, 2. THE SPACE fuer einen moderneren, kompakteren Rahmen, 3. Hambacher Schloss fuer den grossen Bildmoment. Wenn ihr jetzt eine davon auf Kontaktiert setzt, wird der Rest der Planung sofort konkreter.`,
        suggestedReplies: getActionOptions("venue-and-date")
      };
    case "venue-list-all":
      return {
        stepId: "venue-and-date",
        focusArea: "vendors",
        assistantMessage: `Klar, ich bleibe bei eurer Venue-Liste. Rund um ${workspace.onboarding.region} sehe ich aktuell: ${allVenueMatches}. Wenn ihr wollt, sortiere ich sie als Naechstes mit euch nach Budget, Stil oder Passung fuer ${workspace.plan.profile.guestCountTarget} Gaeste.`,
        suggestedReplies: getActionOptions("venue-and-date")
      };
    case "venue-clarify":
      return {
        stepId: "venue-and-date",
        focusArea: "vendors",
        assistantMessage: `Ich bleibe gerade bei euren Locations und gehe nicht automatisch weiter. Wenn ihr wollt, schaue ich jetzt auf Budget-Fit, Atmosphaere oder ich ziehe euch die komplette Venue-Liste rund um ${workspace.onboarding.region} sauber auf.`,
        suggestedReplies: getActionOptions("venue-and-date")
      };
    case "venue-next":
      return {
        stepId: "core-vendors",
        focusArea: "vendors",
        assistantMessage: `Gut, dann gehen wir wie in einem echten Beratungsgespraech in die zweite Welle: Foto, Catering, Musik, Floristik und Styling. Aktuell sehe ich ${topPhotoNames} bei Foto und ${topCateringNames} bei Catering als erste Preisanker. Womit soll ich euch zuerst helfen?`,
        suggestedReplies: getActionOptions("core-vendors")
      };
    case "vendors-photo-first":
      return {
        stepId: "core-vendors",
        focusArea: "vendors",
        assistantMessage: `Foto zuerst ist oft klug, weil Stil und Erinnerungswert spaeter nichts reparieren. Fuer euch wirken ${topPhotoNames} aktuell am passendsten. Wenn ihr nur einen ersten Kontakt startet, wuerde ich mit dem fotografischen Stil anfangen, der sich am engsten an euer Venue-Gefuehl andockt.`,
        suggestedReplies: getActionOptions("core-vendors")
      };
    case "vendors-catering-first":
      return {
        stepId: "core-vendors",
        focusArea: "vendors",
        assistantMessage: `Catering zuerst ist die vernuenftige Beratungsroute, wenn ihr schnell Kostenklarheit braucht. Mit ${topCateringNames} habt ihr schon gute erste Preisanker. Gerade bei ${workspace.plan.profile.guestCountTarget} Gaesten lohnt sich hier ein frueher Realitaetscheck besonders.`,
        suggestedReplies: getActionOptions("core-vendors")
      };
    case "vendors-budget-check":
      return {
        stepId: "core-vendors",
        focusArea: "budget",
        assistantMessage: `Im Moment ist euer Budget noch theoretisch. Ernst wird es erst, wenn nach der Venue weitere Vendor-Kategorien echte Zahlen bekommen. Ich wuerde erst ruhig werden, wenn mindestens zwei Quotes im Tracker stehen. Aktuell habt ihr ${getTrackedVendorCount(workspace, "photography", ["quoted", "booked"])} Foto- und ${getTrackedVendorCount(workspace, "catering", ["quoted", "booked"])} Catering-Angebote belastbar drin.`,
        suggestedReplies: getActionOptions("core-vendors")
      };
    case "vendors-clarify":
      return {
        stepId: "core-vendors",
        focusArea: "vendors",
        assistantMessage: `Ich bleibe in diesem Block bei euren Vendoren, statt euch blind weiterzuschieben. Wenn ihr wollt, priorisieren wir jetzt Foto, Catering oder schauen direkt auf Musik, Floristik, Styling oder einen ehrlichen Budget-Realitaetscheck.`,
        suggestedReplies: getActionOptions("core-vendors")
      };
    case "vendors-next":
      return {
        stepId: "guest-experience",
        focusArea: "guests",
        assistantMessage: `Super, dann wechseln wir vom Einkauf in die Kommunikation. Der naechste Beratungsblock ist jetzt Guestlist und RSVP, damit Catering, Budget und Ablauf nicht ins Blaue planen muessen. Wo wollt ihr zuerst rein?`,
        suggestedReplies: getActionOptions("guest-experience")
      };
    case "guests-start-list":
      return {
        stepId: "guest-experience",
        focusArea: "guests",
        assistantMessage: `Ich wuerde nicht mit einer endlosen Voll-Liste anfangen, sondern mit euren sicheren Kern-Haushalten. Damit bekommt ihr schnell ein vernuenftiges Gefuehl fuer die echte Groessenordnung. Aktuell sind ${workspace.guests.length} von ${workspace.plan.profile.guestCountTarget} Zielgaesten im Workspace angelegt.`,
        suggestedReplies: getActionOptions("guest-experience")
      };
    case "guests-rsvp-test":
      return {
        stepId: "guest-experience",
        focusArea: "guests",
        assistantMessage: `Sehr gute Beratungsentscheidung. Ich wuerde genau jetzt ein bis zwei Testgaeste anlegen, den oeffentlichen RSVP-Link pruegeln und schauen, ob Antwort, Essenswahl und Nachricht fuer euch natuerlich wirken. Erst dann skaliert man den Flow guten Gewissens aus.`,
        suggestedReplies: getActionOptions("guest-experience")
      };
    case "guests-count-check":
      return {
        stepId: "guest-experience",
        focusArea: "guests",
        assistantMessage: `Bei ${workspace.plan.profile.guestCountTarget} Zielgaesten solltet ihr relativ frueh in A-, B- und eventuell Puffer-Gruppen denken. Sonst laufen Venue, Catering und Budget zu lange auf einer Hoffnung, nicht auf einer belastbaren Zahl.`,
        suggestedReplies: getActionOptions("guest-experience")
      };
    case "guests-clarify":
      return {
        stepId: "guest-experience",
        focusArea: "guests",
        assistantMessage: `Ich bleibe hier noch bei Guestlist und RSVP, bevor wir in den Admin-Teil springen. Wenn ihr wollt, schauen wir auf Listenaufbau, Test-RSVPs oder die realistische Ziel-Gaestezahl.`,
        suggestedReplies: getActionOptions("guest-experience")
      };
    case "guests-next":
      return {
        stepId: "legal-admin",
        focusArea: "admin",
        assistantMessage: `Dann gehen wir jetzt in den Teil, den gute Hochzeitsberater nie liegen lassen: Standesamt, Dokumente und Fristen. Hier will ich euch lieber frueh entspannen als spaet beruhigen. Wo soll ich zuerst mit euch reingehen?`,
        suggestedReplies: getActionOptions("legal-admin")
      };
    case "admin-documents":
      return {
        stepId: "legal-admin",
        focusArea: "admin",
        assistantMessage: `Als naechstes wuerde ich fuer euch die Dokumentenspur sauber machen: Ausweise, Geburtsregister und alles, was bei Sonderfaellen dazu kommt. Gerade wenn irgendwo Auslandsbezug, Namensfuehrung oder fremdsprachige Unterlagen drin haengen, sollte das frueh sichtbar sein.`,
        suggestedReplies: getActionOptions("legal-admin")
      };
    case "admin-deadlines":
      return {
        stepId: "legal-admin",
        focusArea: "admin",
        assistantMessage: `Eure wichtigste sichtbare Frist ist aktuell ${legalAdminDone ? "bereits abgedeckt" : workspace.plan.adminReminders.map((reminder) => `${reminder.title} bis ${reminder.dueDate}`).join(" und ")}. Diese Schiene darf neben der Feierplanung nicht nach hinten rutschen.`,
        suggestedReplies: getActionOptions("legal-admin")
      };
    case "admin-special-cases":
      return {
        stepId: "legal-admin",
        focusArea: "admin",
        assistantMessage: `Bei Sonderfaellen denke ich sofort an Auslandsbezug, Uebersetzungen, Apostille oder abweichende Registerunterlagen. Genau dort hilft spaete Improvisation am wenigsten. Wenn so etwas bei euch relevant ist, sollte die App euch spaeter aktiv durch diesen Pfad fuehren.`,
        suggestedReplies: getActionOptions("legal-admin")
      };
    case "admin-clarify":
      return {
        stepId: "legal-admin",
        focusArea: "admin",
        assistantMessage: `Ich bleibe hier noch auf der Standesamt- und Admin-Spur, statt schon in den Endspurt zu springen. Wenn ihr wollt, sortieren wir jetzt Unterlagen, Fristen oder moegliche Sonderfaelle.`,
        suggestedReplies: getActionOptions("legal-admin")
      };
    case "admin-next":
      return {
        stepId: "final-control-room",
        focusArea: "timeline",
        assistantMessage: `Sehr gut. Dann betreten wir jetzt den Endspurt-Modus: offene Aufgaben, Restzahlungen, Ansprechpartner, Timings und Plan B. Das ist die Stelle, an der sich die ganze Beratung zu einem echten Control Room verdichten muss. Was braucht ihr als Erstes?`,
        suggestedReplies: getActionOptions("final-control-room")
      };
    case "final-budget-check":
      return {
        stepId: "final-control-room",
        focusArea: "budget",
        assistantMessage: `Mein letzter Budget-Blick waere aktuell: ${workspace.budgetOverview.overall.remaining.toLocaleString("de-DE")} EUR Restspielraum, ${workspace.budgetOverview.overall.committed.toLocaleString("de-DE")} EUR bereits gebunden und ${workspace.budgetOverview.overall.paid.toLocaleString("de-DE")} EUR schon bezahlt. Kurz vor Schluss ist nicht der Gesamtwert entscheidend, sondern ob die Restzahlungen taktisch sauber liegen.`,
        suggestedReplies: getActionOptions("final-control-room")
      };
    case "final-day-brief":
      return {
        stepId: "final-control-room",
        focusArea: "timeline",
        assistantMessage: `Fuer den Hochzeitstag selbst wuerde ich spaeter mit euch auf vier Dinge schauen: wer oeffnet die Vendor-Kommunikation, wer haelt Timings zusammen, welche Lieferfenster sind kritisch und was ist euer Plan B bei Ausfall oder Wetter. Genau daraus muss sich am Ende der eigentliche Control Room bauen.`,
        suggestedReplies: getActionOptions("final-control-room")
      };
    case "final-clarify":
      return {
        stepId: "final-control-room",
        focusArea: "timeline",
        assistantMessage: `Ich bleibe im Endspurt-Modus und priorisiere nichts vorschnell fuer euch um. Wenn ihr wollt, schauen wir jetzt gezielt auf offene Aufgaben, Budget-Risiken oder den Hochzeitstags-Ablauf.`,
        suggestedReplies: getActionOptions("final-control-room")
      };
    case "final-open-tasks":
    default:
      return {
        stepId: "final-control-room",
        focusArea: "timeline",
        assistantMessage: `Wenn ich euch jetzt wie ein Berater priorisieren wuerde, dann schaue ich zuerst auf offene Tasks, ungeklaerte Vendor-Entscheidungen und auf alles, was noch keinen festen Besitzer hat. Gerade ${workspace.progress.totalTasks - workspace.progress.completedTasks} offene Punkte vor dem Ziel sind kein Drama, aber sie brauchen eine klare Reihenfolge.`,
        suggestedReplies: getActionOptions("final-control-room")
      };
  }
}
