const test = require('node:test');
const assert = require('node:assert/strict');
const e = require('../lib/extract');

const NOW = Date.parse('2026-10-20T16:00:00Z');

// Small pages written for the tests, shaped like the real ones.
const DEVPOST = `<html><head><meta property="og:title" content="Example Hack"></head><body>
<div class="date-range"><span data-dates-text>Deadline:</span> <span data-date-info-tag data-iso-date="2026-10-26T17:00:00-04:00">Oct 26, 2026 @ 5:00pm EDT</span></div>
<h2>Who can participate</h2><ul><li>Ages 18+ only</li></ul><p>All countries/territories, excluding</p><p>standard exceptions</p>
<h2>$ 2,500 in cash</h2>
<h2>What to Submit</h2><ul><li>A demo video (1 to 3 minutes) showing it working.</li><li>A public GitHub repo URL with a licence.</li><li>A short description of what it does.</li></ul>
<h3>Hackathon Sponsors</h3></body></html>`;
const RULES = `<p>NO PURCHASE OR PAYMENT NECESSARY TO ENTER OR WIN.</p><p>3. Eligibility</p><p>The Hackathon IS NOT open to:</p>
<ul><li>Individuals who are residents of a country where local law prohibits participating (including, but not limited to, Brazil, Italy, Russia, Cuba, Iran, and North Korea).</li></ul>`;

test('Devpost deadline comes from data-iso-date and keeps its quote', () => {
  const r = e.readPage(DEVPOST, { extraHtml: RULES, now: NOW });
  assert.equal(r.title, 'Example Hack');
  assert.equal(r.deadline.iso, '2026-10-26T21:00:00.000Z');
  assert.match(r.deadline.quote, /Deadline: Oct 26, 2026/);
  assert.equal(r.deadline.assumed, null);
});

test('eligibility: country not in the excluded list is a yes, in the list is a no', () => {
  const uk = e.readPage(DEVPOST, { extraHtml: RULES, now: NOW }).eligibility;
  assert.equal(uk.status, 'yes');
  assert.match(uk.quote, /Brazil, Italy/);
  const it = e.readPage(DEVPOST, { extraHtml: RULES, country: 'Italy', now: NOW }).eligibility;
  assert.equal(it.status, 'no');
});

test('eligibility: plain sentences', () => {
  assert.equal(e.findEligibility('Open only to legal residents of the 50 United States and D.C.', 'United Kingdom').status, 'no');
  assert.equal(e.findEligibility('Eligibility: open to residents of the United Kingdom and Ireland aged 18+.', 'United Kingdom').status, 'yes');
  assert.equal(e.findEligibility('Entrants must not be residents of the UK, Quebec or Cuba.', 'United Kingdom').status, 'no');
  assert.equal(e.findEligibility('Open to participants worldwide.', 'United Kingdom').status, 'yes');
  assert.equal(e.findEligibility('Have fun building.', 'United Kingdom').status, 'unclear');
  // "join us" is not the United States
  assert.equal(e.findEligibility('Eligible teams can join us online.', 'United States').status, 'unclear');
});

test('licence wording that says worldwide is not about who can enter', () => {
  assert.equal(e.findEligibility('Your entry may be used in any media worldwide without payment.', 'United Kingdom').status, 'unclear');
});

test('fees: free, paid and not stated', () => {
  assert.equal(e.findFee('NO PURCHASE OR PAYMENT NECESSARY TO ENTER OR WIN.').status, 'free');
  assert.deepEqual(
    (({ status, amount }) => ({ status, amount }))(e.findFee('There is a $10 registration fee, no separate submission fee.')),
    { status: 'paid', amount: '$10' });
  assert.equal(e.findFee('Entry fee: €15 if paid by 15 Nov.').amount, '€15');
  assert.equal(e.findFee('Build something great.').status, 'not stated');
});

test('prize total', () => {
  assert.equal(e.findPrize('$2M of Credits and $300K in Cash').amount, '$300K');
  assert.equal(e.findPrize('Over $1,000,000 in prizes').amount, '$1,000,000');
  assert.equal(e.findPrize('First place wins £5,000 and second place £2,000').amount, '£5,000');
});

test('what to hand in comes from the submission section', () => {
  const r = e.readPage(DEVPOST, { now: NOW });
  assert.equal(r.submit.length, 3);
  assert.match(r.submit[0], /demo video/);
  assert.equal(r.videoLimit, '1 to 3 minutes');
});

test('text dates: zones, ranges and the date the deadline word points at', () => {
  const d = (s) => e.findDeadline('', s, NOW);
  assert.equal(d('Submissions close October 30, 2026 at 10:00 AM PT').iso, '2026-10-30T17:00:00.000Z'); // PDT in October
  assert.equal(d('Deadline: 4 Dec 2026, 23:59 PT').iso, '2026-12-05T07:59:00.000Z'); // PST after the clocks change
  assert.equal(d('Deadline: 12 Oct 2026 23:59 AoE').iso, '2026-10-13T11:59:00.000Z');
  assert.equal(d('Entry deadline October 25, 2026; festival Oct 29 to Nov 4.').iso.slice(0, 10), '2026-10-25');
  assert.equal(d('Deadline: 7 Jan 2027 23:45 UTC+1').iso, '2027-01-07T22:45:00.000Z');
});

test('a date with no year or zone rolls forward and says what it assumed', () => {
  const r = e.findDeadline('', 'Submissions open Oct 19 · Close Jan 7', NOW);
  assert.equal(r.iso.slice(0, 4), '2027');
  assert.match(r.assumed, /no time given/);
  assert.match(r.assumed, /no time zone/);
});

test('start dates are not taken for deadlines', () => {
  const r = e.findDeadline('', 'Hackathon starts 1 Nov 2026 at 9am UTC and the submission deadline is 14 Nov 2026 at 23:59 UTC', NOW);
  assert.equal(r.iso, '2026-11-14T23:59:00.000Z');
});

test('toText drops scripts and keeps list items', () => {
  const t = e.toText('<script>var x="Deadline: Jan 1, 2020"</script><ul><li>One &amp; two</li></ul>');
  assert.equal(t, '- One & two');
});
