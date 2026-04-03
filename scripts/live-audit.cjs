const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const { copyFile, mkdir, writeFile } = require("node:fs/promises");
const path = require("node:path");
const { promisify } = require("node:util");
const { chromium, devices } = require("playwright");

const baseUrl = process.env.WEDDING_AUDIT_URL ?? "https://h-town.duckdns.org/wedding/";
const outputDir =
  process.env.WEDDING_AUDIT_OUTPUT ??
  path.join(process.cwd(), "artifacts", "playwright-live-audit");
const screenshotDir = path.join(outputDir, "screens");
const videoDir = path.join(outputDir, "videos");
const storyboardDir = path.join(outputDir, "storyboards");
const frameDir = path.join(outputDir, "frames");
const ffmpegBinary = process.env.WEDDING_AUDIT_FFMPEG_BIN ?? "ffmpeg";
const headlessMode = process.env.WEDDING_AUDIT_HEADLESS === "1";
const slowMo = Number.parseInt(process.env.WEDDING_AUDIT_SLOW_MO ?? "120", 10);
const shouldRecordVideo = process.env.WEDDING_AUDIT_RECORD_VIDEO !== "0";
const shouldExtractFrames = process.env.WEDDING_AUDIT_EXTRACT_FRAMES !== "0";
const shouldCreateStoryboards = process.env.WEDDING_AUDIT_CREATE_STORYBOARDS !== "0";
const hostResolverRule =
  process.env.WEDDING_AUDIT_HOST_RESOLVER_RULE ?? "MAP h-town.duckdns.org 100.95.155.22";
const execFileAsync = promisify(execFile);

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function launchBrowser() {
  const browserArgs = [
    ...(headlessMode ? [] : ["--start-maximized"]),
    ...(hostResolverRule ? [`--host-resolver-rules=${hostResolverRule}`] : [])
  ];
  const launchOptions = {
    headless: headlessMode,
    slowMo,
    args: browserArgs
  };

  try {
    if (process.platform === "win32") {
      return await chromium.launch({ ...launchOptions, channel: "msedge" });
    }
  } catch {
    // Fall back to the bundled Chromium if the preferred channel is unavailable.
  }

  return chromium.launch(launchOptions);
}

function createApiUrl(pathName) {
  return new URL(`api${pathName}`, baseUrl).toString();
}

