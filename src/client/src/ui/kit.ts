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
import { PAPER, PLAYER_COLOURS } from "../kit/palette.ts";

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

h1{font-family:Fredoka,ui-rounded,system-ui,sans-serif;font-weight:700;
  font-size:clamp(30px,7vw,42px);letter-spacing:-.01em;margin:0;line-height:1}
h2{font-family:Fredoka,ui-rounded,system-ui,sans-serif;font-weight:600;
  font-size:21px;margin:0;line-height:1.1}
.tagline{color:var(--text-dim);font-size:13.5px;margin:0}
.dim{color:var(--text-dim);font-size:13px;min-height:16px}

button,input{font:inherit;border-radius:14px;min-height:${UI.minTarget}px}
button{font-family:Fredoka,ui-rounded,system-ui,sans-serif;font-weight:600;font-size:18px;
  color:var(--ink);background:var(--highlight);
  border:var(--outline) solid var(--ink);box-shadow:0 ${UI.shadowOffset}px 0 var(--ink);
  padding:11px 26px;cursor:pointer;
  transition:transform .07s ease-out,box-shadow .07s ease-out}
button:active:not(:disabled){transform:translateY(${UI.shadowOffset - 2}px);
  box-shadow:0 2px 0 var(--ink);}
button:disabled{background:var(--card-dim);color:var(--text-dim);cursor:default;
  box-shadow:0 ${UI.shadowOffset}px 0 var(--ink)}
button.ghost{background:transparent;box-shadow:none;font-size:14px;font-weight:500;
  color:var(--text-dim);border-width:2px;padding:8px 16px}
button.ghost:active:not(:disabled){transform:none;box-shadow:none}

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
 * label and the link box span both columns, so the code and the button are the only
 * two things that share a line.
 */
.codeblock{display:grid;grid-template-columns:auto auto;
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
  background:var(--card);border:var(--outline) solid var(--ink);border-radius:14px;
  box-shadow:0 ${UI.shadowOffset}px 0 var(--ink);cursor:pointer}
.iconbtn:active:not(:disabled){transform:translateY(${UI.shadowOffset - 2}px);
  box-shadow:0 2px 0 var(--ink)}
.iconbtn svg{width:22px;height:22px;fill:none;stroke:var(--ink);stroke-width:2.4;
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
`;

/** A player's colour, by slot. Wraps, so a ninth slot cannot throw. */
export function colourFor(slot: number): string {
  return PLAYER_COLOURS[((slot % PLAYER_COLOURS.length) + PLAYER_COLOURS.length) % PLAYER_COLOURS.length]!;
}

/** Escape anything a player typed before it reaches another player's screen (I2). */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}
