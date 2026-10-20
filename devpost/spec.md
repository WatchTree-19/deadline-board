---
doc: spec
status: approved
---

# Deadline Board: Technical Spec

## How This Works, In Plain Language
Two pieces. A small Node server on your computer fetches the competition page for you (browsers aren't allowed to read other sites' pages directly) and runs a set of reading rules over it: where is the deadline, which sentence talks about who can enter, is there a fee, what must be submitted. It sends back the answers with the exact line each came from. The page in your browser shows those answers as a ticket and keeps your board in the browser's own storage. No AI model, no database, no keys.

## The Core Journey Through the System
Paste link → browser calls `GET /api/read?url=...&country=...` → server checks the link is a public web address, fetches it (and `/rules` for Devpost) → `extract.js` turns HTML into text and finds the deadline, eligibility, fee, prize and requirements → JSON back to the browser → `app.js` converts the deadline into your time zone with `Intl.DateTimeFormat` and draws the ticket → Add to board saves the entry in `localStorage` → the board re-sorts and ticks every second. PRD ref: `prd.md > The Core Journey`.

## Stack
- Node.js 20 or later, built-in modules only (`http`, `dns`, `net`, global `fetch`). Docs: https://nodejs.org/docs/latest-v20.x/api/
- Plain HTML, CSS and JavaScript in the browser, no framework or build step.
- Tests: `node:test`. Docs: https://nodejs.org/api/test.html
- Rationale (agent's call on the learner's delegation): zero installs means anyone can clone and run it in one command; the app is one screen, so a framework adds nothing.

## Where It Runs and How Someone Tries It
Local process. `node server.js`, then open http://localhost:8787. Requires Node 20+, no keys. For the demo video: run it, paste three real competition links, show the board. Deployment: not needed for the proof of concept.

## Look and Feel
Departures board. Dark: background #0d0f12, panels #161a20, amber #ffb000 for times and highlights, off-white #e8e6e1 text, muted #8a8f98. Light (device setting): paper #f7f5f0, ink #1b1d21, amber darkened to #a86b00 for contrast. Times and countdowns in a monospace stack (ui-monospace, "JetBrains Mono", Menlo, Consolas); words in system sans. Calm, dense rows, generous line height. Short, plain copy.

## Components

### Safe fetcher (`lib/fetchpage.js`)
Accepts only http and https, resolves the host and refuses private, loopback and link-local addresses (checked again on every redirect, at most 5), 12 second timeout, 4 MB cap, HTML or text only. PRD ref: `prd.md > States and Boundaries`.

### Reader (`lib/extract.js`)
Pure functions over HTML: `toText`, `findDeadline`, `findEligibility(text, country)`, `findFee`, `findPrize`, `findRequirements`. Each returns a value plus `quote` (the source line) or `null`. Deadline order: Devpost's `data-iso-date` after "Deadline", then JSON-LD `endDate`, then dates in lines that mention deadline words, with a time zone table (PT, ET, CT, MT, UTC, GMT, BST, CET, CEST, IST, AEST, JST, AoE and UTC±hh). PRD ref: `prd.md > Reading a link`.

### Read route (`lib/read.js`, `server.js`)
Fetches the page, adds `/rules` for `*.devpost.com`, merges the text, runs the reader, returns JSON. Serves `public/`. PRD ref: `prd.md > The Core Journey`.

### Page (`public/index.html`, `app.js`, `styles.css`)
Paste box, country picker, ticket, board. PRD ref: `prd.md > Screens and Layout`, `prd.md > The board`.

## Data Model
Browser `localStorage` key `deadlineboard.v1`: `{ country, entries: [{ id, url, title, deadlineISO, deadlineText, tzAssumed, prize, fee, eligibility, submit[], status, addedAt }] }`. Written on every change, read on load, wrapped in try/catch so a blocked storage still lets the page work for the session.

## File Structure
```
deadlineboard/
├── server.js            # HTTP server: static files and /api/read
├── lib/
│   ├── fetchpage.js     # safe fetch with address checks, size and time limits
│   ├── extract.js       # the reading rules
│   └── read.js          # fetch + Devpost rules page + extract
├── public/
│   ├── index.html
│   ├── app.js           # ticket, board, countdowns, storage
│   └── styles.css
├── tests/
│   ├── extract.test.js
│   ├── fetchpage.test.js
│   ├── server.test.js
│   └── fixtures/        # saved competition pages
├── devpost/             # planning documents
├── README.md
└── LICENSE
```

## External Services and Dependencies
Only the competition pages themselves, fetched with a normal browser User-Agent. No API keys, no cost.

## Important Failure Modes
- **Page rendered by JavaScript** (little text in the HTML) → "This page builds itself in the browser, so its text isn't readable here. Open it and check by hand."
- **Site blocks the fetch** (403, 429) → the status and a plain message.
- **Several dates near deadline words** → the latest future one in a deadline line wins, and the quote shows which.

## What Was Simplified and Why
- **Pattern rules** instead of an AI reader: free, instant, quote-able. An AI reader would handle odd wording better but needs a key and a cost per read.
- **Browser storage** instead of accounts: one person's board. Sharing would need a server-side store.

## Decisions and Open Issues
- All technical choices here were made by the agent after the learner delegated them ("Dude just handle it all").
- Genuine uncertainty: how often non-Devpost competition sites put their text in the HTML. Checked during the build against two non-Devpost sites saved as fixtures.
- No open questions.
