import Fastify from "fastify";
import type {
  PrototypeWorkspace,
  WeddingConsultantTurn
} from "@wedding/shared";
import type { VendorRefreshJob } from "@wedding/ingestion";

export interface VendorResearchBrief {
  headline: string;
  instructions: string[];
  outputRequirements: string[];
}

export function createVendorResearchBrief(
  job: VendorRefreshJob
): VendorResearchBrief {
  return {
    headline: `Vendor refresh for ${job.request.region}`,
    instructions: [
      "Use directory sources only for discovery candidate generation.",
      "Prefer first-party websites, official brochures, and claimed profiles for publishable facts.",
      "Reject third-party review scores as product truth."
    ],
    outputRequirements: [
      "Return structured facts with provenance.",
      "Attach freshness timestamps per record.",
      "Mark missing required fields before publish."
    ]
  };
}

export interface AssistantChatMessage {
  role: "assistant" | "user";
  content: string;
}

export interface WeddingConsultantRewriteRequest {
  workspace: PrototypeWorkspace;
  baselineTurn: WeddingConsultantTurn;
  messages: AssistantChatMessage[];
  userMessage: string;
}

export interface WeddingConsultantRewriteResponse {
  assistantMessage: string;
  provider: "ollama" | "fallback";
  model: string;
}

export interface SiggiConversationState {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  street?: string | null;
  houseNumber?: string | null;
  zip?: string | null;
  city?: string | null;
  productArea?: string | null;
  details?: string | null;
  notes?: string | null;
  count?: number | null;
  roomPosition?: string | null;
  callbackPreference?: string | null;
}

export interface SiggiMissingFieldSummary {
  missingFields: string[];
  readyToSubmit: boolean;
}

export interface SiggiConversationRequest {
  state: SiggiConversationState;
  userMessage: string;
  transcript: AssistantChatMessage[];
  summary: SiggiMissingFieldSummary;
}

export interface SiggiConversationResponse {
  assistantMessage: string;
  provider: "ollama" | "fallback";
  model: string;
}

export interface OllamaChatClientOptions {
  baseUrl?: string;
  model?: string;
  temperature?: number;
  fetchImpl?: typeof fetch;
}

export interface AiOrchestratorOptions {
  ollama?: OllamaChatClient;
}

export interface AiOrchestratorHttpClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

type JsonRecord = Record<string, unknown>;
const assistantMessageSchema = {
  type: "object",
  properties: {
    assistantMessage: {
      type: "string"
    }
  },
  required: ["assistantMessage"]
} as const;

function stringifyMessages(messages: AssistantChatMessage[]) {
  return messages
    .slice(-4)
    .map((message) => `${message.role === "assistant" ? "Assistant" : "User"}: ${message.content}`)
    .join("\n");
}

function summarizeWeddingWorkspace(workspace: PrototypeWorkspace) {
  const activeVendors = workspace.plan.vendorMatches
    .slice(0, 8)
    .map((match) => `${match.name} (${match.category})`)
    .join(", ");

  return [
    `Couple: ${workspace.coupleName}`,
    `Region: ${workspace.onboarding.region}`,
    `Date: ${workspace.onboarding.targetDate}`,
    `Budget: ${workspace.onboarding.budgetTotal} EUR`,
    `Current vendor anchors: ${activeVendors || "none"}`
  ].join("\n");
}

function summarizeSiggiState(state: SiggiConversationState) {
  return [
    `Name: ${state.name ?? "unknown"}`,
    `Phone: ${state.phone ?? "unknown"}`,
    `Email: ${state.email ?? "unknown"}`,
    `Address: ${[state.street, state.houseNumber, state.zip, state.city].filter(Boolean).join(" ") || "unknown"}`,
    `Product area: ${state.productArea ?? "unknown"}`,
    `Count: ${typeof state.count === "number" ? state.count : "unknown"}`,
    `Room position: ${state.roomPosition ?? "unknown"}`,
    `Callback preference: ${state.callbackPreference ?? "unknown"}`,
    `Details: ${state.details ?? "unknown"}`,
    `Notes: ${state.notes ?? "unknown"}`
  ].join("\n");
}

function coerceAssistantMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const assistantMessage = (payload as JsonRecord).assistantMessage;
  return typeof assistantMessage === "string" && assistantMessage.trim().length > 0
    ? assistantMessage.trim()
    : null;
}

