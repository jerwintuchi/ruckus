# Lobby Social — Design

## Data model

`Room.Player` gains two fields; both are server-owned and neither is persisted (I7).

```ts
interface Player {
  // ...existing
  ready: boolean;      // R1
  colour: string;      // already exists — becomes CLAIMED rather than assigned (R3)
}
```

Readiness is cleared on `ROUND_START` and whenever the roster changes, so R2's "a late
joiner closes the gate again" falls out of the model rather than being special-cased.

## Colour claiming

The palette is the authority, not a free-text field. A claim is:

```
claim(slot, colour):
  reject unless colour is in PLAYER_COLOURS          (I2, closed set)
  reject if held by another CONNECTED player         (R3)
  otherwise: assign, broadcast the room
```

Server-authoritative and synchronous, so the "two players, same tick" case (R3) is settled
by arrival order at the socket and cannot produce a duplicate: the second claim finds the
colour held and is refused. **The refusal is a reply to that socket, not a broadcast** —
the loser is told, the room is not.

Release on leave is the same code as the slot release RD-100 added: a colour is held by a
connected player or by nobody.

## Wire

```jsonc
{ "t": "ready",  "on": true }            // client -> server
{ "t": "colour", "c": "#1ab0ff" }        // client -> server, from the closed palette
{ "t": "kick",   "slot": 3 }             // client -> server, host only
```

No new server→client message. All three change room state, and the room is already
broadcast as `{ t: "room", players, host, state }` — `PlayerView` gains `ready`. Toasts
(R4) are derived on the client by diffing successive rosters, which is how the existing
join/leave notice already works: **the server does not narrate.**

That is a deliberate choice with a cost. A client that misses a `room` message misses the
toast for it. The alternative — an event message per arrival — is more wire and a second
source of truth for something the roster already says. Rosters are small, sent rarely, and
idempotent; a missed toast is a missed pleasantry, not a missed rule.

**Validation (I2), for each:** shape checked against the shared type; `ready` only in
`LOBBY`; `colour` only in `LOBBY` and only from the palette; `kick` only from the host,
only in `LOBBY`, never targeting the host. Every failure replies to the one socket and
mutates nothing.

## Correctness properties

- **P1 — No duplicate colours.** For any interleaving of claims, no two connected players
  hold the same colour. Property-tested over random interleavings.
- **P2 — The gate is exactly "all connected are ready".** START's enabled state is a pure
  function of the roster; asserted directly rather than by driving the DOM.
- **P3 — No lobby message can stall.** Any sequence of ready/colour/kick messages, valid
  or not, leaves the room able to start (R6).
- **P4 — Kick is the disconnect path.** After a kick, the room is in exactly the state it
  would be in had that player closed their browser (R5) — so I8 needs no new reasoning.
- **P5 — Readiness is reset, never remembered.** No sequence of join/leave/ready leaves a
  disconnected player holding the gate open or closed.

## Layout

The lobby is one card. Order top to bottom, because a phone is read top to bottom:

```
  ROOM  R7ZK   [copy]  [settings]
  ────────────────────────────────
  ● jerwin      host · you   READY
  ● sam                      ready   [x]
  ○ alex                     …       [x]
  ────────────────────────────────
  your colour  ● ● ● ○ ● ● ● ●      <- taken ones dimmed and inert
  ────────────────────────────────
  [        READY        ]            <- a player's own primary action
  [        START        ]            <- host only, disabled + reason
```

The colour row sits **below** the roster and above the actions: it is a decision made
once, and it must not compete with READY, which is the action taken every match.

## Cost

`PlayerView` gains one boolean — one byte on a message sent a handful of times per match,
not per tick. Three new client→server messages, each sent at most a few times per lobby.
**Nothing is added to the snapshot**, so the per-tick budget (I5) is untouched.
