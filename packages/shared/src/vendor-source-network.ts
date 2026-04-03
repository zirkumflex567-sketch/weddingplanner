import type { VendorSearchCategory } from "./vendor-refresh";

export type VendorDiscoveryTier = "free-baseline" | "premium-deep-scan";

export interface VendorSourcePortal {
  id: string;
  label: string;
  websiteUrl: string;
  coverage: "germany" | "dach" | "regional" | "global";
  sourceType:
    | "wedding-marketplace"
    | "event-marketplace"
    | "service-directory"
    | "hotel-booking"
    | "maps-directory"
    | "regional-brochure";
  categories: Array<VendorSearchCategory | "venue">;
  strengths: string[];
  freeTierRole: string;
  premiumTierRole: string;
  notes?: string;
}

export interface VendorDiscoveryPolicy {
  freeTier: {
    objective: string;
    executionHost: string;
    steps: string[];
  };
  premiumTier: {
    objective: string;
    executionHost: string;
    steps: string[];
  };
}

export const vendorSourcePortals: ReadonlyArray<VendorSourcePortal> = [
  {
    id: "hochzeits-location-info",
    label: "hochzeits-location.info",
    websiteUrl: "https://hochzeits-location.info/",
    coverage: "dach",
    sourceType: "wedding-marketplace",
    categories: ["venue"],
    strengths: [
      "spezialisierte Hochzeitslocations",
      "Bewertungen, Ausstattungsmerkmale und Vergleich",
      "stark fuer Venue-Baseline in Deutschland"
    ],
    freeTierRole: "Venue-Grundbestand und Bewertungssignale deutschlandweit aufbauen",
    premiumTierRole: "PLZ-/Umkreis-Deep-Scan fuer Venue-Longlist und Alternativen verdichten"
  },
  {
    id: "hochzeitslocation-de",
    label: "Hochzeitslocation.de",
    websiteUrl: "https://hochzeitslocation.de/hochzeitslocation-index/",
    coverage: "germany",
    sourceType: "wedding-marketplace",
    categories: ["venue"],
    strengths: [
      "deutschlandweiter Hochzeitslocation-Index",
      "Preis-, Beliebtheits- und Trendkontext",
      "gut fuer Marktbreite und Cross-Checks"
    ],
    freeTierRole: "Venue-Abdeckung gegen zweite Wedding-Quelle absichern",
    premiumTierRole: "Preisanker, Popularitaet und Zusatzkontext fuer Wunschregion verdichten"
  },
  {
    id: "weddyplace",
    label: "WeddyPlace",
    websiteUrl: "https://www.weddyplace.com/",
    coverage: "dach",
    sourceType: "wedding-marketplace",
    categories: [
      "venue",
      "photography",
      "catering",
      "music",
      "florals",
      "attire",
      "planner",
      "cake",
      "stationery"
    ],
    strengths: [
      "breite Hochzeitsdienstleister-Abdeckung",
      "deutschsprachig und auf Brautpaare fokussiert",
      "stark fuer Vendoren jenseits von Locations"
    ],
    freeTierRole: "Kernkategorien fuer den bundesweiten Seed-Bestand erweitern",
    premiumTierRole: "gezielte Umkreis-Suche fuer Vendoren und Hidden Gems vertiefen"
  },
  {
    id: "weddix",
    label: "weddix Branchenbuch",
    websiteUrl: "https://www.weddix.de/",
    coverage: "germany",
    sourceType: "wedding-marketplace",
    categories: [
      "venue",
      "photography",
      "catering",
      "music",
      "florals",
      "attire",
      "planner",
      "stationery",
      "cake"
    ],
    strengths: [
      "langjaehriges deutsches Hochzeitsportal",
      "breites Branchenbuch fuer viele Dienstleister",
      "gut fuer deutschlandweite Grundausstattung"
    ],
    freeTierRole: "Wedding-spezifische Deutschland-Abdeckung fuer viele Kategorien auffuellen",
    premiumTierRole: "spezielle Vendor-Typen fuer Suchradius und Stilfilter nachziehen"
  },
  {
    id: "wedcheck",
    label: "Alexandras WedCheck",
    websiteUrl: "https://www.wedcheck.de/hochzeitsdienstleister/",
    coverage: "germany",
    sourceType: "wedding-marketplace",
    categories: [
      "venue",
      "photography",
      "music",
      "florals",
      "attire",
      "childcare",
      "stationery",
      "cake",
      "transport"
    ],
    strengths: [
      "viele hochzeitsspezifische Nebenkategorien",
      "hilfreich fuer Premium-Deep-Scans",
      "gut fuer Childcare, Papeterie, Deko und Spezialgewerke"
    ],
    freeTierRole: "sekundaere Kategorien im Datenbestand absichern",
    premiumTierRole: "Spezialdienstleister fuer konkrete Hochzeitsprofile aufspueren"
  },
  {
    id: "weddchecker",
    label: "Weddchecker",
    websiteUrl: "https://www.weddchecker.de/",
    coverage: "germany",
    sourceType: "wedding-marketplace",
    categories: [
      "venue",
      "photography",
      "catering",
      "music",
      "florals",
      "attire"
    ],
    strengths: [
      "deutsches Hochzeitsportal mit Dienstleisterfokus",
      "brauchbar fuer Zusatztreffer und Cross-Checks"
    ],
    freeTierRole: "sekundaere Wedding-Quelle fuer Duplikaterkennung und Coverage",
    premiumTierRole: "Anbieter-Validierung und Alternativen fuer Terminengpaesse"
  },
  {
    id: "eventlocations",
    label: "eventlocations.com",
    websiteUrl: "https://www.eventlocations.com/de/hochzeit",
    coverage: "germany",
    sourceType: "event-marketplace",
    categories: ["venue"],
    strengths: [
      "grosse Deutschland-Abdeckung fuer Event- und Hochzeitslocations",
      "stark fuer nicht explizit als Hochzeit vermarktete Alternativen",
      "hilfreich bei Terminengpaessen"
    ],
    freeTierRole: "Alternative Eventlocations in den Venue-Bestand aufnehmen",
    premiumTierRole: "non-obvious Venue-Alternativen im Wunschradius aufspueren"
  },
  {
    id: "fiylo",
    label: "fiylo",
    websiteUrl: "https://www.fiylo.de/",
    coverage: "germany",
    sourceType: "event-marketplace",
    categories: ["venue", "catering", "transport", "rentals"],
    strengths: [
      "Eventlocations und Top Dienstleister in Deutschland",
      "nutzbar fuer Corporate-/Event-Locations mit Hochzeitsfit",
      "wichtig fuer Ausweichlocations"
    ],
    freeTierRole: "eventnahe Deutschland-Locations fuer den Basispool ergaenzen",
    premiumTierRole: "Regionale Ausweichlocations und Eventdienstleister tief nachziehen"
  },
  {
    id: "eventpeppers",
    label: "eventpeppers",
    websiteUrl: "https://www.eventpeppers.com/",
    coverage: "germany",
    sourceType: "event-marketplace",
    categories: ["music", "live-artist", "magician", "officiant"],
    strengths: [
      "stark fuer Entertainment, Musik und Show",
      "hilfreich fuer Hochzeit plus Rahmenprogramm",
      "deutschlandweit gut abgedeckt"
    ],
    freeTierRole: "Musik- und Entertainment-Grundbestand deutschlandweit bauen",
    premiumTierRole: "feinere Artist- und Entertainment-Suche im Wunschumkreis vertiefen"
  },
  {
    id: "trustlocal",
    label: "Trustlocal",
    websiteUrl: "https://trustlocal.de/",
    coverage: "germany",
    sourceType: "service-directory",
    categories: ["photography", "catering", "music", "florals", "attire", "planner"],
    strengths: [
      "verifizierte Dienstleister mit Preis- und Bewertungssignalen",
      "gut fuer Fotografen, Caterer, DJs und lokale Services",
      "brauchbar fuer Preisanker"
    ],
    freeTierRole: "Vendoren ausserhalb reiner Hochzeitsportale strukturierter abdecken",
    premiumTierRole: "Preis- und Bewertungsbild fuer konkrete Suchgebiete schaerfen"
  },
  {
    id: "booking",
    label: "Booking.com",
    websiteUrl: "https://www.booking.com/",
    coverage: "global",
    sourceType: "hotel-booking",
    categories: ["lodging"],
    strengths: [
      "breite Hotelabdeckung",
      "sinnvoll fuer Gastportal und Uebernachtungsoptionen",
      "affiliate-faehiger Zielpfad"
    ],
    freeTierRole: "Generische Unterkunftslinks im Deutschland-Bestand ermoeglichen",
    premiumTierRole: "konkrete Hotelvorschlaege nahe Venue mit Affiliate-Pfad ausgeben",
    notes:
      "Im Produkt bevorzugt als Weiterleitung oder eingebettete Karten/Meta-Infos nutzen, statt nur lokale Hochzeitslocations als Stay-Suggestions."
  }
];

