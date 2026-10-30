import { MedOSDB } from "@/db/schema";

let n = 0;

/** Base de datos nueva y aislada para cada prueba. */
export async function freshDb(): Promise<MedOSDB> {
  const db = new MedOSDB(`medos-test-${Date.now()}-${++n}`);
  await db.open();
  return db;
}

export const MIN = 60_000;
export const DAY = 86_400_000;
