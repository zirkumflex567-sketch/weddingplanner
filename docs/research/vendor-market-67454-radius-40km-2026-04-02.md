# Vendor Market 67454 Radius 40 km

## Scope

- Search center: `67454 / Hassloch`
- Radius intent: roughly `40 km`
- Seeded first for categories already used in the prototype:
  - venue
  - photography
  - catering

## Working Rule

- Prefer official vendor websites or official brochures
- Keep price data as:
  - official, when a brochure or price page exists
  - estimated, when the official site confirms the service but not the public rate
- Keep every seed traceable to a source URL

## Curated Seeds

### Venues

#### THE SPACE

- City: Hassloch
- Why seeded: direct local option in `67454`
- Source:
  - `https://the-space.bar/reservieren/`
- Notes:
  - official reservation page lists `Fritz-Karl-Henkel-Strasse 13, 67454 Hassloch`
  - public wedding-specific pricing not visible
  - prototype uses an estimated total band

#### Rebe Deidesheim

- City: Deidesheim
- Source:
  - `https://www.rebe-deidesheim.de/kontakt`
  - `https://www.straub-catering.de/locations/rebe-deidesheim/`
- Notes:
  - official contact page provides address and inquiry flow
  - official location page explicitly lists weddings and freie Trauungen
  - prototype uses an estimated total band

#### Hambacher Schloss

- City: Neustadt an der Weinstrasse
- Source:
  - `https://www.hambacherschloss-pfalz.de/hochzeitsbroschuere.pdf`
- Notes:
  - official brochure shows wedding use cases, capacity context and package anchors
  - public anchors include room fee and per-person rates
  - prototype models this as `per-person-plus-fixed`

#### Deidesheimer Hof

- City: Deidesheim
- Source:
  - `https://www.deidesheimerhof.de/de/feiern3/hochzeitsfeiern/hochzeitsarrangement`
  - `https://www.deidesheimerhof.de/storage/app/media/Documents/Flyer%20Hochzeiten.pdf`
- Notes:
  - official page and flyer confirm wedding packages
  - public rates are shown per person
  - prototype models this as `per-person`

### Photography

#### Nicitello Fotografie

- City: Hassloch
- Source:
  - `https://www.nicitello.de/`
  - `https://www.nicitello.de/kontakt/`
- Notes:
  - local fit for the `67454` center
  - official site confirms wedding specialization
  - no public package list found during this pass
  - prototype uses an estimated total band

#### Foto Speyer

- City: Speyer
- Source:
  - `https://www.foto-speyer.de/hochzeitsfotograf`
- Notes:
  - official page exposes wedding example packages
  - public anchors include `ab 549 EUR`, `ab 1090 EUR`, `ab 1600 EUR`
  - prototype uses a pragmatic full-day oriented band for matching

#### Markus Husner

- City: Bad Duerkheim
- Source:
  - `https://www.markushusner.com/hochzeitsfotograf/`
- Notes:
  - official page positions the service clearly for weddings in the Pfalz
  - no simple public full price list on the page used here
  - prototype uses an estimated total band

#### Lina Wissen Fotografie

- City: Neustadt an der Weinstrasse
- Source:
  - `https://www.linawissen.com/`
- Notes:
  - official portfolio and regional positioning are visible
  - no public wedding pricing found during this pass
  - kept as an estimated band seed

### Catering

#### Event Taste

- City: Hassloch
- Source:
  - `https://www.eventtaste.de/`
- Notes:
  - official site explicitly positions the business as restaurant, event location and catering service in Hassloch
  - no public wedding package prices found during this pass
  - prototype uses an estimated total band

#### Luckies Catering

- City: Landau / Herxheim
- Source:
  - `https://luckies-catering.de/`
- Notes:
  - official site explicitly addresses weddings and on-site planning
  - price is offered after consultation
  - prototype uses an estimated total band

#### Straub Catering

- City: Speyer
- Source:
  - `https://www.straub-catering.de/`
  - `https://www.straub-catering.de/locations/rebe-deidesheim/`
- Notes:
  - official site and location reference show regional wedding activity
  - no public standard wedding pricing found during this pass
  - prototype uses an estimated total band

## Product Use

- The prototype now resolves `67454` and `Hassloch` to the same curated coverage area
- Seeds are stored in:
  - `packages/shared/src/vendor-seeds.ts`
  - `data/curated/vendor-seeds-67454-radius-40km.json`
- Matching is still curated, not marketplace-complete

## Next Data Steps

- Replace estimated price bands with stronger official anchors where possible
- Add music, florals and styling for the same radius
- Add freshness checks and a lightweight review workflow for stale records