async function fetchJson(pathName) {
  const response = await fetch(createApiUrl(pathName), {
    headers: {
      accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`API request failed for ${pathName} with ${response.status}`);
  }

  return response.json();
}

async function fetchJsonInPage(page, pathName) {
  return page.evaluate(async ({ pathName, baseUrl }) => {
    const response = await fetch(new URL(`api${pathName}`, baseUrl).toString(), {
      headers: {
        accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`API request failed for ${pathName} with ${response.status}`);
    }

    return response.json();
  }, { pathName, baseUrl });
}

function addDiagnostics(page, bucket, label) {
  page.on("pageerror", (error) => {
    bucket.push(`[${label}] pageerror: ${error.message}`);
  });

  page.on("console", (message) => {
    if (message.type() === "error") {
      bucket.push(`[${label}] console: ${message.text()}`);
    }
  });

  page.on("requestfailed", (request) => {
    const errorText = request.failure()?.errorText ?? "unknown";

    if (errorText.includes("ERR_ABORTED")) {
      return;
    }

    bucket.push(
      `[${label}] requestfailed: ${errorText} ${request.url()}`
    );
  });

  page.on("response", (response) => {
    if (response.status() >= 400) {
      bucket.push(`[${label}] http:${response.status()} ${response.url()}`);
    }
  });
}

function sanitizeFileSegment(value) {
  return value.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "");
}

async function capture(page, fileName) {
  await mkdir(screenshotDir, { recursive: true });
  const screenshotPath = path.join(screenshotDir, fileName);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  return screenshotPath;
}

async function extractFrames(videoPath, label) {
  if (!shouldExtractFrames) {
    return null;
  }

  const framesOutputDir = path.join(frameDir, sanitizeFileSegment(label));
  await mkdir(framesOutputDir, { recursive: true });

  await execFileAsync(ffmpegBinary, [
    "-y",
    "-i",
    videoPath,
    "-q:v",
    "3",
    path.join(framesOutputDir, "frame-%06d.jpg")
  ]);

  return framesOutputDir;
}

async function createStoryboard(videoPath, label) {
  if (!shouldCreateStoryboards) {
    return null;
  }

  await mkdir(storyboardDir, { recursive: true });
  const storyboardPath = path.join(storyboardDir, `${sanitizeFileSegment(label)}.jpg`);

  await execFileAsync(ffmpegBinary, [
    "-y",
    "-i",
    videoPath,
    "-vf",
    "fps=1,scale=480:-1,tile=3x4",
    "-frames:v",
    "1",
    storyboardPath
  ]);

  return storyboardPath;
}

async function collectRecordedVideos(videoEntries) {
  if (!shouldRecordVideo) {
    return [];
  }

  await mkdir(videoDir, { recursive: true });

  const harvestedVideos = [];
  for (const entry of videoEntries) {
    if (!entry?.video) {
      continue;
    }

    const originalVideoPath = await entry.video.path();
    const extension = path.extname(originalVideoPath) || ".webm";
    const finalVideoPath = path.join(videoDir, `${sanitizeFileSegment(entry.label)}${extension}`);

    if (path.resolve(originalVideoPath) !== path.resolve(finalVideoPath)) {
      await copyFile(originalVideoPath, finalVideoPath);
    }

    const storyboardPath = await createStoryboard(finalVideoPath, entry.label);
    const framesPath = await extractFrames(finalVideoPath, entry.label);

    harvestedVideos.push({
      label: entry.label,
      videoPath: finalVideoPath,
      storyboardPath,
      framesPath
    });
  }

  return harvestedVideos;
}

async function goToRailPage(page, pageName) {
  const navButton = page
    .locator(".rail-nav__item")
    .filter({ hasText: new RegExp(escapeRegex(pageName), "i") })
    .first();
  await navButton.scrollIntoViewIfNeeded();
  await navButton.click();
  await page.waitForTimeout(250);
}

async function expectVisible(page, selector) {
  await page.locator(selector).first().waitFor({ state: "visible" });
}

async function gotoApp(page) {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.evaluate(() => window.localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await expectVisible(page, "body");
}

async function createProfile(page, uniqueId) {
  await page.getByRole("button", { name: "Neues Beratungsprofil" }).click();
  await page.getByLabel("Paarname").fill(`QA Atelier ${uniqueId}`);
  await page.getByLabel("Hochzeitsdatum").fill("2027-08-21");
  await page.getByLabel("Region").fill("67454 Hassloch");
  await page.getByLabel("Gaesteziel").fill("72");
  await page.getByLabel("Budget in EUR").fill("26000");
  await page.getByLabel("Stilpraeferenzen").fill("editorial, natuerlich, modern");
  await page.getByLabel("No-Gos").fill("ballroom, neon");
  await page.getByRole("button", { name: "Beratung mit diesem Profil starten" }).click();
  await page.waitForSelector(".workspace-shell");
  await page.waitForFunction(
    (expectedName) => document.querySelector(".hero-stage h1")?.textContent?.includes(expectedName),
    `QA Atelier ${uniqueId}`
  );
  return `QA Atelier ${uniqueId}`;
}

async function openConsultant(page) {
  await page.getByRole("button", { name: "Concierge", exact: true }).click();
  await page.waitForSelector(".consultant-drawer");
  await page.locator(".consultant-bubble--assistant").first().waitFor({ state: "visible" });
}

async function closeConsultant(page) {
  await page.getByRole("button", { name: "Chat schliessen" }).click();
  await page.waitForSelector(".consultant-drawer", { state: "hidden" });
}

async function exerciseConsultant(page, artifacts) {
  await openConsultant(page);
  artifacts.consultant = await capture(page, "02-consultant-drawer-desktop.png");

  const replyButtons = page.locator(".consultant-reply");
  assert((await replyButtons.count()) > 0, "Consultant should expose quick replies.");

  const input = page.locator(".consultant-input");
  if (!(await input.isDisabled())) {
    const freeChip = page.getByRole("button", { name: "Free", exact: true });
    const premiumChip = page.getByRole("button", { name: "Premium", exact: true });
    const operatorButton = page.getByRole("button", { name: "Operator", exact: true });
    await freeChip.waitFor({ state: "visible" });
    await premiumChip.waitFor({ state: "visible" });
    assert(await operatorButton.isDisabled(), "Operator should be disabled in free mode.");

    await premiumChip.click();
    await operatorButton.click();
    await page.waitForFunction(
      () =>
        document
          .querySelector(".consultant-input")
          ?.getAttribute("placeholder")
          ?.includes("Deaktiviere Catering") ?? false
    );
    artifacts.consultantOperator = await capture(page, "02b-consultant-operator-desktop.png");

    await input.fill("Wenn 50 Erwachsene und 20 Kinder zum Hambacher Schloss gehen, was kostet das ca?");
    await page.getByRole("button", { name: "Nachricht senden" }).click();
    await page.getByText(/Hambacher Schloss/i).last().waitFor();
    await page.getByText(/EUR/i).last().waitFor();

    await input.fill("Gib mir bitte die Kontaktdaten fuer unsere venues.");
    await page.getByRole("button", { name: "Nachricht senden" }).click();
    await page.getByText(/THE SPACE|Hambacher Schloss|Rebe Deidesheim/i).last().waitFor();

    await input.fill(
      [
        "Bitte passe die Einladung direkt an:",
        "Headline: {paar} wartet auf eure Rueckmeldung",
        "Text: {gast}, bitte kommt in festlicher Kleidung und gebt uns eine kurze Rueckmeldung fuer {datum} in {ort}.",
        "Fusszeile: Wir freuen uns riesig auf einen entspannten Abend mit euch."
      ].join("\n")
    );
    await page.getByRole("button", { name: "Nachricht senden" }).click();
    await page.getByText(/Einladung direkt im Workspace aktualisiert/i).last().waitFor();

    const importedGuestName = `Consultant QA ${Date.now().toString().slice(-5)}`;
    artifacts.importedGuestName = importedGuestName;
    await input.fill(
      [
        "Bitte uebernimm diese Gaeste direkt in die Liste:",
        `${importedGuestName}, Familie Consultant, consultant-${Date.now()
          .toString()
          .slice(-5)}@example.com`
      ].join("\n")
    );
    await page.getByRole("button", { name: "Nachricht senden" }).click();
    await page.getByText(new RegExp(importedGuestName)).last().waitFor();

    await page.getByRole("button", { name: "Consultant", exact: true }).click();
    await page.waitForFunction(
      () =>
        document
          .querySelector(".consultant-input")
          ?.getAttribute("placeholder")
          ?.includes("Budget, Location, Gaeste") ?? false
    );

    await page.reload({ waitUntil: "networkidle" });
    await openConsultant(page);
    await page.waitForFunction(
      (name) =>
        Array.from(document.querySelectorAll(".consultant-bubble")).some((bubble) =>
          bubble.textContent?.includes(name)
        ),
      importedGuestName
    );
    const sessionPayload = await fetchJsonInPage(
      page,
      `/prototype/consultant/sessions/${await page.evaluate(() => localStorage.getItem("wedding.prototype.workspaceId"))}`
    );
    assert(
      Array.isArray(sessionPayload.session.messages) &&
        sessionPayload.session.messages.length >= 8,
      "Expected persisted consultant session with several messages."
    );
    assert(
      sessionPayload.session.currentTurn,
      "Expected consultant session to persist the current turn."
    );
    artifacts.consultantReload = await capture(page, "02c-consultant-reload-persisted.png");
  }

  await closeConsultant(page);
}

async function exerciseDashboard(page, artifacts) {
  await page.locator(".brand-lockup").click();
  await page.waitForTimeout(250);
  await page.getByRole("heading", { level: 1 }).filter({ hasText: /QA Atelier/ }).waitFor();
  artifacts.dashboard = await capture(page, "01-dashboard-desktop.png");

  await page.getByRole("button", { name: "Venue-Desk oeffnen" }).click();
  await page.locator("#venue-gallery").waitFor({ state: "visible" });
  await page.locator(".brand-lockup").click();
  await page.waitForTimeout(250);

  await page.getByRole("button", { name: "Admin-Fokus oeffnen" }).click();
  await page.locator("#admin-reminders").waitFor({ state: "visible" });
  await page.locator(".brand-lockup").click();
  await page.waitForTimeout(250);

  await page.getByRole("button", { name: "Fotografie filtern" }).click();
  await page.locator("#vendor-grid").waitFor({ state: "visible" });
  await page.locator(".brand-lockup").click();
  await page.waitForTimeout(250);

  await page.getByRole("button", { name: "Budget-Desk oeffnen" }).click();
  await page.locator("#budget-editor").waitFor({ state: "visible" });
  await page.locator(".brand-lockup").click();
  await page.waitForTimeout(250);

  await page.getByRole("button", { name: "Admin oeffnen" }).click();
  await page.locator("#admin-reminders").waitFor({ state: "visible" });
  await page.locator(".brand-lockup").click();
  await page.waitForTimeout(250);

  await page.getByRole("button", { name: "Ask Co-Pilot fuer Fristen" }).click();
  await page.waitForSelector(".consultant-drawer");
  await closeConsultant(page);
}

async function exerciseTimeline(page, artifacts) {
  await page.getByRole("button", { name: "Plan Your Day" }).click();
  await page.getByRole("heading", { level: 1, name: /Jeder Schritt bekommt seinen eigenen/i }).waitFor();
  artifacts.timeline = await capture(page, "03-timeline-desktop.png");
}

async function exerciseVendors(page, artifacts) {
  await goToRailPage(page, "Vendors");
  await page.getByRole("heading", { level: 1, name: /Venue-Shortlist und Kern-Vendoren/i }).waitFor();
  artifacts.vendors = await capture(page, "04-vendors-desktop.png");

  await page.getByRole("button", { name: "Concierge fuer Vendoren oeffnen" }).click();
  await page.waitForSelector(".consultant-drawer");
  await closeConsultant(page);

  for (const label of ["Locations", "Catering", "Fotografie", "Floristik"]) {
    await page.getByRole("button", { name: new RegExp(`^${escapeRegex(label)}`) }).click();
    await page.waitForTimeout(250);
  }

  const categoryTabs = [
    /Fotografie/i,
    /Catering/i,
    /Musik/i,
    /Floristik/i,
    /Styling & Outfit/i
  ];
  for (const name of categoryTabs) {
    await page.getByRole("tab", { name }).click();
    await page.waitForTimeout(200);
  }

  await page.getByLabel("Kern-Vendoren durchsuchen").fill("studio");
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: "Nur mit Portfolio" }).click();
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: "In Bearbeitung" }).click();
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: "Alle" }).click();
  await page.getByLabel("Kern-Vendoren durchsuchen").fill("");

  const firstVendorCard = page.locator(".guided-vendor-card").first();
  const vendorName = ((await firstVendorCard.locator("strong").first().innerText()) || "").trim();
  assert(
    (await firstVendorCard.locator('a[href^="mailto:"]').count()) > 0 ||
      (await firstVendorCard.getByText(/Kontaktquelle/i).count()) > 0 ||
      (await firstVendorCard.getByText(/Offizielle/i).count()) > 0,
    "Expected vendor card to expose sourced contact evidence."
  );
  await firstVendorCard
    .getByLabel(new RegExp(`^Vendor-Status fuer ${escapeRegex(vendorName)}$`))
    .selectOption("quoted");
  await firstVendorCard
    .getByLabel(new RegExp(`^Quote in EUR fuer ${escapeRegex(vendorName)}$`))
    .fill("2200");
  await firstVendorCard
    .getByLabel(new RegExp(`^Notiz fuer ${escapeRegex(vendorName)}$`))
    .fill("Rueckruf fuer Freitag geplant.");
  await firstVendorCard.getByRole("button", { name: "Vendor speichern" }).click();
  await page.waitForFunction(
    (name) =>
      Array.from(document.querySelectorAll(".guided-vendor-card")).some((card) =>
        card.textContent?.includes(name) &&
        card.textContent?.includes("Rueckruf fuer Freitag geplant.")
      ),
    vendorName
  );
  await page.reload({ waitUntil: "networkidle" });
  await goToRailPage(page, "Vendors");
  const persistedVendorCard = page.locator(".guided-vendor-card", { hasText: vendorName }).first();
  await persistedVendorCard.getByText(/Rueckruf fuer Freitag geplant\./i).first().waitFor();
  assert.strictEqual(
    await persistedVendorCard.getByLabel(new RegExp(`^Adresse fuer ${escapeRegex(vendorName)}$`)).count(),
    0,
    "Vendor card should no longer expose editable address inputs."
  );

  artifacts.vendorName = vendorName;
}

