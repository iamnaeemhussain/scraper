/**
 * Headless smoke test: bundles the SPA with esbuild, renders it in jsdom against the
 * running API and reports console errors plus visible text for every route.
 * Catches runtime crashes without needing a real browser.
 *
 *   node scripts/smoke.mjs [appUrl] [apiUrl]
 */
import { JSDOM, VirtualConsole } from "jsdom";
import * as esbuild from "esbuild";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const APP = process.argv[2] || "http://localhost:5173";
const API = process.argv[3] || "http://localhost:8000";
const ROUTES = process.env.ROUTES ? process.env.ROUTES.split(",") : ["/", "/leads", "/sources", "/jobs", "/agents", "/imports", "/reports", "/settings"];
const DUMP = process.env.DUMP === "1";

const outdir = mkdtempSync(join(tmpdir(), "leadbridge-smoke-"));
await esbuild.build({
  entryPoints: ["src/main.jsx"],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  outfile: join(outdir, "bundle.js"),
  loader: { ".js": "jsx", ".jsx": "jsx" },
  define: {
    "process.env.NODE_ENV": '"development"',
    "import.meta.env.VITE_API_BASE_URL": '""',
  },
  logLevel: "error",
});
const bundle = readFileSync(join(outdir, "bundle.js"), "utf8");

const login = await fetch(`${API}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: process.env.EMAIL || "admin@leadbridge.demo",
    password: process.env.PASSWORD || "LeadBridge#2024",
  }),
});
if (!login.ok) {
  console.error("Login failed", login.status, await login.text());
  process.exit(1);
}
const cookie = (login.headers.getSetCookie?.() || [login.headers.get("set-cookie")])
  .map((value) => value.split(";")[0])
  .join("; ");

const errors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on("jsdomError", (error) => {
  if (!String(error.message).includes("fonts.googleapis.com")) errors.push(`jsdomError: ${error.message}`);
});
virtualConsole.on("error", (...args) => errors.push(`console.error: ${args.join(" ").slice(0, 800)}`));

const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
  url: `${APP}/`,
  runScripts: "outside-only",
  pretendToBeVisual: true,
  virtualConsole,
});

const { window } = dom;
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

window.eval(bundle);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
await wait(3500);

const results = [];
for (const route of ROUTES) {
  window.history.pushState({}, "", route);
  window.dispatchEvent(new window.PopStateEvent("popstate"));
  await wait(1700);
  const main = window.document.querySelector("main") || window.document.body;
  const text = main.textContent.replace(/\s+/g, " ").trim();
  const flags = ["undefined", "NaN", "[object Object]", "Loading…"].filter((needle) => text.includes(needle));
  const headings = [...main.querySelectorAll("h1, h2")].map((node) => node.textContent.trim()).join(" | ");
  results.push({ route, length: text.length, headings, flags, sample: text.slice(0, 160), tail: text.slice(-200) });
}

console.log("\n=== ROUTE RENDER ===");
for (const result of results) {
  if (DUMP) console.log("\n---", result.route, "---\n", result.sample, "\n…", main_text_tail(result));
  console.log(`${result.route.padEnd(11)} chars=${String(result.length).padEnd(6)} h=[${result.headings}]${result.flags.length ? ` ⚠ ${result.flags.join(", ")}` : ""}`);
}

if (errors.length) {
  console.log("\n=== ERRORS ===");
  [...new Set(errors)].slice(0, 20).forEach((error) => console.log("•", error));
  process.exitCode = 1;
} else {
  console.log("\nNo runtime errors captured.");
}

window.close();

function main_text_tail(result) {
  return result.tail;
}
