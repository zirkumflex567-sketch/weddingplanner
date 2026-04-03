import { useEffect, useState } from "react";
import type {
  PrototypeGuest,
  PrototypeMealPreference,
  PrototypePublicRsvpSession
} from "@wedding/shared";
import { getPublicRsvpSession, submitPublicRsvp } from "./lib/api";

const rsvpLabels: Record<PrototypeGuest["rsvpStatus"], string> = {
  pending: "Noch offen",
  attending: "Wir kommen",
  declined: "Wir sagen ab"
};

const mealLabels: Record<PrototypeMealPreference, string> = {
  undecided: "Noch offen",
  standard: "Standard",
  vegetarian: "Vegetarisch",
  vegan: "Vegan",
  kids: "Kindergericht"
};

type PublicRsvpForm = {
  rsvpStatus: PrototypeGuest["rsvpStatus"];
  mealPreference: PrototypeGuest["mealPreference"];
  dietaryNotes: string;
  message: string;
};

function formatInvitationDate(value: string) {
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

function renderInvitationTemplate(
  template: string,
  session: PrototypePublicRsvpSession
) {
  const invitedEvents = session.context.invitedEvents.map((event) => event.label).join(", ");

  return template
    .replaceAll("{paar}", session.context.coupleName)
    .replaceAll("{gast}", session.guest.name)
    .replaceAll("{datum}", formatInvitationDate(session.context.targetDate))
    .replaceAll("{ort}", session.context.region)
    .replaceAll("{events}", invitedEvents);
}

function createForm(session: PrototypePublicRsvpSession): PublicRsvpForm {
  return {
    rsvpStatus: session.guest.rsvpStatus,
    mealPreference: session.guest.mealPreference,
    dietaryNotes: session.guest.dietaryNotes,
    message: session.guest.message
  };
}

interface PublicRsvpPageProps {
  token: string;
}

export function PublicRsvpPage({ token }: PublicRsvpPageProps) {
  const [session, setSession] = useState<PrototypePublicRsvpSession | null>(null);
  const [form, setForm] = useState<PublicRsvpForm | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "saving">("loading");
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      setStatus("loading");
      setError(null);
      setSavedMessage(null);

      try {
        const result = await getPublicRsvpSession(token);

        if (!cancelled) {
          setSession(result);
          setForm(createForm(result));
          setStatus("ready");
        }
      } catch {
        if (!cancelled) {
          setError("Dieser RSVP-Link ist nicht mehr gueltig oder konnte nicht geladen werden.");
          setStatus("ready");
        }
      }
    }

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!form) {
      return;
    }

    setStatus("saving");
    setError(null);
    setSavedMessage(null);

    try {
      const result = await submitPublicRsvp(token, form);
      setSession(result);
      setForm(createForm(result));
      setSavedMessage("Antwort gespeichert. Danke euch.");
      setStatus("ready");
    } catch {
      setError("Die Antwort konnte gerade nicht gespeichert werden.");
      setStatus("ready");
    }
  }

  return (
    <main className="portal-shell">
      <section className="portal-card">
        <div className="portal-head">
          <div>
            <p className="eyebrow">RSVP</p>
            <h1>
              {session
                ? renderInvitationTemplate(session.context.invitationCopy.headline, session)
                : "RSVP wird geladen"}
            </h1>
          </div>
          <span className={`source-pill source-pill--${status}`}>
            {status === "loading" ? "Laedt" : status === "saving" ? "Speichert" : "Bereit"}
          </span>
        </div>

        {session ? (
          <>
            <p className="portal-copy">
              {renderInvitationTemplate(session.context.invitationCopy.body, session)}
            </p>

            <div className="summary-row">
              {session.context.invitedEvents.map((event) => (
                <span key={event.id}>{event.label}</span>
              ))}
            </div>

            {session.context.seatingAssignment ? (
              <div className="experience-panel">
                <div className="section-headline">
                  <div>
                    <p className="eyebrow">Ihr Platz</p>
                    <h2>
                      {session.context.seatingAssignment.tableName} /{" "}
                      {session.context.seatingAssignment.tableShape === "round"
                        ? "Runder Tisch"
                        : "Eckiger Tisch"}
                    </h2>
                  </div>
                </div>
                <p className="portal-copy">
                  Sobald sich der Saalplan aendert, seht ihr hier direkt euren aktuellen Platz.
                </p>
                {session.context.routePlanningLink ? (
                  <a
                    className="secondary-button"
                    href={session.context.routePlanningLink}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Route zur Location oeffnen
                  </a>
                ) : null}
              </div>
            ) : session.context.routePlanningLink ? (
              <div className="experience-panel">
                <div className="section-headline">
                  <div>
                    <p className="eyebrow">Anreise</p>
                    <h2>Route zur Location</h2>
                  </div>
                </div>
                <a
                  className="secondary-button"
                  href={session.context.routePlanningLink}
                  target="_blank"
                  rel="noreferrer"
                >
                  Route zur Location oeffnen
                </a>
              </div>
            ) : null}

            <form className="portal-form" onSubmit={handleSubmit}>
              <div className="portal-section">
                <p className="portal-label">Antwort</p>
                <div className="action-row">
                  {(["pending", "attending", "declined"] as const).map((statusOption) => (
                    <button
                      key={statusOption}
                      type="button"
                      className={`chip-button ${
                        form?.rsvpStatus === statusOption ? "chip-button--active" : ""
                      }`}
                      onClick={() =>
                        setForm((current) =>
                          current
                            ? {
                                ...current,
                                rsvpStatus: statusOption
                              }
                            : current
                        )
                      }
                    >
                      {rsvpLabels[statusOption]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="portal-section">
                <label className="portal-field">
                  Essenswahl
                  <select
                    value={form?.mealPreference ?? "undecided"}
                    onChange={(event) =>
                      setForm((current) =>
                        current
                          ? {
                              ...current,
                              mealPreference: event.target.value as PrototypeMealPreference
                            }
                          : current
                      )
                    }
                  >
                    <option value="undecided">{mealLabels.undecided}</option>
                    <option value="standard">{mealLabels.standard}</option>
                    <option value="vegetarian">{mealLabels.vegetarian}</option>
                    <option value="vegan">{mealLabels.vegan}</option>
                    <option value="kids">{mealLabels.kids}</option>
                  </select>
                </label>

                <label className="portal-field">
                  Allergien oder Hinweise
                  <textarea
                    rows={4}
                    value={form?.dietaryNotes ?? ""}
                    onChange={(event) =>
                      setForm((current) =>
                        current
                          ? {
                              ...current,
                              dietaryNotes: event.target.value
                            }
                          : current
                      )
                    }
                    placeholder="Zum Beispiel vegetarisch, keine Nuesse, Kindersitz noetig..."
                  />
                </label>

                <label className="portal-field">
                  Nachricht ans Paar
                  <textarea
                    rows={4}
                    value={form?.message ?? ""}
                    onChange={(event) =>
                      setForm((current) =>
                        current
                          ? {
                              ...current,
                              message: event.target.value
                            }
                          : current
                      )
                    }
                    placeholder="Kurze Nachricht, Ankunftsinfo oder Frage"
                  />
                </label>
              </div>

              <button type="submit" className="primary-button" disabled={status === "saving"}>
                Antwort speichern
              </button>
            </form>
          </>
        ) : (
          <p className="portal-copy">
            Dieser Link konnte nicht geladen werden. Bitte beim Paar nach einem neuen RSVP-Link
            fragen.
          </p>
        )}

        {savedMessage ? <p className="success-text">{savedMessage}</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
        {session ? (
          <p className="portal-footnote">
            {renderInvitationTemplate(session.context.invitationCopy.footer, session)}
          </p>
        ) : null}
        <p className="portal-footnote">
          Wedding Copilot laeuft hier als privacy-first Prototyp. KI-Arbeit bleibt auf Shadow,
          Hosting und API laufen separat.
        </p>
      </section>
    </main>
  );
}

