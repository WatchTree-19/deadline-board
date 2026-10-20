// Fetches a public web page safely: http(s) only, no private or local
// addresses (checked on every redirect), a time limit and a size limit.
const dns = require('node:dns').promises;
const net = require('node:net');

const MAX_BYTES = 4 * 1024 * 1024;
const TIMEOUT_MS = 12000;
// An honest name. Some sites refuse requests that claim to be a full browser but aren't one.
const UA = 'Mozilla/5.0 (compatible; DeadlineBoard/1.0; +https://github.com/WatchTree-19/deadline-board)';

class PageError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

function privateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return privateAddress(v.slice(7));
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
}

async function checkUrl(raw, lookup = dns.lookup) {
  let url;
  try { url = new URL(String(raw).trim()); } catch { throw new PageError("That doesn't look like a web address."); }
  if (!/^https?:$/.test(url.protocol)) throw new PageError('Only http and https links can be read.');
  if (url.username || url.password) throw new PageError('Links with a username or password are not read.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) throw new PageError('That address is on a private network.');
  const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => { throw new PageError("That site's name doesn't resolve.", 502); });
  if (!addrs.length || addrs.some((a) => privateAddress(a.address))) throw new PageError('That address is on a private network.');
  return url;
}

async function fetchPage(raw, { lookup, fetchImpl = fetch, maxBytes = MAX_BYTES, timeoutMs = TIMEOUT_MS } = {}) {
  let url = await checkUrl(raw, lookup);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    for (let hop = 0; hop <= 5; hop++) {
      let res;
      try {
        res = await fetchImpl(url, { redirect: 'manual', signal: ctrl.signal, headers: { 'user-agent': UA } });
      } catch (e) {
        throw new PageError(ctrl.signal.aborted ? 'The site took too long to answer.' : "Couldn't reach that site.", 502);
      }
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        if (hop === 5) throw new PageError('Too many redirects.', 502);
        url = await checkUrl(new URL(res.headers.get('location'), url).href, lookup);
        continue;
      }
      if (res.status === 403 || res.status === 429) throw new PageError(`The site refused the request (${res.status}). Open it and check by hand.`, 502);
      if (!res.ok) throw new PageError(`The site answered ${res.status}.`, 502);
      const type = res.headers.get('content-type') || '';
      if (type && !/text\/html|application\/xhtml|text\/plain/i.test(type)) throw new PageError("That link isn't a web page.", 415);
      const len = +res.headers.get('content-length');
      if (len && len > maxBytes) throw new PageError('That page is too big to read.', 413);
      const reader = res.body.getReader();
      const chunks = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > maxBytes) { ctrl.abort(); throw new PageError('That page is too big to read.', 413); }
        chunks.push(value);
      }
      return { url: url.href, html: Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8') };
    }
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { fetchPage, checkUrl, privateAddress, PageError };
