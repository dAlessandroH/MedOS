import { expect, test } from "@playwright/test";

/**
 * Funciona sin internet: tras la primera visita, el service worker
 * guarda toda la app y la sirve aunque no haya conexión.
 * (Se prueba en Chromium, donde Playwright controla service workers de forma fiable.)
 */
test.use({ serviceWorkers: "allow" });

test("la app abre sin conexión después de la primera visita", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "Service workers controlados solo en Chromium");
  await page.goto("./");
  await expect(page.getByText("Mi siguiente objetivo")).toBeVisible();
  await page.waitForFunction(async () => {
    const reg = await navigator.serviceWorker.ready;
    return !!reg.active && !!navigator.serviceWorker.controller;
  }, undefined, { timeout: 30_000 });

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText("Mi siguiente objetivo")).toBeVisible();
  await page.goto("./recall/");
  await expect(page.getByRole("heading", { level: 1, name: "NeuroRecall" })).toBeVisible();
  await context.setOffline(false);
});
