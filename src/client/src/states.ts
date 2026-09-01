/**
 * The state gallery (auto-playtest R2).
 *
 * `tools/shoot.sh` drives the real game and photographs whatever it happens to catch.
 * That is the right tool for "does the whole thing work", and it is the wrong tool for
 * half the screens: a toast lasts two seconds, a cooldown ring sweeps past in one and a
 * half, and a player's own action button only exists if the shutter opens during a
 * round they are on the roster of — which the virtual clock cannot arrange (RD-054).
 *
 * Every one of those was a real bug this week, and every one was found by eye on a
 * phone rather than by the suite. So this page mounts the SAME `Ui` and `Controls`
 * classes, with the same stylesheets, and puts them into one named state on demand:
 *
 *     /states.html?state=round-cooling
 *
 * **It proves layout, not behaviour.** Nothing here is connected to a server, so it
 * cannot catch a state the game fails to REACH — the blank button had two causes and
 * this page would have shown only one of them. It answers "when the game is in this
 * state, does it look right", which is the question a screenshot of a live round keeps
 * failing to reach at all.
 */
import { initialState, reduce, type FlowState } from "./flow.ts";
import { InputController } from "./input.ts";
import {
  CONTROLS_CSS, Controls, FONT_LINK, UI_CSS, Ui,
  applyInsets, applyMine, insetOverride,
} from "./ui/index.ts";
import { ACTION_VERBS, PLAYER_COLOURS, type PlayerView, type WireAction } from "@ruckus/shared";
import { iconPath } from "./ui/icons.ts";

/**
 * Keep a self-clearing state on screen.
 *
 * Several of these states exist for a second or two by design — a toast, a countdown
 * digit — and a screenshot that races them is the problem this page was built to
 * solve. Re-applying on a short interval holds the real code path open rather than
 * reaching in and pinning a class by hand.
 */
const hold = (apply: () => void): void => { apply(); setInterval(apply, 250); };

/** A full lobby, so every row-count bug has somewhere to show itself. */
const EIGHT: PlayerView[] = [
  "bot-1", "bot-2", "bot-3", "bot-4", "bot-5", "bot-6", "a-long-ish-name", "jerwin",
].map((name, slot) => ({ slot, name, colour: "", score: 0, connected: slot !== 6 }));

const verb = (v: string, readyIn?: number): WireAction =>
  ({ v: ACTION_VERBS.indexOf(v as never), ...(readyIn === undefined ? {} : { r: readyIn }) });

