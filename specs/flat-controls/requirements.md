# Flat Controls — Requirements

> **A shadow means "this is an object lying on the table". You do not touch objects
> lying on the table — you touch ink printed on the surface.**

*Written 2026-09-01, from a playtest note asking for the shadows off the buttons and the
stick. Investigating it found the request was not a preference: it was a bug report.*

## The finding that started it

`#stickKnob` carried `box-shadow: 6px 6px 0 var(--ink)` — a hard offset with zero blur,
the same treatment a card gets. On a **circle** that does not read as depth; it reads as
a *second circle*, down and to the right. The resting stick has looked lopsided in every
screenshot since it was drawn, and the first playtest reported it as *"the default fixed
position of the joypad is off"*. It was not off. The anchor was moved in response, which
fixed nothing, because the crescent was the shadow (RD-069).

## The principle

**R1**: A shadow is reserved for things that are objects; controls are markings.
- AC: no `box-shadow` on any button, on the stick base or knob, or on the action button
- AC: cards, the toast and the round card **keep** their hard offset shadow — they are
      paper lying on a table and the shadow is what says so
- AC: the rule is stated somewhere a future contributor will find it before adding a
      shadow to a control, not left to be inferred from the absence of one

**R2**: Pressing something still feels like pressing something.
- AC: the press affordance no longer depends on a shadow, since there is none to move
- AC: every interactive control shares one press language, so a button and the action
      button do not feel like different games
- AC: it reads at arm's length on a phone — a 3% scale alone does not, so the fill
      carries it too
- AC: `prefers-reduced-motion` keeps the feedback and removes the movement

**R3**: The change is visible in the two places it is judged.
- AC: the stick reads as centred in its base, which it always was
- AC: nothing else in the UI moves, resizes or reflows — this is ink, not layout

## Amending visual-direction R10

R10's acceptance criteria include *"fat rounded panels, heavy near-black outline, hard
offset shadow, no soft blur"* as one clause covering the whole UI. It is amended in place
to distinguish panels from controls. **The outline stays everywhere** — it is what makes
the UI and the characters look like the same game, since a character is literally a slab
with ink edges. Only the shadow is scoped.

## Not this spec

New colours, new type, new layout. This changes one property and what replaces it.
