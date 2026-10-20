// The reading rules: plain functions from a page's HTML or text to answers.
// Every answer carries `quote`, the line of the page it came from, or is null.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '-', mdash: '-', rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', hellip: '...', pound: '£', euro: '€', middot: '·' };

function decode(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

// HTML to readable lines. Devpost keeps some sections as escaped HTML inside
// attributes, so escaped tags are decoded and stripped as well.
function toText(html) {
  let s = String(html);
  s = s.replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, ' ');
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<li\b[^>]*>/gi, '\n- ');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/?(p|div|section|article|header|footer|h[1-6]|ul|ol|tr|table|blockquote|dt|dd|main|aside|nav)\b[^>]*>/gi, '\n');
  s = s.replace(/<[^>]+>/g, ' ');
  s = decode(s);
  if (/&lt;\/?[a-z]/i.test(s)) s = toText(s.replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
  return s
    .split('\n')
    .map((l) => l.replace(/[\t  ]+/g, ' ').trim())
    .filter((l) => l && l !== '-')
    .join('\n');
}

function lines(text) {
  return text.split('\n').map((l) => l.trim()).filter(Boolean);
}

// Cut long lines down to the sentence that matters.
function sentenceAround(line, re) {
  if (line.length <= 260) return line;
  const parts = line.split(/(?<=[.;!?])\s+/);
  const hit = parts.find((p) => re.test(p));
  const out = (hit || line).trim();
  return out.length > 300 ? out.slice(0, 297) + '...' : out;
}

function titleOf(html) {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
  if (og) return decode(og[1]).trim();
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return t ? decode(t[1]).replace(/\s+/g, ' ').trim() : null;
}

// ---------- deadlines ----------

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';

// Offsets in minutes. Daylight and standard names are both listed; a bare
// "PT" or "ET" takes whichever applies on that date.
const ZONES = {
  utc: 0, gmt: 0, z: 0, bst: 60, cet: 60, cest: 120, eet: 120, eest: 180,
  pst: -480, pdt: -420, mst: -420, mdt: -360, cst: -360, cdt: -300, est: -300, edt: -240,
  ist: 330, sgt: 480, hkt: 480, jst: 540, kst: 540, aest: 600, aedt: 660, nzst: 720, nzdt: 780,
  aoe: -720,
};
const US_GENERIC = { pt: [-480, -420], mt: [-420, -360], ct: [-360, -300], et: [-300, -240] };
const ZONE_RE = '((?:utc|gmt)\\s?[+-]\\s?\\d{1,2}(?::?\\d{2})?|utc|gmt|bst|cet|cest|eet|eest|pst|pdt|pt|mst|mdt|mt|cst|cdt|ct|est|edt|et|ist|sgt|hkt|jst|kst|aest|aedt|nzst|nzdt|aoe|anywhere on earth)';

// US daylight time: second Sunday in March to first Sunday in November.
function usDaylight(y, m, d) {
  const nth = (month, n) => { const first = new Date(Date.UTC(y, month, 1)).getUTCDay(); return 1 + ((7 - first) % 7) + 7 * (n - 1); };
  const start = Date.UTC(y, 2, nth(2, 2)), end = Date.UTC(y, 10, nth(10, 1));
  const t = Date.UTC(y, m, d);
  return t >= start && t < end;
}

function zoneOffset(zone, y, m, d) {
  if (!zone) return null;
  const z = zone.toLowerCase().replace(/\s+/g, ' ').trim();
  if (z === 'anywhere on earth') return -720;
  const num = z.match(/^(?:utc|gmt) ?([+-]) ?(\d{1,2})(?::?(\d{2}))?$/);
  if (num) return (num[1] === '-' ? -1 : 1) * (+num[2] * 60 + +(num[3] || 0));
  if (z in US_GENERIC) return US_GENERIC[z][usDaylight(y, m, d) ? 1 : 0];
  return z in ZONES ? ZONES[z] : null;
}

