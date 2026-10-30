import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

/** Ruta relativa al basePath ("/ajustes" → ./ajustes/). Acepta query (?id=…). */
async function go(page: Page, path: string) {
  if (path === "/") return page.goto("./");
  const [p, q] = path.split("?");
  return page.goto(`.${p}/${q ? `?${q}` : ""}`);
}

async function navFor(page: Page) {
  const sidebar = page.getByRole("complementary", { name: "Navegación principal" });
  return (await sidebar.isVisible()) ? sidebar : page.getByRole("navigation", { name: "Módulos" });
}

async function addSubject(page: Page, name: string) {
  await go(page, "/ajustes");
  const input = page.getByLabel("Nombre de la materia");
  await input.fill(name);
  await input.press("Enter");
  await expect(page.getByRole("list", { name: "Materias activas" }).getByText(name)).toBeVisible();
}

const CSV = `"pregunta","respuesta"
"¿Qué desplaza la curva de la Hb a la derecha?","↑ CO₂, ↑ H⁺, ↑ temperatura y ↑ 2,3-BPG"
"¿Qué es la capacidad residual funcional?","Volumen que queda al final de una espiración normal"
`;

// ── Estructura ────────────────────────────────────────────────────────────

test.describe("estructura y navegación", () => {
  test("los 4 módulos son navegables y marcan el activo", async ({ page }) => {
    await go(page, "/");
    await expect(page.getByText("Mi siguiente objetivo")).toBeVisible();
    for (const m of [
      { label: "NeuroRecall", heading: "NeuroRecall" },
      { label: "FocusMD", heading: "FocusMD" },
      { label: "ClinicalLab", heading: "ClinicalLab" },
      { label: "Dashboard", heading: null },
    ]) {
      await (await navFor(page)).getByRole("link", { name: m.label }).click();
      if (m.heading) await expect(page.getByRole("heading", { level: 1, name: m.heading })).toBeVisible();
      else await expect(page.getByText("Mi siguiente objetivo")).toBeVisible();
      await expect((await navFor(page)).getByRole("link", { name: m.label })).toHaveAttribute("aria-current", "page");
    }
  });

  test("sin desbordamiento horizontal en ninguna pantalla", async ({ page }) => {
    for (const path of ["/", "/recall", "/recall/estadisticas", "/focus", "/lab", "/ajustes"]) {
      await go(page, path);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `desbordamiento en ${path}`).toBeLessThanOrEqual(0);
    }
  });

  test("sin materias, el objetivo lleva a crear la primera", async ({ page }) => {
    await go(page, "/");
    await page.getByRole("link", { name: "Crear materia" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Ajustes" })).toBeVisible();
  });
});

// ── Ajustes ───────────────────────────────────────────────────────────────

test.describe("Ajustes", () => {
  test("materias: crear, duplicado, persistir, editar, archivar y restaurar", async ({ page }) => {
    await addSubject(page, "Fisiología II");
    await addSubject(page, "Farmacología");
    const input = page.getByLabel("Nombre de la materia");
    await input.fill("fisiología ii");
    await input.press("Enter");
    await expect(page.getByRole("alert").filter({ hasText: "Ya tienes una materia" })).toBeVisible();

    await page.reload();
    const active = page.getByRole("list", { name: "Materias activas" });
    await expect(active.getByRole("listitem")).toHaveCount(2);

    await page.getByRole("button", { name: "Editar Farmacología" }).click();
    const dialog = page.getByRole("dialog", { name: "Editar materia" });
    await dialog.getByLabel("Nombre").fill("Bases de Farmacología");
    await dialog.getByRole("button", { name: "Guardar" }).click();
    await expect(dialog).toBeHidden();
    await expect(active.getByText("Bases de Farmacología")).toBeVisible();

    await page.getByRole("button", { name: "Archivar Fisiología II" }).click();
    await expect(active.getByRole("listitem")).toHaveCount(1);
    await page.getByText("Archivadas (1)").click();
    await page.getByRole("button", { name: "Restaurar Fisiología II" }).click();
    await expect(active.getByRole("listitem")).toHaveCount(2);
  });

  test("exámenes aparecen en el Dashboard", async ({ page }) => {
    await addSubject(page, "Genética");
    await page.getByLabel("Examen").fill("Primer parcial");
    await page.getByRole("form", { name: "Nuevo examen" }).getByRole("button", { name: "Agregar" }).click();
    await expect(page.getByRole("list", { name: "Próximos exámenes" }).getByText("Primer parcial")).toBeVisible();
    await go(page, "/");
    await expect(page.getByText("Primer parcial")).toBeVisible();
  });

  test("nombre del perfil cambia el saludo y persiste", async ({ page }) => {
    await go(page, "/ajustes");
    const name = page.getByLabel("Tu nombre");
    await name.fill("Ale");
    await name.press("Enter");
    await page.reload();
    await expect(page.getByLabel("Tu nombre")).toHaveValue("Ale");
    await go(page, "/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(", Ale");
  });

  test("respaldo JSON: exportar e importar (fusionar)", async ({ page }) => {
    await addSubject(page, "Microbiología");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Solo datos (JSON)" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^medos-respaldo-.*\.json$/);
    const file = await download.path();
    await expect(page.getByText(/Último respaldo/)).toBeVisible();

    await page.getByLabel("Archivo de respaldo").setInputFiles(file!);
    const dialog = page.getByRole("dialog", { name: "Importar respaldo" });
    await expect(dialog.getByText("Materias")).toBeVisible();
    await dialog.getByRole("button", { name: "Fusionar" }).click();
    await expect(dialog.getByText(/Listo:/)).toBeVisible();
    await dialog.getByRole("button", { name: "Cerrar" }).click();
    await expect(page.getByRole("list", { name: "Materias activas" }).getByRole("listitem")).toHaveCount(1);
  });
});

// ── NeuroRecall ───────────────────────────────────────────────────────────

test.describe("NeuroRecall", () => {
  test("importar CSV, estudiar con FSRS y ver el progreso", async ({ page }) => {
    await addSubject(page, "Fisiología II");
    await go(page, "/recall");
    await page.getByRole("button", { name: "Importar", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Importar tarjetas (CSV)" });
    await dialog.getByLabel("Archivo CSV").setInputFiles({ name: "respiratoria.csv", mimeType: "text/csv", buffer: Buffer.from(CSV, "utf8") });
    await expect(dialog.getByText("2 tarjetas válidas")).toBeVisible();
    await expect(dialog.getByLabel("Nombre del nuevo tema")).toHaveValue("respiratoria");
    await dialog.getByRole("button", { name: /^Importar 2/ }).click();
    await expect(dialog.getByText("2 tarjetas importadas")).toBeVisible();
    await dialog.getByRole("button", { name: "Listo" }).click();

    await expect(page.getByRole("link", { name: /respiratoria/ })).toBeVisible();
    await expect(page.getByText("0 vencidas · 2 nuevas")).toBeVisible();

    await page.getByRole("link", { name: "Repaso mixto" }).click();
    await expect(page.getByText("1 / 2")).toBeVisible();
    await page.getByLabel("Tu respuesta").fill("CO2 y temperatura");
    await page.getByRole("button", { name: "Mostrar respuesta" }).click();
    await expect(page.getByText("Tu respuesta")).toBeVisible();
    await page.getByRole("button", { name: /^Bien/ }).click();
    await expect(page.getByText(/\/ (2|3)$/)).toBeVisible();

    // deshacer devuelve la tarjeta
    await page.getByRole("button", { name: "Deshacer última calificación" }).click();
    await expect(page.getByText("1 / 2")).toBeVisible();
    await page.getByRole("button", { name: /^Fácil/ }).click();

    // terminar el resto de la sesión (las "Otra vez" pueden repetirse)
    for (let i = 0; i < 6; i++) {
      if (await page.getByText("Sesión terminada").isVisible()) break;
      const reveal = page.getByRole("button", { name: "Mostrar respuesta" });
      if (await reveal.isVisible()) await reveal.click();
      await page.getByRole("button", { name: /^Fácil/ }).click();
    }
    await expect(page.getByText("Sesión terminada")).toBeVisible();

    await go(page, "/");
    await expect(page.getByText(/Repasaste 2 tarjetas/)).toBeVisible();
    await go(page, "/recall/estadisticas");
    await expect(page.getByText("Repasos hoy")).toBeVisible();
  });

  test("crear tema y tarjeta con el editor enriquecido", async ({ page }) => {
    await addSubject(page, "Farmacología");
    await go(page, "/recall");
    await page.getByRole("button", { name: /Nuevo tema/ }).first().click();
    const d1 = page.getByRole("dialog", { name: "Nuevo tema" });
    await d1.getByLabel("Nombre del tema").fill("Autonómico");
    await d1.getByRole("button", { name: "Crear" }).click();
    await page.getByRole("link", { name: /Autonómico/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Autonómico" })).toBeVisible();

    await page.getByRole("button", { name: "Tarjeta" }).click();
    const editor = page.getByRole("dialog", { name: "Nueva tarjeta" });
    await editor.getByRole("textbox", { name: "Pregunta" }).fill("¿Receptor de la atropina?");
    await editor.getByRole("textbox", { name: "Respuesta" }).fill("Antagonista muscarínico");
    await editor.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(editor).toBeHidden();
    await expect(page.getByText("¿Receptor de la atropina?")).toBeVisible();

    await page.reload();
    await expect(page.getByText("¿Receptor de la atropina?")).toBeVisible();
  });
});

// ── FocusMD ───────────────────────────────────────────────────────────────

test.describe("FocusMD", () => {
  test("pantalla limpia, pausa, reanudar, recargar y terminar antes", async ({ page }) => {
    await addSubject(page, "Neuroanatomía");
    await go(page, "/focus");
    await page.getByLabel("Materia").selectOption({ label: "Neuroanatomía" });
    await page.getByLabel("Objetivo concreto").fill("Vías del tronco encefálico");
    await page.getByRole("radio", { name: "15", exact: true }).click();
    await page.getByRole("button", { name: /Comenzar 15 min/ }).click();

    const runner = page.getByRole("region", { name: "Sesión en curso" });
    await expect(runner.getByText("Vías del tronco encefálico")).toBeVisible();
    await expect(runner.getByRole("timer")).toHaveText(/^1[45]:\d\d$/);

    await runner.getByRole("button", { name: "Pausar" }).click();
    await expect(runner.getByText("En pausa")).toBeVisible();

    // recargar no pierde la sesión (vive en IndexedDB)
    await page.reload();
    const again = page.getByRole("region", { name: "Sesión en curso" });
    await expect(again.getByText("En pausa")).toBeVisible();
    await again.getByRole("button", { name: "Reanudar" }).click();
    await again.getByRole("button", { name: "Finalizar" }).click();
    await again.getByRole("button", { name: "Sí, terminar" }).click();

    await expect(page.getByRole("dialog", { name: "Sesión terminada" })).toBeVisible();
    await page.getByRole("button", { name: "Listo" }).click();
    await expect(page.getByText("Terminada antes")).toBeVisible();
  });

  test("no deja empezar sin objetivo", async ({ page }) => {
    await go(page, "/focus");
    await expect(page.getByRole("button", { name: /Comenzar 25 min/ })).toBeDisabled();
  });
});

// ── ClinicalLab ───────────────────────────────────────────────────────────

test.describe("ClinicalLab", () => {
  const template = readFileSync(join(process.cwd(), "public/plantillas/casos-ejemplo.json"));

  test("importar la plantilla, resolver el caso y ver la calificación", async ({ page }) => {
    await go(page, "/lab");
    await page.getByRole("button", { name: "Importar casos" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Importar casos clínicos" });
    await dialog.getByLabel("Archivo de casos JSON").setInputFiles({ name: "casos.json", mimeType: "application/json", buffer: template });
    await expect(dialog.getByText(/1 caso válido/)).toBeVisible();
    await dialog.getByRole("button", { name: /^Importar 1/ }).click();
    await expect(dialog.getByText(/1 caso importado/)).toBeVisible();
    await dialog.getByRole("button", { name: "Listo" }).click();

    await page.getByRole("link", { name: /Poliuria, dolor abdominal/ }).click();
    await expect(page.getByText("Caso ficticio con fines educativos")).toBeVisible();
    await expect(page.getByText("Glucosa sérica")).toBeVisible();
    await page.getByRole("button", { name: /Comenzar caso/ }).click();

    await page.getByRole("button", { name: /brecha aniónica elevada/ }).click();
    await expect(page.getByText("Explicación")).toBeVisible();
    await page.getByRole("button", { name: /Cetoacidosis diabética por infección/ }).click();
    await page.getByRole("button", { name: /β-oxidación hepática/ }).click();
    // error a propósito en la última → concepto débil
    await page.getByRole("button", { name: /hemólisis de la muestra/ }).click();
    await page.getByRole("button", { name: "Ver calificación" }).click();
    await expect(page.getByText("75 %")).toBeVisible();
    await expect(page.getByText("Potasio corporal total en cetoacidosis diabética").first()).toBeVisible();

    await go(page, "/recall/estadisticas");
    await expect(page.getByText("Potasio corporal total en cetoacidosis diabética")).toBeVisible();
  });
});
