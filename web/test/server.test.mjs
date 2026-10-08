// Run: npm --prefix web test   (no network needed)
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const dir = mkdtempSync(path.join(tmpdir(), 'itn-web-'));
writeFileSync(path.join(dir, 'index.html'), '<!doctype html><html><head><script type="module">console.log(1)</script></head><body><div id="root"></div></body></html>');
Object.assign(process.env, {
  ITN_INDEX_PATH: path.join(dir, 'index.html'),
  ITN_OAUTH_CLIENT_ID: 'test-client.apps.googleusercontent.com',
  ITN_OPS_SPREADSHEET_ID: 'OPS',
  ITN_DELEGATING_SERVICE_ACCOUNT: 'sa@example.iam.gserviceaccount.com',
  ITN_REFRESH_URL: 'http://127.0.0.1:9',
});
const { server, viewerFrom, emailsFor } = await import('../server.mjs');

const fakeVerify = (claims) => async () => ({ getPayload: () => claims });
const req = (authorization) => ({ headers: authorization ? { authorization } : {} });

test('viewerFrom: accepts a verified ITN account', async () => {
  const v = await viewerFrom(req('Bearer tok'), fakeVerify({ email: 'Info@ITNconstruction.com', email_verified: true, hd: 'itnconstruction.com' }));
  assert.deepEqual(v, { email: 'info@itnconstruction.com', idToken: 'tok' });
});

test('viewerFrom: rejects missing, invalid, unverified and non-ITN tokens', async () => {
  await assert.rejects(viewerFrom(req(), fakeVerify({})), { status: 401 });
  await assert.rejects(viewerFrom(req('Bearer x'), async () => { throw new Error('bad signature'); }), { status: 401 });
  await assert.rejects(viewerFrom(req('Bearer x'), fakeVerify({ email: 'a@itnconstruction.com', email_verified: false, hd: 'itnconstruction.com' })), { status: 403 });
  await assert.rejects(viewerFrom(req('Bearer x'), fakeVerify({ email: 'a@gmail.com', email_verified: true })), { status: 403 });
  await assert.rejects(viewerFrom(req('Bearer x'), fakeVerify({ email: 'a@evil.com', email_verified: true, hd: 'evil.com' })), { status: 403 });
  // hd claim must match, not just the address suffix
  await assert.rejects(viewerFrom(req('Bearer x'), fakeVerify({ email: 'a@itnconstruction.com', email_verified: true })), { status: 403 });
});

test('server: page has a hash-pinned CSP; API needs sign-in; unknown paths 404', async (t) => {
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;

  const page = await fetch(base + '/');
  assert.equal(page.status, 200);
  const csp = page.headers.get('content-security-policy');
  assert.match(csp, /script-src 'sha256-[A-Za-z0-9+/=]+' https:\/\/accounts\.google\.com\/gsi\/client/);
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.equal(page.headers.get('x-frame-options'), 'DENY');

  const config = await (await fetch(base + '/api/config')).json();
  assert.equal(config.clientId, 'test-client.apps.googleusercontent.com');

  const data = await fetch(base + '/api/dashboard');
  assert.equal(data.status, 401);
  assert.equal(data.headers.get('cache-control'), 'no-store');
  assert.equal((await fetch(base + '/api/refresh', { method: 'POST' })).status, 401);
  assert.equal((await fetch(base + '/api/edit', { method: 'POST', body: '{"kind":"project"}' })).status, 401);
  assert.equal((await fetch(base + '/api/log', { method: 'POST', body: '{}' })).status, 401);
  assert.equal((await fetch(base + '/api/upload?target=project&code=P-2026-001', { method: 'POST', body: 'x' })).status, 401);
  assert.equal((await fetch(base + '/api/ai/ask', { method: 'POST', body: '{}' })).status, 401);
  assert.equal((await fetch(base + '/api/delete', { method: 'POST', body: '{"kind":"invoice","id":"x"}' })).status, 401);
  assert.equal((await fetch(base + '/api/edit')).status, 404);
  assert.equal((await fetch(base + '/api/refresh')).status, 404);
  assert.equal((await fetch(base + '/../shared/Logic.js')).status, 404);
});

test('emailsFor: groups threads per project or tender, newest first, safe links only', () => {
  const store = {
    threads: {
      a: { id: 'a', link: 'https://mail.google.com/mail/u/0/#all/19a', subject: 'RFQ', first: '2026-09-01', last: '2026-09-02', messages: 2, projects: ['P-1', 'P-2'], tenders: ['T-1'], summary: 's', counterparty: 'PT A', kind: 'RFQ', documents: ['Q.pdf'] },
      b: { id: 'b', link: 'javascript:alert(1)', subject: 'PO', first: '2026-09-05', last: '2026-09-06', messages: 1, projects: ['P-1', 'P-GONE'], summary: 't', kind: 'PO / Contract' },
    },
  };
  const out = emailsFor(store, 'projects', ['P-1', 'P-2', 'P-3']);
  assert.deepEqual(out['P-1'].map((t) => t.id), ['b', 'a']);
  assert.equal(out['P-1'][0].link, null);
  assert.equal(out['P-2'][0].link, 'https://mail.google.com/mail/u/0/#all/19a');
  assert.deepEqual(out['P-3'], []);
  assert.equal(out['P-GONE'], undefined);
  assert.deepEqual(emailsFor(null, 'projects', ['P-1']), { 'P-1': [] });
  assert.deepEqual(emailsFor(store, 'tenders', ['T-1', 'T-2', '']), { 'T-1': [out['P-2'][0]], 'T-2': [] });
});
