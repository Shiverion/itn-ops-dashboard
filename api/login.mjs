// POST /api/login {username, password} -> {ok, token, expires}
// The demo login lives in Vercel's environment (DEMO_USERNAME / DEMO_PASSWORD),
// never in this repository.
import { issueToken, json, readBody, sameSecret } from './_session.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, message: 'Use POST.' });
  try {
    const { username, password } = await readBody(req, 4096);
    const ok = sameSecret(username, process.env.DEMO_USERNAME) && sameSecret(password, process.env.DEMO_PASSWORD) && !!process.env.DEMO_PASSWORD;
    if (!ok) {
      await new Promise((r) => setTimeout(r, 600)); // slows down guessing
      return json(res, 401, { ok: false, message: 'Wrong username or password.' });
    }
    return json(res, 200, { ok: true, ...issueToken(String(username)) });
  } catch (e) {
    return json(res, e.status || 500, { ok: false, message: e.status ? e.message : 'The demo server hit an error.' });
  }
}
