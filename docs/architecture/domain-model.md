# Domain-Modell Entwurf

## Ziel

Dieses Modell beschreibt die kleinste sinnvolle Fachdomäne fuer den ersten produktiven Schnitt.

## Kern-Entities

### `couple`

Repraesentiert das Paar bzw. das Planungs-Team.

Beispiel-Felder:

- `id`
- `display_name`
- `primary_contact_name`
- `primary_contact_email`
- `locale`
- `planning_region`

### `wedding`

Der zentrale Planungskontext.

Beispiel-Felder:

- `id`
- `couple_id`
- `target_date`
- `date_flexibility`
- `guest_count_target`
- `budget_total`
- `style_profile`
- `no_go_profile`
- `status`

### `planning_task`

Eine konkrete Aufgabe oder ein Meilenstein.

Beispiel-Felder:

- `id`
- `wedding_id`
- `title`
- `category`
- `priority`
- `due_at`
- `status`
- `source`
- `rationale`

### `budget_item`

Budgetstruktur je Kategorie.

Beispiel-Felder:

- `id`
- `wedding_id`
- `category`
- `planned_amount`
- `actual_amount`
- `confidence`
- `notes`

### `vendor`

Normalisierter Anbieter-Eintrag.

Beispiel-Felder:

- `id`
- `name`
- `category`
- `region`
- `service_area`
- `style_tags`
- `price_band`
- `capacity_min`
- `capacity_max`
- `source_quality_score`
- `freshness_score`

### `vendor_match`

Verknuepft Vendor und Wedding-Kontext.

Beispiel-Felder:

- `id`
- `wedding_id`
- `vendor_id`
- `fit_score`
- `budget_fit_score`
- `style_fit_score`
- `distance_score`
- `reason_summary`

### `quote`

Spaeterer Angebots- oder Preisstand fuer einen Vendor.

Beispiel-Felder:

- `id`
- `wedding_id`
- `vendor_id`
- `status`
- `quoted_amount`
- `currency`
- `received_at`
- `notes`

### `document`

Platzhalter fuer spaetere Dokumente.

Beispiel-Felder:

- `id`
- `wedding_id`
- `type`
- `storage_key`
- `source`
- `created_at`

## Beziehungen

- Ein `couple` hat mindestens eine `wedding`.
- Eine `wedding` hat viele `planning_task`.
- Eine `wedding` hat viele `budget_item`.
- Eine `wedding` hat viele `vendor_match`.
- Ein `vendor_match` verweist auf genau einen `vendor`.
- Eine `wedding` kann spaeter viele `quote` und `document` besitzen.

## Warum dieses Modell klein genug ist

Es deckt den MVP ab, ohne schon frueh zu viel Marketplace- oder CRM-Komplexitaet einzubauen.

Bewusst noch nicht modelliert:

- Vendor claims
- Team-Rollen
- Messaging-Threads
- detaillierte Seating-Strukturen
- Payment-Flows

## Fachliche Regeln, die spaeter wichtig werden

- Tasks duerfen nicht nur generisch aus Templates kommen, sondern muessen aus Wedding-Kontext ableitbar sein.
- Vendor-Matches muessen erklaerbar bleiben.
- Budgetdaten muessen mit Unsicherheit umgehen koennen, solange nur Schaetzungen vorliegen.