function parseTime(t) {
  if (!t) return null;
  const m = t.toLowerCase().replace(/\s+/g, '').match(/^(\d{1,2})(?:[:.](\d{2}))?(am|pm|a\.m\.|p\.m\.)?$/);
  if (!m) return null;
  let h = +m[1];
  const min = +(m[2] || 0);
  const ap = m[3] ? m[3][0] : null;
  if (ap === 'p' && h < 12) h += 12;
  if (ap === 'a' && h === 12) h = 0;
  if (!ap && !m[2]) return null; // a lone number is not a time
  if (h > 23 || min > 59) return null;
  return { h, min };
}

const TIME_RE = '(\\d{1,2}(?:[:.]\\d{2})?\\s?(?:am|pm|a\\.m\\.|p\\.m\\.)|\\d{1,2}:\\d{2}|noon|midnight)';

function readTime(s) {
  const t = s.toLowerCase();
  if (t === 'noon') return { h: 12, min: 0 };
  if (t === 'midnight') return { h: 23, min: 59 };
  return parseTime(s);
}

// Finds dates in a line, with any time and zone written next to them.
function datesIn(line, refYear, now = Date.now()) {
  const out = [];
  const tail = `(?:,?\\s*(?:at|@|by|until|,)?\\s*${TIME_RE})?(?:\\s*\\(?\\s*${ZONE_RE}\\b\\)?)?`;
  const pats = [
    // Oct 26, 2026 / October 26th 2026
    { re: new RegExp(`\\b${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})${tail}`, 'gi'), f: (m) => [m[1], m[2], m[3], m[4], m[5]] },
    // 26 Oct 2026 / 26th October, 2026
    { re: new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE},?\\s+(\\d{4})${tail}`, 'gi'), f: (m) => [m[2], m[1], m[3], m[4], m[5]] },
    // 2026-10-26 (optionally T17:00)
    { re: new RegExp(`\\b(\\d{4})-(\\d{2})-(\\d{2})(?:[T ](\\d{2}:\\d{2}))?(?:\\s*\\(?\\s*${ZONE_RE}\\b\\)?)?`, 'gi'), f: (m) => [String(+m[2]), m[3], m[1], m[4], m[5], true] },
    // Oct 26 (no year), 5pm PT
    { re: new RegExp(`\\b${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?!\\s*,?\\s*\\d{4})${tail}`, 'gi'), f: (m) => [m[1], m[2], null, m[3], m[4]] },
    // 26 Oct (no year)
    { re: new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}(?!,?\\s+\\d{4})${tail}`, 'gi'), f: (m) => [m[2], m[1], null, m[3], m[4]] },
  ];
  const taken = [];
  for (const p of pats) {
    for (const m of line.matchAll(p.re)) {
      const start = m.index, end = m.index + m[0].length;
      if (taken.some(([a, b]) => start < b && end > a)) continue;
      const [mon, day, year, time, zone, numericMonth] = p.f(m);
      const mi = numericMonth ? +mon - 1 : MONTHS[mon.toLowerCase().slice(0, mon.toLowerCase().startsWith('sept') ? 4 : 3)];
      if (mi == null || mi < 0 || mi > 11) continue;
      const d = +day;
      if (d < 1 || d > 31) continue;
      let y = year ? +year : refYear;
      // "Close Jan 7" with no year means the next Jan 7 to come.
      if (!year && Date.UTC(y, mi, d) < now - 864e5) y += 1;
      taken.push([start, end]);
      out.push({ y, m: mi, d, time: time ? readTime(time) : null, zone: zone || null, yearGuessed: !year, raw: m[0].trim(), index: start });
    }
  }
  return out.sort((a, b) => a.index - b.index);
}

function toISO(dt) {
  const off = zoneOffset(dt.zone, dt.y, dt.m, dt.d);
  let time = dt.time, assumed = null, offset = off;
  if (!time) { time = { h: 23, min: 59 }; assumed = 'no time given, end of day assumed'; }
  if (offset == null) {
    offset = 840; // UTC+14, the earliest end of any day on earth
    assumed = (assumed ? assumed + '; ' : '') + 'no time zone given, earliest time zone on earth assumed';
  }
  const ms = Date.UTC(dt.y, dt.m, dt.d, time.h, time.min) - offset * 60000;
  return { iso: new Date(ms).toISOString(), assumed };
}

const DEADLINE_WORDS = /\b(deadline|due|closes?|closing|close of|ends?|submissions? (?:are )?(?:due|close|end)|submit by|last day|entries close|no later than|until)\b/i;
const START_WORDS = /\b(opens?|starts?|begins?|kick-?off|launch(?:es)?|announced?|winners?|judging)\b/i;