async function exerciseBudget(page, artifacts) {
  await goToRailPage(page, "Budget");
  await page.getByRole("heading", { level: 1, name: /Budgetplanung mit echtem Verbrauch/i }).waitFor();
  artifacts.budget = await capture(page, "05-budget-desktop.png");

  await page.getByRole("button", { name: "Vendoren mit Budget verknuepfen" }).click();
  await page.locator("#vendor-grid").waitFor({ state: "visible" });
  await goToRailPage(page, "Budget");
}

async function exerciseGuests(page, artifacts, profileName, recordedPages) {
  const guestName = `QA Gast ${Date.now().toString().slice(-6)}`;
  const guestMail = `qa-${Date.now().toString().slice(-6)}@example.com`;

  await goToRailPage(page, "Gaeste");
  await page.getByRole("heading", { level: 1, name: /Gaesteliste mit RSVP/i }).waitFor();
  artifacts.guests = await capture(page, "06-guests-desktop.png");

  if (artifacts.importedGuestName) {
    await page.waitForFunction(
      (name) => document.body.textContent?.includes(name),
      artifacts.importedGuestName
    );
  }

  await page.getByRole("button", { name: "Gast hinzufuegen" }).click();
  await page.getByLabel("Gastname").fill(guestName);
  await page.getByLabel("Haushalt").fill("Familie QA");
  await page.getByLabel("E-Mail").fill(guestMail);
  await page.getByRole("button", { name: "Gast speichern" }).click();
  await page.waitForTimeout(1200);
  await page.reload({ waitUntil: "networkidle" });
  await goToRailPage(page, "Gaeste");
  await page.waitForFunction((name) => document.body.textContent?.includes(name), guestName);
  let guestCard = page.locator(".guided-guest-card", { hasText: guestName }).first();

  await guestCard.getByRole("button", { name: "Zugesagt" }).click();
  await page.waitForTimeout(300);
  guestCard = page.locator(".guided-guest-card", { hasText: guestName }).first();

  const profiles = await fetchJsonInPage(page, "/prototype/workspaces");
  const profile = profiles.profiles.find((entry) => entry.coupleName === profileName);
  assert(profile, "Expected audit workspace profile to exist.");
  const workspacePayload = await fetchJsonInPage(page, `/prototype/workspaces/${profile.id}`);
  const guest = workspacePayload.workspace.guests.find((entry) => entry.name === guestName);
  assert(guest?.accessToken, "Expected audit guest access token.");

  const context = page.context();
  const rsvpPage = await context.newPage();
  if (shouldRecordVideo) {
    recordedPages.push({
      label: "desktop-public-rsvp",
      video: rsvpPage.video()
    });
  }
  await rsvpPage.goto(new URL(`rsvp/${guest.accessToken}`, baseUrl).toString(), {
    waitUntil: "networkidle"
  });
  await rsvpPage.getByRole("heading", { level: 1, name: /Rueckmeldung/i }).waitFor();
  await rsvpPage.getByText(/Bitte kommt in festlicher Kleidung und gebt uns eine kurze Rueckmeldung/i).waitFor();
  await rsvpPage.getByText(/Wir freuen uns riesig auf einen entspannten Abend mit euch\./i).waitFor();
  await rsvpPage.getByRole("button", { name: "Wir kommen" }).click();
  await rsvpPage.getByLabel("Essenswahl").selectOption("vegan");
  await rsvpPage.getByLabel("Allergien oder Hinweise").fill("Bitte vegane Option vormerken.");
  await rsvpPage.getByLabel("Nachricht ans Paar").fill("Wir freuen uns auf euch.");
  artifacts.publicRsvp = await capture(rsvpPage, "07-public-rsvp.png");
  await rsvpPage.getByRole("button", { name: "Antwort speichern" }).click();
  await rsvpPage.getByText(/Antwort gespeichert/i).waitFor();
  await rsvpPage.close();

  await page.reload({ waitUntil: "networkidle" });
  await goToRailPage(page, "Gaeste");
  await page.waitForFunction((name) => document.body.textContent?.includes(name), guestName);
  const refreshedCard = page.locator(".guided-guest-card", { hasText: guestName }).first();
  await refreshedCard.getByText(/Essen: Vegan/i).waitFor();
  await refreshedCard.getByText(/Wir freuen uns auf euch\./i).waitFor();

  artifacts.guestName = guestName;
}

