import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MedOSDB } from "@/db/schema";
import {
  SubjectError,
  countSubjectDependents,
  createSubject,
  deleteSubject,
  listSubjects,
  setSubjectArchived,
  updateSubject,
} from "@/db/repos/subjects";

let db: MedOSDB;
let n = 0;

beforeEach(async () => {
  db = new MedOSDB(`medos-test-${++n}`);
  await db.open();
});

afterEach(async () => {
  await db.delete();
});

describe("materias", () => {
  it("crea la base con metadatos iniciales", async () => {
    const version = await db.meta.get("schemaVersion");
    expect(version?.value).toBe(1);
    expect(await db.meta.get("lastBackupAt")).toEqual({ key: "lastBackupAt", value: null });
  });

  it("crea, limpia espacios y registra actividad", async () => {
    const s = await createSubject({ name: "  Fisiología   II ", color: "#10B981" }, db);
    expect(s.name).toBe("Fisiología II");
    expect(s.color).toBe("#10b981");
    expect(await db.activity.where("subjectId").equals(s.id).count()).toBe(1);
  });

  it("rechaza nombres vacíos y duplicados (sin importar mayúsculas)", async () => {
    await expect(createSubject({ name: "   " }, db)).rejects.toBeInstanceOf(SubjectError);
    await createSubject({ name: "Farmacología" }, db);
    await expect(createSubject({ name: "farmacología" }, db)).rejects.toMatchObject({ code: "duplicate" });
    expect(await db.subjects.count()).toBe(1);
  });

  it("usa un color válido si recibe uno inválido", async () => {
    const s = await createSubject({ name: "Genética", color: "rojo" }, db);
    expect(s.color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("ordena alfabéticamente y oculta archivadas por defecto", async () => {
    const b = await createSubject({ name: "Microbiología" }, db);
    await createSubject({ name: "Epidemiología" }, db);
    await setSubjectArchived(b.id, true, db);
    expect((await listSubjects({}, db)).map((s) => s.name)).toEqual(["Epidemiología"]);
    expect((await listSubjects({ includeArchived: true }, db)).map((s) => s.name)).toEqual([
      "Epidemiología",
      "Microbiología",
    ]);
  });

  it("renombra y evita choque con otra materia", async () => {
    const a = await createSubject({ name: "Semiología" }, db);
    await createSubject({ name: "Neuroanatomía" }, db);
    await updateSubject(a.id, { name: "Propedéutica" }, db);
    expect((await db.subjects.get(a.id))?.name).toBe("Propedéutica");
    await expect(updateSubject(a.id, { name: "NEUROANATOMÍA" }, db)).rejects.toMatchObject({
      code: "duplicate",
    });
  });

  it("permite renombrar a sí misma con distinto formato", async () => {
    const a = await createSubject({ name: "Genetica" }, db);
    await expect(updateSubject(a.id, { name: "genetica" }, db)).resolves.toBeUndefined();
  });

  it("borra una materia vacía", async () => {
    const s = await createSubject({ name: "Temporal" }, db);
    await deleteSubject(s.id, db);
    expect(await db.subjects.get(s.id)).toBeUndefined();
  });

  it("NO borra una materia con contenido: pide archivarla", async () => {
    const s = await createSubject({ name: "Fisiología II" }, db);
    await db.decks.add({
      id: "deck-1",
      subjectId: s.id,
      parentId: null,
      name: "Respiratoria",
      newPerDay: 8,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    expect((await countSubjectDependents(s.id, db)).total).toBe(1);
    await expect(deleteSubject(s.id, db)).rejects.toMatchObject({ code: "has_content" });
    expect(await db.subjects.get(s.id)).toBeDefined();
  });

  it("los datos persisten al cerrar y reabrir la base", async () => {
    const name = db.name;
    await createSubject({ name: "Persistente" }, db);
    db.close();
    const reopened = new MedOSDB(name);
    await reopened.open();
    expect((await listSubjects({}, reopened)).map((s) => s.name)).toEqual(["Persistente"]);
    reopened.close();
    await db.open(); // para que afterEach pueda borrarla
  });
});
