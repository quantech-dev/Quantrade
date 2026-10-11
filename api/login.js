// POST /api/login  { "credential": "<Google ID token>" }  →  { session, exp, user }
//
// Google's sign-in button gives the browser an ID token. We ask Google to check it,
// make sure it was issued for this app (GOOGLE_CLIENT_ID) and that the Gmail address
// is verified, then issue our own 30-day session so the person stays signed in.
import { createSession, send, readJson } from './_session.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(res, 405, { error: 'Use POST' }); }
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return send(res, 503, { error: 'Google sign-in is not configured' });

  const { credential } = await readJson(req);
  if (typeof credential !== 'string' || credential.length < 20 || credential.length > 8000) return send(res, 400, { error: 'Missing Google credential' });

  let info;
  try {
    const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential));
    if (!r.ok) return send(res, 401, { error: 'Google could not verify this sign-in' });
    info = await r.json();
  } catch (e) {
    console.error('tokeninfo request failed', e);
    return send(res, 502, { error: 'Could not reach Google' });
  }

  const issuerOk = info.iss === 'accounts.google.com' || info.iss === 'https://accounts.google.com';
  if (info.aud !== clientId || !issuerOk || Number(info.exp) * 1000 < Date.now()) return send(res, 401, { error: 'This sign-in was not issued for Quantrade' });
  if (String(info.email_verified) !== 'true' || !info.email) return send(res, 401, { error: 'Your Google email address is not verified' });

  const user = { email: String(info.email).toLowerCase(), name: info.name || info.given_name || info.email.split('@')[0], picture: info.picture || '' };
  try {
    const { token, exp } = createSession(user);
    send(res, 200, { session: token, exp, user });
  } catch (e) {
    console.error(e.message);
    send(res, 503, { error: 'Sign-in is not configured on the server' });
  }
}
