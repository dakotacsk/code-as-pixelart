import { expect, test, type Page } from "@playwright/test";
import { PNG } from "pngjs";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Explore demo" }).click();
  await expect(page.getByText("Field Notes", { exact: true })).toBeVisible();
  (page as Page & { collectedErrors?: string[] }).collectedErrors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as Page & { collectedErrors?: string[] }).collectedErrors ?? []).toEqual([]);
});

test("draws, selects, picks colors, and undoes with familiar shortcuts", async ({ page }) => {
  const canvas = page.locator(".canvas-stage canvas");
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  await page.keyboard.press("b");
  await canvas.click({ position: { x: 18 * 2 + 4, y: 18 * 2 + 4 } });
  await expect(page.locator(".status-bar").getByText(/Painted/)).toBeVisible();
  await page.keyboard.press("Meta+z");
  await expect(page.locator(".status-bar").getByText("Undo", { exact: true })).toBeVisible();
  await page.locator('.layer-cell:has(input[aria-label="Layer name Face"])').evaluate((element: HTMLElement) => element.click());
  const fittedZoom = (await canvas.boundingBox())!.width / 24;
  await canvas.click({ position: { x: 10 * fittedZoom + fittedZoom / 2, y: 6 * fittedZoom + fittedZoom / 2 }, modifiers: ["Alt"] });
  await expect(page.getByRole("button", { name: "Foreground eye" })).toBeVisible();
  await page.keyboard.press("m");
  await expect(page.locator(".context-bar strong")).toHaveText("Marquee");
  await canvas.dragTo(canvas, { sourcePosition: { x: 40, y: 40 }, targetPosition: { x: 160, y: 160 } });
  await expect(page.locator(".selection-overlay rect")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.locator(".selection-overlay rect")).toHaveCount(0);
  await page.keyboard.press("Tab");
  await expect(page.locator(".studio")).toHaveClass(/timeline-hidden/);
  await page.keyboard.press("Tab");
  await expect(page.locator(".studio")).not.toHaveClass(/timeline-hidden/);
});

test("manages layers, frames, playback, and onion skin from the cel timeline", async ({ page }) => {
  await page.getByRole("button", { name: "Add layer" }).click();
  await expect(page.getByLabel("Layer name New layer")).toBeVisible();
  await page.getByLabel("Lock New layer").click();
  await expect(page.getByLabel("Unlock New layer")).toBeVisible();
  const framesBefore = await page.locator(".frame-header").count();
  await page.getByRole("button", { name: "Duplicate frame" }).click();
  await expect(page.locator(".frame-header")).toHaveCount(framesBefore + 1);
  await page.getByRole("button", { name: "Toggle onion skin" }).click();
  await expect(page.getByRole("button", { name: "Toggle onion skin" })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Timeline FPS").fill("18");
  await expect(page.getByLabel("Timeline FPS")).toHaveValue("18");
  await page.getByRole("button", { name: "Loop animation" }).click();
  await expect(page.getByRole("button", { name: "Loop animation" })).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Loop animation" }).click();
  const faceCels = page.locator('.timeline-row:has(input[aria-label="Layer name Face"]) .cel');
  await faceCels.nth(0).dragTo(faceCels.nth(1));
  await expect(page.locator(".status-bar").getByText("Swapped cels", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Play animation" }).click();
  await expect(page.getByRole("button", { name: "Pause animation" })).toBeVisible();
  await page.waitForTimeout(550);
  await page.getByRole("button", { name: "Pause animation" }).click();
});

test("switches authored directions and variants, inspects source, and exports", async ({ page }, testInfo) => {
  const initialHash = await page.locator(".panel-heading span").textContent();
  await page.getByRole("button", { name: "Three-quarter" }).click();
  await expect(page.locator(".preview-data").getByText("Three-quarter", { exact: true })).toBeVisible();
  await page.getByLabel("Variant").selectOption("night-shift");
  await expect.poll(async () => page.locator(".panel-heading span").textContent()).not.toBe(initialHash);
  await page.getByRole("tab", { name: "source" }).click();
  await expect(page.locator(".source-panel pre")).toContainText('"grid"');
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Export" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "JSON manifest" }).click();
  await expect((await download).suggestedFilename()).toMatch(/\.json$/);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "File", exact: true }).click();
  const sourceDownload = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Save project source" }).click();
  const source = await sourceDownload;
  const sourcePath = testInfo.outputPath("round-trip.pixel.json");
  await source.saveAs(sourcePath);
  await page.locator('input[type="file"]').setInputFiles(sourcePath);
  await expect(page.locator(".status-bar").getByText(/Opened round-trip\.pixel\.json/)).toBeVisible();
});

test("keeps canvas and panel controls accessible on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 800 });
  await expect(page.locator(".canvas-workspace")).toBeVisible();
  await expect(page.locator(".mobile-panel-tabs").getByRole("button", { name: "Timeline" })).toBeVisible();
  await expect(page.locator(".studio")).toHaveClass(/inspector-hidden/);
  await expect(page.locator(".studio")).toHaveClass(/timeline-hidden/);
  await page.locator(".mobile-panel-tabs").getByRole("button", { name: "Inspector" }).click();
  await expect(page.locator(".inspector")).toBeVisible();
  await page.locator(".mobile-panel-tabs").getByRole("button", { name: "Inspector" }).click();
  await expect(page.locator(".studio")).toHaveClass(/inspector-hidden/);
  const canvas = await page.locator(".canvas-workspace").boundingBox();
  expect(canvas?.width).toBeGreaterThan(300);
});

test("converts an uploaded mascot, prepares an agent handoff, and exports a GIF", async ({ page }) => {
  const png = new PNG({ width: 8, height: 8 });
  for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) {
    const index = (y * 8 + x) * 4;
    const body = x >= 2 && x <= 5 && y >= 1 && y <= 6;
    png.data[index] = body ? 142 : 238; png.data[index + 1] = body ? 70 : 225; png.data[index + 2] = body ? 46 : 225; png.data[index + 3] = 255;
  }
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Import mascot image" }).click();
  await page.locator('input[aria-label="Mascot image"]').setInputFiles({ name: "pepper.png", mimeType: "image/png", buffer: PNG.sync.write(png) });
  await page.getByText("Remove edge background").getByRole("checkbox").uncheck();
  await page.getByLabel("Imported sprite size").fill("16");
  await page.getByRole("button", { name: "Convert to source" }).click();
  await expect(page.locator(".document-title")).toContainText("pepper");
  await expect(page.locator(".status-bar").getByText(/Converted pepper\.png/)).toBeVisible();

  await page.getByRole("tab", { name: "agent" }).click();
  await page.getByLabel("Agent animation request").fill("Make the mascot blink twice without changing its silhouette.");
  const handoffDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download handoff" }).click();
  await expect((await handoffDownload).suggestedFilename()).toMatch(/\.agent-request\.json$/);

  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Export" }).click();
  const gifDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "GIF animation" }).click();
  await expect((await gifDownload).suggestedFilename()).toMatch(/\.gif$/);
});
