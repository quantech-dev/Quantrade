// Local preview server: node serve.mjs  →  http://localhost:5173
// Serves the static site and the /api functions the same way Vercel does.
// Private settings come from git-ignored files:
//   .env.local           GOOGLE_CLIENT_ID=…  and  SESSION_SECRET=…
//   family-wallets.json  the email → Bitcoin address list (becomes FAMILY_WALLETS)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT) || 5173;
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

const envFile = join(root, '.env.local');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const listFile = join(root, 'family-wallets.json');
if (!process.env.FAMILY_WALLETS && existsSync(listFile)) process.env.FAMILY_WALLETS = readFileSync(listFile, 'utf8');
if (!process.env.FAMILY_WALLETS) console.warn('No family-wallets.json found — nobody will have a wallet linked.');
if (!process.env.GOOGLE_CLIENT_ID) console.warn('GOOGLE_CLIENT_ID is not set in .env.local — the Google sign-in button will be unavailable.');

// /api/<name> → api/<name>.js (helpers starting with "_" are never routes, same as Vercel)
const api = new Map();
for (const name of ['config', 'login', 'wallet']) api.set('/api/' + name, (await import(pathToFileURL(join(root, 'api', name + '.js')))).default);

// files that must never be served as static content
const hidden = /^\/(api|node_modules|\.git)(\/|$)|^\/(family-wallets[^/]*\.json|serve\.mjs|package(-lock)?\.json|\.[^/]*)$/;

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const fn = api.get(path);
  if (fn) { try { await fn(req, res); } catch (e) { console.error(e); if (!res.headersSent) res.writeHead(500).end(); } return; }
  if (hidden.test(path)) { res.writeHead(404).end('Not found'); return; }
  const file = normalize(join(root, path === '/' ? 'index.html' : path));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }).end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(port, () => console.log(`Quantrade running at http://localhost:${port}`));
