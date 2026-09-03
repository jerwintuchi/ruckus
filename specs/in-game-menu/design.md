# In-Game Menu — Design

Satisfies R1–R5. Three pieces: a master gain in the audio kit, a panel in the UI, and
a quit that is the disconnect path rather than a new one.

## Master gain (R2)

`Sound` owns one `GainNode` between every voice and the destination. The voices are
not touched — they connect to `ctx.destination`, so `Sound` hands them a **proxy
`Ctx`** whose `destination` is the master gain:

```
blip/thud/sting ──▶ ctx.destination            (a proxy)
                       │
                    master gain ──▶ real destination
```

`Ctx` is already an interface with a `destination` member, so the proxy is a spread and
one override. No voice, and no test of a voice, changes.

| key | value |
|---|---|
| `VOLUME_STEPS` | `[0, 0.35, 0.7, 1]` — off, low, mid, full |
| `VOLUME_KEY` | `ruckus.volume`, holding the **index**, beside `ruckus.muted` |

The index is stored, not the gain: a stored `0.7` would silently become a different
level the day the curve is retuned, and the thing the player chose was "mid".

**Mute and volume stay independent (R2).** `muted` continues to gate `play()` exactly as
it does now; volume only sets the gain. Muting therefore preserves the level, and
unmuting returns to it, with no interaction between the two beyond both ending in
silence. Step 0 is silence by *setting the gain to zero*, not by flipping `muted` —
one concept per control.

## The panel (R1, R5)

A slab overlay, dismissible by its own close button and by the backdrop. It carries:

- **sound** — four segments, each a tap target. The chosen one is filled with the
  player's own colour (`--mine`, ui-identity R5); the rest are outline only.
- **leave the room** — the destructive one, so it is visually separated and last.
- **close** — returns to whatever was behind.

The opener is an `.iconbtn` in the HUD's top-left, the same construction as the mute
button. It is added to the HUD row, which already carries safe-area padding, so notches
and the URL bar are handled by rules that already exist.

## Quitting (R3)

```
onQuit → sound.unlock-safe teardown → net.close() → flow: back to MENU
```

`net.close()` is the whole of it. The server's disconnect handler already:

- marks the runtime inert and scores it eliminated at round end (I8)
- broadcasts the new room view to everyone still in it
- retires the room when the last player leaves, with the code cooldown (RD-024)

So **no server file changes**, no new message, and no new state. A voluntary leave and
a dropped connection are the same event, which is the point: two code paths for one
outcome is how the second one rots.

The client resets to `initialState()` so the main menu is genuinely fresh — a stale
room code left in the reducer is the shape of RD-050 in another channel.

## Correctness properties

- **P1** — Volume and mute are independent: setting one never reads or writes the other.
- **P2** — The stored value is the step index, and an out-of-range or corrupt stored
  value falls back to full rather than to silence. A game that starts silent because
  `localStorage` returned rubbish is indistinguishable from a game that is broken.
- **P3** — Quitting sends no new message type and touches no server source file.
- **P4** — Opening the menu changes no game state: no wire traffic, no predictor
  interaction, no effect on the round.
- **P5** — The panel is a slab (shadow); every control inside it has none (RD-069).
- **P6** — The opener never overlaps a gameplay control at any supported size.

## What the menu does NOT do

It does not pause. The round runs behind it, the predictor keeps predicting, and the
stick keeps being read — a player who opens the menu mid-round is standing still in a
live arena and will probably lose it. That is the honest behaviour: the alternative
looks like a pause and is not one, because the server never stopped (I1).
