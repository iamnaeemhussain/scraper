/**
 * Login check — proves the sign-in flow works in both cookie modes.
 *
 *   1. normal browser: the httpOnly session cookie is stored and replayed;
 *   2. embedded/blocked-cookies context: the cookie is dropped by the browser, so
 *      the app must fall back to the bearer token returned by /api/auth/login.
 *
 * Run with the API and (optionally) the dev server up:
 *   node scripts/login-check.mjs [appUrl] [apiUrl]
 */
import { JSDOM, VirtualConsole } from "jsdom";
import * as esbuild from "esbuild";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const APP = process.argv[2] || "http://localhost:5173";
const API = process.argv[3] || "http://localhost:8000";
const EMAIL = process.env.EMAIL || "admin@leadbridge.demo";
const PASSWORD = process.env.PASSWORD || "LeadBridge#2024";

const outdir = mkdtempSync(join(tmpdir(), "leadbridge-login-"));
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
const bundle = readFileSync(join(outdir, "bundle.js"), "utf8");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runScenario({ keepCookies }) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (error) => errors.push(`jsdomError: ${error.message}`));
  virtualConsole.on("error", (...args) => errors.push(`console.error: ${args.join(" ").slice(0, 400)}`));

  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: `${APP}/login`,
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole,
  });
  const { window } = dom;
  const jar = new Map();
  const seen = { login: 0, bootstrap401: 0, authorized: 0 };

  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url, APP);
    const headers = new Headers(init.headers || {});
    if (keepCookies && jar.size) {
      headers.set("cookie", [...jar].map(([key, value]) => `${key}=${value}`).join("; "));
    }
    const response = await fetch(url.href, { ...init, headers, redirect: "manual" });

    if (url.pathname === "/api/auth/login") seen.login += 1;
    if (url.pathname === "/api/meta/bootstrap" && response.status === 401) seen.bootstrap401 += 1;
    if (response.status === 200 && url.pathname.startsWith("/api/")) seen.authorized += 1;

    if (keepCookies) {
      for (const cookie of response.headers.getSetCookie?.() || []) {
        const [pair] = cookie.split(";");
        const [name, ...rest] = pair.split("=");
        jar.set(name.trim(), rest.join("="));
      }
    }
    return response;
  };
  window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};

  window.eval(bundle);
  await wait(2200);

  const setValue = (input, value) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, value);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  };

  const inputs = [...window.document.querySelectorAll("input")];
  const emailInput = inputs.find((input) => input.type === "email");
  const passwordInput = inputs.find((input) => input.type === "password");
  if (!emailInput || !passwordInput) throw new Error("login form inputs not found");

  setValue(emailInput, EMAIL);
  setValue(passwordInput, PASSWORD);
  await wait(120);
  window.document.querySelector("form").dispatchEvent(
    new window.Event("submit", { bubbles: true, cancelable: true }),
  );
  await wait(3000);

  const text = window.document.body.textContent.replace(/\s+/g, " ").trim();
  const signedIn = /Good (morning|afternoon|evening)/.test(text) || text.includes("Lead database");
  const errorText = window.document.querySelector(".alert.danger")?.textContent?.trim() || "";
  const tokenStored = (() => {
    try {
      return Boolean(window.sessionStorage.getItem("leadbridge.session"));
    } catch {
      return false;
    }
  })();

  window.close();
  return { keepCookies, signedIn, tokenStored, errorText, seen, errors: [...new Set(errors)].slice(0, 5), sample: text.slice(0, 90) };
}

const scenarios = [];
for (const keepCookies of [true, false]) {
  try {
    scenarios.push(await runScenario({ keepCookies }));
  } catch (error) {
    scenarios.push({ keepCookies, signedIn: false, error: error.message });
  }
}

console.log("\n=== LOGIN ===");
let failed = false;
for (const result of scenarios) {
  const mode = result.keepCookies ? "cookies allowed" : "cookies blocked";
  const verdict = result.signedIn ? "✓ signed in" : "✗ stayed on login";
  console.log(`${mode.padEnd(16)} ${verdict}  token=${result.tokenStored ? "yes" : "no"}  ` +
    `login=${result.seen?.login ?? 0} bootstrap401=${result.seen?.bootstrap401 ?? 0}`);
  if (result.errorText) console.log(`   error shown: ${result.errorText}`);
  if (result.error) console.log(`   ${result.error}`);
  if (result.errors?.length) result.errors.forEach((line) => console.log(`   • ${line}`));
  if (!result.signedIn) failed = true;
}

// The cookie-blocked run must rely on the bearer fallback, never on a cookie.
const blocked = scenarios.find((item) => item.keepCookies === false);
if (blocked && blocked.signedIn && !blocked.tokenStored) {
  console.log("\n✗ signed in without a stored token — the cookie fallback was not exercised as expected");
  failed = true;
}

console.log(failed ? "\nLOGIN CHECK FAILED" : "\nLogin works in both modes.");
process.exit(failed ? 1 : 0);
