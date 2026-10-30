/**
 * Interaction smoke test in jsdom: opens the main modals/drawers and reports any
 * runtime error. Complements scripts/smoke.mjs (which only checks route rendering).
 *
 *   node scripts/interact.mjs [appUrl] [apiUrl]
 */
import { JSDOM, VirtualConsole } from "jsdom";
import * as esbuild from "esbuild";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const APP = process.argv[2] || "http://localhost:5173";
const API = process.argv[3] || "http://localhost:8000";

const outdir = mkdtempSync(join(tmpdir(), "leadbridge-interact-"));
await esbuild.build({
  entryPoints: ["src/main.jsx"],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  outfile: join(outdir, "bundle.js"),
  loader: { ".js": "jsx", ".jsx": "jsx" },
  define: { "process.env.NODE_ENV": '"development"', "import.meta.env.VITE_API_BASE_URL": '""' },
  logLevel: "error",
});

const login = await fetch(`${API}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@leadbridge.demo", password: "LeadBridge#2024" }),
});
const cookie = (login.headers.getSetCookie?.() || [login.headers.get("set-cookie")])
  .map((value) => value.split(";")[0])
  .join("; ");

const errors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on("jsdomError", (error) => errors.push(`jsdomError: ${error.message}`));
virtualConsole.on("error", (...args) => errors.push(`console.error: ${args.join(" ").slice(0, 800)}`));

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: `${APP}/`,
  runScripts: "outside-only",
  pretendToBeVisual: true,
  virtualConsole,
});
const { window } = dom;
const { document } = window;

window.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url, APP);
  const headers = new Headers(init.headers || {});
  headers.set("cookie", cookie);
  return fetch(url.href, { ...init, headers, redirect: "manual" });
};
window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
window.scrollTo = () => {};
window.HTMLElement.prototype.scrollIntoView = () => {};
window.addEventListener("error", (event) => errors.push(`window.error: ${event.message}`));
window.addEventListener("unhandledrejection", (event) => errors.push(`unhandledrejection: ${event.reason}`));

window.eval(readFileSync(join(outdir, "bundle.js"), "utf8"));

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const click = (node) => {
  if (!node) throw new Error("element not found");
  node.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
};
const byText = (selector, text, root = document) =>
  [...root.querySelectorAll(selector)].find((node) => node.textContent.trim().toLowerCase().includes(text.toLowerCase()));
const modalText = () => {
  const modal = document.querySelector(".modal, .drawer, [role='dialog']");
  return modal ? modal.textContent.replace(/\s+/g, " ").slice(0, 120) : "(no modal)";
};
const go = async (route, ms = 1800) => {
  window.history.pushState({}, "", route);
  window.dispatchEvent(new window.PopStateEvent("popstate"));
  await wait(ms);
};

const steps = [];
const step = async (name, fn) => {
  try {
    await fn();
    steps.push(`✓ ${name} — ${modalText()}`);
  } catch (error) {
    steps.push(`✗ ${name} — ${error.message}`);
    errors.push(`${name}: ${error.message}`);
  }
};

await wait(3000);

await step("open lead drawer", async () => {
  await go("/leads", 2200);
  const row = document.querySelector("table.data tbody tr");
  click(row);
  await wait(1400);
});

await step("close lead drawer via Escape", async () => {
  document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await wait(600);
});

await step("source test-connection modal", async () => {
  await go("/sources", 2200);
  click(byText("button", "Test"));
  await wait(1600);
});

await step("close source modal", async () => {
  click(byText(".modal button", "Close") || byText(".modal button", "Done") || document.querySelector(".modal-close, .modal .icon-btn"));
  await wait(500);
});

await step("source edit sheet", async () => {
  click(byText("button", "Edit"));
  await wait(1400);
});

await step("close editor", async () => {
  click(byText(".modal button", "Cancel") || byText(".modal button", "Close"));
  await wait(500);
});

await step("start collection modal", async () => {
  await go("/jobs", 2200);
  click(byText("button", "New collection"));
  await wait(1400);
});

await step("job detail modal", async () => {
  click(byText(".modal button", "Cancel") || byText(".modal button", "Close"));
  await wait(600);
  const row = document.querySelector("table.data tbody tr");
  click(row);
  await wait(1400);
});

await step("agent detail modal", async () => {
  await go("/agents", 2200);
  click(byText(".agent-card button", "View"));
  await wait(1400);
});

await step("imports export tab", async () => {
  await go("/imports", 2200);
  click(byText(".tabs button, .segmented button, button", "Export"));
  await wait(1200);
});

await step("imports history tab", async () => {
  click(byText(".tabs button, .segmented button, button", "History"));
  await wait(1200);
});

await step("settings sections", async () => {
  await go("/settings", 1800);
  for (const label of ["My account", "Suppression list", "API keys", "Audit log", "Data & backups", "Compliance policy", "Organisation"]) {
    const button = byText(".settings-nav button", label);
    if (!button) throw new Error(`missing section: ${label}`);
    click(button);
    await wait(950);
  }
});

console.log("\n=== INTERACTIONS ===");
steps.forEach((line) => console.log(line));

if (errors.length) {
  console.log("\n=== ERRORS ===");
  [...new Set(errors)].slice(0, 20).forEach((error) => console.log("•", error));
  process.exitCode = 1;
} else {
  console.log("\nNo runtime errors captured.");
}

window.close();
