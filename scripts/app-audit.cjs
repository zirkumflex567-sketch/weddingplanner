const assert = require("node:assert/strict");
const { mkdir } = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const baseUrl = process.env.WEDDING_AUDIT_URL ?? "http://127.0.0.1:5173";
const outputDir = path.resolve(process.cwd(), ".gsd/artifacts/playwright");
const INTERACTION_TIMEOUT_MS = 10_000;

function addDiagnostics(page, bucket) {
  page.on("pageerror", (error) => {
    bucket.push(`pageerror:${error.message}`);
  });

  page.on("console", (message) => {
    if (message.type() === "error") {
      bucket.push(`console:${message.text()}`);
    }
  });

  page.on("response", (response) => {
    if (response.url().startsWith(baseUrl) && response.status() >= 400) {
      bucket.push(`http:${response.status()} ${response.url()}`);
    }
  });
}

async function launchBrowser() {
  try {
    return await chromium.launch({ headless: true, channel: "msedge" });
  } catch {
    return chromium.launch({ headless: true });
  }
}

async function expectText(locator, pattern) {
  const text = await locator.innerText();
  assert.match(text, pattern);
}

async function expectAnyText(locator, patterns) {
  const text = await locator.innerText();
  const matched = patterns.some((pattern) => pattern.test(text));
  assert(matched, `Expected text to match one of ${patterns.map((pattern) => pattern).join(", ")}. Got: ${text}`);
}

async function requireVisible(locator, label) {
  const count = await locator.count();
  assert(count > 0, `[${label}] Missing locator in page structure`);
  await locator.first().waitFor({ state: "visible", timeout: INTERACTION_TIMEOUT_MS });
  return locator.first();
}

async function runInteractionStep(diagnostics, label, action) {
  const startedAt = Date.now();

  try {
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    diagnostics.push(`interaction:${label}:failed:${message}`);
    throw new Error(`[${label}] ${message}`);
  } finally {
    diagnostics.push(`interaction:${label}:durationMs:${Date.now() - startedAt}`);
  }
}

async function createProfile(page, uniqueId) {
  await page.getByRole("button", { name: "Neues Beratungsprofil" }).click();
  await page.getByLabel("Paarname").fill(`Audit & Test ${uniqueId}`);
  await page.getByLabel("Hochzeitsdatum").fill("2027-08-21");
  await page.getByLabel("Region").fill("67454 Hassloch");
  await page.getByLabel("Gaesteziel").fill("72");
  await page.getByLabel("Budget in EUR").fill("26000");
  await page.getByLabel("Stilpraeferenzen").fill("natuerlich, editorial");
  await page.getByLabel("No-Gos").fill("ballroom");
  await page.getByRole("button", { name: "Beratung mit diesem Profil starten" }).click();
}

async function enterWorkspace(page, diagnostics, labelPrefix) {
  const openProfileButtons = page.getByRole("button", { name: /^Profil oeffnen$/i });

  if ((await openProfileButtons.count()) > 0) {
    await runInteractionStep(diagnostics, `${labelPrefix}:open-existing-profile`, async () => {
      await openProfileButtons.first().click({ timeout: INTERACTION_TIMEOUT_MS });
    });
  } else {
    await runInteractionStep(diagnostics, `${labelPrefix}:create-profile`, async () => {
      await createProfile(page, `${labelPrefix}-${Date.now().toString().slice(-6)}`);
    });
  }

  await page.waitForSelector(".workspace-shell", { timeout: INTERACTION_TIMEOUT_MS });
}

async function runDesktopAudit(browser) {
  const diagnostics = [];
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1800 }
  });
  const page = await context.newPage();
  addDiagnostics(page, diagnostics);
  const desktopScreenshot = path.join(outputDir, "wedding-app-audit-desktop.png");

  try {
    await runInteractionStep(diagnostics, "desktop:load-app", async () => {
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await page.evaluate(() => window.localStorage.clear());
      await page.reload({ waitUntil: "networkidle" });
      await expectAnyText(page.locator("h1").first(), [
        /Hochzeitsberatung, Schritt fuer Schritt/i,
        /Eine kuratierte Planungsoberflaeche statt einer ueberschallten Checklistenwand\./i
      ]);
      await expectText(page.getByRole("heading", { name: "Gespeicherte Profile" }), /Gespeicherte Profile/i);
    });

    await runInteractionStep(diagnostics, "desktop:enter-workspace", async () => {
      await enterWorkspace(page, diagnostics, "desktop");
      await requireVisible(page.getByRole("button", { name: /Plan Your Day/i }), "desktop topbar timeline button");
      assert((await page.locator(".workspace-rail").count()) > 0, "Expected workspace rail in workspace");
      assert((await page.locator(".workspace-underlay").count()) > 0, "Expected workspace underlay in workspace");
      assert((await page.locator(".rail-nav__item").count()) >= 4, "Expected rail navigation items in workspace");
    });

    await mkdir(outputDir, { recursive: true });
    await page.screenshot({ path: desktopScreenshot, fullPage: true });

    return {
      diagnostics,
      desktopScreenshot,
      guestName: null,
      vendorName: null,
      conversationCountBeforeReload: 0
    };
  } finally {
    await context.close();
  }
}

