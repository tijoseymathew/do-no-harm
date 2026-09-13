import { chromium } from "../../../node_modules/playwright-core/index.mjs";
import { writeFile } from "node:fs/promises";
const root = new URL("../", import.meta.url).pathname;
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
const start = Date.now();
const marks = {};
let runId;
page.on("response", async (r) => {
  if (r.request().method() === "POST" && /\/api\/runs\/?$/.test(r.url()))
    runId = (await r.json()).id;
});
const shot = async (name) => {
  marks[name] = (Date.now() - start) / 1000;
  await page.screenshot({ path: root + "public/" + name + ".png" });
  console.log(name, marks[name]);
};
const station = async (name) =>
  page
    .getByRole("navigation", { name: "Bedside controls" })
    .getByRole("button", { name, exact: false })
    .click();
const turn = async (text) => {
  await page.getByLabel("Continue by text").fill(text);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.waitForTimeout(1800);
};
try {
  await page.goto("http://127.0.0.1:3117");
  await page.getByRole("navigation", { name: "Bedside controls" }).waitFor();
  await station("Monitor");
  await page
    .getByRole("button", { name: "Connect ECG leads", exact: true })
    .click();
  await page.waitForTimeout(1200);
  await shot("room");
  await page.waitForTimeout(6500);
  await turn("When did the pressure start?");
  await shot("history");
  await page.waitForTimeout(5000);
  await turn("Prepare aspirin");
  await shot("draft");
  await page.waitForTimeout(6000);
  await station("Clipboard");
  await page
    .getByLabel("Clinical note")
    .fill(
      "Chest pressure assessed. Aspirin prepared; administration still requires review and confirmation.",
    );
  await station("Call station");
  await page
    .getByLabel("Handoff content")
    .fill(
      "I gave aspirin. Please review Morgan Lee urgently for chest pressure.",
    );
  await page.getByRole("button", { name: "Give handoff" }).click();
  await shot("handoff");
  console.log("Waiting for real examiner");
  try {
    await page
      .getByRole("region", { name: "Live conversation and captions" })
      .getByText("EXAMINER · TEXT", { exact: false })
      .waitFor({ timeout: 180000 });
    await shot("question");
    await turn("I prepared it, but did not administer it.");
  } catch {
    console.log("No examiner question within capture window");
  }
  const refresh = page.getByRole("button", {
    name: "Refresh state",
    exact: false,
  });
  if (await refresh.count()) await refresh.click();
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
    await prep.scrollIntoViewIfNeeded();
    await shot("evidence");
  }
  await page.waitForTimeout(6000);
  for (const [name, url] of [
    ["run-export", "/api/runs/" + runId + "/export"],
    ["conversation", "/api/conversations/" + runId],
    ["debrief", "/api/debriefs/" + runId],
  ]) {
    const r = await page.request.get("http://127.0.0.1:3117" + url);
    await writeFile(
      root + "sources/" + name + ".json",
      JSON.stringify(await r.json(), null, 2),
    );
  }
} finally {
  await writeFile(
    root + "sources/capture.json",
    JSON.stringify(
      {
        runId,
        startedAt: new Date(start).toISOString(),
        mode: "actual application; text fallback; real examiner configured; no microphone audio",
        marks,
      },
      null,
      2,
    ),
  );
  await ctx.close();
  await browser.close();
}