function findDeadline(html, text, now = Date.now()) {
  const refYear = new Date(now).getUTCFullYear();
  // 1. Devpost marks its deadline with data-iso-date right after "Deadline".
  const dp = html.match(/Deadline:?[\s\S]{0,400}?data-iso-date=["']([^"']+)["']/i) ||
    html.match(/data-iso-date=["']([^"']+)["'][\s\S]{0,200}?Deadline/i);
  if (dp && !isNaN(Date.parse(dp[1]))) {
    const quoteLine = lines(text).find((l) => /^Deadline:/i.test(l)) || lines(text).find((l) => /deadline/i.test(l)) || `Deadline: ${dp[1]}`;
    return { iso: new Date(Date.parse(dp[1])).toISOString(), assumed: null, quote: sentenceAround(quoteLine, /deadline/i), source: 'page' };
  }
  // 2. Structured data.
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = [].concat(JSON.parse(m[1]));
      for (const item of data.flatMap((d) => d['@graph'] || [d])) {
        if (item && item.endDate && !isNaN(Date.parse(item.endDate)) && /T\d/.test(item.endDate)) {
          return { iso: new Date(Date.parse(item.endDate)).toISOString(), assumed: null, quote: `End date: ${item.endDate}`, source: 'structured data' };
        }
      }
    } catch { /* not JSON, skip */ }
  }
  // 3. Dates on lines that talk about deadlines.
  const cands = [];
  const ls = lines(text);
  ls.forEach((line, i) => {
    const near = [line, ls[i - 1] || ''];
    const deadlineLine = DEADLINE_WORDS.test(line);
    const deadlineAbove = !deadlineLine && DEADLINE_WORDS.test(near[1]) && near[1].length < 80;
    if (!deadlineLine && !deadlineAbove) return;
    for (const dt of datesIn(line, refYear, now)) {
      const { iso, assumed } = toISO(dt);
      const before = line.slice(Math.max(0, dt.index - 60), dt.index);
      let score = deadlineLine ? 3 : 2;
      if (/deadline|submissions? (?:are )?(?:due|close)|submit by|entries close/i.test(line)) score += 2;
      if (START_WORDS.test(before) && !DEADLINE_WORDS.test(before)) score -= 3;
      if (/(deadline|due|clos(?:e|es|ing)|submit by|ends?|until|no later than)\b[^.;,]{0,25}$/i.test(before)) score += 3; // the date the deadline word points at
      else if (/[-–]\s*$/.test(before) || / to\s*$/i.test(before)) score += 1; // the end of a range
      if (dt.time) score += 1;
      if (dt.zone) score += 1;
      if (dt.yearGuessed) score -= 1;
      if (Date.parse(iso) < now - 864e5) score -= 4;
      cands.push({ iso, assumed, score, quote: sentenceAround(deadlineAbove ? near[1] + ' ' + line : line, new RegExp(dt.raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')) });
    }
  });
  if (!cands.length) return null;
  cands.sort((a, b) => b.score - a.score || Date.parse(b.iso) - Date.parse(a.iso));
  const best = cands[0];
  return { iso: best.iso, assumed: best.assumed, quote: best.quote, source: 'page' };
}

// ---------- who can enter ----------

const COUNTRY_NAMES = {
  'United Kingdom': ['united kingdom', 'u\\.k\\.', 'uk', 'great britain', 'britain', 'england', 'scotland', 'wales', 'northern ireland'],
  'United States': ['united states', 'u\\.s\\.a?\\.', 'usa', 'us'],
  Canada: ['canada'], Ireland: ['ireland', 'republic of ireland'], India: ['india'], Germany: ['germany'], France: ['france'],
  Australia: ['australia'], Nigeria: ['nigeria'], Pakistan: ['pakistan'], Brazil: ['brazil'], Italy: ['italy'], Spain: ['spain'],
  Netherlands: ['netherlands'], Japan: ['japan'], Singapore: ['singapore'], 'South Africa': ['south africa'], Kenya: ['kenya'],
  'United Arab Emirates': ['united arab emirates', 'uae'], Malaysia: ['malaysia'], Indonesia: ['indonesia'], Philippines: ['philippines'],
};
const COUNTRIES = Object.keys(COUNTRY_NAMES);

function countryRe(country) {
  // Used to pick the sentence to quote; the yes or no decision is hasCountry's.
  const names = (COUNTRY_NAMES[country] || [country.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')]);
  return new RegExp(`(?<![A-Za-z])(?:${names.join('|')})(?![A-Za-z])`, 'i');
}

function hasCountry(s, country) {
  const names = COUNTRY_NAMES[country] || [country.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')];
  return names.some((n) => {
    // Short codes (UK, US, USA, UAE) only count in capitals, so the word "us" doesn't.
    if (n.length <= 3 && !n.includes('\\')) return new RegExp(`(?<![A-Za-z])${n.toUpperCase()}(?![A-Za-z])`).test(s);
    return new RegExp(`(?<![A-Za-z])${n}(?![A-Za-z])`, 'i').test(s);
  });
}

const EXCLUDE = /\b(exclud|except|not (?:be )?(?:open|eligible|available|permitted|residents?|citizens?)|ineligible|prohibit|embargo|sanction|void (?:in|where)|residents? of the following|may not (?:enter|participate)|cannot (?:enter|participate))/i;
const OPEN_ANY = /\b(worldwide|all countries|any country|globally|global(?:ly)? open|international(?:ly)?|anywhere in the world|all territories|countries and territories)\b/i;
const ELIG_WORDS = /\b(eligib|open to|who can (?:enter|participate|join)|participants? must|entrants? must|residents?|citizens?|countr(?:y|ies)|territor(?:y|ies))/i;

function countriesNamed(s) {
  return COUNTRIES.filter((c) => c !== 'United States' && hasCountry(s, c)).length +
    (s.match(/\b(Cuba|Iran|North Korea|Syria|Russia|Crimea|Quebec|Afghanistan|Belarus|Venezuela|Myanmar|Sudan|China)\b/g) || []).length;
}

// A long exclusion list is cut down to the part that names the country.
function windowAround(line, country) {
  if (line.length <= 260) return line;
  const m = line.match(countryRe(country));
  if (!m) return sentenceAround(line, EXCLUDE);
  const colon = line.indexOf(':');
  const head = colon > 0 && colon < 80 ? line.slice(0, colon + 1) + ' ' : '';
  let from = Math.max(head.length, m.index - 110), to = Math.min(line.length, m.index + m[0].length + 90);
  from = line.lastIndexOf(' ', from) + 1;
  const end = line.indexOf(' ', to);
  to = end === -1 ? line.length : end;
  return head + '... ' + line.slice(from, to).trim() + (to < line.length ? ' ...' : '');
}

function findEligibility(text, country = 'United Kingdom') {
  const ls = lines(text);
  let exclusion = null, inclusion = null, onlyOthers = null, notInList = null, openAny = null;
  ls.forEach((line, i) => {
    // A line ending "excluding" or "except" carries on in the next line.
    const joined = /\b(excluding|except|exceptions?:?)\s*$/i.test(line) && ls[i + 1] ? line + ' ' + ls[i + 1] : line;
    // Lists of excluded countries often sit in the lines after the sentence that introduces them.
    const block = joined + ' ' + (ls[i + 1] || '') + ' ' + (ls[i + 2] || '');
    if (!ELIG_WORDS.test(joined) && !EXCLUDE.test(joined)) return;
    if (/\b(media|licen[cs]e|royalt|intellectual property|trademark)/i.test(joined)) return;
    const listIntro = EXCLUDE.test(joined) && /:\s*$|following|below/i.test(joined);
    if (EXCLUDE.test(joined)) {
      const after = joined.slice(joined.search(EXCLUDE));
      if (hasCountry(after, country) || (listIntro && hasCountry(block, country))) {
        exclusion = exclusion || windowAround(hasCountry(joined, country) ? joined : block, country);
        return;
      }
      if (countriesNamed(listIntro ? block : after) >= 3) {
        const listLine = listIntro ? [ls[i + 1], ls[i + 2]].find((l) => l && countriesNamed(l) >= 3) : null;
        const cut = listLine ? listLine.search(/\(?including|such as|:\s/i) : -1;
        const q = listLine ? joined + ' ' + (cut > 40 ? '... ' + listLine.slice(cut) : listLine.replace(/^-\s*/, '')) : joined;
        notInList = notInList || (q.length > 300 ? q.slice(0, 297) + '...' : q);
      }
    }
    if (hasCountry(joined, country) && /\b(open to|eligible|may enter|can enter|residents? of|citizens? of|available (?:to|in))\b/i.test(joined)) {
      inclusion = inclusion || sentenceAround(joined, countryRe(country));
      return;
    }
    if (OPEN_ANY.test(joined) && /\b(countr|territor|resident|eligib|particip|open to|entrants?)/i.test(joined)) openAny = openAny || sentenceAround(joined, OPEN_ANY);
    const onlyRe = /\b(?:open|available|limited) (?:only )?to (?:legal )?(?:residents|citizens) of ([^.;]+)/i;
    const only = joined.match(onlyRe);
    if (only && !hasCountry(only[1], country) && !OPEN_ANY.test(only[1]) && /\bonly\b|\blimited\b/i.test(joined)) onlyOthers = onlyOthers || sentenceAround(joined, onlyRe);
  });
  if (exclusion) return { status: 'no', country, quote: exclusion };
  if (inclusion) return { status: 'yes', country, quote: inclusion };
  if (onlyOthers) return { status: 'no', country, quote: onlyOthers };
  if (notInList) return { status: 'yes', country, quote: notInList, note: `${country} is not in the list of excluded places` };
  if (openAny) return { status: 'yes', country, quote: openAny, note: `${country} is not named as an exception on the page` };
  return { status: 'unclear', country, quote: null };
}

// ---------- fees ----------

const MONEY = '(?:[$£€]\\s?\\d[\\d,]*(?:\\.\\d+)?(?:\\s?(?:k|m|million|bn))?|\\d[\\d,]*(?:\\.\\d+)?\\s?(?:usd|gbp|eur|dollars|pounds|euros))';

function findFee(text) {
  const ls = lines(text);
  const free = /\b(no purchase (?:or payment )?(?:is )?necessary|free to (?:enter|join|participate|apply)|free entry|entry is free|no (?:entry|registration|submission|application) fees?|free of charge to enter|there is no (?:fee|cost) to (?:enter|participate))\b/i;
  const paidRe = new RegExp(`\\b(entry|registration|submission|application|participation) fees?\\b[^.]{0,80}?(${MONEY})|(${MONEY})[^.]{0,40}?\\b(entry|registration|submission|application) fees?\\b`, 'i');
  for (const line of ls) {
    const m = line.match(paidRe);
    if (m && !/\bno (entry|registration|submission|application) fee/i.test(line)) {
      return { status: 'paid', amount: (m[2] || m[3]).trim(), quote: sentenceAround(line, paidRe) };
    }
  }
  for (const line of ls) if (free.test(line)) return { status: 'free', quote: sentenceAround(line, free) };
  return { status: 'not stated', quote: null };
}

// ---------- prizes ----------

function moneyValue(s) {
  const m = s.toLowerCase().replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s?(k|m|million|bn)?/);
  if (!m) return 0;
  const mult = { k: 1e3, m: 1e6, million: 1e6, bn: 1e9 }[m[2]] || 1;
  return +m[1] * mult;
}

function findPrize(text) {
  const ls = lines(text);
  const total = new RegExp(`(${MONEY})\\s+(?:in (?:cash )?prizes|(?:total )?prize pool|in total prizes|in cash)|(?:prize pool|total prizes?|prizes? worth|in prizes)(?: of)?:?\\s+(?:over |more than |up to )?(${MONEY})`, 'i');
  for (const line of ls) {
    const m = line.match(total);
    if (m) return { amount: (m[1] || m[2]).replace(/\s+/g, ''), quote: sentenceAround(line, total) };
  }
  let best = null;
  const any = new RegExp(MONEY, 'gi');
  for (const line of ls) {
    if (!/\b(prize|award|winner|first place|grand|1st)\b/i.test(line)) continue;
    for (const m of line.matchAll(any)) {
      if (!/[$£€]/.test(m[0])) continue;
      const v = moneyValue(m[0]);
      if (!best || v > best.v) best = { v, amount: m[0].replace(/\s+/g, ''), quote: sentenceAround(line, /prize|award|winner|place|grand/i) };
    }
  }
  return best ? { amount: best.amount, quote: best.quote, note: 'largest single prize named' } : null;
}

// ---------- what to hand in ----------

const SUBMIT_HEAD = /^(what to submit|submission requirements|requirements|how to (?:enter|submit)|what you(?:'ll)? need to submit|submission guidelines|deliverables|entry requirements|what (?:should|must) (?:i|you) submit)\b/i;
const SUBMIT_THING = /\b(video|demo|repo(?:sitory)?|github|gitlab|source code|description|write-?up|screenshots?|link|url|pitch|deck|slides|form|readme|licen[cs]e|images?|trailer|film|script|apk|build)\b/i;
const NEED = /\b(must|required|requires?|should|need to|include|submit|provide|upload|share)\b/i;

function tidy(item) {
  let s = item.replace(/^[-•*\d.)\s]+/, '').trim();
  if (s.length > 220) s = sentenceAround(s, SUBMIT_THING);
  if (s.length > 220) s = s.slice(0, 217) + '...';
  return s;
}

function findRequirements(text) {
  const ls = lines(text);
  const items = [];
  const seen = new Set();
  const add = (s) => {
    const t = tidy(s);
    const key = t.toLowerCase().slice(0, 60);
    if (t.length < 12 || seen.has(key) || /\b(discord|forum|newsletter|slack channel)\b/i.test(t)) return;
    seen.add(key);
    items.push(t);
  };
  ls.forEach((line, i) => {
    if (items.length >= 8 || !SUBMIT_HEAD.test(line) || line.length > 80) return;
    for (let j = i + 1; j < Math.min(ls.length, i + 25) && items.length < 8; j++) {
      const l = ls[j];
      if (!l.startsWith('- ') && j > i + 1 && l.length < 60 && !NEED.test(l)) break; // next heading
      if (l.startsWith('- ') || (NEED.test(l) && SUBMIT_THING.test(l))) add(l);
    }
  });
  if (items.length < 3) {
    for (const line of ls) {
      if (items.length >= 8) break;
      if (SUBMIT_THING.test(line) && NEED.test(line) && /\b(submission|submit|entr(?:y|ies)|entrants?|participants?|you)\b/i.test(line) && line.length < 400) add(line);
    }
  }
  return items.slice(0, 8);
}

function videoLimit(text) {
  const span = /(\b\d+\s?(?:-|–|to)\s?\d+|(?:under|less than|up to|no (?:longer|more) than|maximum(?: of)?|max\.?)\s+(?:\w+\s+\(\d+\)|\d+))[- ]?(minutes?|mins?|seconds?|secs?)\b/i;
  for (const line of lines(text)) {
    if (!/\b(video|demo|film|trailer)\b/i.test(line)) continue;
    const m = line.match(span);
    if (m) {
      const unit = m[2].toLowerCase().replace(/^mins?$/, 'minute').replace(/^secs?$/, 'second').replace(/s$/, '');
      return (m[1].replace(/\b[a-z]+\s+\((\d+)\)/i, '$1') + ' ' + unit + 's').replace(/\s+/g, ' ').replace(/(\d)\s?[-–]\s?(\d)/, '$1 to $2');
    }
  }
  return null;
}

function readPage(html, { country = 'United Kingdom', extraHtml = '', now = Date.now() } = {}) {
  const text = toText(html);
  const extra = extraHtml ? toText(extraHtml) : '';
  const all = extra ? text + '\n' + extra : text;
  return {
    title: titleOf(html),
    deadline: findDeadline(html, text, now) || (extraHtml ? findDeadline(extraHtml, extra, now) : null),
    eligibility: findEligibility(all, country),
    fee: findFee(all),
    prize: findPrize(text) || (extra ? findPrize(extra) : null),
    submit: findRequirements(text).length >= 3 ? findRequirements(text) : findRequirements(all),
    videoLimit: videoLimit(all),
    textLength: all.length,
  };
}

module.exports = { toText, titleOf, datesIn, toISO, zoneOffset, findDeadline, findEligibility, findFee, findPrize, findRequirements, videoLimit, readPage, COUNTRIES, hasCountry };
