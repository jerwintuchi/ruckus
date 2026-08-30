# Lobby Flow — Design

Satisfies R1–R8. The look of these screens is `specs/visual-direction/` R10–R12; this
document is only what happens.

## The wire gains one message

`create` is a new client intention, sitting beside `join`. Two intentions rather than
one overloaded one, which is what lets `join` stop creating rooms.

| tag | payload | server does |
|---|---|---|
| `create` | `{ name }` | mints an unused code, makes the room, joins, replies `welcome` |
| `join` | `{ code, name }` | joins **an existing room**, or replies `err: NO_ROOM` |

**The single most important change:** `ensureRoom(code)` is retired from the join path.
It is why a typo silently created a ghost room and why two groups typing `PLAY` were
dropped into a match together.

## Minting a code

`newRoomCode()` already draws from the unambiguous alphabet (no I, O, 0 or 1 — codes
are read aloud) and retries against live rooms. It gains one thing:

```ts
CODE_COOLDOWN_MS = 90_000
```

A code from a room that just closed is held back for that long. Without it, a stale
link — a message from ten minutes ago — can drop someone into a room full of strangers
who happen to have been given the same four characters. 32⁴ is about a million codes, so
reserving a handful for ninety seconds costs nothing.

**P1**: a minted code is never live and never recently retired.
**P2**: minting terminates — after a bounded number of attempts it widens rather than
spinning, so a pathologically busy server degrades instead of hanging.

## The client state machine

`src/client/src/flow.ts` — a **pure module**, no DOM, so it can be tested without a
browser (R7). This is the piece that did not exist: the client's screen was implied by
whichever `style.display` had last been written.

```
        ┌──────┐  create   ┌──────────┐ welcome ┌───────┐
        │ MENU │──────────▶│ CREATING │────────▶│ LOBBY │
        │      │  join     ├──────────┤ welcome │       │
        │      │──────────▶│ JOINING  │────────▶│       │
        └──────┘           └──────────┘         └───────┘
            ▲                    │ err               │ intro
            │       err (NO_ROOM)│                   ▼
            └────────────────────┘             ┌──────────┐
            ▲                                  │ IN_MATCH │
            └───────── disconnect ─────────────┴──────────┘
```

```ts
type Screen = "MENU" | "CREATING" | "JOINING" | "LOBBY" | "IN_MATCH";
interface FlowState {
  screen: Screen;
  code: string;          // the room we are in or trying
  codeLocked: boolean;   // true when it arrived from a link (R4)
  error: string | null;
  name: string;
}
reduce(state: FlowState, event: FlowEvent): FlowState
```

**P3** (R6): `reduce` is total — every `(state, event)` pair returns a defined state,
so no sequence of server messages can strand the client. Asserted by feeding random
event sequences and checking the screen is always one of the five.

**P4**: an error returns to the screen that caused it with `code` and `name` intact, so
a mistyped character is corrected rather than the whole thing retyped.

## Screens

| screen | shows | leads to |
|---|---|---|
| **MENU** | name field · **Create room** · **Join room** | CREATING / JOINING |
| **JOINING** | code field (locked if from a link) · Join · Back | LOBBY / error |
| **LOBBY** | the code, large · copy link · players · start | IN_MATCH |
| **IN_MATCH** | the game; the UI gets out of the way | LOBBY |

Arriving at `?room=CODE` starts in **JOINING** with the code filled and locked, so a
shared link is one tap plus a name.

## Sharing

The lobby already copies an invite link, with a selectable fallback for the insecure
context a phone on a LAN actually hits (RD-023). This spec keeps that and adds nothing:
a QR code would be a genuinely good affordance for people in the same room, and it is
generatable in code without breaking the Kit, but it is **out of scope here** and
recorded as a follow-up rather than smuggled in.

## Errors a player can act on

| code | says |
|---|---|
| `NO_ROOM` | "No room with that code — check it, or create your own." |
| `ROOM_FULL` | "That room is full (8 players)." |
| `TOO_FEW` | "You need at least two players." |
| `NOT_HOST` | "Only the host can start." |

**P5**: every error names what to do next. An error that only says what went wrong
leaves a player stuck on a screen with no move.

## What this does not touch

The server's match machine, every minigame, the snapshot protocol, and bots. Bots join
by code, which stays a first-class path — they simply need a room that already exists,
which the host creates.