async function exerciseAdmin(page, artifacts) {
  await page.getByRole("button", { name: "Inspiration" }).click();
  await page.getByRole("heading", { level: 1, name: /Profilfundament, Admin-Fristen/i }).waitFor();
  await page.locator("#foundation-form").waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Allgemeine Praeferenzen" }).click();
  await page.getByRole("button", { name: "Benachrichtigungen & Fristen" }).click();
  await page.locator("#admin-reminders").waitFor({ state: "visible" });

  const noGoInput = page.getByLabel("No-Gos");
  const categoryFieldset = page.locator("fieldset", {
    hasText: "Aktive Vendor-Kategorien"
  });
  const cateringToggle = categoryFieldset.locator(
    "label:has-text('Catering') input[type='checkbox']"
  );
  await noGoInput.fill("ballroom, neon, konfetti-kanone");
  await page.getByLabel("Einladungs-Headline").fill("{paar} wartet auf eure Rueckmeldung");
  await page
    .getByLabel("Einladungstext")
    .fill(
      "{gast}, bitte kommt in festlicher Kleidung und gebt uns eine kurze Rueckmeldung fuer {datum} in {ort}."
    );
  await page
    .getByLabel("Einladungs-Fusszeile")
    .fill("Wir freuen uns riesig auf einen entspannten Abend mit euch.");
  if (await cateringToggle.isChecked()) {
    await cateringToggle.uncheck();
  }
  await page.getByRole("button", { name: "Profil speichern" }).click();
  await page.getByRole("heading", { level: 1, name: /Profilfundament, Admin-Fristen/i }).waitFor();
  await page.locator("#foundation-form").waitFor({ state: "visible" });
  await page.waitForTimeout(600);

  artifacts.admin = await capture(page, "08-admin-desktop.png");

  await goToRailPage(page, "Vendors");
  assert.strictEqual(
    await page.getByRole("tab", { name: /Catering/i }).count(),
    0,
    "Catering tab should disappear when the category is disabled."
  );
  await goToRailPage(page, "Admin");
  await page.locator("#foundation-form").waitFor({ state: "visible" });
  await cateringToggle.check();
  await page.getByRole("button", { name: "Profil speichern" }).click();
  await page.getByRole("heading", { level: 1, name: /Profilfundament, Admin-Fristen/i }).waitFor();

  await page.reload({ waitUntil: "networkidle" });
  await goToRailPage(page, "Admin");
  await page.getByLabel("No-Gos").waitFor();
  assert.match(await noGoInput.inputValue(), /konfetti-kanone/i);
  assert.match(await page.getByLabel("Einladungs-Headline").inputValue(), /wartet auf eure Rueckmeldung/i);
  assert.match(await page.getByLabel("Einladungs-Fusszeile").inputValue(), /entspannten Abend/i);
  assert.strictEqual(await cateringToggle.isChecked(), true);
}

