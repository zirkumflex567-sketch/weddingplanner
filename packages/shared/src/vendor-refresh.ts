import type { VendorSeedCategory } from "./vendor-seeds";

export type VendorSearchCategory =
  | VendorSeedCategory
  | "videography"
  | "photobooth"
  | "magician"
  | "live-artist"
  | "stationery"
  | "cake"
  | "transport"
  | "lodging"
  | "planner"
  | "officiant"
  | "childcare"
  | "rentals";

export type VendorCoverageKind =
  | "curated-area"
  | "postal-code"
  | "city"
  | "region"
  | "nationwide";

export interface VendorCoverageArea {
  id: string;
  label: string;
  kind: VendorCoverageKind;
  queryText: string;
  curated: boolean;
}

export interface VendorSearchStrategy {
  mode: "curated-plus-refresh" | "refresh-only";
  requiresPaidRefresh: boolean;
  curatedCoverageAreaIds: string[];
  coverageAreas: VendorCoverageArea[];
  refreshCategories: VendorSearchCategory[];
  note: string;
}

interface CuratedCoverageAreaConfig {
  id: string;
  label: string;
  aliases: string[];
}

const curatedCoverageAreas: ReadonlyArray<CuratedCoverageAreaConfig> = [
  {
    id: "berlin-core",
    label: "Berlin",
    aliases: ["berlin", "berlin mitte", "berlin city"]
  },
  {
    id: "potsdam-core",
    label: "Potsdam",
    aliases: ["potsdam", "brandenburg potsdam"]
  },
  {
    id: "67454-radius-40km",
    label: "67454 Hassloch + 40 km",
    aliases: ["67454", "hassloch", "haßloch", "hassloch pfalz", "haßloch pfalz"]
  }
];

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

function createBaseCoverageArea(region: string): VendorCoverageArea {
  const normalizedRegion = normalizeSearchText(region);
  const postalCodeMatch = normalizedRegion.match(/\b\d{5}\b/);

  if (postalCodeMatch) {
    return {
      id: `de-postal-${postalCodeMatch[0]}`,
      label: `PLZ ${postalCodeMatch[0]}`,
      kind: "postal-code",
      queryText: postalCodeMatch[0],
      curated: false
    };
  }

  if (normalizedRegion.includes("deutschland")) {
    return {
      id: "de-national-input",
      label: "Deutschland",
      kind: "nationwide",
      queryText: "Deutschland",
      curated: false
    };
  }

  return {
    id: `de-region-${normalizedRegion.replace(/ /g, "-") || "unknown"}`,
    label: region,
    kind: region.includes(",") ? "region" : "city",
    queryText: region,
    curated: false
  };
}

export function buildVendorSearchStrategy(
  region: string,
  categories: VendorSearchCategory[]
): VendorSearchStrategy {
  const normalizedRegion = normalizeSearchText(region);
  const matchedCuratedAreas = curatedCoverageAreas.filter((area) =>
    area.aliases.some((alias) => {
      const normalizedAlias = normalizeSearchText(alias);
      return (
        normalizedRegion.includes(normalizedAlias) ||
        normalizedAlias.includes(normalizedRegion)
      );
    })
  );

  const coverageAreas: VendorCoverageArea[] = [
    createBaseCoverageArea(region),
    ...matchedCuratedAreas.map((area) => ({
      id: area.id,
      label: area.label,
      kind: "curated-area" as const,
      queryText: region,
      curated: true
    }))
  ];

  if (!coverageAreas.some((area) => area.id === "de-national")) {
    coverageAreas.push({
      id: "de-national",
      label: "Deutschland",
      kind: "nationwide",
      queryText: "Deutschland",
      curated: false
    });
  }

  const curatedCoverageAreaIds = matchedCuratedAreas.map((area) => area.id);
  const requiresPaidRefresh = true;

  return {
    mode: curatedCoverageAreaIds.length > 0 ? "curated-plus-refresh" : "refresh-only",
    requiresPaidRefresh,
    curatedCoverageAreaIds,
    coverageAreas,
    refreshCategories: [...categories],
    note:
      curatedCoverageAreaIds.length > 0
        ? "Kuratierte Seeds koennen sofort gezeigt werden; eine bezahlte Refresh-Pipeline erweitert und aktualisiert deutschlandweit."
        : "Keine kuratierte Sofortabdeckung fuer diese Region. Ergebnisse sollten ueber die bezahlte Refresh-Pipeline erzeugt werden."
  };
}
