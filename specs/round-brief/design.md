# Round Brief — Design

Satisfies R1–R3.

## The count is derived, not ticked

`intro` already carries `endsAt`. The client renders

```
remaining = endsAt - serverNow()
count     = clamp(ceil(remaining / 1000), 0, COUNT_FROM)
```

and draws the number only while `count` is in `1..COUNT_FROM`. Above it — the first
second of a four-second intro — the card shows the rule alone.

Deriving rather than ticking is what makes a late arrival correct for free: a client
that receives `intro` one second late computes `2`, not `3`, because the deadline is
absolute. A local `setInterval` started on arrival would count everyone to a different
instant.

**P1** (R1): `countdownAt(endsAt, now)` is pure, and clamped at both ends — no negative
number, nothing above `COUNT_FROM`, whatever the clock skew.

**P2** (R2): no new message, and no per-second traffic. The whole feature is one
subtraction on the client.

| name | value | why |
|---|---|---|
| `COUNT_FROM` | 3 | the count asked for |
| `INTRO_MS` | 4000 | unchanged: one second of rule, then three of counting |
