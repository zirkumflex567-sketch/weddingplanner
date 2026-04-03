import { useEffect, useMemo, useState } from "react";
import {
  getIngestionCoverageSnapshot,
  type IngestionCoverageSnapshot
} from "./lib/api";
import "./app.css";

function formatDate(value?: string) {
  if (!value) {
    return "—";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(parsed);
}

export function IngestionCoveragePage() {
  const [snapshot, setSnapshot] = useState<IngestionCoverageSnapshot | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const next = await getIngestionCoverageSnapshot();
      setSnapshot(next);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Coverage konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 15000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const regionItems = useMemo(() => snapshot?.regions ?? [], [snapshot]);

  return (
    <main className="coverage-page">
      <header className="coverage-hero">
        <div>
          <p className="eyebrow">Ingestion Live Monitor</p>
          <h1>Deutschlandweite Vendor-Abdeckung</h1>
          <p className="page-copy">
            Diese Seite zeigt laufende Batch-Sweeps, den Coverage-Fortschritt und aktuelle Datensamples in Echtzeit.
          </p>
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={() => void refresh()}
          disabled={loading}
        >
          {loading ? "Aktualisiere..." : "Jetzt aktualisieren"}
        </button>
      </header>

      {error ? <p className="error-text">{error}</p> : null}

      <section className="coverage-metrics">
        <article className="coverage-card">
          <strong>{snapshot?.coverage.recordsTotal ?? 0}</strong>
          <span>Datensaetze gesamt</span>
        </article>
        <article className="coverage-card">
          <strong>
            {snapshot?.coverage.regionsCovered ?? 0}/{snapshot?.coverage.regionsTotal ?? 0}
          </strong>
          <span>Regionen abgedeckt</span>
        </article>
        <article className="coverage-card">
          <strong>{snapshot?.coverage.regionsCoveragePercent ?? 0}%</strong>
          <span>Regionaler Fortschritt</span>
        </article>
        <article className="coverage-card">
          <strong>
            {snapshot?.coverage.categoriesCovered ?? 0}/{snapshot?.coverage.categoriesTotal ?? 0}
          </strong>
          <span>Kategorien abgedeckt</span>
        </article>
        <article className="coverage-card">
          <strong>{snapshot?.coverage.categoriesCoveragePercent ?? 0}%</strong>
          <span>Kategorie-Fortschritt</span>
        </article>
      </section>

      <section className="coverage-grid">
        <article className="experience-panel">
          <div className="section-headline">
            <div>
              <p className="eyebrow">Runner</p>
              <h2>Batch-Status</h2>
            </div>
          </div>
          <div className="coverage-runner-status">
            <p>
              <strong>Status:</strong>{" "}
              <span className={snapshot?.runner.active ? "status-pill status-pill--ok" : "status-pill"}>
                {snapshot?.runner.active ? "Aktiv" : "Nicht aktiv"}
              </span>
            </p>
            <p><strong>PID:</strong> {snapshot?.runner.pid ?? "—"}</p>
            <p><strong>Zyklen:</strong> {snapshot?.runner.cycles ?? 0}</p>
            <p><strong>Letzter Heartbeat:</strong> {formatDate(snapshot?.runner.lastHeartbeatAt)}</p>
            <p><strong>Cycle gestartet:</strong> {formatDate(snapshot?.runner.lastCycleStartedAt)}</p>
            <p><strong>Cycle beendet:</strong> {formatDate(snapshot?.runner.lastCycleCompletedAt)}</p>
            {snapshot?.runner.lastError ? (
              <p className="error-text"><strong>Letzter Fehler:</strong> {snapshot.runner.lastError}</p>
            ) : null}
          </div>
        </article>

        <article className="experience-panel">
          <div className="section-headline">
            <div>
              <p className="eyebrow">Deutschlandkarte</p>
              <h2>Abdeckungs-Flecken pro Region</h2>
            </div>
          </div>
          <div className="coverage-map">
            {regionItems.map((region) => (
              <div
                key={region.name}
                className={`coverage-dot ${region.covered ? "coverage-dot--covered" : ""}`}
                title={`${region.name}: ${region.recordCount} Datensaetze`}
              >
                <span>{region.name}</span>
                <small>{region.recordCount}</small>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="experience-panel">
        <div className="section-headline">
          <div>
            <p className="eyebrow">Stichproben</p>
            <h2>Zuletzt eingesammelte Daten</h2>
          </div>
        </div>
        <div className="coverage-sample-list">
          {(snapshot?.samples ?? []).map((sample, index) => (
            <article key={`${sample.name}-${sample.sourcePortalId}-${index}`} className="coverage-sample-row">
              <div>
                <strong>{sample.name}</strong>
                <p>{sample.category} · {sample.region} · {sample.sourcePortalId}</p>
              </div>
              <div>
                <p>{sample.contactEmail ?? "keine Email"}</p>
                <p>{sample.contactPhone ?? "kein Telefon"}</p>
                <p>{sample.address ?? "keine Adresse"}</p>
                <p>{sample.websiteUrl ?? "keine Website"}</p>
                <small>{formatDate(sample.freshnessTimestamp)}</small>
              </div>
            </article>
          ))}
          {snapshot && snapshot.samples.length === 0 ? (
            <p className="empty-state">Noch keine Samples vorhanden.</p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
