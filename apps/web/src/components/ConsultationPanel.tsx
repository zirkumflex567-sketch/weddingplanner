import { useEffect, useRef } from "react";
import type {
  GuidedPlanningSession,
  GuidedPlanningStepId,
  WeddingConsultantTurn
} from "@wedding/shared";

export type ConsultationAssistantMode = "consultant" | "operator";
export type ConsultationAssistantTier = "free" | "premium";

export interface ConsultationMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
}

interface ConsultationPanelProps {
  mode?: "standalone" | "embedded";
  isOpen: boolean;
  isSending?: boolean;
  isRecording?: boolean;
  isTranscribing?: boolean;
  isSpeaking?: boolean;
  assistantTier: ConsultationAssistantTier;
  assistantMode: ConsultationAssistantMode;
  assistantLane?: "agent" | "provider-fallback" | "fallback" | "rules" | null;
  guidedSession: GuidedPlanningSession;
  currentTurn: WeddingConsultantTurn | null;
  messages: ConsultationMessage[];
  draft: string;
  onDraftChange(value: string): void;
  onAssistantTierChange(tier: ConsultationAssistantTier): void;
  onAssistantModeChange(mode: ConsultationAssistantMode): void;
  onStart(): void;
  onClose(): void;
  onStepSelect(stepId: GuidedPlanningStepId): void;
  onReplySelect(optionId: string, label: string): void;
  onSend(): void;
  onToggleRecording(): void;
  onReplayAssistant(): void;
}

