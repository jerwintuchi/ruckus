# Round Brief — Requirements

> **Every round starts with a count.** The rule card already appears for four seconds
> before a round; nothing tells you how long you have, or that the round is about to
> start at all.

*Written 2026-08-31, from the phone playtest that followed RD-035.*

**R1**: Every round begins with a visible three-second count.
- AC: the rule card shows `3`, then `2`, then `1`, one per second, in the last three
      seconds before play
- AC: the first second stays a plain card, so the rule has time to be read before the
      count starts pulling the eye — vision pillar 1 gives a rule five seconds to land
      and a bare countdown competes with it
- AC: the count is driven by the server's `endsAt`, not by a local timer started on
      arrival, so a late-joining client counts to the same instant everyone else does
- AC: it never shows a negative number, or a number above 3, however late the message
      arrives or however far the clocks differ

**R2**: The count costs no new wire message.
- AC: `intro` already carries `endsAt`; the client derives the number from it
- AC: no per-second traffic — the server says when, once, and the client counts

**R3**: Motion is emphasis, never the message.
- AC: each number lands with the same overshoot-and-settle the UI already uses (R10)
- AC: under `prefers-reduced-motion` the numbers still change, without animation

**R4**: Every player counts to the same instant, on their own clock.
- AC: the wire carries a **duration**, never a wall-clock instant — two devices that
      disagree about the time must not disagree about the countdown
- AC: the client adds it to a **monotonic** clock, so an OS clock step cannot lurch it
- AC: each number is on screen for exactly one second; none is held for two
- AC: the intro is at least `COUNT_FROM` seconds long, so the first number is not clipped

*Found in a two-player playtest: the host counted 3-2-1 unevenly and the second player's
phone opened the intro already on "1" and lost it immediately (RD-065).*
