import { useEffect, useRef } from "react";
import type {
  GuidedPlanningSession,
  GuidedPlanningStepId,
  WeddingConsultantTurn
} from "@wedding/shared";

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
  guidedSession: GuidedPlanningSession;
  currentTurn: WeddingConsultantTurn | null;
  messages: ConsultationMessage[];
  draft: string;
  onDraftChange(value: string): void;
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
  guidedSession,
  currentTurn,
  messages,
  draft,
  onDraftChange,
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
          <p className="eyebrow">AI Wedding Consultant</p>
          <h2>{isEmbedded ? "Wedding Consultant" : "Gefuehrte Hochzeitsberatung"}</h2>
          <p className="assistant-headline">{guidedSession.headline}</p>
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
                Chat schliessen
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
                {step.status === "done" ? "Erledigt" : step.status === "active" ? "Jetzt dran" : "Spaeter"}
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
                    {message.role === "assistant" ? "Wedding Consultant" : "Ihr"}
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
                placeholder="Schreibt frei, was euch gerade beschaeftigt: Budget, Location, Gaeste, Unsicherheit, Bauchgefuehl ..."
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
                      : "Push-to-Talk"}
                </button>
                <button
                  type="button"
                  className="secondary-button consultant-voice-button"
                  disabled={messages.every((message) => message.role !== "assistant") || isSpeaking}
                  onClick={onReplayAssistant}
                >
                  {isSpeaking ? "Antwort spricht ..." : "Antwort vorlesen"}
                </button>
                <button
                  type="submit"
                  className="primary-button consultant-send"
                  disabled={isSending || isTranscribing}
                >
                  {isSending ? "Consultant antwortet ..." : "Nachricht senden"}
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
                    : "Naechster Beratungsblock"}
              </p>
              <h3>{activeStep?.title}</h3>
              <p className="assistant-summary">{activeStep?.summary}</p>
              <p className="assistant-copy">{activeStep?.coachBrief}</p>
            </div>

            <div className="consultant-sidecard">
              <p className="eyebrow">Worauf Wir Achten</p>
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
