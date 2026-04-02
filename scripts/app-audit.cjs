const assert = require("node:assert/strict");
const { mkdir } = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const baseUrl = process.env.WEDDING_AUDIT_URL ?? "http://127.0.0.1:5173";
const outputDir = "C:/Users/Shadow/Documents/wedding/output/playwright";

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

async function runDesktopAudit(browser) {
  const diagnostics = [];
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1800 }
  });
  const page = await context.newPage();
  addDiagnostics(page, diagnostics);

  const uniqueId = Date.now().toString().slice(-6);
  const guestName = `Auditgast ${uniqueId}`;
  const desktopScreenshot = path.join(outputDir, "wedding-app-audit-desktop.png");

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.evaluate(() => window.localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await expectText(page.locator("h1").first(), /Hochzeitsberatung, Schritt fuer Schritt/i);
  await expectText(page.getByRole("heading", { name: "Gespeicherte Profile" }), /Gespeicherte Profile/i);

  await createProfile(page, uniqueId);
  await page.waitForFunction(
    (expectedName) => document.querySelector("h1")?.textContent?.includes(expectedName),
    `Audit & Test ${uniqueId}`
  );
  await expectText(page.locator("h1").first(), new RegExp(`Audit & Test ${uniqueId}`));
  await page.waitForSelector(".consultant-bubble--assistant");
  assert.equal(await page.locator(".content-grid").count(), 0, "Old dashboard grid should be removed");
  await expectText(page.locator(".guided-workbench h2").first(), /Location-Shortlist/i);
  assert(
    (await page.locator(".guided-card-stack--vendors .guided-vendor-card").count()) >= 8,
    "Venue step should expose an expanded local venue selection"
  );
  await expectText(page.locator(".guided-card-stack--vendors").first(), /Bewertung|Offizielle/i);

  const replyLabels = await page.locator(".consultant-reply").allInnerTexts();
  assert(replyLabels.length > 0, "Guided consultation should expose reply chips");
  await page.getByRole("button", { name: replyLabels[0], exact: true }).click();
  await page.locator(".consultant-input").fill(
    "Wir wollen wirklich nur Schritt fuer Schritt gefuehrt werden und jetzt Venue plus Prioritaeten klaeren."
  );
  await page.getByRole("button", { name: "Nachricht senden" }).click();

  const conversationCountBeforeReload = await page.locator(".consultant-bubble").count();
  assert(conversationCountBeforeReload >= 4, "Consultation transcript should contain multiple exchanges");

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".consultant-bubble--assistant");
  const conversationCountAfterReload = await page.locator(".consultant-bubble").count();
  assert(
    conversationCountAfterReload >= conversationCountBeforeReload,
    "Consultation transcript should persist after reload"
  );

  await page.getByRole("button", { name: "Gaesteliste & RSVP" }).click();
  await expectText(page.locator(".guided-workbench h2").first(), /Gaesteliste & RSVP/i);
  await page.getByLabel("Gastname").fill(guestName);
  await page.getByLabel("Haushalt").fill("Familie Audit");
  await page.getByLabel("E-Mail").fill(`audit-${uniqueId}@example.com`);
  await page.getByRole("button", { name: "Gast speichern" }).click();
  await page.waitForFunction(
    (expectedName) =>
      document.querySelector(".guided-guest-list")?.textContent?.includes(expectedName),
    guestName
  );
  await expectText(page.locator(".guided-guest-list"), new RegExp(guestName));

  const guestCard = page.locator(".guided-guest-card", { hasText: guestName }).first();
  const rsvpPath = await guestCard.getByRole("link", { name: "RSVP-Link oeffnen" }).getAttribute("href");
  assert(rsvpPath, "Expected a public RSVP link for the new guest");

  const publicRsvpPage = await context.newPage();
  addDiagnostics(publicRsvpPage, diagnostics);
  await publicRsvpPage.goto(new URL(rsvpPath, baseUrl).toString(), { waitUntil: "networkidle" });
  await publicRsvpPage.getByRole("button", { name: "Wir kommen" }).click();
  await publicRsvpPage.getByLabel("Essenswahl").selectOption("vegan");
  await publicRsvpPage.getByLabel("Allergien oder Hinweise").fill("Bitte vegane Option einplanen.");
  await publicRsvpPage.getByLabel("Nachricht ans Paar").fill("Wir freuen uns sehr auf euch.");
  await publicRsvpPage.getByRole("button", { name: "Antwort speichern" }).click();
  await expectText(publicRsvpPage.locator(".success-text"), /Antwort gespeichert/i);
  await publicRsvpPage.close();

  await page.bringToFront();
  await page.waitForTimeout(2600);
  await expectText(page.locator(".guided-guest-summary"), /Zugesagt:\s*1/i);
  await expectText(page.locator(".guided-guest-list"), /Vegan/i);

  await page.getByRole("button", { name: "Kern-Vendoren" }).click();
  await expectText(page.locator(".guided-workbench h2").first(), /Kern-Vendoren/i);
  await expectText(page.locator(".guided-vendor-filter-tabs"), /Fotografie/i);
  await expectText(page.locator(".guided-vendor-filter-tabs"), /Musik/i);
  await expectText(page.locator(".guided-vendor-filter-tabs"), /Floristik/i);
  await expectText(page.locator(".guided-vendor-filter-tabs"), /Styling & Outfit/i);
  await page.getByRole("tab", { name: /Musik/i }).click();
  await expectText(page.locator(".guided-vendor-group h4").first(), /Musik/i);
  await page.getByRole("button", { name: "Nur mit Portfolio" }).click();
  assert(
    (await page.locator(".guided-vendor-group .guided-vendor-card").count()) >= 3,
    "Core vendor filter should still expose a useful local category slice"
  );
  assert(
    (await page.getByRole("link", { name: /Showcase|Portfolio|Referenzen|Impressionen|Looks & Auswahl/i }).count()) >= 1,
    "Vendor cards should expose at least one portfolio-style link"
  );
  await page.getByRole("button", { name: "Alle" }).click();
  await page.getByLabel("Budgeteintrag").fill("Foto Anzahlung");
  await page.getByLabel("Budgetkategorie").selectOption("photography");
  await page.getByLabel("Betrag").fill("1500");
  await page.getByLabel("Budget-Status").selectOption("paid");
  await page.getByLabel("Budget-Vendor").fill("Studio Nordlicht");
  await page.getByRole("button", { name: "Budgeteintrag speichern" }).click();
  await page.waitForFunction(
    () => document.querySelector(".guided-budget-list")?.textContent?.includes("Foto Anzahlung")
  );
  await expectText(page.locator(".guided-budget-list"), /Foto Anzahlung/i);

  const firstVendorCard = page.locator(".guided-vendor-card").first();
  const vendorName = await firstVendorCard.locator("strong").first().innerText();
  await firstVendorCard.getByLabel("Paket fuer " + vendorName).fill("Premium-Paket");
  await firstVendorCard.getByLabel("Vendor-Status").selectOption("quoted");
  await firstVendorCard.getByLabel("Quote in EUR").fill("2200");
  await firstVendorCard.getByLabel("Anzahlung in EUR fuer " + vendorName).fill("700");
  await firstVendorCard.getByLabel("Verfuegbarkeit fuer " + vendorName).selectOption("available");
  await firstVendorCard.getByLabel("Vertrag fuer " + vendorName).selectOption("received");
  await firstVendorCard.getByLabel("Zahlungsstand fuer " + vendorName).selectOption("deposit-due");
  await firstVendorCard.getByLabel("Naechstes Follow-up fuer " + vendorName).fill("2026-04-12");
  await firstVendorCard.getByLabel("Notiz").fill("Rueckruf am Freitag vereinbart.");
  await firstVendorCard.getByRole("button", { name: "Vendor speichern" }).click();
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll(".guided-vendor-card")).some((card) =>
        card.textContent?.includes("Rueckruf am Freitag vereinbart.")
      )
  );
  await expectText(firstVendorCard, /2\.200 EUR Quote/i);
  await expectText(firstVendorCard, /Premium-Paket/i);
  await expectText(firstVendorCard, /700 EUR/i);
  await expectText(firstVendorCard, /verfuegbar/i);
  await expectText(firstVendorCard, /vorliegend/i);
  await expectText(firstVendorCard, /Rueckruf am Freitag vereinbart\./i);

  await page.getByRole("button", { name: "Profil wechseln" }).click();
  await expectText(page.getByRole("heading", { name: "Gespeicherte Profile" }), /Gespeicherte Profile/i);
  await expectText(page.locator(".profile-library-list"), new RegExp(`Audit & Test ${uniqueId}`));
  await page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: `Profil loeschen Audit & Test ${uniqueId}` }).click();
  await page.waitForTimeout(500);
  assert.doesNotMatch(await page.locator("body").innerText(), new RegExp(`Audit & Test ${uniqueId}`));

  await mkdir(outputDir, { recursive: true });
  await page.screenshot({ path: desktopScreenshot, fullPage: true });

  await context.close();

  return {
    diagnostics,
    desktopScreenshot,
    guestName,
    vendorName,
    conversationCountBeforeReload
  };
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

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await expectText(page.locator("h1").first(), /Hochzeitsberatung, Schritt fuer Schritt/i);
  await expectText(page.getByRole("heading", { name: "Gespeicherte Profile" }), /Gespeicherte Profile/i);
  if ((await page.getByRole("button", { name: "Profil oeffnen" }).count()) === 0) {
    await createProfile(page, "mobile");
  } else {
    await page.getByRole("button", { name: "Profil oeffnen" }).first().click();
  }
  await page.waitForSelector(".consultant-bubble--assistant");
  await page.waitForSelector(".guided-workbench");
  await expectText(page.locator(".guided-workbench .eyebrow").first(), /Aktueller Planungsschritt/i);

  await mkdir(outputDir, { recursive: true });
  await page.screenshot({ path: mobileScreenshot, fullPage: true });
  await context.close();

  return {
    diagnostics,
    mobileScreenshot
  };
}

async function main() {
  const browser = await launchBrowser();

  try {
    const desktop = await runDesktopAudit(browser);
    const mobile = await runMobileAudit(browser);
    const diagnostics = [...desktop.diagnostics, ...mobile.diagnostics];

    console.log(
      JSON.stringify(
        {
          baseUrl,
          desktopScreenshot: desktop.desktopScreenshot,
          mobileScreenshot: mobile.mobileScreenshot,
          guestName: desktop.guestName,
          vendorName: desktop.vendorName,
          conversationCountBeforeReload: desktop.conversationCountBeforeReload,
          diagnostics
        },
        null,
        2
      )
    );

    if (diagnostics.length > 0) {
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