function normalizeAssistantText(raw: string) {
  return raw
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractJsonPayload(raw: string) {
  const direct = safeJsonParse(raw);

  if (direct) {
    return direct;
  }

  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]+?)```/i);

  if (fencedMatch?.[1]) {
    return safeJsonParse(fencedMatch[1]);
  }

  const objectMatch = raw.match(/\{[\s\S]+\}/);
  return objectMatch?.[0] ? safeJsonParse(objectMatch[0]) : null;
}

function safeJsonParse(raw: string) {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export class OllamaChatClient {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly temperature: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OllamaChatClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
    this.model = options.model ?? process.env.OLLAMA_MODEL ?? "qwen3:1.7b";
    this.temperature = options.temperature ?? 0.5;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  get modelName() {
    return this.model;
  }

  async generateText(systemPrompt: string, userPrompt: string) {
    const response = await this.fetchImpl(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        think: false,
        options: {
          temperature: this.temperature,
          num_predict: 120
        },
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: userPrompt
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed with ${response.status}`);
    }

    const payload = (await response.json()) as {
      message?: {
        content?: string;
      };
    };

    const raw = payload.message?.content;

    if (!raw) {
      throw new Error("Ollama returned no content");
    }

    return normalizeAssistantText(raw);
  }

  async generateJson<T extends JsonRecord>(systemPrompt: string, userPrompt: string) {
    const response = await this.fetchImpl(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        format: assistantMessageSchema,
        think: false,
        options: {
          temperature: this.temperature,
          num_predict: 180
        },
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: userPrompt
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed with ${response.status}`);
    }

    const payload = (await response.json()) as {
      message?: {
        content?: string;
      };
    };

    const raw = payload.message?.content;

    if (!raw) {
      throw new Error("Ollama returned no content");
    }

    const parsed = extractJsonPayload(raw);

    if (!parsed || typeof parsed !== "object") {
      throw new Error("Ollama returned non-JSON content");
    }

    return parsed as T;
  }
}

export class AiOrchestrator {
  private readonly ollama: OllamaChatClient;

  constructor(options: AiOrchestratorOptions = {}) {
    this.ollama = options.ollama ?? new OllamaChatClient();
  }

  get modelName() {
    return this.ollama.modelName;
  }

  async rewriteWeddingConsultantReply(
    request: WeddingConsultantRewriteRequest
  ): Promise<WeddingConsultantRewriteResponse> {
    const systemPrompt = [
      "Du bist eine warme, erfahrene deutsche Hochzeitsberaterin.",
      "Deine Aufgabe ist nur sprachliches Umschreiben, nicht neues Planen.",
      "Behalte Schritt, Fokus und alle konkreten Fakten der Basisantwort strikt bei.",
      "Du darfst keine neuen Vendoren, Preise, Orte, Fristen, Listenpunkte oder Rechtsinfos hinzufuegen.",
      "Wenn die Basisantwort konkrete Namen nennt, darfst du nur genau diese Namen nennen.",
      "Wenn der Nutzer nach einer Liste fragt und die Basisantwort schon eine Liste enthaelt, gib genau diese Punkte in natuerlicher Form wieder.",
      "Antworte kompakt, menschlich und proaktiv.",
      "Stell hoechstens eine kurze Rueckfrage.",
      "Antworte nur mit dem finalen Antworttext auf Deutsch."
    ].join(" ");

    const userPrompt = [
      "WORKSPACE",
      summarizeWeddingWorkspace(request.workspace),
      "",
      `CURRENT STEP: ${request.baselineTurn.stepId}`,
      `CURRENT FOCUS: ${request.baselineTurn.focusArea}`,
      "",
      "RECENT TRANSCRIPT",
      stringifyMessages(request.messages),
      "",
      `LATEST USER MESSAGE: ${request.userMessage}`,
      "",
      "BASELINE REPLY",
      request.baselineTurn.assistantMessage,
      "",
      "Formuliere daraus eine menschliche, hilfreiche Antwort, ohne irgendeinen neuen konkreten Fakt hinzuzufuegen."
    ].join("\n");

    try {
      const assistantMessage = await this.ollama.generateText(systemPrompt, userPrompt);

      if (!assistantMessage) {
        throw new Error("Missing assistantMessage");
      }

      return {
        assistantMessage,
        provider: "ollama",
        model: this.ollama.modelName
      };
    } catch {
      return {
        assistantMessage: request.baselineTurn.assistantMessage,
        provider: "fallback",
        model: this.ollama.modelName
      };
    }
  }

  async createSiggiReply(
    request: SiggiConversationRequest,
    fallbackMessage: string
  ): Promise<SiggiConversationResponse> {
    const systemPrompt = [
      "Du bist Siggi, der freundliche Assistent von Fenster- und Rollladen-Sieg in Hassloch.",
      "Das Gespraech laeuft schon, also stelle dich nicht erneut vor.",
      "Deine Aufgabe ist nur, die Basisantwort menschlicher zu formulieren, nicht neue Fragen zu erfinden.",
      "Frage nur nach den Informationen, die in der Basisantwort bereits fehlen.",
      "Klinge natuerlich, ruhig und hilfreich statt formelhaft.",
      "Schreibe in ein bis zwei kurzen Saetzen und nicht als Aufzaehlung.",
      "Versprich keine Preise, Termine oder Buchungen.",
      "Antworte nur mit dem finalen Antworttext auf Deutsch."
    ].join(" ");

    const userPrompt = [
      "CURRENT LEAD STATE",
      summarizeSiggiState(request.state),
      "",
      `READY TO SUBMIT: ${request.summary.readyToSubmit ? "yes" : "no"}`,
      `MISSING FIELDS: ${request.summary.missingFields.join(", ") || "none"}`,
      "",
      "RECENT TRANSCRIPT",
      stringifyMessages(request.transcript),
      "",
      `LATEST USER MESSAGE: ${request.userMessage}`,
      "",
      "BASELINE REPLY",
      fallbackMessage,
      "",
      "Formuliere die Basisantwort freundlich und natuerlich um, ohne neue fehlende Punkte oder neue Fragen hinzuzufuegen."
    ].join("\n");

    try {
      const assistantMessage = await this.ollama.generateText(systemPrompt, userPrompt);

      if (!assistantMessage) {
        throw new Error("Missing assistantMessage");
      }

      return {
        assistantMessage,
        provider: "ollama",
        model: this.ollama.modelName
      };
    } catch {
      return {
        assistantMessage: fallbackMessage,
        provider: "fallback",
        model: this.ollama.modelName
      };
    }
  }
}

export class AiOrchestratorHttpClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: AiOrchestratorHttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async rewriteWeddingConsultantReply(request: WeddingConsultantRewriteRequest) {
    const response = await this.fetchImpl(`${this.baseUrl}/chat/wedding-consultant`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      throw new Error(`AI orchestrator request failed with ${response.status}`);
    }

    const payload = (await response.json()) as {
      response?: WeddingConsultantRewriteResponse;
    };

    if (!payload.response) {
      throw new Error("AI orchestrator returned no wedding consultant response");
    }

    return payload.response;
  }

  async createSiggiReply(request: SiggiConversationRequest) {
    const response = await this.fetchImpl(`${this.baseUrl}/chat/siggi-intake`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      throw new Error(`AI orchestrator request failed with ${response.status}`);
    }

    const payload = (await response.json()) as {
      response?: SiggiConversationResponse;
    };

    if (!payload.response) {
      throw new Error("AI orchestrator returned no Siggi response");
    }

    return payload.response;
  }
}

function isAssistantChatMessage(value: unknown): value is AssistantChatMessage {
  return Boolean(
    value &&
      typeof value === "object" &&
      ((value as JsonRecord).role === "assistant" || (value as JsonRecord).role === "user") &&
      typeof (value as JsonRecord).content === "string"
  );
}

function isWeddingConsultantRewriteRequest(
  value: unknown
): value is WeddingConsultantRewriteRequest {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as JsonRecord).workspace &&
      (value as JsonRecord).baselineTurn &&
      Array.isArray((value as JsonRecord).messages) &&
      ((value as JsonRecord).messages as unknown[]).every(isAssistantChatMessage) &&
      typeof (value as JsonRecord).userMessage === "string"
  );
}

function isSiggiConversationRequest(value: unknown): value is SiggiConversationRequest {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as JsonRecord).state &&
      Array.isArray((value as JsonRecord).transcript) &&
      ((value as JsonRecord).transcript as unknown[]).every(isAssistantChatMessage) &&
      typeof (value as JsonRecord).userMessage === "string" &&
      (value as JsonRecord).summary &&
      Array.isArray(((value as JsonRecord).summary as JsonRecord).missingFields) &&
      typeof ((value as JsonRecord).summary as JsonRecord).readyToSubmit === "boolean"
  );
}

export function buildAiOrchestratorApp(options: AiOrchestratorOptions = {}) {
  const app = Fastify({ logger: false });
  const orchestrator = new AiOrchestrator(options);

  app.get("/health", async () => ({
    status: "ok",
    model: orchestrator.modelName
  }));

  app.post("/chat/wedding-consultant", async (request, reply) => {
    if (!isWeddingConsultantRewriteRequest(request.body)) {
      return reply.code(400).send({ error: "Invalid wedding consultant payload" });
    }

    const response = await orchestrator.rewriteWeddingConsultantReply(request.body);
    return { response };
  });

  app.post("/chat/siggi-intake", async (request, reply) => {
    const fallbackMessage =
      "Danke, ich habe das aufgenommen. Ich frage gleich gezielt nach dem naechsten wichtigen Punkt, falls noch etwas fehlt.";

    if (!isSiggiConversationRequest(request.body)) {
      return reply.code(400).send({ error: "Invalid Siggi payload" });
    }

    const response = await orchestrator.createSiggiReply(request.body, fallbackMessage);
    return { response };
  });

  return app;
}
