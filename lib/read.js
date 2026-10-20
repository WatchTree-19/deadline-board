// One link in, the answers out. Devpost keeps eligibility and fees on a
// separate rules page, so that page is read too.
const { fetchPage } = require('./fetchpage');
const { readPage, toText } = require('./extract');

async function readCompetition(link, { country = 'United Kingdom', fetcher = fetchPage, now = Date.now() } = {}) {
  const page = await fetcher(link);
  const u = new URL(page.url);
  let rulesHtml = '', rulesUrl = null;
  if (/(^|\.)devpost\.com$/i.test(u.hostname) && u.hostname !== 'devpost.com' && !/\/rules\/?$/.test(u.pathname)) {
    rulesUrl = `${u.origin}/rules`;
    try { rulesHtml = (await fetcher(rulesUrl)).html; } catch { rulesUrl = null; }
  }
  const result = readPage(page.html, { country, extraHtml: rulesHtml, now });
  const thin = toText(page.html).length < 1500 && !rulesHtml;
  return { url: page.url, rulesUrl, ...result, thin, readAt: new Date(now).toISOString() };
}

module.exports = { readCompetition };
