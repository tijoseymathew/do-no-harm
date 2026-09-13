import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

async function open(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Bedside controls" })).toBeVisible();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
}

async function station(page: Page, name: string) {
  await page.getByRole("navigation", { name: "Bedside controls" }).getByRole("button", { name, exact: false }).click();
}

async function textTurn(page: Page, text: string) {
  await page.getByLabel("Continue by text").fill(text);
  await page.getByRole("button", { name: "Send", exact: true }).click();
}

test("Finish saves draft evidence and opens a citation-resolving visual debrief", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page);
  await textTurn(page, "Prepare aspirin");
  await station(page, "Clipboard");
  await page.getByLabel("Clinical note").fill("Focused assessment in progress. Aspirin is prepared, not administered. Senior review needed.");
  await station(page, "Call station");
  await page.getByLabel("Handoff content").fill("Morgan Lee has chest pain. Aspirin is prepared but not administered. Please review urgently.");
  await page.getByRole("button", { name: "Give handoff" }).click();
  await page.getByRole("button", { name: "Finish", exact: true }).click();

  const debrief = page.getByRole("region", { name: "Visual formative debrief" });
  await expect(debrief.getByRole("heading", { name: "Run debrief" })).toBeVisible();
  await expect(debrief).toContainText("finish-v1");
  await expect(debrief.getByRole("heading", { name: "Six criterion outcomes" })).toBeVisible();
  await expect(debrief.locator(".criteria-list > li")).toHaveCount(6);
  await expect(debrief.getByText("insufficient evidence", { exact: true }).first()).toBeVisible();
  await expect(debrief.getByText("Note revision 1", { exact: true }).first()).toBeVisible();
  await expect(debrief.locator(".action-status.prepared").first()).toBeVisible();
  await expect(debrief.locator(".chart-marker.treatment")).toHaveCount(0);

  const citation = debrief.locator("button.citation").first();
  await citation.click();
  await expect(debrief.locator(".evidence-detail pre")).toBeVisible();
  await expect(debrief.locator(".evidence-detail")).toContainText(/handoff|prepared|note/i);
  await mkdir("docs/evidence/phase-06", { recursive: true });
  await page.screenshot({ path: "docs/evidence/phase-06/debrief-view-1280x900.png", fullPage: true });
  await debrief.locator(".evidence-browser").screenshot({ path: "docs/evidence/phase-06/evidence-view-1280x900.png" });
});

test("late transcript correction creates a labeled feedback revision and teach-back is assisted", async ({ page }) => {
  await open(page);
  await textTurn(page, "I administered aspirin.");
  await station(page, "Call station");
  await page.getByLabel("Handoff content").fill("Chest pain assessed. Aspirin was not administered. Senior review requested.");
  await page.getByRole("button", { name: "Give handoff" }).click();
  await page.getByRole("button", { name: "Finish", exact: true }).click();

  const debrief = page.getByRole("region", { name: "Visual formative debrief" });
  const transcriptCard = debrief.locator(".evidence-card-list > button").filter({ hasText: "I administered aspirin." });
  await transcriptCard.click();
  await page.getByLabel("Late transcript correction").fill("Correction: aspirin was prepared but not administered.");
  await page.getByRole("button", { name: "Save correction" }).click();
  await page.getByRole("button", { name: "Check for late corrections" }).click();
  await expect(debrief).toContainText("Feedback revision 2 · late evidence");
  await expect(debrief.getByText("2 preserved feedback revisions")).toBeVisible();

  await page.getByRole("button", { name: "Start assisted teach-back" }).click();
  await expect(debrief).toContainText("This prompt and the next answer are explicitly marked assisted evidence.");
  await page.getByLabel("Teach-back answer").fill("I will distinguish preparation from administration and cite the receipt.");
  await page.getByRole("button", { name: "Submit assisted answer" }).click();
});
