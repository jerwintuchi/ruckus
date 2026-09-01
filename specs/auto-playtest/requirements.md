# Automated Playtest — Requirements

> **I could not see the game.** Every UI bug this project has shipped was invisible to a
> green test suite and obvious in a photograph, and the only way to get one was to ask
> someone holding a phone.

*Written 2026-08-31, after a day in which nine of eleven bugs were found by a human
looking at a screen, several of them twice.*

## What the test suite could not catch

| | what shipped | what a picture showed |
|---|---|---|
| RD-031 | canvas at twice the viewport | arena in the bottom-right corner |
| RD-042 | a deep link that could not be joined | Join disabled, no field to satisfy it |
| RD-044 | a button stretched to an ellipse | a third of the screen |
| RD-048 | eliminated players hidden | an emptying arena |
| RD-050 | stale frames across a round | dead players invisible for a whole round |

Each had passing tests. The suite verifies logic; none of it looks at the result.

**R1**: The game can be driven without hands.
- AC: a URL parameter joins a room and plays — movement, the action button, a full round
- AC: it drives the **real** client through the **real** join flow. A harness with test
      hooks or a bypass verifies a path no player ever takes
- AC: it is inert without the parameter, and adds nothing to a normal session

**R2**: A picture can be taken of any moment.
- AC: one command produces a screenshot of the running game
- AC: it uses a browser already on the machine — **no new dependency** (kit-rules.md)
- AC: images are written **outside the working tree**, so `kit_check` needs no exception
      and the Kit stays closed

**R5**: Every screen can be photographed, including the ones a live shot races.
- AC: a state that lasts a second or two — a toast, a cooldown sweep, a countdown digit
      — can be held still and photographed
- AC: a state that needs a full lobby, a failed join, or a specific action verb can be
      reached without arranging a match
- AC: it mounts the **real** `Ui` and `Controls` with the real stylesheets. A gallery
      of hand-built lookalikes documents itself, not the game
- AC: every action verb the server can send has a state, since the blank icon (RD-054)
      was a defect only rounds opening on one particular verb could show
- AC: it is a separate entry point and never reaches the game bundle
- AC: it proves **layout, not reachability** — nothing here talks to a server, so it
      cannot catch a state the game fails to arrive at, and says so

**R6**: The DOM is tested by mounting it, not by reading its source.
- AC: the controls and the screens can be constructed in a test and inspected after a
      call, rather than asserted against `CONTROLS_HTML` as a string
- AC: reintroducing RD-042 or RD-054 fails a test — checked by doing it, not assumed
- AC: the DOM environment is opt-in per file, so the suite that needs none stays fast
- AC: it adds no browser-automation package; a DOM implementation is not a browser
- AC: it says what it still cannot answer — jsdom lays nothing out, so **where** a
      thing is remains a question for `gallery.sh` and a phone

**R3**: It is honest about what it cannot answer.
- AC: it renders in software, so it says nothing about frame rate — `bench.html` on a
      real phone remains the only source for that
- AC: it cannot report touch, safe areas, or how anything feels. It replaces the round
      trip for *visual correctness*, not the playtest

**R4**: It never becomes a substitute for playing.
- AC: no spec's manual task is ticked on the strength of a screenshot
