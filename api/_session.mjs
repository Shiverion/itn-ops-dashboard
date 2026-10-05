// Demo sessions for the Vercel deployment: a signed, expiring token issued by
// api/login and required by api/ask. (Files starting with "_" are not routes.)
import { createHmac, timingSafeEqual } from 'node:crypto';

const SECRET = () => {
  const s = process.env.DEMO_SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('DEMO_SESSION_SECRET must be set (32+ characters).');
  return s;
};
const sign = (payload) => createHmac('sha256', SECRET()).update(payload).digest('base64url');

export const SESSION_HOURS = 12;

export function issueToken(username) {
  const expires = Date.now() + SESSION_HOURS * 3600_000;
  const payload = Buffer.from(JSON.stringify({ u: username, exp: expires })).toString('base64url');
  return { token: `${payload}.${sign(payload)}`, expires };
}

/** The username in a valid, unexpired token, or null. */
export function verifyToken(header) {
  const token = String(header || '').replace(/^Bearer /, '');
  const [payload, mac] = token.split('.');
  if (!payload || !mac) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { u, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return exp > Date.now() ? String(u) : null;
  } catch {
    return null;
  }
}

/** Constant-time string comparison (both sides hashed to the same length first). */
export function sameSecret(a, b) {
  const h = (s) => createHmac('sha256', 'compare').update(String(s ?? '')).digest();
  return timingSafeEqual(h(a), h(b));
}

export async function readBody(req, limit = 256 * 1024) {
  if (req.body && typeof req.body === 'object') return req.body; // already parsed by the platform
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('Request too large.'), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw Object.assign(new Error('Invalid JSON.'), { status: 400 });
  }
}

export function json(res, status, value) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(value));
}