export const vendorDiscoveryPolicy: VendorDiscoveryPolicy = {
  freeTier: {
    objective:
      "htown baut eine deutschlandweite Grundausstattung fuer Locations und Kernvendoren auf und nutzt dabei nur kontrollierte, nachvollziehbare Quellen.",
    executionHost: "htown",
    steps: [
      "deutschlandweite Basislisten aus Wedding- und Event-Portalen sammeln",
      "in das vorhandene VendorSeed-/VendorMatch-Schema normalisieren",
      "Kontakt, Adresse, Preisanker und Quellen wenn moeglich direkt erfassen",
      "alternative Eventlocations mit Hochzeitsfit bewusst mit aufnehmen",
      "Unterkunftsdaten bevorzugt ueber Booking.com-kompatible Zielpfade ausgeben"
    ]
  },
  premiumTier: {
    objective:
      "Premium fuehrt fuer PLZ, Stadt oder Radius einen tieferen Suchlauf aus und sucht zusaetzlich nach unabh??ngigen Anbietern ausserhalb der grossen Portale.",
    executionHost: "htown-first, optional later shadow/cloud for heavy scans",
    steps: [
      "Portal-Suche fuer Wunsch-PLZ, Stadt oder Umkreis vertiefen",
      "danach explizit nach offiziellen Vendor-Websites und lokalen Alternativen suchen",
      "nicht-hochzeitsspezifische, aber gut passende Locations als Ausweichoptionen markieren",
      "Unterkuenfte im Venue-Umfeld mit Affiliate-Zielen und Anreisebezug priorisieren",
      "nur Daten des aktuellen Nutzer-Workspaces weiter anreichern, niemals global unkontrolliert ueberschreiben"
    ]
  }
};

