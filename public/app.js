// Deadline Board in the browser: the ticket, the board, countdowns and storage.
(() => {
  const KEY = 'deadlineboard.v1';
  const $ = (id) => document.getElementById(id);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Builds elements from text only, so nothing read from a page can run as code.
  function h(tag, attrs = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : String(kid));
    return el;
  }

  let state = { country: 'United Kingdom', entries: [] };
  try { state = { ...state, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { /* storage blocked or damaged: start fresh */ }
  if (!Array.isArray(state.entries)) state.entries = [];
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* still works for this visit */ } };

  const fmtLong = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
  const fmtRow = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const fmtClock = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short' });

  function left(iso, now = Date.now()) {
    const ms = Date.parse(iso) - now;
    if (isNaN(ms)) return { text: 'unknown', closed: false, soon: false };
    if (ms <= 0) return { text: 'Closed', closed: true, soon: false };
    const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), hh = Math.floor((s % 86400) / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return { text: d ? `${d}d ${pad(hh)}h ${pad(mm)}m` : `${pad(hh)}:${pad(mm)}:${pad(ss)}`, closed: false, soon: ms < 3 * 864e5, days: d };
  }

  const ENTER = { yes: 'Yes', no: 'No', unclear: 'Unclear' };
  const short = (c) => ({ 'United Kingdom': 'UK', 'United States': 'US', 'United Arab Emirates': 'UAE' }[c] || c);

  // ---------- country picker ----------
  fetch('/api/countries').then((r) => r.json()).then(({ countries }) => {
    for (const c of countries) $('country').append(h('option', { value: c, selected: c === state.country }, c));
  }).catch(() => $('country').append(h('option', { value: 'United Kingdom' }, 'United Kingdom')));
  $('country').addEventListener('change', (e) => { state.country = e.target.value; save(); if (current) read(current.url); });

  // ---------- reading a link ----------
  let current = null;
  async function read(link) {
    $('error').hidden = true;
    $('go').disabled = true;
    $('go').textContent = 'Reading...';
    try {
      const r = await fetch(`/api/read?url=${encodeURIComponent(link)}&country=${encodeURIComponent(state.country)}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'That page could not be read.');
      current = data;
      showTicket(data);
    } catch (e) {
      $('error').textContent = e.message;
      $('error').hidden = false;
      $('ticket').hidden = true;
    } finally {
      $('go').disabled = false;
      $('go').textContent = 'Read it';
    }
  }

  $('read').addEventListener('submit', (e) => { e.preventDefault(); read($('link').value.trim()); });
  document.querySelectorAll('[data-sample]').forEach((b) => b.addEventListener('click', () => { $('link').value = b.dataset.sample; read(b.dataset.sample); }));

  function quote(text, fallback = 'Not found on the page.') {
    return text ? h('blockquote', {}, h('span', { class: 'qmark', 'aria-hidden': 'true' }, 'From the page'), text) : h('p', { class: 'missing' }, fallback);
  }

  function showTicket(d) {
    const t = $('ticket');
    t.replaceChildren();
    const dl = d.deadline;
    const l = dl ? left(dl.iso) : null;
    const e = d.eligibility;
    const onBoard = state.entries.some((x) => x.url === d.url);
    t.append(...[
      h('div', { class: 'thead' },
        h('div', {}, h('p', { class: 'kicker' }, 'Boarding pass'), h('h2', {}, d.title || new URL(d.url).hostname), h('a', { href: d.url, target: '_blank', rel: 'noopener noreferrer', class: 'src' }, new URL(d.url).hostname + new URL(d.url).pathname.replace(/\/$/, ''))),
        h('button', { class: 'add', id: 'add', disabled: onBoard || !dl, onclick: addCurrent }, onBoard ? 'On the board' : dl ? 'Add to board' : 'No deadline found')
      ),
      d.thin ? h('p', { class: 'warn' }, 'This page builds itself in the browser, so little of its text could be read. Open it and check by hand.') : null,
      h('div', { class: 'grid' },
        h('div', { class: 'cell when' },
          h('p', { class: 'label' }, `Closes, your time (${zone.replace(/_/g, ' ')})`),
          dl ? h('p', { class: 'big mono' }, fmtLong.format(new Date(dl.iso))) : h('p', { class: 'big' }, 'Not found'),
          dl ? h('p', { class: `count mono ${l.closed ? 'closed' : l.soon ? 'soon' : ''}`, 'data-iso': dl.iso }, l.closed ? 'Closed' : l.text + ' left') : null,
          dl && dl.assumed ? h('p', { class: 'warn small' }, `Careful: ${dl.assumed}.`) : null,
          quote(dl && dl.quote)
        ),
        h('div', { class: 'cell' },
          h('p', { class: 'label' }, `Can you enter from ${short(e.country)}?`),
          h('p', { class: `big verdict ${e.status}` }, ENTER[e.status]),
          e.note ? h('p', { class: 'small' }, e.note + '.') : null,
          quote(e.quote, 'Nothing on the page says who can enter. Check the rules.')
        ),
        h('div', { class: 'cell' },
          h('p', { class: 'label' }, 'Entry fee'),
          h('p', { class: `big verdict ${d.fee.status === 'free' ? 'yes' : d.fee.status === 'paid' ? 'no' : 'unclear'}` }, d.fee.status === 'free' ? 'Free' : d.fee.status === 'paid' ? d.fee.amount : 'Not stated'),
          quote(d.fee.quote, 'The page says nothing about a fee.')
        ),
        h('div', { class: 'cell' },
          h('p', { class: 'label' }, 'Prize'),
          h('p', { class: 'big mono' }, d.prize ? d.prize.amount : 'Not stated'),
          d.prize && d.prize.note ? h('p', { class: 'small' }, d.prize.note + '.') : null,
          quote(d.prize && d.prize.quote, 'No prize amount on the page.')
        )
      ),
      h('div', { class: 'cell wide' },
        h('p', { class: 'label' }, 'What you hand in' + (d.videoLimit ? ` (video: ${d.videoLimit})` : '')),
        d.submit.length ? h('ul', { class: 'hand' }, d.submit.map((s) => h('li', {}, s))) : h('p', { class: 'missing' }, 'No submission list found on the page.')
      ),
      d.rulesUrl ? h('p', { class: 'small read' }, 'Also read: ', h('a', { href: d.rulesUrl, target: '_blank', rel: 'noopener noreferrer' }, 'the official rules'), '.') : null,
    ].filter(Boolean));
    t.hidden = false;
    t.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }

  function addCurrent() {
    const d = current;
    if (!d || !d.deadline || state.entries.some((x) => x.url === d.url)) return;
    state.entries.push({
      id: Math.random().toString(36).slice(2, 10), url: d.url, title: d.title || new URL(d.url).hostname,
      deadlineISO: d.deadline.iso, deadlineQuote: d.deadline.quote, assumed: d.deadline.assumed,
      prize: d.prize ? d.prize.amount : null, fee: d.fee.status === 'paid' ? d.fee.amount : d.fee.status,
      eligibility: { status: d.eligibility.status, country: d.eligibility.country }, submit: d.submit, videoLimit: d.videoLimit,
      status: 'thinking', addedAt: new Date().toISOString(),
    });
    save();
    renderBoard(true);
    const b = $('add');
    if (b) { b.textContent = 'On the board'; b.disabled = true; }
  }

  // ---------- the board ----------
  const STATUSES = { thinking: 'Thinking', building: 'Building', submitted: 'Submitted', skipped: 'Skipped' };

  function renderBoard(flash) {
    const now = Date.now();
    const rows = $('rows');
    rows.replaceChildren();
    const sorted = [...state.entries].sort((a, b) => {
      const ca = Date.parse(a.deadlineISO) <= now, cb = Date.parse(b.deadlineISO) <= now;
      return ca !== cb ? (ca ? 1 : -1) : Date.parse(a.deadlineISO) - Date.parse(b.deadlineISO);
    });
    for (const x of sorted) {
      const l = left(x.deadlineISO, now);
      const entry = x.eligibility.status === 'yes' ? `${short(x.eligibility.country)} yes` : x.eligibility.status === 'no' ? `${short(x.eligibility.country)} no` : `${short(x.eligibility.country)} ?`;
      const fee = x.fee === 'free' ? 'free' : x.fee === 'not stated' ? 'fee ?' : x.fee;
      rows.append(h('li', { class: `row ${l.closed ? 'closed' : ''} ${l.soon ? 'soon' : ''} st-${x.status} ${flash && x === state.entries[state.entries.length - 1] ? 'new' : ''}` },
        h('span', { class: 'c-when mono' }, fmtRow.format(new Date(x.deadlineISO)).replace(/,/g, ''), x.assumed ? h('abbr', { title: x.assumed, class: 'assumed' }, '*') : null),
        h('span', { class: 'c-left mono', 'data-iso': x.deadlineISO }, l.text),
        h('span', { class: 'c-name' }, h('a', { href: x.url, target: '_blank', rel: 'noopener noreferrer' }, x.title)),
        h('span', { class: 'c-prize mono' }, x.prize || '-'),
        h('span', { class: `c-entry ${x.eligibility.status}` }, entry, h('span', { class: 'dot' }, ' · '), fee),
        h('label', { class: 'c-status' }, h('span', { class: 'sr' }, `Status for ${x.title}`),
          h('select', { onchange: (e) => { x.status = e.target.value; save(); renderBoard(); } },
            Object.entries(STATUSES).map(([k, v]) => h('option', { value: k, selected: x.status === k }, v)))),
        h('button', { class: 'c-del', title: `Remove ${x.title}`, 'aria-label': `Remove ${x.title}`, onclick: () => { state.entries = state.entries.filter((y) => y !== x); save(); renderBoard(); if (current && current.url === x.url) showTicket(current); } }, '×')
      ));
    }
    $('empty').hidden = state.entries.length > 0;
  }

  function tick() {
    const now = Date.now();
    $('clock').textContent = 'Now ' + fmtClock.format(new Date(now));
    document.querySelectorAll('[data-iso]').forEach((el) => {
      const l = left(el.dataset.iso, now);
      el.textContent = el.classList.contains('count') ? (l.closed ? 'Closed' : l.text + ' left') : l.text;
    });
  }

  renderBoard();
  tick();
  setInterval(tick, 1000);
})();
