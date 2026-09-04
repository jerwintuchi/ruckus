/**
 * The paper UI kit (visual-direction T13, R10–R11).
 *
 * A panel is a character slab at interface scale: flat fill, a heavy ink outline, and
 * a **hard** offset shadow with no blur. That shared construction is the whole reason
 * the menus and the world read as one thing rather than two — see
 * `specs/visual-direction/design.md`.
 *
 * Everything here is CSS and tokens. No images, no icon font, nothing loaded (RD-001);
 * the two typefaces come from Google Fonts, which is a runtime CDN dependency rather
 * than an asset file, with a declared fallback.
 */
import { PAPER, PLAYER_COLOURS, readableInk, tint } from "../kit/palette.ts";

/** Construction constants, exported so the tests assert the real numbers. */
export const UI = {
  /** Outline weight. Thick enough to read as ink at arm's length on a phone. */
  outline: 4,
  /** Offset of the hard shadow. Zero blur is what makes it a printed card. */
  shadowOffset: 6,
  radius: 20,
  /** Cards that arrive one at a time sit slightly off-square, like a dealt hand. */
  tilt: 1.2,
  /** The smallest side of anything you can tap. Below this, thumbs miss. */
  minTarget: 44,
  /**
   * How far a control shrinks when pressed (flat-controls R2).
   *
   * The shadow used to be the affordance: the slab travelled toward the table. With
   * no shadow there is nothing to travel, so this is the half that is FELT — and the
   * half `prefers-reduced-motion` removes, which is why the fill darkens too.
   */
  pressScale: 0.94,
  /** How much ink soaks into a pressed control. The half that is SEEN. */
  pressInk: 0.16,
} as const;

export const FONT_LINK =
  "https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Nunito:wght@400;600;800&display=swap";

/**
 * The stylesheet.
 *
 * Written as one string rather than per-component style objects so the cascade is
 * readable in one place — specificity fights between a `.card` and a `.btn` over their
 * own padding is exactly the bug this avoids.
 */