/** Each entry puts the real UI into one state and leaves it there. */
const STATES: Record<string, (ui: Ui, controls: Controls, show: (s: FlowState) => void) => void> = {
  "lobby-8": (ui, _c, show) => {
    show(lobby());
    ui.renderHud(undefined);
  },
  "lobby-toast": (ui, _c, show) => {
    // The one that landed on ROOM CODE (RD-058). Two seconds live; forever here —
    // the real toast hides itself after 2.2s, which is exactly why no shot of the
    // running game had ever contained one. `hold` re-arms it instead of faking it.
    show(lobby());
    hold(() => ui.toast("a-long-ish-name joined"));
  },
  "join-full": (_u, _c, show) => {
    // Through `wantJoin`, or the reducer never leaves MENU and the error draws under
    // the menu card — which is what the first walk of this gallery photographed.
    let f = reduce(initialState(), { t: "setName", name: "jerwin" });
    f = reduce(f, { t: "wantJoin" });
    f = reduce(f, { t: "setCode", code: "38YF" });
    show(reduce(f, { t: "err", code: "ROOM_FULL" }));
  },
  "round-tumble": (ui, controls) => {
    ui.render(inMatch()); controls.show("TUMBLE"); controls.setAction(verb("tumble"));
  },
  "round-cooling": (ui, controls) => {
    // Mid-sweep: the frame the ring exists for, and the one no live shot has caught.
    ui.render(inMatch());
    controls.show("TUMBLE");
    controls.setAction(verb("tumble", 0.8));
  },
  "round-pass": (ui, controls) => {
    ui.render(inMatch()); controls.show("PASS"); controls.setAction(verb("pass"));
  },
  "round-jump": (ui, controls) => {
    ui.render(inMatch()); controls.show("JUMP"); controls.setAction(verb("jump"));
  },
  "hud": (ui) => {
    ui.render(inMatch());
    ui.renderHud({ fuse: 6200, fuseLength: 9000, remaining: 7400, counts: { 0: 3, 7: 5 } } as never,
      { name: "A Round Name", round: 3, of: 5 });
  },
  "hud-urgent": (ui) => {
    // The bar and the red belong to the FUSE gauge, not the round countdown — which
    // the first walk of this gallery made obvious by showing neither (RD-061).
    ui.render(inMatch());
    ui.renderHud({ fuse: 1400, fuseLength: 9000, remaining: 12000 } as never,
      { name: "A Longer Round Name", round: 5, of: 5 });
  },
  "waiting": (ui) => { ui.render(inMatch()); ui.showWaiting(2, 5); },
  // Watching a round you are not in, with the arena still visible behind (R2, R3).
  "spectating": (ui) => { ui.render(inMatch()); ui.setSpectating(true, 2, 5); ui.renderHud(undefined, { name: "the round", round: 2, of: 5 }); },
  "countdown": (ui) => { ui.render(inMatch()); hold(() => {
    ui.showIntro("A Round Name", "One sentence, which is the whole explanation.", 2, 5);
    ui.setCountdown(2);
  }); },
  "round-end": (ui) => {
    ui.render(inMatch());
    ui.showRoundEnd(Object.fromEntries(EIGHT.map((p, i) => [p.slot, 7 - i])), EIGHT);
  },
  "match-end": (ui) => {
    ui.render(inMatch());
    ui.showMatchEnd(EIGHT[0], EIGHT, Object.fromEntries(EIGHT.map((p, i) => [p.slot, 21 - i * 3])));
  },
  /**
   * Every control, in every player's colour, in one frame (ui-identity R5).
   *
   * Eight separate screenshots cannot be compared; a contact sheet can. This is also
   * the only view that answers the question the contrast maths protects but does not
   * judge — whether the maroon player's interface is as pleasant as the mint one.
   */
  "swatches": (_u, _c, show) => {
    show(initialState());
    document.querySelectorAll(".overlay").forEach((el) => el.remove());
    const wrap = document.createElement("div");
    wrap.style.cssText =
      "position:fixed;inset:0;overflow:auto;display:grid;gap:6px;padding:8px;" +
      "grid-template-columns:repeat(4,1fr);align-content:start;" +
      "font:600 11px Fredoka,ui-rounded,system-ui,sans-serif";
    PLAYER_COLOURS.forEach((colour, slot) => {
      const cell = document.createElement("div");
      applyMine(cell, slot);
      cell.style.cssText += ";display:flex;align-items:center;gap:6px;padding:6px 8px;" +
        "background:var(--card);border:3px solid var(--ink);border-radius:14px";
      const swatch = document.createElement("span");
      swatch.style.cssText =
        "width:16px;height:16px;border-radius:5px;border:2px solid var(--ink);flex:0 0 auto;" +
        `background:${colour}`;
      const label = document.createElement("button");
      label.textContent = "start";
      label.style.cssText = "flex:1;min-width:0;padding:6px 10px;font-size:13px";
      const icon = document.createElement("button");
      icon.className = "iconbtn";
      icon.innerHTML =
        '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H2v6h4l5 4z"></path>' +
        '<path d="M15.5 8.5a5 5 0 0 1 0 7"></path></svg>';
      const act = document.createElement("button");
      act.id = "swatchAction";
      act.innerHTML =
        `<svg viewBox="0 0 24 24" style="width:22px;height:22px;fill:none;` +
        `stroke:var(--mine-ink);stroke-width:2.4"><path d="${iconPath("tumble")}"/></svg>`;
      act.style.cssText =
        "width:44px;height:44px;min-height:44px;padding:0;border-radius:50%;flex:0 0 auto;" +
        "background:var(--mine);border:4px solid var(--ink);display:flex;" +
        "align-items:center;justify-content:center";
      cell.append(swatch, label, icon, act);
      wrap.append(cell);
    });
    document.body.append(wrap);
  },
  "menu": (_u, _c, show) => show(initialState()),
  "join": (_u, _c, show) => show(reduce(
    reduce(initialState(), { t: "setName", name: "jerwin" }), { t: "wantJoin" })),
};

/**
 * The screen a round is played on: every overlay hidden, nothing but the controls.
 *
 * Reached through the real reducer rather than by hiding the overlay by hand — a
 * gallery that fakes its own chrome is photographing itself, not the game.
 */
function inMatch(): FlowState {
  let s = reduce(initialState(), { t: "setName", name: "jerwin" });
  s = reduce(s, { t: "welcome", slot: 7, code: "38YF", host: 0 });
  return reduce(s, { t: "room", players: EIGHT, host: 0, state: "ROUND_PLAY" });
}

function lobby(): FlowState {
  let s = reduce(initialState(), { t: "setName", name: "jerwin" });
  s = reduce(s, { t: "welcome", slot: 7, code: "38YF", host: 0 });
  return reduce(s, { t: "room", players: EIGHT, host: 0, state: "LOBBY" });
}

const font = document.createElement("link");
font.rel = "stylesheet";
font.href = FONT_LINK;
document.head.append(font);

const style = document.createElement("style");
style.textContent = UI_CSS + CONTROLS_CSS;
document.head.append(style);

