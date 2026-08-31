# Lobby Flow — Tasks

The look of these screens is `specs/visual-direction/` T13–T17. These tasks are the
behaviour; where they render something, they render it in that spec's idiom rather than
inventing a second one.

## Phase A — the wire and the server

- [x] T1 [R1, R8] — A `create` message in `src/shared/src/protocol.ts`
  Test: `protocol.test.ts` — `create` parses with a name and is rejected without one;
  a malformed `create` returns null rather than throwing, like every other tag

- [x] T2 [R1, P1, P2] — Minting with a cooldown in `src/server/src/net.ts`
  Test: `net.test.ts` — a minted code is never a live room's; a code retired inside
  `CODE_COOLDOWN_MS` is not reissued; minting terminates under contention rather than
  spinning; the alphabet still excludes I, O, 0 and 1

- [x] T3 [R3] — `join` stops creating rooms
  Test: `net.test.ts` — joining an unknown code returns `NO_ROOM` and creates nothing;
  joining a live room still works; **a typo can no longer produce a ghost room**, which
  is the defect this whole spec exists for

- [x] T4 [R3] — Code normalisation
  Test: `protocol.test.ts` — lower case, surrounding whitespace and dashes all resolve
  to the same code; a code that is not four characters after cleaning is `BAD_CODE`

## Phase B — the client state machine

- [x] T5 [R6, R7, P3, P4] — `reduce` in `src/client/src/flow.ts`, pure and DOM-free
  Test: `flow.test.ts` — the full happy path for create and for join; an error returns
  to its own screen with the input intact; a disconnect returns to MENU; property:
  random event sequences never leave the screen outside the five legal values

- [x] T6 [R4] — Deep link handling
  Test: `flow.test.ts` — `?room=CODE` starts in JOINING with the code filled and
  locked; a locked code cannot be edited; a dead room from a link errors into MENU with
  an explanation rather than a dead end

## Phase C — the screens

- [x] T7 [R1, R2, R5] — Menu, join and lobby screens driven by `flow.ts`
  Test: `ui.test.ts` — the menu offers create and join; the lobby shows the code, the
  copy control, and every player's colour, name and connected state; the host is marked

- [x] T8 [R5] — The start control explains itself
  Test: `ui.test.ts` — it says "waiting for one more" below two players; it is offered
  only to the host; a non-host is told who they are waiting for, by name

- [x] T9 [R2] — Sharing, carried over from RD-023
  Test: `ui.test.ts` — the invite link contains the code; the insecure-context fallback
  offers a selectable link rather than failing silently

- [x] T10 [P5] — Errors that name the next move
  Test: `ui.test.ts` — every `ErrCode` maps to a message; each one says what to do, not
  only what went wrong

## Phase D — the theme

- [x] T11 — Apply `specs/visual-direction/` R10–R12 to these screens: flat fill, heavy
  ink outline, hard offset shadow, overshoot entrances, the game's own player colours
  Test: `kit.test.ts` (visual-direction T13) covers the primitives; `screens.test.ts`
  covers the screens built from them. Done by doing visual-direction Phase D first,
  which subsumed this rather than inventing a second visual system to throw away.

## Phase E — close

- [x] T13 [R9] — `nameState` and `createState` in `src/client/src/flow.ts`, and a live
  listener on the name field
  Test: `flow.test.ts` — a name under 2 characters is rejected with a note saying what
  is missing; 2 and 12 are accepted and 13 is trimmed; `createState` and `joinState`
  both refuse without a valid name; every refusal carries a non-empty note, asserted
  over the whole space rather than at one example

- [x] T14 [R10] — One-tap copy in `src/client/src/ui/screens.ts`
  Test: `screens.test.ts` — the control is an icon button with an accessible label; a
  successful copy shows a transient banner and no link text; the **fallback order** is
  clipboard, then `execCommand`, then selectable text, asserted against the source
  because a secure context cannot be faked in a unit test and the order is the part
  that matters over plain http

- [x] T15 [R11] — Arrivals and departures in `src/client/src/main.ts`
  Test: `flow.test.ts` — `rosterChange(before, after)` names who joined and who left,
  is empty when nothing changed, and is a pure function of the two rosters

- [x] T16 [R12] — The match result says the room stays open
  Test: `screens.test.ts` — the match-result card names the winner and says another
  match can start; `match.test.ts` already proves round and scores reset, and this
  task adds no server behaviour

- [x] T17 [R13] — `standings` in `src/client/src/flow.ts`, and the two result cards
  Test: `flow.test.ts` — `standings` ranks every player including zero-scorers, breaks
  ties by slot so it is stable, and is a pure function; `screens.test.ts` — the round
  card lists a player who scored nothing, the match card lists every player and not
  just the winner, and the local player's row is marked in both

- [x] T18 [R13] — Eight rows fit a short landscape phone
  Test: `kit.test.ts` — the result card is bounded and scrolls internally rather than
  growing past the viewport, under the short-viewport query T17 already establishes

- [ ] T12 — Played for real: create a room on one device, join it from another by the
  link, play a round, and have someone leave and come back
  Test: manual, via `pnpm playtest`. The questions are whether the code is readable
  across a room and whether a returning player lands back where they expect.
