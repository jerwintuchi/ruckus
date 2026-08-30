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

- [ ] T11 — Apply `specs/visual-direction/` R10–R12 to these screens: flat fill, heavy
  ink outline, hard offset shadow, overshoot entrances, the game's own player colours
  Test: `ui-kit.test.ts` (visual-direction T13) covers the primitives; here, assert the
  menu, join and lobby screens are built from them rather than from ad-hoc styles

## Phase E — close

- [ ] T12 — Played for real: create a room on one device, join it from another by the
  link, play a round, and have someone leave and come back
  Test: manual, via `pnpm playtest`. The questions are whether the code is readable
  across a room and whether a returning player lands back where they expect.