const measured = insetOverride(location.search);
if (measured) applyInsets(document.documentElement, measured);

/**
 * `?still=1` — settle every animation, for a repeatable photograph.
 *
 * The cards deal in, the waiting dots bounce forever and the toast fades. A shutter
 * lands at an arbitrary point in each, so the same page photographed twice produced
 * different pixels — which makes a visual baseline noise rather than a signal
 * (RD-063). This does not remove the motion from the game: `kit.test.ts` still asserts
 * the animations exist and still asserts they go under `prefers-reduced-motion`. It
 * asks for the settled frame, which is the one a layout check is actually about.
 */
if (new URLSearchParams(location.search).get("still") === "1") {
  const still = document.createElement("style");
  still.textContent =
    "*,*::before,*::after{animation:none!important;transition:none!important}" +
    // A text caret blinks and a Blink scrollbar fades out. Neither is a CSS animation,
    // so neither was caught by the rule above — and both are repainting pixels that a
    // fingerprint then reads as "this screen changed".
    //
    // The scrollbar rule has a cost worth knowing: a still frame cannot tell you that
    // a card scrolls. In the short landscape profiles the lobby DOES, and the shot
    // looks simply cut off. Load the page without ?still=1 to see the affordance.
    "*{caret-color:transparent!important}" +
    "::-webkit-scrollbar{display:none!important}";
  document.head.append(still);
}

const overlay = document.createElement("div");
document.body.append(overlay);

const noop = (): void => {};
const ui = new Ui(overlay, {
  onCreate: noop, onJoin: noop, onStart: noop, onEvent: noop,
  onToggleMute: () => false,
});
const controls = new Controls(document.body, new InputController(document.body));

const NAMES = Object.keys(STATES);
const params = new URLSearchParams(location.search);
const name = params.get("state") ?? "";
/** Carry the profile flags between pages, so a phone walk keeps its overrides. */
const carry = (to: string): string => {
  const q = new URLSearchParams(params);
  if (to) q.set("state", to); else q.delete("state");
  return `?${q}`;
};

const enter = STATES[name];
if (enter) {
  enter(ui, controls, (s) => ui.render(s));
  walker();
} else {
  index();
}

/**
 * The index, in the game's own vocabulary rather than a bare list.
 *
 * This is a page a person opens ON THE PHONE — which is the only place the insets, the
 * touch targets and WebKit are real. So it has to be tappable, not just readable.
 */
function index(): void {
  const wrap = document.createElement("div");
  wrap.className = "overlay";
  wrap.style.cssText = "pointer-events:auto;overflow-y:auto;justify-content:flex-start";
  const card = document.createElement("div");
  card.className = "card";
  card.style.cssText = "margin:auto;max-width:min(430px,92vw)";
  card.innerHTML = "<h1>states</h1><div class=\"dim\">tap one — this is the real UI</div>";
  for (const n of NAMES) {
    const a = document.createElement("a");
    a.href = carry(n);
    a.textContent = n;
    a.style.cssText = "text-decoration:none";
    const b = document.createElement("button");
    // Ghost, not primary: fifteen yellow buttons is a wall, not a list. This is an
    // index to scan, and only one of them is the thing you came for.
    b.className = "ghost";
    b.textContent = n;
    b.style.cssText = "width:100%;text-align:left";
    a.append(b);
    a.replaceChildren(b);
    card.append(a);
  }
  wrap.append(card);
  document.body.append(wrap);
}

/**
 * Previous / next / index, pinned top-left.
 *
 * Harness chrome, deliberately in the one corner no control uses: the stick owns
 * bottom-left, the button bottom-right and the gauge top-centre. Without it, walking
 * twelve states on a phone is twelve trips through the browser's back button.
 */
function walker(): void {
  const i = NAMES.indexOf(name);
  const bar = document.createElement("div");
  bar.style.cssText =
    "position:fixed;z-index:40;display:flex;gap:6px;align-items:center;" +
    "top:calc(6px + var(--safe-top));left:calc(6px + var(--safe-left));" +
    "font:600 12px Fredoka,ui-rounded,system-ui,sans-serif;opacity:.75";
  const link = (label: string, to: string): HTMLElement => {
    const a = document.createElement("a");
    a.href = carry(to);
    a.textContent = label;
    a.style.cssText =
      "display:inline-block;min-width:30px;min-height:30px;line-height:30px;" +
      "text-align:center;padding:0 8px;border-radius:9px;text-decoration:none;" +
      "background:var(--card);color:var(--ink);border:2px solid var(--ink)";
    return a;
  };
  bar.append(
    link("‹", NAMES[(i - 1 + NAMES.length) % NAMES.length]!),
    link(name, ""),
    link("›", NAMES[(i + 1) % NAMES.length]!),
  );
  document.body.append(bar);
}

