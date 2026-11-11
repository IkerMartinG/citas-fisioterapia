// Franja superior de la demo: avisa de que los datos son de ejemplo y enlaza web ↔ panel.
// La configuración llega por data-* en la etiqueta <script> que inyecta `npm run build:demo`.
import { DEMO_PASSWORD, resetDemo } from "./server.js";

const script = document.currentScript ?? document.querySelector("script[data-demo-banner]");
const { site, panel, where } = script?.dataset ?? {};

const style = document.createElement("style");
style.textContent = `
  .demo-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 6px 18px;
    padding: 10px 16px; background: #15202B; color: #E6ECF2; font: 500 14px/1.4 system-ui, sans-serif; text-align: center; }
  .demo-bar a, .demo-bar button { color: #fff; font: inherit; font-weight: 700; text-decoration: underline; text-underline-offset: 3px;
    background: none; border: 0; padding: 6px 2px; cursor: pointer; }
  .demo-bar a:hover, .demo-bar button:hover { color: #C9D4FF; }
  .demo-bar code { background: rgba(255,255,255,.14); padding: 1px 6px; border-radius: 5px; font: 600 13px ui-monospace, monospace; }
`;

const bar = document.createElement("div");
bar.className = "demo-bar";
bar.setAttribute("role", "note");

const text = document.createElement("span");
text.textContent = "Demo con datos de ejemplo: nada de lo que hagas aquí es real.";
bar.append(text);

if (where === "site" && panel) {
  const a = document.createElement("a");
  a.href = panel;
  a.textContent = "Ver el panel del negocio";
  const pw = document.createElement("span");
  pw.append("Contraseña: ", Object.assign(document.createElement("code"), { textContent: DEMO_PASSWORD }));
  bar.append(a, pw);
}
if (where === "panel" && site) {
  const a = document.createElement("a");
  a.href = site;
  a.textContent = "Ver la web para clientes";
  bar.append(a);
}

const reset = document.createElement("button");
reset.type = "button";
reset.textContent = "Restablecer datos";
reset.addEventListener("click", () => {
  resetDemo();
  location.reload();
});
bar.append(reset);

document.head.append(style);
document.body.prepend(bar);
