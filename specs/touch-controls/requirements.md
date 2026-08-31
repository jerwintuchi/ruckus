# Touch Controls — Requirements

> **One thumb, and you can see it.** The stick and the button exist in the input code
> and have never been drawn. A control nobody can see is not a control.

*Written 2026-08-31, from the first phone playtest of `visual-direction` T19.*

## The problem, stated exactly

`InputController` has worked the whole time: the left half of the screen plants a stick,
the right 40% is the button. `stickView` computes exactly where to draw it — and
**nothing in the codebase reads `stickView`.** It is dead code. The playtester moved and
passed the bomb by discovering unmarked screen regions, which is the precise opposite of
vision pillar 2, "anyone can be handed a phone mid-match and play the next round without
instruction."

## The stick

**R1**: The stick is visible before it is touched.
- AC: a resting stick base is drawn in the lower-left whenever a round is playable, so a
      player who has never seen the game knows the left side is a stick
- AC: touching anywhere in the left zone re-plants the stick under the thumb and lights
      it up — the thumb is never asked to travel to a fixed spot
- AC: the drawn position matches `stickView` exactly; the picture and the input can
      never disagree about where the stick is

**R2**: The stick reads at arm's length on a phone.
- AC: it is drawn in the game's own ink-and-paper vocabulary, so it belongs to the same
      world as the characters (`visual-direction` R10)
- AC: it never obscures the arena more than it must — it sits in the thumb corner, and
      it is translucent at rest
- AC: it costs no asset (kit-rules.md) and nothing per frame beyond what it already draws

## The button

**R3**: The button says what it does.
- AC: a minigame declares its own word — JUMP, PASS, GRAB — and the button shows it
- AC: the shell reads that word from the contract and **no minigame id appears anywhere
      in the UI source** (RD-009 holds)
- AC: it is legible in five seconds by someone who has never played (vision pillar 1)

**R4**: The button appears only when there is one.
- AC: a `stick` minigame draws no button at all; `stick+button` draws exactly one
- AC: the input budget is unchanged — one stick, at most one button, no camera control
      (non-negotiable 2). This spec draws the existing budget; it does not widen it.

**R5**: Both controls are reachable and honest about their hit area.
- AC: every control is at least 44 px on its shortest side (`visual-direction` R11)
- AC: the drawn button and its touch region are the same region — today the button is
      "the right 40% of the screen", which no drawn circle would honestly represent
- AC: controls sit inside `env(safe-area-inset-*)`, clear of the home indicator

## Not this spec

Camera framing, safe-area insets for the HUD, and the portrait prompt are
`specs/arena-framing/`.
