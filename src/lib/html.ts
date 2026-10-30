/** Utilidades de HTML para tarjetas: escapar texto plano y sanear HTML enriquecido. */

const ALLOWED_TAGS = new Set([
  "P", "BR", "STRONG", "B", "EM", "I", "U", "S", "MARK", "UL", "OL", "LI",
  "H3", "H4", "CODE", "BLOCKQUOTE", "SUB", "SUP", "HR",
]);

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Texto plano (p. ej. de un CSV) → HTML seguro, respetando saltos de línea. */
export function textToHtml(text: string): string {
  const paragraphs = text.replace(/\r\n?/g, "\n").trim().split(/\n{2,}/);
  return paragraphs
    .filter((p) => p.trim() !== "")
    .map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** HTML → texto plano (para búsqueda, títulos y comparaciones). */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|h3|h4|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Sanea HTML con lista blanca de etiquetas y SIN atributos.
 * En el navegador usa DOMParser; fuera de él (pruebas) escapa todo.
 */
export function sanitizeHtml(html: string): string {
  if (typeof DOMParser === "undefined") return textToHtml(htmlToText(html));
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");

  const clean = (node: Node): string => {
    if (node.nodeType === 3) return escapeHtml(node.textContent ?? "");
    if (node.nodeType !== 1) return "";
    const el = node as Element;
    const inner = Array.from(el.childNodes).map(clean).join("");
    const tag = el.tagName.toUpperCase();
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "IFRAME") return "";
    if (!ALLOWED_TAGS.has(tag)) return inner;
    const t = tag.toLowerCase();
    if (t === "br" || t === "hr") return `<${t}>`;
    return `<${t}>${inner}</${t}>`;
  };

  return Array.from(doc.body.childNodes).map(clean).join("");
}

export function isBlankHtml(html: string): boolean {
  return htmlToText(html).trim() === "";
}
