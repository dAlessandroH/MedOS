import type { DashboardData } from "@/db/repos/stats";
import { daysUntil } from "@/db/repos/exams";

export interface Objective {
  id: string;
  title: string;
  reason: string;
  href: string;
  cta: string;
}

const EXAM_WINDOW_DAYS = 7;

/**
 * "Mi siguiente objetivo": reglas fijas y explicables (sin IA), en este orden:
 *  1. Retomar una sesión de FocusMD que quedó abierta
 *  2. Terminar un caso clínico empezado
 *  3. Crear la primera materia
 *  4. Repasar tarjetas vencidas (de la materia con examen más cercano, si hay)
 *  5. Examen en ≤ 7 días → sesión de enfoque de esa materia
 *  6. Conceptos débiles pendientes
 *  7. Aprender tarjetas nuevas del día
 *  8. Importar el primer mazo
 * Devuelve la lista ordenada; el Dashboard muestra solo la primera (y la siguiente, discreta).
 */
export function rankObjectives(d: DashboardData): Objective[] {
  const out: Objective[] = [];
  const subjectName = (id: string | null | undefined) => d.subjects.find((s) => s.id === id)?.name;

  if (d.activeSession) {
    const s = d.activeSession;
    out.push({
      id: "resume-focus",
      title: s.kind === "focus" ? `Retomar: ${s.goal}` : "Retomar tu descanso",
      reason: s.status === "paused" ? "Dejaste una sesión en pausa. Sigue donde te quedaste." : "Tienes una sesión en curso.",
      href: "/focus",
      cta: "Retomar sesión",
    });
  }

  if (d.openCase) {
    out.push({
      id: "resume-case",
      title: `Terminar el caso «${d.openCase.title}»`,
      reason: "Ya empezaste este caso; termínalo para ver tu calificación.",
      href: `/lab/caso?id=${d.openCase.id}`,
      cta: "Continuar caso",
    });
  }

  if (d.subjects.length === 0) {
    out.push({
      id: "create-subject",
      title: "Crea tu primera materia",
      reason: "Todo en MedOS se organiza por materia: mazos, sesiones de enfoque y casos clínicos.",
      href: "/ajustes#materias",
      cta: "Crear materia",
    });
    return out;
  }

  const nearExams = d.exams
    .map((e) => ({ e, days: daysUntil(e.date, d.now) }))
    .filter((x) => x.days >= 0 && x.days <= EXAM_WINDOW_DAYS);

  if (d.reviewsDue > 0) {
    const examWithDue = nearExams.find((x) => (d.dueBySubject.get(x.e.subjectId) ?? 0) > 0);
    if (examWithDue) {
      const n = d.dueBySubject.get(examWithDue.e.subjectId) ?? 0;
      out.push({
        id: "review-exam",
        title: `Repasar ${n} ${n === 1 ? "tarjeta" : "tarjetas"} de ${subjectName(examWithDue.e.subjectId)}`,
        reason: `Tu examen «${examWithDue.e.title}» es ${examWithDue.days === 0 ? "hoy" : examWithDue.days === 1 ? "mañana" : `en ${examWithDue.days} días`}.`,
        href: `/recall/estudiar?subject=${examWithDue.e.subjectId}`,
        cta: "Empezar repaso",
      });
    } else {
      out.push({
        id: "review",
        title: `Repasar ${d.reviewsDue} ${d.reviewsDue === 1 ? "tarjeta" : "tarjetas"}`,
        reason: "Están vencidas: repasarlas hoy evita que se te olviden. Empiezan las que menos dominas.",
        href: "/recall/estudiar?mix=1",
        cta: "Empezar repaso",
      });
    }
  }

  if (nearExams.length > 0) {
    const x = nearExams[0];
    out.push({
      id: "exam-focus",
      title: `Sesión de 25 min de ${subjectName(x.e.subjectId) ?? "tu examen"}`,
      reason: `Examen «${x.e.title}» ${x.days === 0 ? "hoy" : x.days === 1 ? "mañana" : `en ${x.days} días`}. Una sesión corta suma.`,
      href: `/focus?subject=${x.e.subjectId}`,
      cta: "Iniciar sesión",
    });
  }

  if (d.weak.length > 0) {
    const w = d.weak[0];
    out.push({
      id: "weak",
      title: `Reforzar: ${w.label}`,
      reason: `Fallaste este concepto ${w.hits} ${w.hits === 1 ? "vez" : "veces"} en ${w.source === "lab" ? "ClinicalLab" : "NeuroRecall"}.`,
      href: "/recall/estadisticas#debiles",
      cta: "Ver conceptos débiles",
    });
  }

  if (d.newAvailable > 0) {
    out.push({
      id: "learn-new",
      title: `Aprender ${d.newAvailable} ${d.newAvailable === 1 ? "tarjeta nueva" : "tarjetas nuevas"}`,
      reason: "Ya repasaste lo pendiente. Avanza con contenido nuevo dentro de tu límite diario.",
      href: "/recall/estudiar?mix=1",
      cta: "Aprender",
    });
  }

  if (d.totalCards === 0) {
    out.push({
      id: "import-first",
      title: "Importa tu primer mazo",
      reason: "Sube un CSV de flashcards o de plataforma para empezar a repasar con FSRS.",
      href: "/recall",
      cta: "Ir a NeuroRecall",
    });
  }

  return out;
}