export function ConsultationPanel({
  mode = "standalone",
  isOpen,
  isSending = false,
  isRecording = false,
  isTranscribing = false,
  isSpeaking = false,
  assistantTier,
  assistantMode,
  assistantLane = null,
  guidedSession,
  currentTurn,
  messages,
  draft,
  onDraftChange,
  onAssistantTierChange,
  onAssistantModeChange,
  onStart,
  onClose,
  onStepSelect,
  onReplySelect,
  onSend,
  onToggleRecording,
  onReplayAssistant
}: ConsultationPanelProps) {
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const isEmbedded = mode === "embedded";
  const tierCopy =
    assistantTier === "premium"
      ? "Premium arbeitet, wenn möglich, zuerst über OpenClaw auf htown. Nur wenn dieser Weg nicht erreichbar ist, greift ein Ausweichpfad."
      : "Free bleibt bewusst beratend. Der Chat hilft konkret, verändert aber nichts direkt im Workspace.";
  const modeCopy =
    assistantMode === "operator"
      ? {
          label: "Operator",
          description:
            "Arbeitet direkt im Workspace: Gäste importieren, Kategorien umschalten, Kontakte herausziehen, Preise überschlagen und Texte anpassen."
        }
      : {
          label: "Beratung",
          description:
            "Bleibt im beratenden Modus: priorisieren, einordnen, Unsicherheit auflösen und den nächsten sauberen Schritt formulieren."
        };
  const laneLabel =
    assistantLane === "agent"
      ? "OpenClaw aktiv"
      : assistantLane === "provider-fallback"
        ? "Ausweichmodell aktiv"
      : assistantLane === "fallback"
        ? "Server-Ausweichantwort aktiv"
        : assistantLane === "rules"
          ? "Lokaler Regelmodus aktiv"
          : null;
  const activeStep =
    guidedSession.steps.find((step) => step.id === currentTurn?.stepId) ??
    guidedSession.steps.find((step) => step.id === guidedSession.currentStepId) ??
    guidedSession.steps[0];

  useEffect(() => {
    const container = transcriptRef.current;

    if (!container) {
      return;
    }

    container.scrollTop = container.scrollHeight;
  }, [messages]);

  return (
    <section
      id="guided-planning-panel"
      className={`panel assistant-panel ${isOpen ? "assistant-panel--open" : ""}`}
    >
      <div className="assistant-head">
        <div>
          <p className="eyebrow">Hochzeitsberatung</p>
          <h2>{isEmbedded ? "Hochzeitsberatung" : "Geführte Hochzeitsberatung"}</h2>
          <p className="assistant-headline">{guidedSession.headline}</p>
          <div className="assistant-mode-strip" role="tablist" aria-label="Assistant Modus">
            {(
              [
                ["free", "Free"],
                ["premium", "Premium"]
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`assistant-mode-chip ${
                  assistantTier === value ? "assistant-mode-chip--active" : ""
                }`}
                aria-pressed={assistantTier === value}
                onClick={() => onAssistantTierChange(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="assistant-copy">{tierCopy}</p>
          <div className="assistant-mode-strip" role="tablist" aria-label="Assistant Modus">
            {(
              [
                ["consultant", "Beratung"],
                ["operator", "Direkt ausführen"]
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`assistant-mode-chip ${
                  assistantMode === value ? "assistant-mode-chip--active" : ""
                }`}
                aria-pressed={assistantMode === value}
                disabled={assistantTier === "free" && value === "operator"}
                onClick={() => onAssistantModeChange(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="assistant-copy">{modeCopy.description}</p>
          {laneLabel ? <p className="assistant-lane">{laneLabel}</p> : null}
        </div>
        {!isEmbedded ? (
          <div className="assistant-head-actions">
            {!isOpen ? (
              <button type="button" className="primary-button assistant-cta" onClick={onStart}>
                Beratung starten
              </button>
            ) : (
              <button
                type="button"
                className="secondary-button secondary-button--compact"
                onClick={onClose}
              >
                Chat schließen
              </button>
            )}
          </div>
        ) : null}
      </div>

      {!isEmbedded ? (
        <div className="assistant-step-strip">
          {guidedSession.steps.map((step) => (
            <button
              key={step.id}
              type="button"
              className={`assistant-step-chip assistant-step-chip--${step.status} ${
                currentTurn?.stepId === step.id ? "assistant-step-chip--selected" : ""
              }`}
              onClick={() => onStepSelect(step.id)}
            >
              <span>{step.title}</span>
              <small>
                {step.status === "done" ? "Erledigt" : step.status === "active" ? "Jetzt dran" : "Später"}
              </small>
            </button>
          ))}
        </div>
      ) : null}

      {isOpen ? (
        <div className="consultant-layout">
          <div className="consultant-transcript-shell">
            <div className="consultant-transcript" ref={transcriptRef}>
              {messages.map((message) => (
                <article
                  key={message.id}
                  className={`consultant-bubble consultant-bubble--${message.role}`}
                >
                  <p className="consultant-role">
                    {message.role === "assistant" ? "Hochzeitsberatung" : "Ihr"}
                  </p>
                  <p>{message.content}</p>
                </article>
              ))}
            </div>

            <div className="consultant-replies">
              {(currentTurn?.suggestedReplies ?? []).map((reply) => (
                <button
                  key={reply.id}
                  type="button"
                  className="consultant-reply"
                  disabled={isSending}
                  onClick={() => onReplySelect(reply.id, reply.label)}
                >
                  {reply.label}
                </button>
              ))}
            </div>

            <form
              className="consultant-composer"
              onSubmit={(event) => {
                event.preventDefault();
                onSend();
              }}
            >
              <textarea
                className="consultant-input"
                value={draft}
                disabled={isSending || isTranscribing}
                onChange={(event) => onDraftChange(event.target.value)}
                placeholder={
                  assistantMode === "operator"
                    ? "Zum Beispiel: 'Deaktiviere Catering', 'Importiere diese Gäste ...', 'Erstelle eine Anfrage für Hambacher Schloss' ..."
                    : "Schreibt frei, was euch gerade beschäftigt: Budget, Location, Gästeliste, Unsicherheit, Bauchgefühl ..."
                }
              />
              <div className="consultant-composer-actions">
                <button
                  type="button"
                  className={`secondary-button consultant-voice-button ${
                    isRecording ? "consultant-voice-button--recording" : ""
                  }`}
                  disabled={isSending || isTranscribing}
                  onClick={onToggleRecording}
                >
                  {isTranscribing
                    ? "Wird transkribiert ..."
                    : isRecording
                      ? "Aufnahme stoppen"
                      : "Sprechen"}
                </button>
                <button
                  type="button"
                  className="secondary-button consultant-voice-button"
                  disabled={messages.every((message) => message.role !== "assistant") || isSpeaking}
                  onClick={onReplayAssistant}
                >
                  {isSpeaking ? "Antwort läuft ..." : "Antwort vorlesen"}
                </button>
                <button
                  type="submit"
                  className="primary-button consultant-send"
                  disabled={isSending || isTranscribing}
                >
                  {isSending ? "Antwort wird vorbereitet ..." : "Nachricht senden"}
                </button>
              </div>
            </form>
          </div>

          <aside className="consultant-sidebar">
            <div className="consultant-sidecard">
              <p className={`assistant-status assistant-status--${activeStep?.status ?? "upcoming"}`}>
                {activeStep?.status === "done"
                  ? "Erledigt"
                  : activeStep?.status === "active"
                    ? "Aktiver Beratungsblock"
                    : "Nächster Beratungsblock"}
              </p>
              <h3>{activeStep?.title}</h3>
              <p className="assistant-summary">{activeStep?.summary}</p>
              <p className="assistant-copy">{activeStep?.coachBrief}</p>
            </div>

            <div className="consultant-sidecard">
              <p className="eyebrow">Worauf wir achten</p>
              <ul className="assistant-checklist">
                {(activeStep?.checklist ?? []).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      ) : null}
    </section>
  );
}



