import type { VendorSearchCategory } from "@wedding/shared";

export const germanSweepRegions: string[] = [
  "Berlin",
  "Hamburg",
  "Muenchen",
  "Koeln",
  "Frankfurt am Main",
  "Stuttgart",
  "Duesseldorf",
  "Leipzig",
  "Dresden",
  "Bremen",
  "Hannover",
  "Nuernberg",
  "Dortmund",
  "Essen",
  "Duisburg",
  "Bochum",
  "Bonn",
  "Mannheim",
  "Karlsruhe",
  "Augsburg",
  "Wiesbaden",
  "Mainz",
  "Muenster",
  "Kiel",
  "Rostock",
  "Freiburg im Breisgau",
  "Saarbruecken",
  "Erfurt",
  "Magdeburg",
  "Potsdam",
  "Flensburg",
  "Koblenz"
];

export const germanSweepCategories: VendorSearchCategory[] = [
  "venue",
  "photography",
  "catering",
  "music",
  "florals",
  "attire",
  "planner",
  "cake",
  "stationery",
  "transport",
  "lodging",
  "officiant",
  "videography",
  "photobooth",
  "magician",
  "live-artist",
  "childcare",
  "rentals"
];

export function chunkArray<T>(input: T[], chunkSize: number) {
  const chunks: T[][] = [];
  const size = Math.max(1, chunkSize);
  for (let index = 0; index < input.length; index += size) {
    chunks.push(input.slice(index, index + size));
  }
  return chunks;
}
