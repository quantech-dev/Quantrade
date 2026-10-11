// POST /api/wallet  (Authorization: Bearer <session from /api/login>)  →  { "address": "bc1…" | null }
//
// The family list lives in the FAMILY_WALLETS environment variable (set in the
// Vercel dashboard), never in the public site files. It's a JSON object:
//   {"name@gmail.com": "bc1q…", "other@gmail.com": "1…"}
// The email comes from the signed session (verified by Google), not from the
// request body, so nobody can look up someone else's wallet by typing their email.
import { parseBtcAddr } from './_btc.js';
import { readSession, send } from './_session.js';

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

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(res, 405, { error: 'Use POST' }); }
  let s;
  try { s = readSession(req); } catch (e) { console.error(e.message); return send(res, 503, { error: 'Sign-in is not configured on the server' }); }
  if (!s) return send(res, 401, { error: 'Please sign in again' });
  send(res, 200, { address: loadWallets().get(s.email) || null });
}