async function exerciseLibraryButtons(page, profileName) {
  await page.getByRole("button", { name: "Profilbibliothek" }).click();
  await page.getByRole("heading", { name: "Gespeicherte Profile" }).waitFor();

  await page.getByRole("button", { name: "Profilformular oeffnen" }).click();
  await page.getByRole("button", { name: "Abbrechen" }).click();

  await page.getByRole("button", { name: "Letztes Profil oeffnen" }).click();
  await page.waitForSelector(".workspace-shell");
  await page.getByRole("button", { name: "Profilbibliothek" }).click();
  await page.getByRole("heading", { name: "Gespeicherte Profile" }).waitFor();

  const profileCard = page.locator(".library-profile-card", { hasText: profileName }).first();
  await profileCard.getByRole("button", { name: "Profil oeffnen" }).click();
  await page.waitForSelector(".workspace-shell");
  await page.getByRole("button", { name: "Profilbibliothek" }).click();
  await page.getByRole("heading", { name: "Gespeicherte Profile" }).waitFor();
}

async function deleteProfile(page, profileName) {
  const profileCard = page.locator(".library-profile-card", { hasText: profileName }).first();
  await profileCard.waitFor({ state: "visible" });
  page.once("dialog", (dialog) => dialog.accept());
  await profileCard.getByRole("button", { name: /Profil loeschen/i }).click();
  await page.waitForFunction((name) => !document.body.textContent?.includes(name), profileName);
}

