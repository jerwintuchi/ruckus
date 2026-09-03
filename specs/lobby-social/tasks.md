# Lobby Social — Tasks

- [x] T1 [R1, P5] — `ready` on the server, in `src/server/src/room.ts`
  Test: `room.test.ts` — readying sets it; un-readying clears it; a disconnect clears it;
  `ROUND_START` clears everyone's; a roster change clears the gate (R2)

- [x] T2 [R2, P2] — The start gate, on the server as `Room.allReady()`
  *(moved from `flow.ts`: the gate is a fact about the roster, and the roster is the
  server's. The client renders `allReady`, it does not recompute it — I1.)*
  Test: `lobby-social.test.ts` — open only when every connected player is ready; a late
  joiner closes it; a disconnected unready player does not hold it open; the host is
  ready by definition and cannot be un-readied

- [x] T3 [R3, P1] — Colour claiming, in `src/server/src/room.ts`
  Test: `room.test.ts` — property: over random interleavings of claims from 8 players, no
  two connected players ever hold the same colour; a colour outside the palette is
  refused; leaving releases it; the refusal replies to one socket and broadcasts nothing

- [ ] T4 [R5, P4] — Kick, in `src/server/src/net.ts`
  Test: `net.test.ts` — a host kick puts the room in exactly the state a disconnect would;
  a non-host kick is ignored with a reply and no broadcast; the host cannot kick
  themselves; host handover on the host leaving is unchanged

- [ ] T5 [R1, R3, R5] — The three messages, in `src/shared/src/protocol.ts`
  Test: `protocol.test.ts` — each is parsed and validated; each is refused outside `LOBBY`;
  malformed payloads are dropped rather than throwing (R10's clamp-never-reject rule)

- [x] T6 [R6, P3] — No lobby message can stall the room
  Test: `room.test.ts` — property: 1000 random ready/colour/kick messages, valid and
  malformed, in random order, leave the room startable and the roster consistent

- [ ] T7 [R1, R2] — The READY and START controls, in `src/client/src/ui/screens.ts`
  Test: `lobby.dom.test.ts` — mounted: READY toggles and shows its state; START is absent
  for a non-host, present and disabled for the host until all are ready, and carries its
  reason as text; both clear the 44px tap floor as COMPUTED

- [ ] T8 [R3] — The colour row, in `src/client/src/ui/screens.ts`
  Test: `lobby.dom.test.ts` — mounted: eight swatches; a taken one is inert and visibly
  unavailable; tapping a free one sends exactly one `colour`; tapping a taken one sends
  nothing; the row sits below the roster and above the actions

- [ ] T9 [R4] — Join / leave / removed toasts, in `src/client/src/ui/screens.ts`
  Test: `lobby.dom.test.ts` — mounted: a roster diff produces one toast naming the player
  in their own colour; a player's own arrival produces none; four arrivals at once produce
  one combined toast rather than four; a name with markup in it is escaped

- [ ] T10 [R5] — The removed player's landing, in `src/client/src/main.ts`
  Test: `lobby.dom.test.ts` — mounted: a kicked client lands on the main menu with the
  reason shown, per-round state torn down (RD-050), and the code still joinable

- [ ] T11 [R1–R5] — Played on a phone, at a full lobby, on more than one device
  Test: manual. Does the room feel like it is waiting for you, or nagging you? Is the
  colour row obvious enough to use and quiet enough to ignore? Does a kicked player
  understand what happened without being told by the person who kicked them?
