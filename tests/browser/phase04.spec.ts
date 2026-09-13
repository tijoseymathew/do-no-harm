import { expect, test, type Page } from "@playwright/test";
import { copyFile, mkdir, writeFile } from "node:fs/promises";

const evidenceDirectory = "docs/evidence/phase-04";

async function open(page: Page) {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Bedside controls" })).toBeVisible();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
}

async function station(page: Page, name: string) {
  await page.getByRole("navigation").getByRole("button", { name, exact: false }).click();
}

test("complete bedside workflow keeps proposed, authorized, and performed actions distinct", async ({ page }) => {
  await open(page);

  await station(page, "Patient");
  await page.getByRole("button", { name: /Ask · Onset and timing/ }).click();
  await page.getByRole("button", { name: /Ask · Pain score/ }).click();
  await page.getByRole("button", { name: /Perform · Assess airway/ }).click();
  await page.getByRole("button", { name: /Perform · Inspect breathing/ }).click();

  await station(page, "Monitor");
  for (const label of ["ECG leads", "SpO₂ probe", "BP cuff"])
    await page.getByRole("button", { name: `Connect ${label}`, exact: true }).click();
  await page.getByRole("button", { name: "Measure BP", exact: true }).click();

  await station(page, "ECG / results");
  const ecg = page.locator("article").filter({ hasText: "12-lead ECG" });
  await ecg.getByRole("button", { name: "Request", exact: true }).click();
  await ecg.getByRole("button", { name: "Acquire 12-lead tracing" }).click();
  await ecg.getByRole("button", { name: "Try opening now" }).click();
  await expect(page.getByRole("alert")).toContainText("not yet available");
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await page.getByRole("button", { name: "Advance scenario +30 s" }).click();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await ecg.getByRole("button", { name: "Open ECG" }).click();
  await ecg.getByRole("button", { name: "Open report" }).click();
  await expect(page.getByRole("img", { name: /12-lead ECG development tracing/ })).toBeVisible();
  await page.getByLabel("ECG zoom").fill("180");
  await page.getByLabel("12-lead ECG interpretation").fill("Sinus tachycardia; needs senior ECG review.");
  await ecg.getByRole("button", { name: "Save interpretation" }).click();
  await page.getByLabel("Request another investigation").fill("CT coronary angiogram");
  await page.getByRole("button", { name: "Check case availability" }).click();
  await expect(page.getByText(/CT coronary angiogram is outside this authored case/)).toBeVisible();

  await station(page, "Medication");
  await page.getByLabel("Dose", { exact: true }).fill("600");
  await page.getByLabel("Unit", { exact: true }).selectOption("mg");
  await page.getByLabel("Route", { exact: true }).selectOption("oral");
  await page.getByLabel("Allergy history reviewed").check();
  await page.getByLabel("Prior doses reviewed").check();
  await page.getByRole("button", { name: "Review and prepare medication" }).click();
  await expect(page.getByRole("heading", { name: "Prepared — not administered" })).toBeVisible();
  await page.getByRole("button", { name: "Administer", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Dose must normalize to 300 mg");
  await page.getByLabel("Dose", { exact: true }).fill("300");
  await page.getByRole("button", { name: "Review and prepare medication" }).click();
  await page.getByRole("button", { name: "Administer", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Administration accepted" })).toBeVisible();

  await station(page, "Oxygen / IV");
  await page.getByLabel("Oxygen flow").fill("2");
  await page.getByRole("button", { name: "Apply oxygen" }).click();
  await page.getByLabel("Oxygen flow").fill("4");
  await page.getByRole("button", { name: "Adjust oxygen" }).click();
  await page.getByRole("button", { name: "Stop oxygen" }).click();
  await page.getByRole("button", { name: "Establish IV access" }).click();
  await page.getByRole("button", { name: "Inspect patency" }).click();
  await page.getByRole("button", { name: "Request fluid authorization" }).click();

  await station(page, "Call station");
  await page.getByRole("button", { name: "Request senior review" }).click();
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await page.getByRole("button", { name: "Advance scenario +30 s" }).click();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByText(/Acknowledgment:/).locator("strong").last()).toHaveText("received");

  await station(page, "Oxygen / IV");
  await expect(page.getByText(/Simulated authorization:/).locator("strong")).toHaveText("authorized");
  await page.getByLabel("Fluid volume").fill("100");
  await page.getByLabel("Fluid rate").fill("600");
  await page.getByRole("button", { name: "Start fluid" }).click();
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await page.getByRole("button", { name: "Advance scenario +30 s" }).click();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: "Stop fluid" }).click();
  await expect(page.getByText(/Pump: stopped · [5-6]\./)).toBeVisible();

  await station(page, "Patient");
  await page.getByRole("button", { name: /Reassess · Pain score/ }).click();
  await page.getByRole("button", { name: /Reassess · Pain score/ }).click();
  await expect(page.getByText(/Reassessed 3 times/)).toBeVisible();

  await station(page, "Clipboard");
  await page.getByLabel("Clinical note").fill("Assessment: chest pain. Plan: monitor, ECG, treatment and urgent senior review.");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await page.getByLabel("Clinical note").fill("Revised: reassessed after aspirin; continue monitored care and transfer responsibility.");
  await page.getByRole("button", { name: "Save revised note" }).click();

  await station(page, "Call station");
  await page.getByLabel("Handoff content").fill("Situation: Morgan Lee with chest pain. Background: hypertension. Assessment: ECG acquired and aspirin administered. Recommendation: urgent senior ECG review and monitored care.");
  await page.getByRole("button", { name: "Give handoff" }).click();
  await expect(page.getByRole("button", { name: "Finish", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(page.getByText("Run finished · evidence frozen")).toBeVisible();

  await mkdir(evidenceDirectory, { recursive: true });
  await page.screenshot({ path: `${evidenceDirectory}/complete-run-1280x720.png`, fullPage: true });
  const exportResponse = await page.request.get(await page.getByRole("link", { name: "Export run JSON" }).getAttribute("href") as string);
  const exported = await exportResponse.json();
  await writeFile(`${evidenceDirectory}/complete-run.json`, `${JSON.stringify(exported, null, 2)}\n`);
  expect(exported.state).toMatchObject({ lifecycle: "ended", notes: [{ revision: 1 }, { revision: 2 }] });
  expect(exported.events.map(({ type }: { type: string }) => type)).toEqual(expect.arrayContaining([
    "investigation.requested", "investigation.available", "medication.blocked", "medication.administered",
    "authorization.granted", "fluid.stopped", "handoff.recorded", "session.ended",
  ]));
  const video = page.video();
  await page.close();
  if (video) await copyFile(await video.path(), `${evidenceDirectory}/complete-and-blocked-flow-1280x720.webm`);
});