async function exerciseStepRibbon(page) {
  const ribbonButtons = page.locator(".step-ribbon__item");
  const count = await ribbonButtons.count();

  for (let index = 0; index < count; index += 1) {
    await ribbonButtons.nth(index).click();
    await page.waitForTimeout(250);
  }
}

async function runDesktopPass(browser) {
  const diagnostics = [];
  const artifacts = {};
  const recordedPages = [];
  const context = await browser.newContext({
    viewport: { width: 1512, height: 1900 },
    recordVideo: shouldRecordVideo
      ? {
          dir: path.join(outputDir, ".playwright-videos-desktop"),
          size: { width: 1512, height: 1900 }
        }
      : undefined
  });
  const page = await context.newPage();
  addDiagnostics(page, diagnostics, "desktop");
  if (shouldRecordVideo) {
    recordedPages.push({
      label: "desktop-main",
      video: page.video()
    });
  }

  const uniqueId = Date.now().toString().slice(-6);
  let capturedVideos = [];
  let profileName;

  try {
    await gotoApp(page);
    artifacts.library = await capture(page, "00-library-desktop.png");

    profileName = await createProfile(page, uniqueId);
    await exerciseStepRibbon(page);
    await exerciseConsultant(page, artifacts);
    await exerciseDashboard(page, artifacts);
    await exerciseTimeline(page, artifacts);
    await exerciseVendors(page, artifacts);
    await exerciseAdmin(page, artifacts);
    await exerciseBudget(page, artifacts);
    await exerciseGuests(page, artifacts, profileName, recordedPages);
    await exerciseLibraryButtons(page, profileName);
    await deleteProfile(page, profileName);
    artifacts.libraryAfterDelete = await capture(page, "09-library-after-delete.png");
  } finally {
    await context.close();
    capturedVideos = await collectRecordedVideos(recordedPages);
  }

  return {
    diagnostics,
    artifacts,
    profileName,
    videos: capturedVideos
  };
}

