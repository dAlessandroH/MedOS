# Formato de casos de ClinicalLab

ClinicalLab importa **solo** archivos `.json` con este formato. Puedes descargar una
plantilla con un caso completo desde la app (ClinicalLab → Importar casos → Plantilla)
o verla en `public/plantillas/casos-ejemplo.json`.

```json
{
  "formato": "medos-casos",
  "version": 1,
  "casos": [ { ...caso... }, { ...caso... } ]
}
```

También se acepta una lista `[ {...}, {...} ]` o un solo caso `{...}`.

## Campos de cada caso

| Campo | Obligatorio | Descripción |
|---|---|---|
| `titulo` | sí | Título corto (máx. 120). |
| `especialidad` | sí | Ej. "Endocrinología". Se usa para filtrar. |
| `dificultad` | sí | `1` básico · `2` intermedio · `3` avanzado. |
| `materia` | no | Nombre exacto de una materia de MedOS para asociarlo. |
| `paciente.edad` | sí | Número entero. |
| `paciente.sexo` | sí | `"F"` o `"M"`. |
| `motivoConsulta` | sí | |
| `padecimientoActual` | sí | |
| `antecedentes` | no | `personales`, `familiares`, `medicamentos`, `alergias`, `otros` (texto). |
| `exploracionFisica` | sí | |
| `signosVitales` | sí | `ta` ("120/80"), `fc`, `fr`, `temp`, `spo2`, `peso`, `talla` (números, todos opcionales). |
| `laboratorios` | no | Lista de `{ estudio, valor, unidad, referencia, bandera }`; `bandera`: `"H"` alto, `"L"` bajo, `"N"` normal. |
| `pasos` | sí (≥ 1) | Preguntas progresivas (ver abajo). |
| `referencias` | sí (≥ 1) | `{ cita, url? }`. Deben ser verificables. |
| `etiquetas` | no | Lista de textos. |

## Pasos (preguntas progresivas)

```json
{
  "tipo": "opcion_multiple",
  "revelar": "Información nueva que aparece antes de esta pregunta (opcional).",
  "pregunta": "…",
  "opciones": { "a": "…", "b": "…", "c": "…", "d": "…" },
  "correcta": "c",
  "explicacion": "Por qué es correcta y por qué las otras no.",
  "concepto": "Concepto evaluado (si fallas, se agrega a conceptos débiles)"
}
```

`tipo`: `opcion_multiple`, `diagnostico_diferencial`, `laboratorios` o `fisiopatologia`.

## Reglas de calidad

- Casos **ficticios** y clínicamente coherentes (signos, laboratorios y evolución sin contradicciones).
- Referencias reales y verificables (guía, consenso o libro con edición). Nunca inventadas.
- Opciones de largo y estructura parecidos: la correcta no debe delatarse por ser la más larga.
- La validación rechaza casos sin referencias, sin pasos o con campos obligatorios vacíos y te dice qué falta.
