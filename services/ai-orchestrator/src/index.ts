import type { VendorRefreshJob } from "@wedding/ingestion";

export interface VendorResearchBrief {
  headline: string;
  instructions: string[];
  outputRequirements: string[];
}

export function createVendorResearchBrief(
  job: VendorRefreshJob
): VendorResearchBrief {
  return {
    headline: `Vendor refresh for ${job.request.region}`,
    instructions: [
      "Use directory sources only for discovery candidate generation.",
      "Prefer first-party websites, official brochures, and claimed profiles for publishable facts.",
      "Reject third-party review scores as product truth."
    ],
    outputRequirements: [
      "Return structured facts with provenance.",
      "Attach freshness timestamps per record.",
      "Mark missing required fields before publish."
    ]
  };
}
