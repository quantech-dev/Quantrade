// POST /api/wallet  { "email": "name@gmail.com" }  →  { "address": "bc1…" | null }
//
// The family list lives in the FAMILY_WALLETS environment variable (set in the
// Vercel dashboard), never in the public site files. It's a JSON object:
//   {"name@gmail.com": "bc1q…", "other@gmail.com": "1…"}
// Each caller only gets the address for the email they sign in with.
import { parseBtcAddr } from './_btc.js';

function loadWallets() {
  let raw = {};
  try { raw = JSON.parse(process.env.FAMILY_WALLETS || '{}'); } catch { console.error('FAMILY_WALLETS is not valid JSON'); }
  const map = new Map();
  for (const [email, addr] of Object.entries(raw)) {
    const a = parseBtcAddr(addr);
    if (a) map.set(email.trim().toLowerCase(), a);
    else console.error(`FAMILY_WALLETS: invalid Bitcoin address for ${email} — ignored`);
  }
  return map;
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body; // Vercel parses JSON bodies
  let s = ''; for await (const chunk of req) { s += chunk; if (s.length > 10000) break; }
  try { return JSON.parse(s || '{}'); } catch { return {}; }
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.statusCode = 405; res.setHeader('Allow', 'POST'); res.end(JSON.stringify({ error: 'Use POST' })); return; }
  const { email } = await readJson(req);
  const address = loadWallets().get(String(email || '').trim().toLowerCase()) || null;
  res.statusCode = 200;
  res.end(JSON.stringify({ address }));
}
