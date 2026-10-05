// The Vercel demo functions (api/login, api/ask) against a fake Kimi server. No network.
import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

Object.assign(process.env, {
  DEMO_USERNAME: 'demo-user',
  DEMO_PASSWORD: 'demo-pass',
  DEMO_SESSION_SECRET: 'x'.repeat(40),
  KIMI_API_KEY: 'test-key',
});

// Fake Moonshot endpoint: streams two chunks in the OpenAI SSE format.
const seen = [];
const kimi = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    seen.push({ auth: req.headers.authorization, body: JSON.parse(body) });
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write('data: {"choices":[{"delta":{"content":"Send the "}}]}\n\n');
    res.write('data: {"choices":[{"delta":{"content":"revised quotation."}}]}\n\n');
    res.end('data: [DONE]\n\n');
  });
});
await new Promise((r) => kimi.listen(0, r));
process.env.KIMI_BASE_URL = `http://127.0.0.1:${kimi.address().port}/v1`;

const login = (await import('../../api/login.mjs')).default;
const ask = (await import('../../api/ask.mjs')).default;

/** Calls a Vercel-style handler with a JSON body; returns { status, text }. */
async function call(handler, { method = 'POST', body, auth } = {}) {
  const chunks = [];
  const res = {
    statusCode: 200,
    headers: {},
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    write(c) { chunks.push(String(c)); return true; },
    end(c) { if (c) chunks.push(String(c)); },
  };
  const req = { method, headers: auth ? { authorization: auth } : {}, body };
  await handler(req, res);
  return { status: res.statusCode, text: chunks.join(''), headers: res.headers };
}

test('login: right credentials get a token; wrong ones are refused', async () => {
  const bad = await call(login, { body: { username: 'demo-user', password: 'nope' } });
  assert.equal(bad.status, 401);
  const good = await call(login, { body: { username: 'demo-user', password: 'demo-pass' } });
  assert.equal(good.status, 200);
  const { token, expires } = JSON.parse(good.text);
  assert.ok(token.includes('.'));
  assert.ok(expires > Date.now());
});

test('ask: needs a valid session token', async () => {
  assert.equal((await call(ask, { body: { question: 'hi' } })).status, 401);
  assert.equal((await call(ask, { body: { question: 'hi' }, auth: 'Bearer forged.token' })).status, 401);
});

test('ask: streams Kimi’s answer back as NDJSON, with the key only on the server', async () => {
  const { token } = JSON.parse((await call(login, { body: { username: 'demo-user', password: 'demo-pass' } })).text);
  const r = await call(ask, { body: { question: 'Best next move?', scope: 'project P-2026-004', context: { project: { code: 'P-2026-004' } } }, auth: `Bearer ${token}` });
  assert.equal(r.status, 200);
  assert.match(r.headers['content-type'], /ndjson/);
  const lines = r.text.trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(lines.slice(0, 2), [{ delta: 'Send the ' }, { delta: 'revised quotation.' }]);
  assert.deepEqual(lines.at(-1), { done: true, answer: 'Send the revised quotation.' });
  const sent = seen.at(-1);
  assert.equal(sent.auth, 'Bearer test-key');
  assert.equal(sent.body.stream, true);
  assert.match(sent.body.messages[1].content, /P-2026-004/);
  kimi.close();
});
