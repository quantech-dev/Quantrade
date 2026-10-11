// Signed session tokens: base64url(payload).base64url(HMAC-SHA256(payload, SESSION_SECRET)).
// Issued by /api/login after Google confirms who the person is; checked by /api/wallet.
import { createHmac, timingSafeEqual } from 'node:crypto';

const DAYS = 30;
const b64 = s => Buffer.from(s).toString('base64url');

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET is missing or shorter than 32 characters');
  return s;
}
const sign = data => createHmac('sha256', secret()).update(data).digest('base64url');

export function createSession({ email, name, picture }) {
  const payload = b64(JSON.stringify({ email, name, picture, exp: Date.now() + DAYS * 864e5 }));
  return { token: `${payload}.${sign(payload)}`, exp: Date.now() + DAYS * 864e5 };
}

// Returns the session payload, or null if the token is missing, tampered with or expired
export function readSession(req) {
  const h = req.headers?.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const want = Buffer.from(sign(payload)), got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return s.exp > Date.now() && s.email ? s : null;
  } catch { return null; }
}

// Shared JSON helpers (work with both Vercel and the local serve.mjs)
export function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
export async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body; // Vercel parses JSON bodies
  let s = ''; for await (const chunk of req) { s += chunk; if (s.length > 20000) break; }
  try { return JSON.parse(s || '{}'); } catch { return {}; }
}
