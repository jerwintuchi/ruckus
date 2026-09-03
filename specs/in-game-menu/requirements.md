# In-Game Menu — Requirements

> **A way out, and a way to turn it down.** Two things a party game on a borrowed
> phone must have and Ruckus has neither.

*Written 2026-09-01, from the first phone playtest: "a menu or settings in-game would
be nice for volume and option to quit the room/session and also in the main menu".*

## What exists already

A mute button, persisted in `localStorage` under `ruckus.muted` (RD-068). It is the
whole of the audio control surface, and there is **no master gain at all** — every
voice sets its own peak and connects straight to `ctx.destination`. So "volume" is a
new node, not a new slider on an existing one.

## Requirements

**R1**: The menu is one tap away, during a round and everywhere else.
- AC: an icon button sits **top-left**, the one corner no control uses — the stick owns
      bottom-left, the action button bottom-right, the gauges top-centre
- AC: it is present in the lobby, in a live round, and on the round-over card
- AC: it is shell UI, not gameplay input: the stick and the one action button are
      untouched, so **non-negotiable 2 still holds** (a menu button is not a second
      gameplay control)
- AC: it is reachable by tap alone — no gesture, nothing hidden. A party cannot find
      what it cannot see (vision pillar 1)

**R2**: Volume is a stepped control, and mute keeps working.
- AC: four steps — off, low, mid, full — each a tap target, no drag
- AC: a master gain sits between every voice and the destination, so one number
      governs all four sounds and no voice needs changing
- AC: the level survives a reload, like the mute does — it is a device preference, not
      screen state
- AC: **mute and volume are independent**: muting does not destroy the chosen level,
      and unmuting returns to it
- AC: at zero the game is silent by the same path muting uses, not by a second one

**R3**: Quitting leaves the room and returns to the main menu.
- AC: quitting closes the socket — it **is** the disconnect path, not a parallel one,
      so I8's guarantees apply unchanged: the capsule goes inert and is scored
      eliminated at round end
- AC: the round the player left **continues** for everyone else; nothing about quitting
      may end or stall a round
- AC: the quitter lands on the main menu, able to create or join again
- AC: no new server message and no new server state — if this needs either, it is the
      wrong design

**R4**: The menu never changes the round.
- AC: opening it does **not** pause: the server is authoritative and a party game does
      not stop for one player (I1, I7)
- AC: it costs no wire traffic and the server never learns it opened
- AC: while it is open the arena keeps rendering behind it — the round is still worth
      watching, and closing the menu must not reveal a jump

**R5**: It obeys the Kit.
- AC: the panel is a slab with the hard offset shadow; the buttons and segments are
      ink on the surface with none (kit-rules, RD-069)
- AC: no new asset, no new dependency, no drag widget — the segments are the same slab
      construction the rest of the interface uses
- AC: it reads at arm's length on a phone, in landscape and portrait

## Not this spec

- **Pausing.** The server never stops (I1, I7), and a menu that appeared to pause a
  round it could not actually pause would be a lie.
- **Per-sound volumes.** One master level. Four sounds do not need a mixer.
- **Rebinding or graphics settings.** There is one stick, one button and one fixed
  camera; there is nothing to configure.
