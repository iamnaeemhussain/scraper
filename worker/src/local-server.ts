import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import { createNodeSqliteExecutor } from './node-sqlite-driver';
import { PakTelApiEngine } from './router';

function loadOptionalDotEnv(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

loadOptionalDotEnv(path.resolve(process.cwd(), '.env'));
loadOptionalDotEnv(path.resolve(process.cwd(), '.dev.vars'));

const dataDir = path.resolve(process.cwd(), '.data');
fs.mkdirSync(dataDir, { recursive: true });
const sqlitePath = process.env.SQLITE_PATH || path.join(dataDir, 'paktel.sqlite');
const { executor } = createNodeSqliteExecutor(sqlitePath);
const engine = new PakTelApiEngine(executor);
engine.ensureSchema();

const webDistDir = path.resolve(process.cwd(), 'web', 'dist');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';

const server = http.createServer(async (req, res) => {
  try {
    const proto = (req.headers['x-forwarded-proto'] as string) || 'http';
    const reqHost = (req.headers['x-forwarded-host'] as string) || req.headers.host || `localhost:${port}`;
    const fullUrl = `${proto}://${reqHost}${req.url || '/'}`;
    const parsedUrl = new URL(fullUrl);

    if (parsedUrl.pathname.startsWith('/api/')) {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const rawBody = Buffer.concat(chunks);
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (Array.isArray(v)) headers.set(k, v.join(', '));
        else if (typeof v === 'string') headers.set(k, v);
      }

      const webReq = new Request(fullUrl, {
        method: req.method || 'GET',
        headers,
        body:
          req.method && !['GET', 'HEAD'].includes(req.method.toUpperCase())
            ? rawBody
            : undefined,
      });

      const webRes = await engine.handle(webReq, process.env as any);
      res.statusCode = webRes.status;
      webRes.headers.forEach((val, key) => res.setHeader(key, val));
      const ab = await webRes.arrayBuffer();
      res.end(Buffer.from(ab));
      return;
    }

    // Serve static files from web/dist with SPA fallback
    const safeRel = path
      .normalize(decodeURIComponent(parsedUrl.pathname))
      .replace(/^(\.\.(\/|\\|$))+/, '')
      .replace(/^\/+/, '');
    let candidate = path.join(webDistDir, safeRel);

    if (safeRel && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      const ext = path.extname(candidate).toLowerCase();
      res.statusCode = 200;
      res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
      res.end(fs.readFileSync(candidate));
      return;
    }

    const indexHtml = path.join(webDistDir, 'index.html');
    if (fs.existsSync(indexHtml)) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(fs.readFileSync(indexHtml));
      return;
    }

    res.statusCode = 404;
    res.end('Frontend build not found — run npm run build first.');
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ message: err?.message || 'Internal error' }));
  }
});

server.listen(port, host, () => {
  console.log(`Pak-Tel full-stack preview listening on http://${host}:${port}`);
});
