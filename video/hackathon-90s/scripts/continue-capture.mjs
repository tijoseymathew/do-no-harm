import { chromium } from "../../../node_modules/playwright-core/index.mjs";
import { readFile, writeFile } from "node:fs/promises";
const root = new URL("../", import.meta.url).pathname;
const capture = JSON.parse(
  await readFile(root + "sources/capture.json", "utf8"),
);
const { runId } = capture;
const base = "http://127.0.0.1:3117";
const browser = await chromium.launch({
  executablePath:
    "/home/josey/.cache/ms-playwright/chromium_headless_shell-1234/chrome-linux/headless_shell",
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const ctx = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  recordVideo: { dir: root + "sources", size: { width: 1920, height: 1080 } },
});
const page = await ctx.newPage();
// Resume the actual retained server run. Only initialization is redirected from create to GET;
// all product interactions and provider responses remain real, with no fixture payloads.
await page.route("**/api/runs", async (route) => {
  if (route.request().method() === "POST") {
    const response = await page.request.get(base + "/api/runs/" + runId);
    await route.fulfill({ response });
  } else await route.continue();
});
const start = Date.now();
const marks = {};
const shot = async (n) => {
  marks[n] = (Date.now() - start) / 1000;
  await page.screenshot({ path: root + "public/" + n + ".png" });
  console.log(n, marks[n]);
};
try {
  await page.goto(base);
  await page.getByRole("navigation", { name: "Bedside controls" }).waitFor();
  await page
    .getByLabel("Continue by text")
    .fill("I prepared it, but did not administer it.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.waitForTimeout(2000);
  await page
    .getByRole("navigation", { name: "Bedside controls" })
    .getByRole("button", { name: "Clipboard", exact: false })
    .click();
  await page
    .getByLabel("Clinical note")
    .fill(
      "Chest pressure assessed. Aspirin prepared, not administered. Earlier handoff administration claim was incorrect.",
    );
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await page
    .getByRole("heading", { name: "Run debrief", exact: true })
    .waitFor();
  await shot("evaluation-start");
  for (let attempt = 0; attempt < 120; attempt++) {
    const current = await (
      await page.request.get("http://127.0.0.1:3117/api/debriefs/" + runId)
    ).json();
    if (["ready", "unavailable"].includes(current.status)) break;
    await page.waitForTimeout(2000);
  }
  await shot("debrief");
  const prep = page
    .locator(".evidence-card-list > button")
    .filter({ hasText: /prepared/i })
    .first();
  if (await prep.count()) {
    await prep.click();
    await page.locator(".evidence-detail").scrollIntoViewIfNeeded();
    await shot("evidence");
  }
  await page.waitForTimeout(5000);
} finally {
  for (const [name, url] of [
    ["run-export", "/api/runs/" + runId + "/export"],
    ["conversation", "/api/conversations/" + runId],
    ["debrief", "/api/debriefs/" + runId],
  ]) {
    const r = await page.request.get(base + url);
    await writeFile(
      root + "sources/" + name + ".json",
      JSON.stringify(await r.json(), null, 2),
    );
  }
  await writeFile(
    root + "sources/continuation.json",
    JSON.stringify(
      {
        runId,
        startedAt: new Date(start).toISOString(),
        marks,
        note: "Browser reopened on the SAME real server run via initialization redirect to GET existing run. Text correction and Finish use unmodified app APIs. Recording gap explicitly retained in source manifest.",
      },
      null,
      2,
    ),
  );
  await ctx.close();
  await browser.close();
}