export const UI_CSS = `
:root{
  --ink:${PAPER.ink};
  --card:${PAPER.card};
  --card-dim:${PAPER.cardDim};
  --ground:${PAPER.ground};
  --text:${PAPER.text};
  --text-dim:${PAPER.textDim};
  --highlight:${PAPER.highlight};
  /* The four safe-area insets, once, so every rule spends them by name.
     Indirected through a variable rather than calling env() at each site so the
     screenshot harness can substitute a real phone's measured values — a desktop
     browser reports 0 on all four sides and cannot be told otherwise (RD-055). */
  --safe-top:env(safe-area-inset-top);
  --safe-right:env(safe-area-inset-right);
  --safe-bottom:env(safe-area-inset-bottom);
  --safe-left:env(safe-area-inset-left);
  /*
   * Your colour, on the CONTROLS only (ui-identity R5).
   *
   * Three properties, written once when a slot is known and holding the highlight
   * before that. Not threaded through every rule: one write and every control that
   * spends them follows. Cards, the ground, body text and the HUD never touch these —
   * a whole interface tinted eight ways is a themed skin, not a game that knows who
   * you are, and a test enforces the boundary rather than trusting it.
   */
  --mine:${PAPER.highlight};
  --mine-tint:${PAPER.highlight};
  --mine-ink:${PAPER.ink};
  --outline:${UI.outline}px;
  --radius:${UI.radius}px;
  --shadow:${UI.shadowOffset}px ${UI.shadowOffset}px 0 var(--ink);
}
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;height:100%;overflow:hidden;background:var(--ground);color:var(--text);
  font-family:Nunito,ui-rounded,system-ui,-apple-system,sans-serif;
  -webkit-user-select:none;user-select:none;touch-action:none;
  -webkit-font-smoothing:antialiased}
/*
 * The canvas MUST be given a CSS size.
 *
 * A canvas is a replaced element: with width:auto its layout size comes from its
 * INTRINSIC size — the drawing-buffer attributes the renderer sets — not from inset:0.
 * On a DPR-1 desktop the buffer equals the CSS size and it looks perfect; on a 3x phone
 * the canvas laid out at twice the viewport, anchored top-left, so the arena's centre
 * sat off the right edge and only its corner was visible. Every "the camera is off"
 * report was this, and the camera was correct throughout (RD-031).
 */
canvas{display:block;position:fixed;inset:0;width:100%;height:100%}

/*
 * Safe areas (arena-framing T4, R4).
 *
 * viewport-fit=cover in index.html is what makes these env() values non-zero; on its
 * own it only means content slides UNDER the browser's chrome and the notch, which is
 * what the first phone playtest photographed — the HUD sitting beneath Safari's URL
 * bar. The padding is what actually keeps things clear of it. In landscape the notch
 * is at the SIDE, so all four sides are inset, not just the top.
 */
.overlay{position:fixed;inset:0;z-index:10;display:flex;align-items:center;
  justify-content:center;flex-direction:column;gap:14px;pointer-events:none;
  text-align:center;
  padding:calc(16px + var(--safe-top)) calc(16px + var(--safe-right))
          calc(16px + var(--safe-bottom)) calc(16px + var(--safe-left))}

/* A panel IS a slab: flat fill, ink outline, hard offset shadow, no blur. */
.card{pointer-events:auto;background:var(--card);color:var(--text);
  border:var(--outline) solid var(--ink);border-radius:var(--radius);
  box-shadow:var(--shadow);padding:20px 24px;
  display:flex;flex-direction:column;gap:11px;
  min-width:min(300px,88vw);max-width:min(430px,92vw)}
.card.tilt{transform:rotate(-${UI.tilt}deg)}

/* The wordmark: letters dealt like a hand, in the roster's own colours (R1). */
h1.mark{display:flex;justify-content:center;gap:.02em}
h1.mark .ch{display:inline-block;
  transform:rotate(calc((var(--i) - 2.5) * 1.6deg)) translateY(calc(var(--i) * .5px));
  -webkit-text-stroke:2px var(--ink);paint-order:stroke fill}
/* Eliminated, which is not the same as absent: present and finished. */
.row.out .nm{text-decoration:line-through;text-decoration-thickness:2px}
.row.out .dot{opacity:.45}
h1{font-family:Fredoka,ui-rounded,system-ui,sans-serif;font-weight:700;
  font-size:clamp(30px,7vw,42px);letter-spacing:-.01em;margin:0;line-height:1}
h2{font-family:Fredoka,ui-rounded,system-ui,sans-serif;font-weight:600;
  font-size:21px;margin:0;line-height:1.1}
.tagline{color:var(--text-dim);font-size:13.5px;margin:0}
.dim{color:var(--text-dim);font-size:13px;min-height:16px}

button,input{font:inherit;border-radius:14px;min-height:${UI.minTarget}px}
/*
 * A control is INK PRINTED ON THE SURFACE, not an object lying on it (RD-069).
 *
 * No shadow: a hard zero-blur offset says "this is a slab above the table", which is
 * true of a card and false of a button you press. On the stick's knob it was worse than
 * untrue — on a circle it read as a second circle, and the resting stick looked
 * lopsided from the day it was drawn.
 *
 * The --fill variable exists so the press can darken whatever the control happens to be
 * filled with — the highlight today, the player's own colour once ui-identity lands —
 * without either rule knowing about the other.
 */
button{font-family:Fredoka,ui-rounded,system-ui,sans-serif;font-weight:600;font-size:18px;
  --fill:var(--mine-tint);
  color:var(--ink);background:var(--fill);
  border:var(--outline) solid var(--ink);
  padding:11px 26px;cursor:pointer;
  transition:transform .07s ease-out,background .07s ease-out}
button:active:not(:disabled){transform:scale(${UI.pressScale});
  background:color-mix(in srgb, var(--fill) ${Math.round((1 - UI.pressInk) * 100)}%, var(--ink))}
button:disabled{background:var(--card-dim);color:var(--text-dim);cursor:default}
button.ghost{--fill:transparent;background:transparent;font-size:14px;font-weight:500;
  color:var(--text-dim);border-width:2px;padding:8px 16px}
/* A ghost has no fill to darken, so its ink is what deepens. */
button.ghost:active:not(:disabled){transform:scale(${UI.pressScale});color:var(--ink)}

input{background:#fff;color:var(--text);border:3px solid var(--ink);
  padding:10px 14px;text-align:center;width:100%}
input::placeholder{color:var(--text-dim)}
.codeinput{font-family:Fredoka,sans-serif;font-size:30px;font-weight:700;
  letter-spacing:.26em;text-indent:.26em;text-transform:uppercase}
.codeinput:read-only{background:var(--card-dim)}
.linkbox{grid-column:1/-1;font-size:12px;letter-spacing:0;text-transform:none;font-weight:400}

/*
 * The room code: the one thing in the lobby that gets read across a room.
 *
 * The copy button sits BESIDE the code, not under it. Stacked, it cost a whole 44px
 * row, and on a landscape phone with eight players that row was the one that pushed
 * "waiting for X to start" off the bottom of the card. Its offset shadow also landed
 * on the divider rule underneath. A grid does it without touching the markup: the
 * label and the link box span EVERY column, so the code and the icon buttons are the
 * only things that share a line. One column per icon button: auto-placement wrapped the
 * mute button onto a row of its own the moment it was added, which cost the row the
 * footer needed (audio T2).
 */
/* Eight slots: the shape of the wait, without counting rows (ui-identity R3). */
.slots{grid-column:1/-1;display:flex;justify-content:center;gap:5px;padding-top:3px}
.slot{width:14px;height:14px;border-radius:5px;border:3px solid var(--ink);
  background:transparent}

.codeblock{display:grid;grid-template-columns:auto auto auto;
  align-items:center;justify-content:center;column-gap:6px;row-gap:3px;
  padding-bottom:10px;border-bottom:3px solid var(--ink)}
.codelabel{grid-column:1/-1;
  font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--text-dim)}
.code{font-family:Fredoka,sans-serif;font-size:clamp(38px,11vw,52px);font-weight:700;
  letter-spacing:.2em;text-indent:.2em;line-height:1;font-variant-numeric:tabular-nums}

.row{display:flex;align-items:center;gap:10px;padding:5px 2px}
.row.gone{opacity:.42}
/* Your own row, so a board of eight is readable at a glance (R13). */
.row.me{background:var(--card-dim);border-radius:10px;padding-left:6px;padding-right:6px}
.row.me .nm{font-weight:800}
.dot{width:15px;height:15px;border-radius:5px;border:2px solid var(--ink);
  display:inline-block;flex:0 0 auto}
.nm{flex:1;text-align:left;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sc{font-variant-numeric:tabular-nums;font-weight:800}
/*
 * A capped-width block in a stretch column has to centre itself.
 *
 * The card is a flex column with the default align-items:stretch, so a child is full
 * width unless it says otherwise — and max-width then anchors the narrowed box to the
 * START edge. The text inside still centred, against the left-hung box, so "that room
 * is full" sat visibly off to one side of the card while looking almost right. The
 * rule text has carried margin:0 auto for this reason since it was written; this never
 * did.
 */
.err{color:#c0281a;font-size:13.5px;min-height:17px;max-width:28ch;font-weight:600;
  margin-inline:auto}

.big{font-family:Fredoka,sans-serif;font-weight:700;font-size:clamp(26px,6.5vw,34px);line-height:1.05}
.rule{font-size:clamp(15px,4vw,18px);color:var(--text);max-width:26ch;margin:0 auto}

/* An icon button: the same slab, sized for a thumb rather than a sentence. */
.iconbtn{width:${UI.minTarget}px;height:${UI.minTarget}px;min-height:${UI.minTarget}px;
  padding:0;display:inline-flex;align-items:center;justify-content:center;
  --fill:var(--mine);
  background:var(--fill);border:var(--outline) solid var(--ink);border-radius:14px;
  cursor:pointer;transition:transform .07s ease-out,background .07s ease-out}
.iconbtn:active:not(:disabled){transform:scale(${UI.pressScale});
  background:color-mix(in srgb, var(--fill) ${Math.round((1 - UI.pressInk) * 100)}%, var(--ink))}
.iconbtn svg{width:22px;height:22px;fill:none;stroke:var(--mine-ink);stroke-width:2.4;
  stroke-linecap:round;stroke-linejoin:round}

/*
 * The toast: it confirms, it never asks.
 *
 * Pointer-events:none, so it can never sit over a control or need dismissing — a copy
 * confirmation that blocks Start would be worse than silence.
 *
 * BOTTOM-centre, not top. Top-centre is the busiest strip on the screen: the round
 * gauge lives there during a match, and on a landscape phone the lobby card reaches
 * the top of the viewport, so "someone joined" landed across the ROOM CODE label.
 * Nothing occupies bottom-centre in landscape — the stick and the button hold the two
 * corners — so the confirmation gets a lane of its own instead of a z-index fight.
 */
.toast{position:fixed;z-index:20;left:50%;transform:translate(-50%,16px);
  bottom:calc(14px + var(--safe-bottom));
  background:var(--ink);color:var(--card);
  border-radius:999px;padding:9px 18px;
  font-family:Fredoka,ui-rounded,system-ui,sans-serif;font-weight:600;font-size:14px;
  opacity:0;pointer-events:none;
  transition:opacity .16s ease-out,transform .16s ease-out}
.toast.show{opacity:1;transform:translate(-50%,0)}

/* Waiting dots: the sign of life a spectator needs (spectating R2). */
.dots{display:inline-flex;gap:5px;margin-left:8px;vertical-align:middle}
.dots i{width:7px;height:7px;border-radius:50%;background:var(--ink);
  animation:dot 1.2s ease-in-out infinite}
.dots i:nth-child(2){animation-delay:.15s}
.dots i:nth-child(3){animation-delay:.3s}
@keyframes dot{0%,70%,100%{opacity:.25;transform:translateY(0)}
  35%{opacity:1;transform:translateY(-3px)}}

/* The count before a round. Big enough to read across a room, quiet when empty. */
.count{font-family:Fredoka,ui-rounded,system-ui,sans-serif;font-weight:700;
  font-size:clamp(34px,9vw,48px);line-height:1;min-height:1em;
  font-variant-numeric:tabular-nums;color:var(--ink)}
.count.pulse{animation:countIn .3s cubic-bezier(.2,.9,.3,1.2) both}
@keyframes countIn{
  0%{transform:scale(.7);opacity:0}
  62%{transform:scale(1.08);opacity:1}
  100%{transform:scale(1);opacity:1}
}

/* The HUD sits above the arena, out of both thumb corners (R11). */
#hud{position:fixed;top:0;left:0;right:0;z-index:5;
  padding:calc(10px + var(--safe-top)) calc(14px + var(--safe-right))
          10px calc(14px + var(--safe-left));
  display:flex;justify-content:center;gap:10px;pointer-events:none}
.gauge{background:var(--card);border:3px solid var(--ink);border-radius:999px;
  box-shadow:3px 3px 0 var(--ink);padding:5px 14px;
  font-family:Fredoka,sans-serif;font-weight:600;font-size:15px;
  font-variant-numeric:tabular-nums;display:flex;align-items:center;gap:8px}
.gauge .bar{width:74px;height:9px;border:2px solid var(--ink);border-radius:999px;
  overflow:hidden;background:#fff}
.gauge .bar > i{display:block;height:100%;background:var(--highlight);
  width:var(--pct,100%);transition:width .12s linear}
.gauge.urgent .bar > i{background:#e6484d}
/* The connection stopped answering (RD-081). Same slab as the spectator chip; the
   hazard colour is what separates "you are waiting" from "something is wrong". */
.stalled{gap:7px;color:var(--ink);background:var(--card)}
/* .gauge.stalled, not .stalled: the shared dot rule below is also two classes, so at
   equal specificity source order would decide it — and it comes later, which is how
   this drew the waiting chip's yellow instead of the hazard red. */
.gauge.stalled .eye{background:#e6484d}

/* Watching, not playing (spectating R2). A slab, so it keeps the shadow every other
   card has — it is paper on the table, not a control printed on it (kit-rules). */
.spectate{gap:7px;color:var(--ink)}

/* Settings (in-game-menu R5). The panel is a .card and so is a slab with the shadow;
   everything inside it is ink on the surface and has none (RD-069). */
.setrow{display:flex;align-items:center;justify-content:space-between;gap:14px}
.setlabel{font-family:Fredoka,ui-rounded,system-ui,sans-serif;font-weight:600;font-size:17px}
.steps{display:flex;gap:6px}
/* Segments, not a slider: a drag is the one control a thumb must be precise with, and
   the Kit has no draggable widget outside the stick itself. */
.steps .step{min-height:${UI.minTarget}px;min-width:34px;padding:0;
  border:var(--outline) solid var(--ink);border-radius:11px;
  background:var(--card-dim);box-shadow:none;cursor:pointer;
  transition:transform .07s ease-out,background .07s ease-out}
.steps .step.on{background:var(--mine-tint)}
.steps .step:active{transform:scale(${UI.pressScale})}
/* Leaving is the one destructive action here, so it does not look like the others. */
button.danger{background:var(--card);color:var(--ink)}
button.danger:active:not(:disabled){background:color-mix(in srgb, var(--card) 84%, var(--ink))}
/*
 * The opener is pinned top-left (R1), not carried along by the HUD's centred row.
 *
 * #hud centres its children, so simply being first in it put the gear beside the round
 * label in the middle of the screen. Absolute, against the same padding #hud spends, so
 * the notch and the URL bar are handled by the rule that already handles them — and the
 * gauges stay centred rather than being shoved off-centre by a sibling.
 */
.iconbtn.gear{pointer-events:auto;position:absolute;
  left:calc(14px + var(--safe-left));top:calc(10px + var(--safe-top))}
/* The dot both status chips share. Defined once on .gauge .eye rather than under one
   chip's selector: it lived under .spectate .eye and the stalled chip then set only its
   COLOUR, so it inherited no size and drew nothing at all. A shared element needs a
   shared rule. NB no backticks in here - this whole stylesheet is a template literal. */
.gauge .eye{width:9px;height:9px;border-radius:50%;background:var(--highlight);
  border:2px solid var(--ink);animation:spectate-pulse 1.6s ease-in-out infinite}
/* No reduced-motion rule of its own: the global animation:none!important below
   already stops this, and a second media block splits the one the guards read. */
@keyframes spectate-pulse{0%,100%{opacity:1}50%{opacity:.25}}

/*
 * The countdown stopwatch (round-countdown R1-R3).
 *
 * A disc slab, standing on its own over the arena — NOT inside the rule card, which is
 * gone by the time this appears. Same three declarations every card carries, so it
 * belongs without a new visual idea being invented for it.
 */
.tick{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);
  width:150px;height:150px;display:none;place-items:center;z-index:6;pointer-events:none}
.tick.on{display:grid}
.tick .disc{position:absolute;inset:0;border-radius:50%;background:var(--card);
  border:var(--outline) solid var(--ink);box-shadow:var(--shadow)}
.tick svg{position:absolute;inset:0;width:100%;height:100%;transform:rotate(-90deg)}
.tick circle{fill:none;stroke-width:7;stroke-linecap:round;
  transition:stroke-dashoffset 1s linear,stroke .3s linear}
.tick .n{position:relative;font-family:var(--display);font-size:76px;line-height:1;
  color:var(--ink);font-variant-numeric:tabular-nums}
/* Each number lands with the deal the cards already use, then GO releases it. */
.tick .n.land{animation:deal .34s cubic-bezier(.2,1.5,.4,1) both}
.tick.go{animation:punch .24s ease-out both}
/* Reduced motion needs no rule of its own here: the global block below drops every
   animation and transition, and the digit and the ring's value are inline styles, so
   what is SHOWN is identical either way (round-countdown R7). */
@keyframes punch{
  0%{transform:translate(-50%,-50%) scale(1);opacity:1}
  100%{transform:translate(-50%,-50%) scale(1.5);opacity:0}
}
/* Entrances overshoot and settle — nothing simply fades (R10). */
@keyframes deal{
  0%{transform:scale(.86) rotate(-${UI.tilt * 3}deg);opacity:0}
  62%{transform:scale(1.04) rotate(${UI.tilt * .4}deg);opacity:1}
  100%{transform:scale(1) rotate(-${UI.tilt}deg);opacity:1}
}
@keyframes pop{0%{transform:scale(.9);opacity:0}70%{transform:scale(1.03)}100%{transform:scale(1);opacity:1}}
.card.tilt{animation:deal .34s cubic-bezier(.2,.9,.3,1.2) both}
.card:not(.tilt){animation:pop .26s cubic-bezier(.2,.9,.3,1.2) both}

/* Motion is emphasis, never the message: it all goes, the information stays. */
@media (prefers-reduced-motion:reduce){
  /* The name stays; only the dealt tilt goes (R1). */
  h1.mark .ch{transform:none}
  /* The scale is the felt half and goes; the ink-soak is the seen half and stays, so a
     pressed control is never entirely without feedback (flat-controls R2, P1). */
  button:active:not(:disabled),.iconbtn:active:not(:disabled){transform:none}
  *,*::before,*::after{animation:none!important;transition:none!important}
  .card.tilt{transform:rotate(-${UI.tilt}deg)}
  /* The wobble goes; the sentence stays. Motion is emphasis, never the message. */
  #rotate span{transform:none}
  /* The dots stop moving but remain visible — they are still a "waiting" mark. */
  .dots i{opacity:.6;transform:none}
}

/*
 * "Turn your phone" (arena-framing T5, R5).
 *
 * CSS only — no JS, no resize listener, no state in flow.ts. The browser already knows
 * which way up it is, and a media query cannot get out of sync with it the way a
 * cached orientation flag can. It also means no sequence of rotations can strand a
 * player on a screen, so the reducer's totality property is untouched (P4).
 *
 * It does NOT cover the game. The arena keeps rendering, correctly framed, underneath:
 * a player whose orientation lock is on, or whose phone is propped on a table, loses
 * comfort and not the round. Never require an action to keep playing (I8's spirit).
 */
#rotate{display:none}
@media (orientation:portrait){
  #rotate{position:fixed;z-index:20;left:0;right:0;
    bottom:calc(14px + var(--safe-bottom));
    display:flex;justify-content:center;pointer-events:none}
  /* Both are bottom-centre pills, and upright the prompt is the one that matters,
     so the toast moves up rather than landing on it. Folded into THIS query rather
     than opening a second one: there is exactly one description of what upright looks
     like, and a test that reads "the portrait block" stays unambiguous. */
  .toast{bottom:calc(66px + var(--safe-bottom))}
  #rotate span{background:var(--card);color:var(--text);
    border:var(--outline) solid var(--ink);border-radius:999px;
    box-shadow:var(--shadow);padding:9px 18px;
    font-family:Fredoka,ui-rounded,system-ui,sans-serif;font-weight:600;font-size:14px;
    animation:nudge 1.9s ease-in-out infinite}
}
@keyframes nudge{
  0%,72%,100%{transform:rotate(0deg)}
  80%{transform:rotate(-7deg)}
  90%{transform:rotate(7deg)}
}

/* Landscape phones: short viewports get tighter, and scroll INSIDE the card (T18). */
@media (max-height:430px){
  /* Tighter, but never inside the chrome: the insets survive the squeeze. */
  .overlay{padding:calc(8px + var(--safe-top)) calc(8px + var(--safe-right))
           calc(8px + var(--safe-bottom)) calc(8px + var(--safe-left))}
  /* 100% of the OVERLAY's content box, not 94vh. Against the viewport the card is
     allowed the padding and the safe insets as well as its own space, so it grew past
     the overlay by exactly that much and the last row was cut off by the screen edge —
     photographed on the device, with a player's name sliced in half (RD-055).
     min-height:0 is what lets a flex item shrink below its content at all, and
     without it the max-height above is quietly ignored. */
  .card{padding:12px 18px;gap:7px;max-height:100%;min-height:0;overflow-y:auto}
  /* Eight rows is the design maximum, so buy back the height they need. */
  .row{padding:3px 2px}
  h1{font-size:26px}
  .code{font-size:34px}
  button{min-height:${UI.minTarget}px;padding:8px 20px;font-size:16px}
  .codeblock{padding-bottom:8px}
}

/*
 * Very short landscape: Safari with its chrome is 292 points tall (RD-064).
 *
 * Eight rows, the code block and the footer do not fit there at the 430px tier, so the
 * list stopped at bot-6 and scrolled. Everything that is not a TAP TARGET gets tighter:
 * the rows, the type and the gaps. The 44px floor on the copy and Start buttons is not
 * negotiable — a control too small to hit is worse than a list too long to see — so
 * this buys back what it can and the rest still scrolls (RD-067).
 */
@media (max-height:340px){
  /* The strip is the first thing to go: at 292 points the eight rows and the room code
     are what the round needs, and the strip is a second view of what the rows already
     say (P5). Decided by measurement, not by preference — see RD-067. */
  .slots{display:none}
  .card{padding:6px 14px;gap:2px}
  .row{padding:1px 2px;font-size:13px;line-height:1.25}
  .dot{width:12px;height:12px;border-radius:4px}
  .codelabel{font-size:9px;line-height:1}
  .code{font-size:24px}
  .codeblock{padding-bottom:3px;row-gap:0}
  .dim,.err{font-size:11.5px;line-height:1.2}
  .err{min-height:0}
  h1{font-size:20px}
}
`;

/** A player's colour, by slot. Wraps, so a ninth slot cannot throw. */
/**
 * Adopt a player's colour on the controls (ui-identity R5, P8).
 *
 * One write, at `welcome`. Everything that spends the three properties follows, and a
 * slot of -1 leaves the highlight in place — which is what the menu and the join screen
 * see, and what a spectator keeps.
 */
export function applyMine(root: { style: { setProperty(k: string, v: string): void } },
  slot: number): void {
  const mine = slot >= 0 ? colourFor(slot) : PAPER.highlight;
  root.style.setProperty("--mine", mine);
  root.style.setProperty("--mine-tint", slot >= 0 ? tint(mine) : PAPER.highlight);
  root.style.setProperty("--mine-ink", slot >= 0 ? readableInk(mine) : PAPER.ink);
}

export function colourFor(slot: number): string {
  return PLAYER_COLOURS[((slot % PLAYER_COLOURS.length) + PLAYER_COLOURS.length) % PLAYER_COLOURS.length]!;
}

/** Escape anything a player typed before it reaches another player's screen (I2). */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}