async function runMobilePass(browser) {
  const diagnostics = [];
  const artifacts = {};
  const recordedPages = [];
  const context = await browser.newContext({
    ...devices["iPhone 13"],
    recordVideo: shouldRecordVideo
      ? {
          dir: path.join(outputDir, ".playwright-videos-mobile"),
          size: { width: 390, height: 844 }
        }
      : undefined
  });
  const page = await context.newPage();
  addDiagnostics(page, diagnostics, "mobile");
  if (shouldRecordVideo) {
    recordedPages.push({
      label: "mobile-main",
      video: page.video()
    });
  }
  let capturedVideos = [];

  try {
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Neues Beratungsprofil" }).click();
    await page.getByLabel("Paarname").fill("QA Mobile");
    await page.getByLabel("Hochzeitsdatum").fill("2027-09-11");
    await page.getByLabel("Region").fill("Hamburg");
    await page.getByLabel("Gaesteziel").fill("55");
    await page.getByLabel("Budget in EUR").fill("19000");
    await page.getByLabel("Stilpraeferenzen").fill("modern, city");
    await page.getByLabel("No-Gos").fill("kitsch");
    await page.getByRole("button", { name: "Beratung mit diesem Profil starten" }).click();
    await page.waitForSelector(".workspace-shell");

    await page.getByRole("button", { name: "Menue" }).click();
    artifacts.mobileMenu = await capture(page, "10-mobile-menu-open.png");

    const dockTargets = ["Plan", "Vendoren", "Budget", "Gaeste", "Admin", "Start"];
    for (const label of dockTargets) {
      await page.getByRole("button", { name: new RegExp(label, "i") }).last().click();
      await page.waitForTimeout(250);
    }

    artifacts.mobile = await capture(page, "11-mobile-workspace.png");
    await page.getByRole("button", { name: "Profilbibliothek" }).click();
    const mobileProfile = page.locator(".library-profile-card", { hasText: "QA Mobile" }).first();
    page.once("dialog", (dialog) => dialog.accept());
    await mobileProfile.getByRole("button", { name: /Profil loeschen/i }).click();
    await page.waitForFunction(() => !document.body.textContent?.includes("QA Mobile"));

  } finally {
    await context.close();
    capturedVideos = await collectRecordedVideos(recordedPages);
  }

  return {
    diagnostics,
    artifacts,
    videos: capturedVideos
  };
}

async function main() {
  const browser = await launchBrowser();

  try {
    const desktop = await runDesktopPass(browser);
    const mobile = await runMobilePass(browser);
    const result = {
      baseUrl,
      outputDir,
      launch: {
        headless: headlessMode,
        slowMo,
        recordVideo: shouldRecordVideo,
        extractFrames: shouldExtractFrames,
        createStoryboards: shouldCreateStoryboards
      },
      diagnostics: [...desktop.diagnostics, ...mobile.diagnostics],
      desktop: {
        profileName: desktop.profileName,
        artifacts: desktop.artifacts,
        videos: desktop.videos
      },
      mobile: {
        artifacts: mobile.artifacts,
        videos: mobile.videos
      }
    };

    await mkdir(outputDir, { recursive: true });
    await writeFile(
      path.join(outputDir, "report.json"),
      JSON.stringify(result, null, 2),
      "utf8"
    );

    console.log(JSON.stringify(result, null, 2));

    if (result.diagnostics.length > 0) {
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

