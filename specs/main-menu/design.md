# Main Menu — Design

## Structure

One screen, three states, already modelled by `flow.ts` as `MENU | JOINING | LOBBY`. This
spec adds no state — it changes what those states *look* like and where Options and Exit
live.

```
        ┌────────────────────────────┐
        │                            │
        │        R U C K U S         │   wordmark: ink, hard shadow, settles once
        │  8 players · 10 minutes    │   tagline: one wry line
        │                            │
        │   ┌──────────────────┐     │
        │   │ your name        │     │   remembered on the device
        │   └──────────────────┘     │
        │                            │
        │   [      HOST      ]       │   primary, lower half
        │   [      JOIN      ]       │   primary
        │                            │
        │    options      exit       │   subordinate: smaller, quieter, lower
        └────────────────────────────┘
```

## Motion

Three named animations, defined once in the Kit and reused, so "the transitions" are a
vocabulary rather than a pile of one-offs:

- **`settle`** — enter past the target and come back (the Kit's existing overshoot). The
  wordmark on load, cards on appear.
- **`swap`** — menu ↔ join: the outgoing state leaves the way the incoming one arrives, so
  the two read as one surface moving rather than two screens crossfading.
- **`press`** — `UI.pressScale` + `UI.pressInk`, already defined (RD-069). Controls take
  ink and shrink; they never gain a shadow.

Under `prefers-reduced-motion` all three collapse to their settled state — **the position
is kept, only the movement is dropped**, which is the rule the Kit already states and
which `kit.test.ts` already guards.

## Name persistence

`localStorage`, beside the mute and volume preferences that already live there (RD-068),
behind the same try/catch — a private window or blocked storage must not break the menu.
A stored name is a convenience, never state the game depends on: the field is the truth,
storage only pre-fills it.

## Exit, honestly

There is no process to close. `Exit` returns to a neutral end state with a way back in —
it does not call `window.close()` (which is a no-op for a page the user navigated to) and
it does not pretend. On a page opened from a shared link, "exit" leaving a dead tab is
worse than "exit" showing a door back.

## Correctness properties

- **P1 — No new flow state.** The reducer's state set is unchanged; this spec is layout,
  motion and placement only. Asserted by the existing `flow.test.ts` totality tests.
- **P2 — One settings panel.** The panel opened from the menu and the one opened in-game
  are the same component with the same handlers (in-game-menu R2).
- **P3 — Storage is optional.** With `localStorage` throwing on every access, the menu
  renders, accepts a name, and hosts a room.

## Cost

No wire change, no server change, no per-frame cost. The wordmark is type and one shadow;
it is not geometry and never enters the render loop.
