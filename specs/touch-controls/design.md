# Touch Controls — Design

Satisfies R1–R5.

## Where they are drawn

A DOM overlay, not the canvas. The UI kit already draws ink-outlined, hard-shadowed
shapes in CSS (`visual-direction` T13) and the controls belong to that family; putting
them in the scene would mean camera-facing geometry, which is the one thing the
character spec forbids for good reason.

`src/client/src/ui/controls.ts`, driven from the same render loop that already reads
`input.stickView` — so the drawn stick is a function of the input state and cannot
drift from it.

**P1** (R1): the drawn stick position is `stickView` verbatim. Asserted, because a
control that lies about where it is, is worse than no control.

## The touch regions become honest

Today: left half plants the stick, `clientX > innerWidth * 0.6` is the button. That is a
40% invisible slab, and no drawn button could honestly represent it.

The button becomes a real element with a real hit area, and `InputController` learns the
button from the DOM rather than from a screen fraction:

```
stick zone  = everything left of the button, minus the UI controls
button      = the drawn element's own touch target
```

This keeps RD-029's rule intact — a touch that starts on a control belongs to the
control — and makes the button one of those controls.

**P2** (R5): drawn region and hit region are the same region, asserted rather than
eyeballed.

**P3** (R4): with `input: "stick"` no button element exists at all, so there is nothing
to press and nothing to explain.

## The label

`Minigame` gains one optional field beside `rule` and `input`:

```ts
/** The word on the action button. Required when `input` is 'stick+button'. */
buttonLabel?: string;
```

| minigame | input | buttonLabel |
|---|---|---|
| `falling-floor` | `stick` | — |
| `hot-potato` | `stick+button` | `PASS` |
| `sweepers` | `stick+button` | `JUMP` |
| `scramble` | `stick+button` | `GRAB` |

It travels on the existing `roundStart` message, next to `rule`, so the UI receives a
word and never a minigame id (RD-009).

**P4** (R3): every `stick+button` minigame declares a label, enforced by a test over the
registry rather than by discipline — the next minigame cannot forget.

## Constants

`src/client/src/ui/controls.ts`

| name | value | why |
|---|---|---|
| `STICK_REST_OPACITY` | 0.35 | present enough to be found, faint enough to not fight the arena |
| `BUTTON_MIN_PX` | 72 | comfortably over the 44 px floor; this one is pressed under pressure |
| `STICK_BASE_PX` | 132 | matches `STICK_RADIUS`'s 60 px throw, plus the knob |
