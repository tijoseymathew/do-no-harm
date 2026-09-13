import { expect, test, type Page } from "@playwright/test";

async function open(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Bedside controls" })).toBeVisible();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
}

async function textTurn(page: Page, text: string) {
  const input = page.getByLabel("Continue by text");
  await input.fill(text);
  await page.getByRole("button", { name: "Send", exact: true }).click();
}

async function station(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "Bedside controls" })
    .getByRole("button", { name, exact: false })
    .click();
}

test("authored briefing grounds history, visible state, and an unexecuted medication draft", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await open(page);
  const conversation = page.getByRole("region", { name: "Live conversation and captions" });
  await expect(conversation).toContainText("NURSE · AUTHORED");
  await expect(conversation).toContainText(
    "This is a formative emergency simulation. You are the medical student at the bedside. The patient is Morgan Lee, 58 years old, with central chest pressure, pale and clammy. Assess and manage the patient. What do you want to do?",
  );
  for (const withheld of ["45 minutes", "Amlodipine", "Hypertension", "300 mg", "ABCDE", "rubric"])
    await expect(conversation).not.toContainText(withheld);

  await textTurn(page, "When did the pressure start?");
  await expect(conversation).toContainText("PATIENT · TEXT");
  await expect(conversation).toContainText("45 minutes");

  await textTurn(page, "What is the heart rate on the monitor?");
  await expect(conversation).toContainText("ECG leads are not connected");
  await station(page, "Monitor");
  await page.getByRole("button", { name: "Connect ECG leads", exact: true }).click();
  await textTurn(page, "What is the heart rate on the monitor?");
  await expect(conversation).toContainText("104 beats/min");

  await textTurn(page, "Prepare aspirin");
  await expect(page.getByRole("heading", { name: "Medication", exact: true })).toBeFocused();
  await expect(page.getByText("Text-created draft")).toBeVisible();
  await expect(page.getByLabel("Draft dose")).toHaveValue("");
  await expect(page.getByLabel("Draft unit")).toHaveValue("");
  await expect(page.getByLabel("Draft route")).toHaveValue("");
  await expect(page.getByRole("button", { name: "Administer", exact: true })).toBeDisabled();
  await expect(page.getByRole("heading", { name: "Administration accepted" })).toHaveCount(0);

  await page.getByLabel("Draft dose").fill("300");
  await page.getByLabel("Draft unit").selectOption("mg");
  await page.getByLabel("Draft route").selectOption("oral");
  await page.getByLabel("Allergy history reviewed").check();
  await page.getByLabel("Prior doses reviewed").check();
  await page.getByRole("button", { name: "Confirm draft parameters" }).click();
  await expect(page.getByRole("button", { name: "Administer", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Administer", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Administration accepted" })).toBeVisible();
});

test("corrections reach one examiner follow-up and the answer is marked assisted", async ({ page }) => {
  await open(page);
  const conversation = page.getByRole("region", { name: "Live conversation and captions" });
  await textTurn(page, "I administered aspirin.");
  await conversation.getByText("Transcript", { exact: false }).click();
  const original = conversation.locator("li").filter({ hasText: "I administered aspirin." });
  await original.getByRole("button", { name: "Correct" }).click();
  await page.getByLabel("Correct transcript").fill("Correction: I only prepared aspirin; I did not administer it.");
  await page.getByRole("button", { name: "Save correction" }).click();
  await expect(original).toContainText("superseded by correction");
  await expect(conversation).toContainText("correction preserved");

  await station(page, "Call station");
  await page.getByLabel("Handoff content").fill("Morgan Lee has chest pressure. Aspirin was only prepared, not administered. I need senior review.");
  await page.getByRole("button", { name: "Give handoff" }).click();
  await expect(conversation).toContainText("EXAMINER · TEXT", { timeout: 10_000 });
  await expect(conversation).toContainText("What evidence informed your most important decision so far?");
  await expect(page.getByRole("button", { name: "Enter reasoning checkpoint" })).toBeDisabled();

  await textTurn(page, "The focused history and current observations informed it.");
  await conversation.getByText("Transcript", { exact: false }).click();
  await expect(
    conversation.locator("li").filter({ hasText: "The focused history and current observations informed it." }),
  ).toContainText("assisted response");
  await expect(conversation.locator("li").filter({ hasText: /^examiner/ })).toHaveCount(1);
});
