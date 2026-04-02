import { useEffect, useState } from "react";
import type { PrototypePublicSiteSession } from "@wedding/shared";
import { getPublicSiteSession } from "./lib/api";

interface PublicSitePageProps {
  token: string;
}

export function PublicSitePage({ token }: PublicSitePageProps) {
  const [session, setSession] = useState<PrototypePublicSiteSession | null>(null);
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      setStatus("loading");
      setError(null);

      try {
        const result = await getPublicSiteSession(token);

        if (!cancelled) {
          setSession(result);
          setStatus("ready");
        }
      } catch {
        if (!cancelled) {
          setError("Diese Hochzeitsseite konnte gerade nicht geladen werden.");
          setStatus("ready");
        }
      }
    }

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <main className="portal-shell">
      <section className="portal-card portal-card--site">
        <div className="portal-head">
          <div>
            <p className="eyebrow">Wedding Website</p>
            <h1>{session?.website.heroTitle ?? "Hochzeitsseite wird geladen"}</h1>
          </div>
          <span className={`source-pill source-pill--${status}`}>{status === "loading" ? "Laedt" : "Bereit"}</span>
        </div>

        {session ? (
          <div className="portal-site-layout">
            <p className="portal-copy">{session.website.storyIntro}</p>

            <div className="summary-row">
              <span>{session.coupleName}</span>
              <span>{session.targetDate}</span>
              <span>{session.region}</span>
              <span>{session.guestCountTarget} geplante Gaeste</span>
            </div>

            <section className="portal-section">
              <p className="portal-label">Ablauf & Events</p>
              <div className="guided-card-stack">
                {session.eventBlueprints.map((event) => (
                  <article key={event.id} className="guided-inline-card">
                    <strong>{event.label}</strong>
                    <p>{event.planningFocus}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="portal-site-grid">
              <article className="guided-inline-card">
                <span className="eyebrow">Location & Feier</span>
                <strong>Vor Ort</strong>
                <p>{session.website.venueNote}</p>
              </article>
              <article className="guided-inline-card">
                <span className="eyebrow">Anreise</span>
                <strong>Travel</strong>
                <p>{session.website.travelNote}</p>
              </article>
              <article className="guided-inline-card">
                <span className="eyebrow">Hotel</span>
                <strong>Stay</strong>
                <p>{session.website.hotelNote}</p>
              </article>
              <article className="guided-inline-card">
                <span className="eyebrow">Dresscode & RSVP</span>
                <strong>{session.website.dressCode}</strong>
                <p>
                  {session.website.rsvpDeadline
                    ? `Bitte antwortet idealerweise bis ${session.website.rsvpDeadline}.`
                    : "Die persoenlichen RSVP-Links kommen direkt ueber eure Einladung."}
                </p>
              </article>
            </section>
          </div>
        ) : (
          <p className="portal-copy">
            {error ?? "Diese Hochzeitsseite steht gerade noch nicht zur Verfuegung."}
          </p>
        )}

        <p className="portal-footnote">
          Wedding Copilot laeuft hier als privacy-first Prototyp. KI-Arbeit bleibt auf Shadow,
          Hosting und API laufen separat.
        </p>
      </section>
    </main>
  );
}
