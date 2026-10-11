// GET /api/config → public settings the browser needs (the Google Client ID is not a secret)
import { send } from './_session.js';

export default function handler(req, res) {
  send(res, 200, { googleClientId: process.env.GOOGLE_CLIENT_ID || null });
}
