# UI Identity — Requirements

> **The game has no name on screen, no sense of who gained, and no shape to the wait.**

*Written 2026-09-01. Three places the UI is currently silent when it has something worth
saying, and all three are dead space rather than crowded space.*

## A name

**R1**: The game says what it is, in its own vocabulary.
- AC: a wordmark on the menu, built from the Kit — slabs, ink edges, the palette. **No
      image file**, which `kit_check` enforces anyway (RD-001)
- AC: it uses the **eight player colours**, because those are the game's actual visual
      system and a wordmark in unrelated colours would be a second one
- AC: it reads at phone size in portrait and landscape, and degrades to plain text if
      the webfont has not loaded — a cold load on a bad connection must still say the
      name
- AC: `prefers-reduced-motion` keeps the wordmark and drops any entrance

## Who gained

**R2**: A scoreboard shows the change, not just the result.
- AC: on the round card and the match card, each score **rolls** from its previous value
      to its new one
- AC: a player who gained nothing does not animate — stillness is the information
- AC: the final value is correct regardless of when the animation is interrupted; a card
      dismissed early must not leave a wrong number behind
- AC: under `prefers-reduced-motion` the numbers are simply correct, immediately

## The shape of the wait

**R3**: The lobby says how many more, without counting.
- AC: eight slots above the roster, filled in each player's colour or empty
- AC: it answers "are we waiting for one more or four" at a glance, which the row list
      does not
- AC: it fits the very short landscape tier, where it is competing with eight rows for
      292 points — if it cannot fit there it does not ship there
- AC: it is derived from the same roster the rows are, so the two cannot disagree

**R4**: Going out is visible on the board, not only in the arena.
- AC: a player eliminated during a round is marked on the round card when it appears
- AC: distinct from *disconnected*, which the board already shows — out and gone are
      different states and must not look the same

## Your colour

**R5**: The **buttons** are yours. The interface around them is not.
- AC: the controls carry the local player's colour — so the lobby dot, the character in
      the arena, the caret above it and the thing under your thumb all agree
- AC: **cards, the ground, body text and the HUD are untouched.** Paper stays paper: the
      panels are the game's identity and a whole interface tinted eight ways is a themed
      skin, not a party game that knows who you are
- AC: **contrast is measured, not hoped for.** These eight were chosen for distinctness
      against an arena and for two colour-blindness types — never as a surface behind a
      label — and at full strength a maroon button with an ink label is **1.72:1**:
  - a button with **text** uses a 45% tint toward paper, ink label — worst case 4.90:1
  - an **icon-only** control keeps the full colour, glyph auto-picked ink or paper by
    luminance — a thick glyph is a graphical object at 3:1, worst case 4.34
- AC: no colour is special-cased. `forest` fails **both** ink and paper at full strength,
      so an automatic light/dark choice alone does not save a text button — which is
      why the tint exists rather than being a nicety
- AC: before a slot exists — menu, join — the controls hold today's highlight, and adopt
      the player's colour at `welcome`
- AC: the palette itself is **not changed**. Retuning eight colours for a role they were
      never chosen for would cost the role they were chosen for

## Not this spec

The flat control language is `specs/flat-controls/`. Finding your own character is
`specs/find-yourself/`. This is the three places the UI has nothing to say and should.
