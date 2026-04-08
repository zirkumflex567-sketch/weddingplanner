import { useEffect, useMemo, useState } from "react";
import {
  createGuidedPlanningSession,
  type PrototypeWorkspaceProfile,
  type WeddingBootstrapInput
} from "@wedding/shared";
import { createWorkspace, getWorkspace, listWorkspaceProfiles } from "./lib/api";
import "./app-v2.css";

const quickStartInput: WeddingBootstrapInput = {
  coupleName: "Mara & Luis",
  targetDate: "2027-08-28",
  region: "67454 Hassloch",
  guestCountTarget: 78,
  budgetTotal: 36000,
  stylePreferences: ["editorial", "garden party", "warm minimal"],
  noGoPreferences: ["Ballsaal", "steife Sitzordnung"],
  plannedEvents: ["civil-ceremony", "celebration"],
  disabledVendorCategories: [],
  invitationCopy: {
    headline: "{paar} freut sich auf eure Rückmeldung",
    body:
      "{gast}, ihr seid eingeladen für {datum} in {ort}. Gebt uns bitte kurz Bescheid, ob ihr dabei seid und ob es Essenshinweise gibt.",
    footer: "Wir freuen uns sehr auf euch."
  }
};

function formatMeta(profile: PrototypeWorkspaceProfile) {
  return `${profile.region} · ${profile.targetDate} · ${profile.guestCountTarget} Gäste`;
}

export function WeddingV2Page() {
  const [profiles, setProfiles] = useState<PrototypeWorkspaceProfile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "saving">("loading");

  useEffect(() => {
    void (async () => {
      setStatus("loading");
      const result = await listWorkspaceProfiles();
      setProfiles(result.profiles);
      setActiveId(result.profiles[0]?.id ?? null);
      setStatus("idle");
    })();
  }, []);

  const activeProfile = useMemo(
    () => profiles.find((profile) => profile.id === activeId) ?? profiles[0] ?? null,
    [activeId, profiles]
  );

  const [workspaceHeadline, setWorkspaceHeadline] = useState<string>(
    "Kuratiertes Cockpit für Timeline, Budget, Vendoren und Gäste."
  );

  useEffect(() => {
    if (!activeProfile) {
      return;
    }

    void (async () => {
      const workspaceResponse = await getWorkspace(activeProfile.id);
      const workspace = workspaceResponse.workspace;
      const guidedSession = createGuidedPlanningSession(workspace);
      setWorkspaceHeadline(
        `${guidedSession.headline} · ${workspace.progress.completedTasks}/${workspace.progress.totalTasks} Tasks erledigt`
      );
    })();
  }, [activeProfile]);

  async function handleQuickStart() {
    setStatus("saving");
    const created = await createWorkspace(quickStartInput);
    const refreshed = await listWorkspaceProfiles();
    setProfiles(refreshed.profiles);
    setActiveId(created.workspace.id);
    window.location.assign(`/wedding/?workspace=${created.workspace.id}`);
  }

  return (
    <div className="v2-shell">
      <header className="v2-topbar">
        <div>
          <p className="v2-kicker">Wedding Copilot V2</p>
          <h1>Editorial Workspace statt UI-Chaos.</h1>
        </div>
        <div className="v2-actions">
          <button type="button" className="v2-btn v2-btn--ghost" onClick={() => window.location.assign("/wedding/")}>
            Classic öffnen
          </button>
          <button type="button" className="v2-btn" onClick={() => void handleQuickStart()} disabled={status === "saving"}>
            {status === "saving" ? "Erstelle Workspace..." : "Schnellstart-Demo"}
          </button>
        </div>
      </header>

      <main className="v2-main">
        <section className="v2-hero">
          <p className="v2-kicker">Live unter /wedding/v2</p>
          <h2>{activeProfile ? activeProfile.coupleName : "Neues Beratungsprofil"}</h2>
          <p>{activeProfile ? formatMeta(activeProfile) : "Lege ein erstes Profil an und starte dann in den Guided Flow."}</p>
          <p className="v2-hero-note">{workspaceHeadline}</p>
        </section>

        <section className="v2-grid">
          <article className="v2-card">
            <h3>Profile</h3>
            <div className="v2-list">
              {profiles.slice(0, 8).map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  className={`v2-profile-item ${profile.id === activeProfile?.id ? "is-active" : ""}`}
                  onClick={() => setActiveId(profile.id)}
                >
                  <strong>{profile.coupleName}</strong>
                  <span>{formatMeta(profile)}</span>
                </button>
              ))}
            </div>
          </article>

          <article className="v2-card">
            <h3>V2 Design-Prinzipien</h3>
            <ul>
              <li>Fester, opaker Header mit klarer Kante</li>
              <li>Keine leeren Zweitspalten in Hero-Bereichen</li>
              <li>Einheitliche Typografie und besserer Lesefluss</li>
              <li>Weniger verschachtelte Boxen, mehr klare Hierarchie</li>
            </ul>
          </article>

          <article className="v2-card">
            <h3>Nächster Schritt</h3>
            <p>
              Öffne das aktive Profil direkt im produktiven Flow. V2 dient als visuelles Front-Cockpit
              und Einstieg, der Rest bleibt vollständig kompatibel mit dem bestehenden Workspace.
            </p>
            {activeProfile ? (
              <button
                type="button"
                className="v2-btn"
                onClick={() => window.location.assign(`/wedding/?workspace=${activeProfile.id}`)}
              >
                Profil öffnen
              </button>
            ) : null}
          </article>
        </section>
      </main>
    </div>
  );
}
