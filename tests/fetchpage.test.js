const test = require('node:test');
const assert = require('node:assert/strict');
const { fetchPage, checkUrl, privateAddress, PageError } = require('../lib/fetchpage');

const publicLookup = async () => [{ address: '93.184.216.34' }];
const res = (status, body = '', headers = {}) => new Response(body, { status, headers: { 'content-type': 'text/html', ...headers } });

test('private and local addresses are refused', async () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.4', '172.20.0.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:127.0.0.1', '100.64.0.1']) assert.ok(privateAddress(ip), ip);
  assert.ok(!privateAddress('93.184.216.34'));
  await assert.rejects(checkUrl('http://localhost:8080/'), PageError);
  await assert.rejects(checkUrl('http://169.254.169.254/latest/meta-data'), /private/);
  await assert.rejects(checkUrl('https://example.test/', async () => [{ address: '10.0.0.5' }]), /private/);
  await assert.rejects(checkUrl('file:///etc/passwd'), /http/);
  await assert.rejects(checkUrl('not a link'), /web address/);
  await assert.rejects(checkUrl('https://user:pw@example.com/'), /password/);
  assert.equal((await checkUrl('https://example.com/x', publicLookup)).href, 'https://example.com/x');
});

test('a redirect to a private address is refused', async () => {
  const lookup = async (host) => [{ address: host === 'inside.example' ? '10.0.0.9' : '93.184.216.34' }];
  const fetchImpl = async () => res(302, '', { location: 'http://inside.example/admin' });
  await assert.rejects(fetchPage('https://example.com/', { lookup, fetchImpl }), /private/);
});

test('size, type and refusal limits', async () => {
  const big = 'x'.repeat(2000);
  await assert.rejects(fetchPage('https://example.com/', { lookup: publicLookup, fetchImpl: async () => res(200, big), maxBytes: 1000 }), /too big/);
  await assert.rejects(fetchPage('https://example.com/', { lookup: publicLookup, fetchImpl: async () => res(200, 'x', { 'content-type': 'application/pdf' }) }), /isn't a web page/);
  await assert.rejects(fetchPage('https://example.com/', { lookup: publicLookup, fetchImpl: async () => res(403) }), /refused/);
  const ok = await fetchPage('https://example.com/a', { lookup: publicLookup, fetchImpl: async () => res(200, '<p>hi</p>') });
  assert.equal(ok.html, '<p>hi</p>');
});

test('a slow site times out', async () => {
  const fetchImpl = (url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
  await assert.rejects(fetchPage('https://example.com/', { lookup: publicLookup, fetchImpl, timeoutMs: 50 }), /too long/);
});
