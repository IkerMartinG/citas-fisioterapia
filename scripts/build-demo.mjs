// Genera docs/: una versión estática de la web y del panel que funciona sin servidor,
// con un backend simulado en el navegador. GitHub Pages la sirve desde la carpeta /docs.
//
// Uso: npm run build:demo
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "docs");

// Lo que cambia entre proyectos
const BUSINESS_CONFIG = "src/clinic.js";
const LIBS = ["src/lib/schedule.js", "src/lib/time.js", "src/lib/validate.js"];

rmSync(out, { recursive: true, force: true });
cpSync(join(root, "public"), out, { recursive: true });

mkdirSync(join(out, "js/lib"), { recursive: true });
for (const file of [BUSINESS_CONFIG, ...LIBS]) cpSync(join(root, file), join(out, "js/lib", file.split("/").pop()));
cpSync(join(root, "demo"), join(out, "js/demo"), { recursive: true });

writeFileSync(join(out, ".nojekyll"), ""); // que GitHub Pages sirva los archivos tal cual

// Marca cada página como demo e inserta la franja de aviso
const pages = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (name.endsWith(".html")) pages.push(path);
  }
})(out);

for (const page of pages) {
  const toRoot = relative(dirname(page), out).replaceAll("\\", "/") || ".";
  const isPanel = relative(out, page).startsWith("admin");
  let html = readFileSync(page, "utf8");
  html = html.replace(/<html lang="es">/, '<html lang="es" data-demo="true">');
  const banner =
    `<script type="module" data-demo-banner src="${toRoot}/js/demo/banner.js" ` +
    `data-where="${isPanel ? "panel" : "site"}" data-site="${toRoot}/" data-panel="${toRoot}/admin/"></script>`;
  html = html.replace("</head>", `  ${banner}\n</head>`);
  writeFileSync(page, html);
}

if (!existsSync(join(out, "index.html"))) throw new Error("Falta public/index.html");
console.log(`Demo generada en docs/ (${pages.length} páginas). Sube docs/ a GitHub y activa Pages en la carpeta /docs.`);
