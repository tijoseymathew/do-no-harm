import { expect, test, type Page } from "@playwright/test";
import { mkdir, copyFile, writeFile } from "node:fs/promises";
import { PerspectiveCamera, Vector3 } from "three";

const evidence = "docs/evidence/phase-03";

test("3D equipment hotspots open the matching HTML panel", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  const locations: [string, number, number, number][] = [
    ["Monitor", -1.6, 2, -1.35],
    ["Medication", -2, 1.3, 2],
    ["Oxygen / IV", -2.4, 2.28, -0.8],
    ["ECG / results", 2.3, 1.8, 0.7],
    ["Clipboard", 1, 1.05, 2.3],
    ["Call station", 3.8, 1.65, -3.15],
    ["Patient", 0, 1.36, -1.25],
  ];
  for (const [name, x, y, z] of locations) {
    await station(page, "Patient");
    await expect(
      page.getByRole("heading", { name: "Patient", exact: true }),
    ).toBeFocused();
    const rect = (await page.locator(".room canvas").boundingBox())!;
    const camera = new PerspectiveCamera(
      42,
      rect.width / rect.height,
      0.1,
      100,
    );
    camera.position.set(7.6, 6.8, 10.5);
    camera.lookAt(0, 1, 0);
    camera.updateMatrixWorld();
    const point = new Vector3(x, y, z).project(camera);
    await page.mouse.click(
      rect.x + ((point.x + 1) * rect.width) / 2,
      rect.y + ((1 - point.y) * rect.height) / 2,
    );
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeFocused();
  }
});
async function open(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("navigation", { name: "Bedside controls" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
}
async function station(page: Page, name: string) {
  await page
    .getByRole("navigation")
    .getByRole("button", { name, exact: false })
    .click();
}

test("reset starts a fresh scenario and clears bedside state", async ({ page }) => {
  await open(page);
  const firstRun = await page
    .getByRole("link", { name: "Export run JSON" })
    .getAttribute("href");
  await station(page, "Monitor");
  await page.getByRole("button", { name: "Connect ECG leads" }).click();
  await expect(page.getByLabel(/ECG: \d+ beats\/min/)).toBeVisible();

  await page.getByRole("button", { name: "Reset scenario" }).click();

  await expect(page.getByRole("heading", { name: "Patient", exact: true })).toBeVisible();
  const nextRun = await page
    .getByRole("link", { name: "Export run JSON" })
    .getAttribute("href");
  expect(nextRun).not.toBe(firstRun);
  await station(page, "Monitor");
  await expect(page.getByLabel("ECG: not connected")).toBeVisible();
});

test("reports an empty API response without surfacing a JSON parse error", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("**/api/cases/current", (route) =>
    route.fulfill({ status: 502, body: "" }),
  );

  await page.goto("/");

  await expect(page.getByRole("alert")).toContainText(
    "The server returned an empty response (HTTP 502). Try again.",
  );
  expect(pageErrors).not.toContainEqual(
    expect.stringContaining("Unexpected end of JSON input"),
  );
});
async function inViewport(page: Page, locator: ReturnType<Page["getByRole"]>) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
}
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
]) {
  test(`room and administration ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await open(page);
    await expect(
      page.getByText("Reduced graphics —", { exact: false }),
    ).toHaveCount(0);
    const rendered = await page
      .locator(".room canvas")
      .evaluate((canvas: HTMLCanvasElement) => {
        const gl = canvas.getContext("webgl2");
        return !!gl && !gl.isContextLost() && canvas.width > 0;
      });
    expect(rendered).toBe(true);
    for (const name of [
      "Patient",
      "Monitor",
      "Medication",
      "Oxygen / IV",
      "ECG / results",
      "Clipboard",
      "Call station",
    ]) {
      await station(page, name);
      await expect(
        page.getByRole("heading", { name, exact: true }),
      ).toBeFocused();
      await inViewport(page, page.getByRole("navigation"));
      await inViewport(
        page,
        page.getByRole("region", { name: "Bedside monitor summary" }),
      );
    }
    await station(page, "Monitor");
    await expect(page.getByLabel("ECG: not connected")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Measure BP", exact: true }),
    ).toBeDisabled();
    for (const name of ["ECG leads", "SpO₂ probe", "BP cuff"])
      await page
        .getByRole("button", { name: `Connect ${name}`, exact: true })
        .click();
    await expect(
      page.getByLabel("ECG: 104 beats/min, four-second strip"),
    ).toBeVisible();
    await page.getByRole("button", { name: "Measure BP", exact: true }).click();
    await expect(page.getByText(/^0 s ago/)).toBeVisible();
    await page
      .getByRole("button", { name: "Resume", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Advance scenario +30 s", exact: true })
      .click();
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await expect(page.getByText(/^3[01] s ago/)).toBeVisible();
    await page.getByRole("button", { name: "Repeat BP measurement" }).click();
    await expect(page.getByText(/^0 s ago/)).toBeVisible();
    for (const name of ["ECG leads", "SpO₂ probe", "BP cuff"])
      await page
        .getByRole("button", { name: `Disconnect ${name}`, exact: true })
        .click();
    await expect(page.getByLabel("ECG: not connected")).toBeVisible();
    await expect(
      page.getByText("Cuff not connected · last reading retained"),
    ).toBeVisible();
    for (const name of ["ECG leads", "SpO₂ probe", "BP cuff"])
      await page
        .getByRole("button", { name: `Connect ${name}`, exact: true })
        .click();
    await station(page, "Medication");
    await page.getByLabel("Dose", { exact: true }).fill("300");
    await page.getByLabel("Unit", { exact: true }).selectOption("mg");
    await page.getByLabel("Route", { exact: true }).selectOption("oral");
    await page.getByLabel("Allergy history reviewed").check();
    await page.getByLabel("Prior doses reviewed").check();
    const administrations: unknown[] = [];
    page.on("request", (r) => {
      if (
        r.url().endsWith("/commands") &&
        r.postDataJSON()?.command?.type === "administer_prepared"
      )
        administrations.push(r.postDataJSON());
    });
    await page.getByRole("button", { name: "Review and prepare medication" }).click();
    await inViewport(
      page,
      page.getByRole("button", { name: "Administer", exact: true }),
    );
    await page.getByRole("button", { name: "Cancel prepared order" }).click();
    expect(administrations).toHaveLength(0);
    await page.getByRole("button", { name: "Review and prepare medication" }).click();
    await mkdir(evidence, { recursive: true });
    await inViewport(page, page.getByRole("navigation"));
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await page.screenshot({
      path: `${evidence}/room-${viewport.width}x${viewport.height}.png`,
    });
    const accepted = page.waitForResponse(
      (r) =>
        r.url().endsWith("/commands") &&
        r.request().postDataJSON()?.command?.type === "administer_prepared",
    );
    await page.getByRole("button", { name: "Administer", exact: true }).click();
    const receipt = (await (await accepted).json()).receipts[0];
    await expect(
      page.getByRole("heading", { name: "Administration accepted" }),
    ).toBeVisible();
    expect(administrations).toHaveLength(1);
    expect(receipt).toMatchObject({
      dose: 300,
      unit: "mg",
      route: "oral",
      mode: "development_fixture",
      status: "administered",
    });
    await writeFile(
      `${evidence}/receipt-${viewport.width}.json`,
      JSON.stringify(receipt, null, 2) + "\n",
    );
    await inViewport(page, page.getByRole("navigation"));
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await page.screenshot({
      path: `${evidence}/accepted-${viewport.width}x${viewport.height}.png`,
    });
    expect(errors).toEqual([]);
    const video = page.video();
    await page.close();
    if (viewport.width === 1280 && video)
      await copyFile(
        await video.path(),
        `${evidence}/interaction-1280x720.webm`,
      );
  });
}

for (const reducedMotion of ["reduce", "no-preference"] as const) {
  test(`keyboard workflow with ${reducedMotion} motion and muted audio`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await page.setViewportSize({ width: 1280, height: 720 });
    await open(page);
    await expect(
      page.getByLabel("Reduced motion", { exact: true }),
    ).toBeChecked({ checked: reducedMotion === "reduce" });
    await expect(
      page.getByRole("button", { name: "Sound muted" }),
    ).toHaveAttribute("aria-pressed", "true");
    async function tabTo(name: string) {
      const target = page.getByRole("button", { name, exact: true });
      for (let i = 0; i < 60; i++) {
        if (await target.evaluate((el) => el === document.activeElement))
          return;
        await page.keyboard.press("Tab");
      }
      throw new Error(`Could not reach ${name} by keyboard`);
    }
    await tabTo("02Monitor");
    await page.keyboard.press("Enter");
    for (const label of ["ECG leads", "SpO₂ probe", "BP cuff"]) {
      await tabTo(`Connect ${label}`);
      await page.keyboard.press("Enter");
      await expect(
        page.getByRole("button", { name: `Disconnect ${label}`, exact: true }),
      ).toBeEnabled();
    }
    await tabTo("Measure BP");
    await page.keyboard.press("Enter");
    await expect(page.getByText("146/88", { exact: true })).toBeVisible();
    await tabTo("03Medication");
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", { name: "Medication", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Tab"); // drug
    await page.keyboard.press("Tab"); // dose
    await expect(page.getByLabel("Dose", { exact: true })).toBeFocused();
    await page.keyboard.type("300");
    await page.keyboard.press("Tab");
    await page.keyboard.press("m");
    await page.keyboard.press("Tab");
    await page.keyboard.press("o");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Space");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Space");
    await tabTo("Review and prepare medication");
    await page.keyboard.press("Enter");
    await tabTo("Administer");
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", { name: "Administration accepted" }),
    ).toBeVisible();
  });
}

test("lost acknowledgment pauses locally and refresh recovers the accepted receipt", async ({
  page,
}) => {
  await open(page);
  await station(page, "Medication");
  await page.getByLabel("Dose", { exact: true }).fill("300");
  await page.getByLabel("Unit", { exact: true }).selectOption("mg");
  await page.getByLabel("Route", { exact: true }).selectOption("oral");
  await page.getByLabel("Allergy history reviewed").check();
  await page.getByLabel("Prior doses reviewed").check();
  await page.getByRole("button", { name: "Review and prepare medication" }).click();
  await expect(page.getByRole("heading", { name: "Prepared — not administered" })).toBeVisible();
  await page.route("**/commands", async (route) => {
    await route.fetch(); // The server accepts the action; its reply is lost.
    await route.abort("failed");
  });
  await page.getByRole("button", { name: "Administer", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Simulation paused locally");
  await page.unroute("**/commands");
  await page.getByRole("button", { name: "Refresh state" }).click();
  await expect(
    page.getByRole("heading", { name: "Administration accepted" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Resume", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Administer", exact: true }),
  ).toHaveCount(0);
});

test("WebGL unavailable keeps sensor and medication controls functional", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      type: string,
      ...args: unknown[]
    ) {
      if (type.startsWith("webgl") || type === "experimental-webgl")
        return null;
      return Reflect.apply(original, this, [type, ...args]);
    } as typeof original;
  });
  await open(page);
  await expect(
    page.getByText("Reduced graphics —", { exact: false }),
  ).toBeVisible();
  await station(page, "Monitor");
  await page
    .getByRole("button", { name: "Connect ECG leads", exact: true })
    .click();
  await expect(
    page.getByLabel("ECG: 104 beats/min, four-second strip"),
  ).toBeVisible();
  await station(page, "Medication");
  await page.getByLabel("Dose", { exact: true }).fill("300");
  await page.getByLabel("Unit", { exact: true }).selectOption("mg");
  await page.getByLabel("Route", { exact: true }).selectOption("oral");
  await page.getByLabel("Allergy history reviewed").check();
  await page.getByLabel("Prior doses reviewed").check();
  await page.getByRole("button", { name: "Review and prepare medication" }).click();
  await page.getByRole("button", { name: "Administer", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Administration accepted" }),
  ).toBeVisible();
});
