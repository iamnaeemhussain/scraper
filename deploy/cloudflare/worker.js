/**
 * Cloudflare Worker — authenticated proxy in front of the Python extraction engine.
 *
 * What it does
 *   • serves the static React app from Pages (ASSETS binding),
 *   • forwards /api/* to the FastAPI host, preserving cookies,
 *   • sets real client IP headers so the API can rate-limit and audit correctly,
 *   • optionally pins the origin with a shared header (ORIGIN_SHARED_SECRET).
 *
 * What it must NEVER do
 *   • run Scrapling / Patchright / any Python (Workers cannot do this),
 *   • store the database or job queue,
 *   • embed API keys or adapter credentials in anything sent to the browser.
 *
 * Deploy
 *   wrangler.toml:
 *     name = "leadbridge-edge"
 *     main = "worker.js"
 *     compatibility_date = "2024-11-01"
 *     [vars]
 *     API_ORIGIN = "https://leadbridge-api.fly.dev"
 *     [[routes]]
 *     pattern = "leads.example.com/api/*"
 *     zone_name = "example.com"
 *
 *   wrangler secret put ORIGIN_SHARED_SECRET   (optional, must match the API's config)
 *   wrangler deploy
 */

const HOP_BY_HOP = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailer", "transfer-encoding", "upgrade", "host",
]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith("/api/")) {
      // Static SPA. Fall back to index.html so client-side routes work.
      if (env.ASSETS) {
        const asset = await env.ASSETS.fetch(request);
        if (asset.status !== 404) return asset;
        return env.ASSETS.fetch(new Request(new URL("/", url), request));
      }
      return new Response("Not found", { status: 404 });
    }

    if (!env.API_ORIGIN) {
      return json({ detail: "The edge proxy is not configured (API_ORIGIN missing)." }, 500);
    }

    const target = new URL(url.pathname + url.search, env.API_ORIGIN);
    const headers = new Headers(request.headers);
    for (const name of HOP_BY_HOP) headers.delete(name);

    // The browser cannot spoof these: Cloudflare always overwrites CF-Connecting-IP.
    const clientIp = request.headers.get("CF-Connecting-IP") || "";
    if (clientIp) {
      headers.set("X-Forwarded-For", clientIp);
      headers.set("X-Real-IP", clientIp);
    }
    headers.set("X-Forwarded-Proto", "https");
    headers.set("X-Forwarded-Host", url.host);

    // Optional shared secret: proves the request came through this edge, without
    // shipping anything to the browser.
    if (env.ORIGIN_SHARED_SECRET) {
      headers.set("X-Edge-Secret", env.ORIGIN_SHARED_SECRET);
    }

    const init = {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      redirect: "manual",
      // FastAPI streams exports; keep the body as a stream rather than buffering.
      cf: { cacheTtl: 0 },
    };

    let response;
    try {
      response = await fetch(new Request(target, init));
    } catch (error) {
      return json({ detail: `Extraction engine unreachable: ${String(error.message || error)}` }, 502);
    }

    const outHeaders = new Headers(response.headers);
    for (const name of HOP_BY_HOP) outHeaders.delete(name);
    outHeaders.set("X-Proxy", "leadbridge-edge");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: outHeaders,
    });
  },
};

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
