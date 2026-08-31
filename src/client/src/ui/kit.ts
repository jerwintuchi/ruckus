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
  --outline:${UI.outline}px;
  --radius:${UI.radius}px;
  --shadow:${UI.shadowOffset}px ${UI.shadowOffset}px 0 var(--ink);
}
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;height:100%;overflow:hidden;background:var(--ground);color:var(--text);
  font-family:Nunito,ui-rounded,system-ui,-apple-system,sans-serif;
  -webkit-user-select:none;user-select:none;touch-action:none;
  -webkit-font-smoothing:antialiased}
canvas{display:block;position:fixed;inset:0}

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
  padding:calc(16px + env(safe-area-inset-top)) calc(16px + env(safe-area-inset-right))
          calc(16px + env(safe-area-inset-bottom)) calc(16px + env(safe-area-inset-left))}

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
.linkbox{font-size:12px;letter-spacing:0;text-transform:none;font-weight:400}

/* The room code: the one thing in the lobby that gets read across a room. */
.codeblock{display:flex;flex-direction:column;align-items:center;gap:7px;
  padding-bottom:12px;border-bottom:3px solid var(--ink)}
.codelabel{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--text-dim)}
.code{font-family:Fredoka,sans-serif;font-size:clamp(38px,11vw,52px);font-weight:700;
  letter-spacing:.2em;text-indent:.2em;line-height:1;font-variant-numeric:tabular-nums}

.row{display:flex;align-items:center;gap:10px;padding:5px 2px}
.row.gone{opacity:.42}
.dot{width:15px;height:15px;border-radius:5px;border:2px solid var(--ink);
  display:inline-block;flex:0 0 auto}
.nm{flex:1;text-align:left;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sc{font-variant-numeric:tabular-nums;font-weight:800}
.err{color:#c0281a;font-size:13.5px;min-height:17px;max-width:28ch;font-weight:600}

.big{font-family:Fredoka,sans-serif;font-weight:700;font-size:clamp(26px,6.5vw,34px);line-height:1.05}
.rule{font-size:clamp(15px,4vw,18px);color:var(--text);max-width:26ch;margin:0 auto}

/* The HUD sits above the arena, out of both thumb corners (R11). */
#hud{position:fixed;top:0;left:0;right:0;z-index:5;
  padding:calc(10px + env(safe-area-inset-top)) calc(14px + env(safe-area-inset-right))
          10px calc(14px + env(safe-area-inset-left));
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
    bottom:calc(14px + env(safe-area-inset-bottom));
    display:flex;justify-content:center;pointer-events:none}
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

/* Landscape phones: short viewports get tighter, never scrolled (R11, T17). */
@media (max-height:430px){
  /* Tighter, but never inside the chrome: the insets survive the squeeze. */
  .overlay{padding:calc(8px + env(safe-area-inset-top)) calc(8px + env(safe-area-inset-right))
           calc(8px + env(safe-area-inset-bottom)) calc(8px + env(safe-area-inset-left))}
  .card{padding:12px 18px;gap:7px;max-height:94vh;overflow-y:auto}
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
