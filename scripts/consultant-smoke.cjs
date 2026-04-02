const { mkdir } = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const baseUrl = process.env.WEDDING_SMOKE_URL ?? "http://127.0.0.1:5173";
const screenshotPath =
  process.env.WEDDING_SMOKE_SCREENSHOT ??
  "C:/Users/Shadow/Documents/wedding/output/playwright/wedding-ai-consultant-chat.png";

async function launchBrowser() {
  try {
    return await chromium.launch({ headless: true, channel: "msedge" });
  } catch {
    return chromium.launch({ headless: true });
  }
}

async function clickIfVisible(page, name) {
  const button = page.getByRole("button", { name });

  if (await button.count()) {
    const firstButton = button.first();

    if (await firstButton.isVisible()) {
      await firstButton.click();
      return true;
    }
  }

  return false;
}

async function main() {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } });

  try {
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Planung starten" }).first().click();
    await page.waitForTimeout(500);
    await clickIfVisible(page, "Beratung starten");
    await page.waitForSelector(".consultant-bubble--assistant");

    const initialAssistant = await page
      .locator(".consultant-bubble--assistant")
      .first()
      .innerText();
    const initialReplies = await page.locator(".consultant-reply").allInnerTexts();

    if (initialReplies.length > 0) {
      await page.getByRole("button", { name: initialReplies[0], exact: true }).click();
      await page.waitForTimeout(400);
    }

    await page
      .locator(".consultant-input")
      .fill(
        "Wir wollen uns wirklich wie in einer persoenlichen Hochzeitsberatung fuehlen und sind vor allem bei Budget und Prioritaeten unsicher."
      );
    await page.getByRole("button", { name: "Nachricht senden" }).click();
    await page.waitForTimeout(500);

    const transcriptTexts = await page.locator(".consultant-bubble").allInnerTexts();
    const sidebarTitle = await page.locator(".consultant-sidebar h3").first().innerText();

    await mkdir(path.dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true });

    console.log(
      JSON.stringify(
        {
          baseUrl,
          initialAssistant,
          initialReplies,
          sidebarTitle,
          transcriptCount: transcriptTexts.length,
          lastMessages: transcriptTexts.slice(-4),
          screenshotPath
        },
        null,
        2
      )
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
