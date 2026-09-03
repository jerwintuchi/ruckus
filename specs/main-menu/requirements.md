# Main Menu — Requirements

> **The front door.** A name, a way in, and nothing else competing for the tap.

*Simple, funny, and confident — the aesthetic `visual-direction` already chose (RD-021),
applied to the one screen every player sees before they have any idea what Ruckus is.*

## Requirements

**R1**: The menu asks for one thing and offers two.
- AC: a name field, a **HOST** action and a **JOIN** action — nothing else above the fold
- AC: no room code is invented by a player; hosting mints one (lobby-flow R1, unchanged)
- AC: the name is remembered on the device between sessions, so a returning player taps
      twice rather than typing again
- AC: actions say why they are disabled rather than being silently dead (lobby-flow R9)

**R2**: Options and Exit sit with the menu, not inside the game.
- AC: **Options** opens the same settings panel the in-game menu opens — one panel, one
      implementation (in-game-menu R2), reachable from the main menu
- AC: **Exit** is present and honest: on the web there is nothing to quit to, so it
      returns to a neutral "thanks for playing" state rather than pretending to close a
      process it cannot close
- AC: both are visually subordinate to HOST and JOIN — smaller, quieter, lower

**R3**: It reads as Ruckus in the first second.
- AC: the wordmark is the largest thing on screen and is drawn from the Kit's own
      vocabulary — ink, paper, hard offset shadow (kit-rules)
- AC: one idle motion, and only one: the wordmark settles on load and then rests. A menu
      that keeps moving is a menu that keeps asking for attention
- AC: it holds at 320 px wide and in landscape on a short phone (`arena-framing` R4)
- AC: no colour outside the palette, no hex literal at a call site

**R4**: Every control is thumb-sized and reachable.
- AC: every tappable clears `UI.minTarget` as a COMPUTED value, not merely as a rule
- AC: primary actions sit in the lower half, where a thumb rests, on a phone in portrait
- AC: nothing sits under the notch or the home indicator (`--safe-*`, RD-055)

**R5**: The transitions are deliberate.
- AC: menu → join → lobby are three states of one screen, and each transition is one
      named animation, not an ad-hoc fade
- AC: entrances overshoot and settle; nothing simply fades (visual-direction R10)
- AC: `prefers-reduced-motion` removes movement and keeps the settled position

## The aesthetic, concretely

The Kit is closed — **no image, model or sound file may be added** (RD-001, kit_check).
So "assets" here means things generated in code, and the recommendations are:

| Want | Do this | Not this |
|---|---|---|
| Texture on the paper | `DataTexture` grain the Kit already generates (RD-020) | a .png |
| The wordmark | Kit type + ink outline + hard offset shadow, set in code | a logo file |
| Personality | **motion and copy** — overshoot, a settle, a wry line of text | more colour |
| Depth | the hard offset shadow, used on slabs only (RD-069) | blur, gradients |
| Sound | the existing synthesised voices (RD-068) | an .mp3 |

**Where the funny actually lives: the copy.** Ruckus is a game about eight people
shouting. The menu should sound like it knows that — the tagline, the disabled-button
reasons, the toast wording. That is free, needs no asset, and is the cheapest personality
in the project. It is also the easiest thing to overdo: one joke per screen, never two.

## Not this spec

- **A settings screen of its own.** Options opens the existing panel (in-game-menu R2).
- **Accounts, profiles, cosmetics.** Not a progression game (vision).
- **A tutorial.** If a minigame needs one, it is the wrong minigame (pillar 1).
