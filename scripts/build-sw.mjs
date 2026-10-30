// Genera out/sw.js después de `next build`: precachea TODA la app estática
// (HTML, JS, CSS, fuentes, íconos, plantillas) para que funcione sin internet.
import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const OUT = "out";
const BASE = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");
const SKIP = new Set(["sw.js", "404.html", "404/index.html"]);

async function walk(dir) {
  const files = [];
  for (const entry of await readdir(dir)) {
    const full = join(dir, entry);
    const s = await stat(full);
    if (s.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files;
}

const files = (await walk(OUT))
  .map((f) => relative(OUT, f).split(sep).join("/"))
  .filter((f) => !SKIP.has(f) && !f.endsWith(".map"))
  .sort();

const hash = createHash("sha256");
const urls = [];
for (const f of files) {
  hash.update(f);
  hash.update(await readFile(join(OUT, f)));
  // recall/mazo/index.html → /recall/mazo/  (así la pide el navegador)
  const url = f === "index.html" ? "/" : f.endsWith("/index.html") ? `/${f.slice(0, -"index.html".length)}` : `/${f}`;
  urls.push(`${BASE}${url.split("/").map(encodeURIComponent).join("/")}`);
}
const version = hash.digest("hex").slice(0, 12);

const sw = `/* MedOS service worker · generado por scripts/build-sw.mjs · v${version} */
const CACHE = "medos-${version}";
const BASE = ${JSON.stringify(BASE)};
const PRECACHE = ${JSON.stringify(urls)};

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("medos-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE + "/")) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      // Primero la copia local (instantáneo y offline); los parámetros ?id= no cambian el archivo
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      try {
        return await fetch(req);
      } catch (err) {
        if (req.mode === "navigate") {
          const shell = await cache.match(BASE + "/");
          if (shell) return shell;
        }
        throw err;
      }
    })(),
  );
});
`;

await writeFile(join(OUT, "sw.js"), sw);
console.log(`sw.js: ${urls.length} archivos precacheados (versión ${version})`);
