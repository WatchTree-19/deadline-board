---
doc: checklist
status: approved
---

# Build Checklist

Build mode: fast (the learner delegated the build: "Do the task outright")

## Slices

- [x] **1. A link's page is read into the four answers, each with its quote**
  Becomes usable: `readPage()` turns a competition page into deadline, eligibility, fee, prize and what to hand in, each with the line it came from.
  Why now: this is the kernel; everything else displays it.
  PRD ref: `prd.md > Reading a link`
  Spec ref: `spec.md > Reader (lib/extract.js)`
  Build: HTML to text, Devpost's data-iso-date, JSON-LD, dated deadline lines with a time zone table, country eligibility with exclusion lists, fees, prize totals, the submission section.
  Verify (mechanical): `node --test tests/*.test.js` (reader tests) and a read of six live competition pages.
  Learner check: paste the Build With AI: Basics link and confirm 26 Oct, UK yes, free, $2,500.
  Commit: `Reader: deadline, eligibility, fee, prize and requirements with quotes`

- [x] **2. Any public link can be read safely from the browser**
  Becomes usable: `GET /api/read?url=` fetches the page (and a Devpost `/rules` page) and returns the answers; private and local addresses, other schemes, huge pages and slow sites are refused with a plain message.
  Why now: the page needs a server to read other sites.
  PRD ref: `prd.md > States and Boundaries`
  Spec ref: `spec.md > Safe fetcher`, `spec.md > Read route`
  Build: `lib/fetchpage.js`, `lib/read.js`, `server.js` with security headers and a per-visitor limit.
  Verify (mechanical): fetcher and server tests; live reads of Devpost and non-Devpost pages.
  Learner check: paste a link that isn't a competition and see a plain answer.
  Commit: `Safe page fetcher and read route`

- [x] **3. The ticket and the board**
  Becomes usable: the one-page app: paste, read, ticket with quotes, add to board, board sorted by deadline with live countdowns, status, remove, saved in the browser.
  Why now: completes the core journey.
  PRD ref: `prd.md > The Core Journey`, `prd.md > The board`
  Spec ref: `spec.md > Page`, `spec.md > Data Model`
  Build: `public/index.html`, `app.js`, `styles.css`, `icon.svg`.
  Verify (mechanical): Chromium at 1280 and 390 px, dark and light: four live links read and added, no console errors, no sideways scroll, board back after reload.
  Learner check: add three competitions and watch the board order them.
  Commit: `Ticket and departures board`

## Hands-on Checkpoints

- [x] Early usable behavior explored: slice 1 read against six live pages; fixes made (see Revisions)
- [x] Final kick-the-tires exploration and feedback completed: screenshots at both widths and both themes looked at; fixes made

## Final Review

- [x] Stray "null" under the ticket header removed
- [x] Track lists no longer shown as "what you hand in" (the "What to build" heading dropped)
- [x] Board times on one line
- [x] Final review complete: the learner delegated sign-off to the agent

## Code Tour and App Map

- [x] Learning activity complete: brief recap (the learner delegated; no walkthrough requested)
- [x] Optional edit and transfer reflection addressed: not applicable, declined by delegation
- [x] `devpost/app-map.html` generated from finished code, checked, and shown

Activity and evidence: recap of the read path in `devpost/app-map.html`.
Route and stops: `public/app.js read()` → `server.js /api/read` → `lib/read.js readCompetition()` → `lib/fetchpage.js fetchPage()` → `lib/extract.js readPage()`.
Edit outcome: not applicable.
Reflection: not applicable.
Activity mode: recap.

## Revisions

- Devpost refused requests that claimed to be a full browser (403); the fetcher now sends an honest DeadlineBoard user agent and no browser headers, which Devpost accepts.
- Eligibility first matched a licence clause containing "worldwide"; lines about media, licences and trademarks are now ignored, and an explicit list of excluded countries is preferred, with the list quoted.
- A deadline with no year ("Close Jan 7") was read as a past date; dates without a year now roll forward to the next one.
- "Extended deadline Oct 25, festival Oct 29 to Nov 4" picked Nov 4; the date a deadline word points at now wins over the end of a range.
- "UTC+1" was read as plain UTC; numeric offsets are matched first.
