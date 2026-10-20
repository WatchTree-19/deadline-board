// Deadline Board: serves the page and reads competition links.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { readCompetition } = require('./lib/read');
const { PageError } = require('./lib/fetchpage');
const { COUNTRIES } = require('./lib/extract');

const PUBLIC = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const SECURITY = {
  'content-security-policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

// A few reads a minute per visitor is plenty for one person's board.
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 60000);
  list.push(now);
  hits.set(ip, list);
  return list.length > 30;
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', ...SECURITY });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function createServer(opts = {}) {
  return http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://local');
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Only GET here.' });
    if (u.pathname === '/api/read') {
      if (limited(req.socket.remoteAddress)) return send(res, 429, { error: 'Too many reads in a minute. Try again shortly.' });
      const link = u.searchParams.get('url');
      const country = COUNTRIES.includes(u.searchParams.get('country')) ? u.searchParams.get('country') : 'United Kingdom';
      if (!link) return send(res, 400, { error: 'Paste a link first.' });
      try {
        return send(res, 200, await readCompetition(link, { country, ...opts }));
      } catch (e) {
        if (e instanceof PageError) return send(res, e.status, { error: e.message });
        console.error('read failed', e);
        return send(res, 500, { error: 'Something went wrong reading that page.' });
      }
    }
    if (u.pathname === '/api/countries') return send(res, 200, { countries: COUNTRIES });
    const file = u.pathname === '/' ? 'index.html' : u.pathname.slice(1);
    const full = path.join(PUBLIC, path.normalize(file));
    if (!full.startsWith(PUBLIC + path.sep) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
    res.writeHead(200, { 'content-type': TYPES[path.extname(full)] || 'application/octet-stream', 'cache-control': 'no-cache', ...SECURITY });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(full).pipe(res);
  });
}

if (require.main === module) {
  const port = +process.env.PORT || 8787;
  const host = process.env.HOST || '127.0.0.1';
  createServer().listen(port, host, () => console.log(`Deadline Board on http://localhost:${port}`));
}

module.exports = { createServer };
