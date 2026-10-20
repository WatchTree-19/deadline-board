const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../server');
const { PageError } = require('../lib/fetchpage');

const PAGES = {
  'https://example-hack.devpost.com/': `<title>Example Hack</title><span data-dates-text>Deadline:</span><span data-iso-date="2026-11-14T23:59:00Z">Nov 14</span><p>Open to participants worldwide.</p>`,
  'https://example-hack.devpost.com/rules': `<p>NO PURCHASE NECESSARY.</p>`,
};
const fetcher = async (url) => {
  if (PAGES[url]) return { url, html: PAGES[url] };
  throw new PageError('The site answered 404.', 502);
};

async function withServer(fn) {
  const srv = createServer({ fetcher, now: Date.parse('2026-10-20T00:00:00Z') });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try { await fn(base); } finally { srv.close(); }
}

test('reads a Devpost link and its rules page', () => withServer(async (base) => {
  const r = await fetch(`${base}/api/read?url=${encodeURIComponent('https://example-hack.devpost.com/')}&country=United%20Kingdom`);
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.title, 'Example Hack');
  assert.equal(d.deadline.iso, '2026-11-14T23:59:00.000Z');
  assert.equal(d.fee.status, 'free');
  assert.equal(d.eligibility.status, 'yes');
  assert.equal(d.rulesUrl, 'https://example-hack.devpost.com/rules');
}));

test('errors come back as plain messages', () => withServer(async (base) => {
  let r = await fetch(`${base}/api/read`);
  assert.equal(r.status, 400);
  r = await fetch(`${base}/api/read?url=${encodeURIComponent('https://nope.example/')}`);
  assert.equal(r.status, 502);
  assert.match((await r.json()).error, /404/);
}));

test('serves the page, refuses paths outside it, sends security headers', () => withServer(async (base) => {
  let r = await fetch(`${base}/`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
  assert.match(await r.text(), /Deadline Board/);
  r = await fetch(`${base}/..%2fserver.js`);
  assert.equal(r.status, 404);
  r = await fetch(`${base}/api/read`, { method: 'POST' });
  assert.equal(r.status, 405);
}));
