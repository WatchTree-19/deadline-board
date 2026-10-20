---
doc: prd
status: approved
---

# Deadline Board: Product Requirements

A one-page web app for a solo builder who enters many competitions: paste a link, read the facts that decide an entry, keep a board of deadlines. Source: `scope.md > The Unique Kernel`.

## The Core Journey
1. Open the page. The board shows any saved entries; first time, it shows an empty board with a sample link to try.
2. Paste a competition link and press Read.
3. A ticket appears: competition name, closing time in your own time zone with a countdown, whether you can enter from your chosen country, the entry fee, the prize, and what to hand in. Under each answer, the line from the page it came from.
4. Press Add to board. The entry takes its place on the board, ordered by deadline.
5. Come back any time: the board shows live countdowns; change an entry's status (thinking, building, submitted) or remove it. Closed ones drop to the bottom, greyed.

## Screens and Layout
One screen, top to bottom: header with the country picker; the paste box; the ticket (only after a read); the board.

## Look and Feel
Departures board: near-black background, amber and off-white text, monospace for times and countdowns, a clean sans for words. Rows like a flight board. Light mode follows the device with a paper-white version. Works at phone width with no sideways scroll.

## Features and Behavior

### Reading a link
- As a builder, I want the closing time in my time so I never miss a deadline by a time zone.
  - [ ] Shows date and time in the browser's time zone and names that zone
  - [ ] Shows the original wording and its time zone underneath
  - [ ] When the page gives a date with no time zone, says so and assumes the earliest end of that day anywhere (UTC+14), to be safe
- As a builder, I want to know if I can enter from my country.
  - [ ] Yes, no or unclear, with the sentence that decided it
  - [ ] Recognises common names for the country (UK, United Kingdom, Great Britain, England, Scotland, Wales, Northern Ireland)
- As a builder, I want to know if it costs anything to enter.
  - [ ] Free, paid with amount, or not stated, with the quote
- As a builder, I want the list of what to hand in.
  - [ ] Up to eight items taken from the page's requirements or submission section
- [ ] Devpost links also read the /rules page, where eligibility and fees live
- [ ] The prize total when the page states one

### The board
- [ ] Entries sorted by soonest deadline, closed ones last and greyed
- [ ] Countdown updates every second
- [ ] Status per entry: thinking, building, submitted
- [ ] Remove an entry
- [ ] Saved in this browser and back after a reload

## States and Boundaries
- **Empty board**: a short line and a sample link.
- **Reading**: the button shows progress; the page stays usable.
- **Page can't be read** (blocked, not a web page, too big, timed out, private address): a plain message saying why.
- **Answer not found**: "Not found on the page", never a guess presented as fact.
- **Persistence**: the board and country choice live in this browser only.

## Product Decisions
- Pattern rules, not an AI model (agent's call on the learner's delegation): free, no key, and every answer can quote its source line.
- The country defaults to the United Kingdom, the learner's own.
- No-time-zone dates assume the earliest end of day anywhere, so the board errs early.

## What We're Building
The reader, the ticket and the board as above.

## Deferred From the POC
- Reminders (email or calendar file): needs scheduling or a download format, not needed to prove the kernel.
- Pages that only render in a browser: would need a headless browser on the server.

## Possible Later Enhancements
Calendar file export; a shared board link; a feed of new competitions matching your country.

## Non-Goals
- Not a competition search engine.
- No accounts.

## Open Questions
None blocking.
