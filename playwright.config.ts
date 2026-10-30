import { defineConfig, devices } from "@playwright/test";

/**
 * Pruebas de punta a punta contra la compilación estática real (out/),
 * con el mismo basePath que GitHub Pages. WebKit = motor de Safari.
 * Requiere `npm run build` antes.
 */
const PORT = 4173;
const BASE = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}${BASE}/`,
    trace: "retain-on-failure",
    // el service worker se prueba aparte (offline.spec.ts); aquí no debe interferir
    serviceWorkers: "block",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node scripts/serve-out.mjs",
    url: `http://localhost:${PORT}${BASE}/`,
    env: { PORT: String(PORT), BASE_PATH: BASE },
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "safari-mac", use: { ...devices["Desktop Safari"] } },
    { name: "iphone", use: { ...devices["iPhone 14"] } },
    { name: "ipad", use: { ...devices["iPad (gen 7)"] } },
    { name: "chrome-desktop", use: { ...devices["Desktop Chrome"] } },
  ],
});
