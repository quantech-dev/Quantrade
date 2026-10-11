// Local preview server: node serve.mjs  →  http://localhost:5173
// Serves the static site and the /api/wallet function the same way Vercel does.
// The family list is read from family-wallets.json (git-ignored) into FAMILY_WALLETS.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import walletHandler from './api/wallet.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT) || 5173;
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

const listFile = join(root, 'family-wallets.json');
if (!process.env.FAMILY_WALLETS && existsSync(listFile)) process.env.FAMILY_WALLETS = readFileSync(listFile, 'utf8');
if (!process.env.FAMILY_WALLETS) console.warn('No family-wallets.json found — nobody will have a wallet linked.');

// files that must never be served as static content
const hidden = /^\/(api|node_modules|\.git)(\/|$)|^\/(family-wallets[^/]*\.json|serve\.mjs|package(-lock)?\.json|\.[^/]*)$/;

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path === '/api/wallet') { try { await walletHandler(req, res); } catch (e) { console.error(e); res.writeHead(500).end(); } return; }
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