async function runMobileAudit(browser) {
  const diagnostics = [];
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });
  const page = await context.newPage();
  addDiagnostics(page, diagnostics);
  const mobileScreenshot = path.join(outputDir, "wedding-app-audit-mobile.png");

  try {
    await runInteractionStep(diagnostics, "mobile:load-app", async () => {
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await expectAnyText(page.locator("h1").first(), [
        /Hochzeitsberatung, Schritt fuer Schritt/i,
        /Eine kuratierte Planungsoberflaeche statt einer ueberschallten Checklistenwand\./i
      ]);
      await expectText(page.getByRole("heading", { name: "Gespeicherte Profile" }), /Gespeicherte Profile/i);
    });

    await runInteractionStep(diagnostics, "mobile:enter-workspace", async () => {
      await enterWorkspace(page, diagnostics, "mobile");
      await requireVisible(page.getByRole("button", { name: /^Menue$/i }), "mobile topbar menu toggle");
      assert((await page.locator(".workspace-rail").count()) > 0, "Expected workspace rail in workspace");
      assert((await page.locator(".workspace-underlay").count()) > 0, "Expected workspace underlay in workspace");
    });

    await runInteractionStep(diagnostics, "mobile:open-menu-toggle", async () => {
      const menuToggle = await requireVisible(
        page.getByRole("button", { name: /^Menue$/i }),
        "topbar menu toggle"
      );
      await menuToggle.click({ timeout: INTERACTION_TIMEOUT_MS });
      await page.waitForFunction(
        () =>
          document.querySelector(".workspace-rail")?.classList.contains("workspace-rail--open") &&
          document
            .querySelector(".workspace-underlay")
            ?.classList.contains("workspace-underlay--visible"),
        { timeout: INTERACTION_TIMEOUT_MS }
      );
    });

    await runInteractionStep(diagnostics, "mobile:rail-nav-to-guests", async () => {
      const railGuests = await requireVisible(
        page
          .locator(".workspace-rail.workspace-rail--open .rail-nav")
          .getByRole("button", { name: /Gaeste/i }),
        "rail guests navigation button"
      );
      await railGuests.evaluate((element) => {
        (element).click();
      });
      await requireVisible(
        page.locator(".rail-nav__item--active", { hasText: "Gaeste" }),
        "active guests rail marker"
      );
    });

    await runInteractionStep(diagnostics, "mobile:underlay-close", async () => {
      const underlayVisible = await page
        .locator(".workspace-underlay.workspace-underlay--visible")
        .count();

      if (underlayVisible === 0) {
        const menuToggle = await requireVisible(
          page.getByRole("button", { name: /^Menue$/i }),
          "topbar menu toggle for underlay close"
        );
        await menuToggle.click({ timeout: INTERACTION_TIMEOUT_MS });
      }

      const underlayVisibleAfterOpen = await page
        .locator(".workspace-underlay.workspace-underlay--visible")
        .count();
      assert(underlayVisibleAfterOpen > 0, "Expected visible-class underlay before close tap");

      await page.evaluate(() => {
        const underlay = document.querySelector(".workspace-underlay.workspace-underlay--visible");
        if (!(underlay instanceof HTMLElement)) {
          throw new Error("mobile underlay element missing");
        }
        underlay.click();
      });
      await page.waitForFunction(
        () =>
          !document
            .querySelector(".workspace-underlay")
            ?.classList.contains("workspace-underlay--visible") &&
          !document.querySelector(".workspace-rail")?.classList.contains("workspace-rail--open"),
        { timeout: INTERACTION_TIMEOUT_MS }
      );
    });

    await runInteractionStep(diagnostics, "mobile:topbar-nav-timeline", async () => {
      const topbarTimeline = await requireVisible(
        page.getByRole("button", { name: /Plan Your Day/i }),
        "topbar timeline button"
      );
      await topbarTimeline.click({ timeout: INTERACTION_TIMEOUT_MS });
      const activeDockPlan = page.locator(".mobile-dock__item--active", { hasText: "Plan" });
      await requireVisible(activeDockPlan, "mobile dock active plan marker");
    });

    await runInteractionStep(diagnostics, "mobile:dock-nav-vendors", async () => {
      const dockVendors = await requireVisible(
        page.locator(".mobile-dock__item", { hasText: "Vendoren" }),
        "mobile dock vendors button"
      );
      await dockVendors.click({ timeout: INTERACTION_TIMEOUT_MS });
      await requireVisible(
        page.locator(".mobile-dock__item--active", { hasText: "Vendoren" }),
        "mobile dock active vendors marker"
      );
      await requireVisible(
        page.locator(".rail-nav__item--active", { hasText: "Vendoren" }),
        "active vendors rail marker"
      );
    });

    await mkdir(outputDir, { recursive: true });
    await page.screenshot({ path: mobileScreenshot, fullPage: true });

    return {
      diagnostics,
      mobileScreenshot
    };
  } finally {
    await context.close();
  }
}

async function main() {
  const browser = await launchBrowser();

  try {
    const desktop = await runDesktopAudit(browser);
    const mobile = await runMobileAudit(browser);
    const diagnostics = [...desktop.diagnostics, ...mobile.diagnostics];
    const blockingDiagnostics = diagnostics.filter((entry) =>
      /^(pageerror:|console:|http:|interaction:.*:failed:)/.test(entry)
    );

    console.log(
      JSON.stringify(
        {
          baseUrl,
          desktopScreenshot: desktop.desktopScreenshot,
          mobileScreenshot: mobile.mobileScreenshot,
          guestName: desktop.guestName,
          vendorName: desktop.vendorName,
          conversationCountBeforeReload: desktop.conversationCountBeforeReload,
          diagnostics,
          blockingDiagnostics
        },
        null,
        2
      )
    );

    if (blockingDiagnostics.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
