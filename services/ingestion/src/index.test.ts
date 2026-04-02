import { describe, expect, it } from "vitest";
import { createVendorRefreshJob, createVendorRefreshPlan } from "./index";

describe("vendor refresh planning", () => {
  it("creates a refresh-only strategy for uncovered German regions", () => {
    const plan = createVendorRefreshPlan({
      paidOrderId: "order_123",
      region: "50667 Koeln",
      categories: ["venue", "photography", "music", "magician"],
      requestedBy: "customer-payment"
    });

    expect(plan.strategy.mode).toBe("refresh-only");
    expect(plan.strategy.coverageAreas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "de-postal-50667", kind: "postal-code" }),
        expect.objectContaining({ id: "de-national", kind: "nationwide" })
      ])
    );
  });

  it("adds directory discovery only as a non-publish source", () => {
    const plan = createVendorRefreshPlan({
      paidOrderId: "order_456",
      region: "Deutschland",
      categories: ["music", "magician", "live-artist"],
      requestedBy: "customer-payment"
    });

    expect(plan.connectors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "directory-discovery",
          discoveryOnly: true,
          role: "directory-discovery"
        })
      ])
    );
    expect(plan.publishGate.blockedFields).toContain("thirdPartyReviewScore");
  });

  it("creates queueable jobs for a paid refresh request", () => {
    const job = createVendorRefreshJob({
      paidOrderId: "order_789",
      region: "67454 Hassloch",
      categories: ["venue", "photography"],
      requestedBy: "customer-payment"
    });

    expect(job.status).toBe("queued");
    expect(job.plan.strategy.mode).toBe("curated-plus-refresh");
    expect(job.plan.stages).toHaveLength(6);
  });
});
