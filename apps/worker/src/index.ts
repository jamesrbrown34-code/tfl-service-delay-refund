import { chromium } from "playwright";
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

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://oyster.tfl.gov.uk/", { waitUntil: "domcontentloaded" });

  console.log("Manual login checkpoint: complete login and 2FA in the opened browser.");
  await page.waitForTimeout(45_000);

  // Placeholder for selector work: intentionally conservative until a real account walkthrough is done.
  await page.goto("https://oyster.tfl.gov.uk/oyster/history.do", { waitUntil: "domcontentloaded" });

  const rows = await page.locator("table tbody tr").all();
  const parsed: JourneyRow[] = [];

  for (const row of rows) {
    const cells = row.locator("td");
    const text = await cells.allInnerTexts();
    if (text.length < 5) {
      continue;
    }

    parsed.push({
      id: crypto.randomUUID(),
      oysterCardId: "primary",
      startStation: text[0]?.trim() ?? "Unknown",
      endStation: text[1]?.trim() ?? "Unknown",
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      fare: Number.parseFloat((text[4] ?? "0").replace("£", "")) || 0,
      rawSource: text.join(" | ")
    });
  }

  const payload = parsed.map((journey) => {
    const valid = journeyRowSchema.parse(journey);
    return {
      ...valid,
      startedAt: valid.startedAt,
      endedAt: valid.endedAt
    };
  });

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
