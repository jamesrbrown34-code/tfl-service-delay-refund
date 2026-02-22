import { chromium } from "playwright";
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

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://oyster.tfl.gov.uk/", { waitUntil: "domcontentloaded" });

  console.log("Manual login checkpoint: complete login and 2FA in the opened browser.");
  await page.waitForTimeout(45_000);

  const cardSelector = `.indiv-card2.panel[data-id="${TARGET_CARD_ID}"]`;
  await page.waitForSelector(cardSelector, { timeout: 60_000 });
  await page.locator(cardSelector).click();

  await page
    .locator('li.col-md-6 a.list-group-item:has-text("View journey history")')
    .first()
    .click();

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
    const text = (await cells.allInnerTexts()).map((cellText) => cellText.trim());
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

  const response = await fetch("http://localhost:5080/journeys/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  console.log("Imported rows", payload.length, "status", response.status);
  await context.storageState({ path: "./storage-state.json" });
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
