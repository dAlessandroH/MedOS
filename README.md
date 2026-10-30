# MedOS

Sistema operativo personal de estudio médico. Funciona 100 % en el dispositivo:
sin servidores, sin cuentas, sin IA. Los datos viven en IndexedDB y la app
funciona sin internet una vez instalada.

| Módulo | Qué hace |
|---|---|
| **Dashboard** | Saludo, “Mi siguiente objetivo” (una sola tarea), tiempo estudiado, pendientes, retención, exámenes, progreso, actividad y accesos rápidos. |
| **NeuroRecall** | Mazos por materia → tema → subtema, tarjetas con texto enriquecido e imágenes, importación CSV, repaso con **FSRS real** (`ts-fsrs`), deshacer, estadísticas, tarjetas problemáticas y conceptos débiles. |
| **FocusMD** | Temporizador 5/10/15/25/45/personalizado, descansos, pantalla limpia, tiempo por marcas de tiempo, pantalla siempre encendida, historial y estadística semanal. |
| **ClinicalLab** | Biblioteca de casos (JSON), filtros, casos seriados, laboratorios marcados, retroalimentación, calificación e historial. |

**Ajustes:** materias, exámenes, respaldos JSON/ZIP (fusionar o reemplazar), preferencias y estado del almacenamiento.

## Importar contenido

**NeuroRecall (CSV, todo entre comillas dobles):**

- Flashcards: `"pregunta","respuesta"`
- Plataforma: `"pregunta","opcion_a","opcion_b","opcion_c","opcion_d","respuesta","categoria","explicacion"`
  (`respuesta` = a/b/c/d). La columna `categoria` puede crear subtemas automáticamente.

Reimportar el mismo archivo no duplica tarjetas.

**ClinicalLab (JSON):** ver [docs/FORMATO-CASOS.md](docs/FORMATO-CASOS.md).

## Publicar en GitHub Pages (una sola vez)

1. Crea un repositorio (por ejemplo `MedOS`) y sube esta carpeta a la rama `main`.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Cada `push` instala, verifica tipos, corre pruebas unitarias y de punta a punta
   (Safari/WebKit en Mac, iPad y iPhone + Chrome) y, si todo pasa, publica en
   `https://<usuario>.github.io/MedOS/`. Si algo falla, no se publica.

## Instalar en iPhone / iPad / Mac

Safari → Compartir → **Agregar a inicio** (en Mac: Archivo → Agregar al Dock).
Instalada así funciona sin internet y Safari no borra los datos por inactividad.

Cada dispositivo guarda su propia copia. Para pasar datos: **Ajustes → Respaldos →
Respaldo completo (ZIP)**, guárdalo en iCloud Drive y en el otro dispositivo
**Importar respaldo → Fusionar**.

## Desarrollo local

```bash
npm install
npm run dev        # http://localhost:3000
npm run check      # tipos + pruebas + compilación + e2e
```

Para e2e local: `npx playwright install webkit chromium` una vez.

## Estructura

```
src/
  app/            rutas: /, /recall, /recall/mazo, /recall/estudiar, /recall/estadisticas,
                  /focus, /lab, /lab/caso, /ajustes
  components/     ui/ (botones, campos, diálogos, gráficas) · layout/ (navegación, service worker)
  features/       vistas y lógica por módulo (dashboard, recall, focus, lab, settings)
  db/             esquema Dexie, tipos y repositorios (toda la lógica de datos)
  lib/            utilidades (CSV, HTML, fechas, preferencias, navegador)
scripts/          build-sw.mjs (service worker offline) · serve-out.mjs (servidor de pruebas)
tests/            unit/ (Vitest + IndexedDB en memoria) · e2e/ (Playwright)
```

## Reglas del proyecto

- Solo 4 módulos. Nada de backend, autenticación, IA ni bases externas.
- Toda fecha se guarda como epoch en milisegundos; el tiempo de estudio se calcula con marcas de tiempo.
- Cambios de esquema: agregar `this.version(N)` en `src/db/schema.ts`, nunca editar una existente.
