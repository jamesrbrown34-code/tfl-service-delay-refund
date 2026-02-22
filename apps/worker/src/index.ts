import { chromium, type Page } from "playwright";
import { writeFile } from "node:fs/promises";
import { z } from "zod";

type JourneyRow = {
  id: string;
  oysterCardId: string;
  startStation: string;
  endStation: string;
  startedAt: string;
  endedAt: string;
  fare: number;
  rawSource: string;
};

const journeyRowSchema = z.object({
  id: z.string(),
  oysterCardId: z.string(),
  startStation: z.string(),
  endStation: z.string(),
  startedAt: z.string(),
  endedAt: z.string(),
  fare: z.number(),
  rawSource: z.string()
});

const TARGET_CARD_ID = "060105052041";
const IMPORT_API_URL = "https://localhost:59256/journeys/import";

function parseJourneyAction(action: string): { startStation: string; endStation: string } {
  const cleaned = action.replace(/\s+/g, " ").trim();
  const separators = [" to ", " - ", " → ", " > "];

  for (const separator of separators) {
    if (cleaned.includes(separator)) {
      const [start, end] = cleaned.split(separator, 2);
      return {
        startStation: start?.trim() || "Unknown",
        endStation: end?.trim() || "Unknown"
      };
    }
  }

  return {
    startStation: cleaned || "Unknown",
    endStation: "Unknown"
  };
}

function parseDateTime(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function parseFare(value: string): number {
  const cleaned = value.replace(/[^0-9.-]+/g, "");
  const parsed = Number.parseFloat(cleaned);
  return Number.isNaN(parsed) ? 0 : parsed;
}

async function clickAcceptAllCookiesIfPresent(page: Page): Promise<void> {
  const cookieButtons = [
    'button:has-text("Accept all cookies")',
    'a:has-text("Accept all cookies")',
    'button:has-text("Accept all")',
    'a:has-text("Accept all")'
  ];

  for (const selector of cookieButtons) {
    const button = page.locator(selector).first();
    if ((await button.count()) > 0 && (await button.isVisible().catch(() => false))) {
      await button.click().catch(() => undefined);
      return;
    }
  }
}

async function waitForCardAfterLogin(page: Page, cardSelector: string): Promise<void> {
  const timeoutMs = 180_000;
  const pollIntervalMs = 1_000;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    await clickAcceptAllCookiesIfPresent(page);

    const card = page.locator(cardSelector).first();
    if ((await card.count()) > 0 && (await card.isVisible().catch(() => false))) {
      return;
    }

    await page.waitForTimeout(pollIntervalMs);
  }

  throw new Error(`Timed out waiting for Oyster card ${TARGET_CARD_ID} to appear after manual login.`);
}

async function postJourneyImport(payload: JourneyRow[]): Promise<Response> {
  try {
    return await fetch(IMPORT_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    const certError =
      error instanceof Error &&
      "cause" in error &&
      (error as { cause?: { code?: string } }).cause?.code === "DEPTH_ZERO_SELF_SIGNED_CERT";

    if (!certError) {
      throw error;
    }

    console.warn(
      "Self-signed certificate detected on import endpoint; retrying with TLS verification disabled for local development."
    );
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

    return await fetch(IMPORT_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  }
}

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://oyster.tfl.gov.uk/", { waitUntil: "domcontentloaded" });

  console.log("Manual login checkpoint: complete login and 2FA in the opened browser.");

  const cardSelector = `.indiv-card2.panel[data-id="${TARGET_CARD_ID}"]`;
  await waitForCardAfterLogin(page, cardSelector);
  await page.locator(cardSelector).click();

  await clickAcceptAllCookiesIfPresent(page);
  await page
    .locator('li.col-md-6 a.list-group-item:has-text("View journey history")')
    .first()
    .click();

  await clickAcceptAllCookiesIfPresent(page);
  await page.waitForSelector("#date-range-button", { timeout: 30_000 });
  await page.locator("#date-range-button").click();

  await page.waitForSelector("table.table.journeyhistory tbody", { timeout: 30_000 });

  const rows = await page.locator("table.table.journeyhistory tbody tr").all();
  const parsed: JourneyRow[] = [];

  for (const row of rows) {
    const noDataText = (await row.innerText()).trim();
    if (noDataText.includes("There is no journey history to display")) {
      continue;
    }

    const cells = row.locator("td");
    const text = (await cells.allInnerTexts()).map((cellText: string) => cellText.trim());
    if (text.length < 4) {
      continue;
    }

    const dateTime = text[0] ?? "";
    const journeyAction = text[1] ?? "";
    const charge = text[2] ?? "";
    const { startStation, endStation } = parseJourneyAction(journeyAction);

    parsed.push({
      id: crypto.randomUUID(),
      oysterCardId: TARGET_CARD_ID,
      startStation,
      endStation,
      startedAt: parseDateTime(dateTime),
      endedAt: parseDateTime(dateTime),
      fare: parseFare(charge),
      rawSource: text.join(" | ")
    });
  }

  const payload = parsed.map((journey) => journeyRowSchema.parse(journey));

  await writeFile("./journey-history.json", JSON.stringify(payload, null, 2), "utf8");

  const response = await postJourneyImport(payload);

  console.log("Imported rows", payload.length, "status", response.status);
  await context.storageState({ path: "./storage-state.json" });
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
