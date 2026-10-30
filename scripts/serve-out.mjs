// Servidor estático mínimo (sin dependencias) para probar la carpeta out/
// tal como la servirá GitHub Pages, incluido el basePath.
//   BASE_PATH=/MedOS PORT=4173 node scripts/serve-out.mjs
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const ROOT = resolve("out");
const PORT = Number(process.env.PORT ?? 4173);
const BASE = (process.env.BASE_PATH ?? process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

async function resolveFile(urlPath) {
  const safe = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, "");
  const candidates = [join(ROOT, safe), join(ROOT, safe, "index.html"), join(ROOT, `${safe}.html`)];
  for (const file of candidates) {
    if (!file.startsWith(ROOT)) continue;
    try {
      if ((await stat(file)).isFile()) return file;
    } catch {
      /* siguiente */
    }
  }
  return null;
}

createServer(async (req, res) => {
  let path = new URL(req.url ?? "/", "http://x").pathname;
  if (BASE) {
    if (path === BASE) {
      res.writeHead(301, { Location: `${BASE}/` }).end();
      return;
    }
    if (!path.startsWith(`${BASE}/`)) {
      res.writeHead(404).end("Not found");
      return;
    }
    path = path.slice(BASE.length);
  }
  const file = await resolveFile(path);
  if (!file) {
    const notFound = await resolveFile("/404.html");
    res.writeHead(404, { "Content-Type": TYPES[".html"] });
    res.end(notFound ? await readFile(notFound) : "Not found");
    return;
  }
  res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" });
  res.end(await readFile(file));
}).listen(PORT, () => {
  console.log(`MedOS sirviendo out/ en http://localhost:${PORT}${BASE}/`);
});
