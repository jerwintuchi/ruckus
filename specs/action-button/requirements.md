# Action Button — Requirements

> **The button lied.** It was labelled PASS in `hot-potato` and GRAB in `scramble`, and
> in both it was a dash. The bomb transfers on contact and pickups collect on proximity;
> the button had nothing to do with either.

*Written 2026-08-31. The labels were written from the minigames' names rather than from
what `btn` does — my error, in `touch-controls` T1 (RD-034).*

**R1**: The button is named for what it does.
- AC: no label describes a mechanic the button does not drive
- AC: `sweepers` keeps JUMP, which was always correct

**R2**: The dash becomes a tumble.
- AC: the same burst of speed, presented as a roll — the character tumbles rather than
      sliding, so the move reads at phone size
- AC: the animation is procedural, from the existing pose system. No rig, no keyframes,
      no asset (kit-rules.md)
- AC: **it is movement only.** No invulnerability: `hot-potato`'s contact rule and
      `sweepers`' bar clearance keep the balance RD-012 and RD-014 measured

**R3**: `hot-potato`'s button depends on who is holding the bomb.
- AC: the holder's button **throws** the bomb along their facing; everyone else tumbles
- AC: one stick and one button, unchanged (non-negotiable 2). Contextual, not additional.
- AC: a thrown bomb travels, and is caught by the first living player it reaches; if it
      reaches nobody it lands and the nearest player takes it, so a throw can never
      strand the round (I8)
- AC: the pass lock still applies, so a throw cannot be instantly returned

**R4**: The button says which of the two it currently is.
- AC: the label and icon come from the **snapshot**, per player, not from `roundStart`
      per round — the holder and a runner see different buttons at the same instant
- AC: the shell still knows no minigame by name (RD-009): the round sends a verb, the
      UI renders it

**R5**: An icon, not a word.
- AC: the button carries an icon with an accessible label, in the game's ink vocabulary
- AC: **no icon files and no icon dependency.** Icons are SVG paths written in code,
      the same argument as the procedural textures (RD-020, RD-001)

**R6**: The cooldown is visible.
- AC: a ring sweeps as the tumble recharges, with the remaining seconds to one decimal
- AC: at zero the ring is full and the number is gone — a ready button shows no clutter
- AC: the cooldown comes from the snapshot; the client never counts it independently
