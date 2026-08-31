/**
 * The screens (visual-direction T15, R12; lobby-flow T7–T10).
 *
 * Every panel here is built from the kit, so a menu card and a character slab share
 * one construction: flat fill, ink outline, hard offset shadow. `flow.ts` owns which
 * screen is showing; this only draws what it is handed.
 */
import type { PlayerView } from "@ruckus/shared";
import type { FlowEvent, FlowState } from "../flow.ts";
import { createState, joinState, startState } from "../flow.ts";
import { colourFor, escapeHtml } from "./kit.ts";
import { renderHud, roundLabel, type HudData } from "./hud.ts";

export interface UiHandlers {
  onCreate(name: string): void;
  onJoin(code: string, name: string): void;
  onStart(): void;
  onEvent(event: FlowEvent): void;
}

export class Ui {
  private readonly root: HTMLElement;
  private readonly menu: HTMLElement;
  private readonly joining: HTMLElement;
  private readonly lobby: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly scoreboard: HTMLElement;
  private readonly hud: HTMLElement;
  private readonly toastEl: HTMLElement;
  private toastTimer = 0;
  /** Kept so the share button can build a link without being handed state again. */
  private code = "";

  constructor(container: HTMLElement, private readonly handlers: UiHandlers) {
    this.root = container;
    this.root.innerHTML = TEMPLATE;
    this.menu = this.q("#menu");
    this.joining = this.q("#joining");
    this.lobby = this.q("#lobby");
    this.banner = this.q("#banner");
    this.toastEl = this.q("#toast");
    this.scoreboard = this.q("#scoreboard");
    this.hud = this.q("#hud");

    const name = (): string => (this.q("#name") as HTMLInputElement).value.trim() || "player";

    this.q("#createBtn").addEventListener("click", () => this.handlers.onCreate(name()));
    this.q("#joinNav").addEventListener("click", () => this.handlers.onEvent({ t: "wantJoin" }));
    this.q("#backBtn").addEventListener("click", () => this.handlers.onEvent({ t: "back" }));
    this.q("#joinBtn").addEventListener("click", () =>
      this.handlers.onJoin((this.q("#code") as HTMLInputElement).value, name()));
    this.q("#code").addEventListener("input", (e) =>
      this.handlers.onEvent({ t: "setCode", code: (e.target as HTMLInputElement).value }));
    // Live, so the note answers while the player types rather than after they submit.
    this.q("#name").addEventListener("input", (e) =>
      this.handlers.onEvent({ t: "setName", name: (e.target as HTMLInputElement).value }));
    this.q("#startBtn").addEventListener("click", () => this.handlers.onStart());
    this.q("#shareBtn").addEventListener("click", () => void this.share());
  }

  private q(sel: string): HTMLElement {
    const el = this.root.querySelector(sel);
    if (!el) throw new Error(`missing ${sel}`);
    return el as HTMLElement;
  }

  /** One render, driven entirely by flow state. */
  render(state: FlowState): void {
    const show = (el: HTMLElement, on: boolean): void => {
      el.style.display = on ? "flex" : "none";
    };
    show(this.menu, state.screen === "MENU" || state.screen === "CREATING");
    show(this.joining, state.screen === "JOINING");
    show(this.lobby, state.screen === "LOBBY");

    // Every screen that can raise an error owns a slot for it.
    //
    // An error is deliberately kept on the screen that raised it (screenForError, P4),
    // but the only slot used to be the menu's — so a failed join painted its message
    // into a display:none element and the player saw the tap do nothing at all. The
    // test that covered this asserted `#error`.textContent and passed the whole time,
    // because the stub DOM cannot express "is this inside the screen being shown".
    for (const id of ["#error", "#joinError", "#lobbyError"]) {
      this.q(id).textContent = state.error ?? "";
    }

    const nameInput = this.q("#name") as HTMLInputElement;
    if (nameInput.value !== state.name) nameInput.value = state.name;

    const codeInput = this.q("#code") as HTMLInputElement;
    if (codeInput.value !== state.code) codeInput.value = state.code;
    // A code from a shared link is not editable — half-editing an invite is worse
    // than not being able to edit it at all.
    codeInput.readOnly = state.codeLocked;
    // Never silently dead: if Join cannot be pressed, say why (P5, joinState).
    const join = joinState(state);
    (this.q("#joinBtn") as HTMLButtonElement).disabled = !join.canJoin;
    this.q("#joinNote").textContent = join.note;
    // Create explains itself too now — it was the last control that could sit dead
    // with nothing said (R9).
    const create = createState(state);
    (this.q("#createBtn") as HTMLButtonElement).disabled = !create.canCreate;
    this.q("#nameNote").textContent = create.note;

    if (state.screen === "LOBBY") {
      this.code = state.code;
      this.q("#roomCode").textContent = state.code;
      this.renderScores(state.players);

      const s = startState(state);
      const btn = this.q("#startBtn") as HTMLButtonElement;
      btn.style.display = state.mySlot === state.host ? "block" : "none";
      btn.disabled = !s.canStart;
      btn.textContent = s.label;
      this.q("#waitNote").textContent = s.note;
    }
  }

  /** The in-round HUD, driven by the snapshot and nothing else (T16). */
  renderHud(extra: HudData | undefined, label?: { name: string; round: number; of: number }): void {
    const gauges = renderHud(extra);
    const round = label ? roundLabel(label.name, label.round, label.of) : "";
    this.hud.innerHTML = round + gauges;
  }

  clearHud(): void {
    this.hud.innerHTML = "";
  }

  /**
   * One row per player. A disconnected player is dimmed rather than removed — a room
   * that silently reshuffles underneath everyone is worse than one showing a gap.
   */
  private renderScores(players: PlayerView[]): void {
    this.scoreboard.innerHTML = [...players]
      .sort((a, b) => b.score - a.score || a.slot - b.slot)
      .map(
        (p) => `<div class="row${p.connected ? "" : " gone"}">
            <span class="dot" style="background:${colourFor(p.slot)}"></span>
            <span class="nm">${escapeHtml(p.name)}</span>
            <span class="sc">${p.score}</span>
          </div>`,
      )
      .join("");
  }

  /**
   * Copy the invite, in the order that actually works (R10).
   *
   * 1. `navigator.clipboard` — the right API, and **unavailable where this game is
   *    played**: it needs a secure context and a phone on a LAN over plain http is not
   *    one. It is tried first because it is correct when it exists.
   * 2. `document.execCommand("copy")` — deprecated, universally supported, and works
   *    in a non-secure context. This is the path that runs on the playtest phone, so
   *    it is not a nicety; without it there is no one-tap copy at all.
   * 3. Selectable text — only if both fail. It used to be step 2, which is why the
   *    link box was on screen every time.
   */
  private async share(): Promise<void> {
    const link = `${location.origin}${location.pathname}?room=${this.code}`;

    try {
      await navigator.clipboard.writeText(link);
      this.toast("invite link copied");
      return;
    } catch {
      // fall through
    }

    if (this.copyByExecCommand(link)) {
      this.toast("invite link copied");
      return;
    }

    const box = this.q("#linkBox") as HTMLInputElement;
    box.style.display = "block";
    box.value = link;
    box.select();
    this.toast("select and copy the link");
  }

  /** The legacy path. Off-screen rather than hidden: a `display:none` node cannot be
   * selected, and iOS will not copy from one. */
  private copyByExecCommand(text: string): boolean {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      Object.assign(ta.style, {
        position: "fixed", top: "0", left: "-9999px", opacity: "0",
      });
      document.body.append(ta);
      ta.select();
      ta.setSelectionRange(0, text.length); // iOS needs the explicit range
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }

  /** A transient banner. Never blocks, never needs dismissing (R10, R11). */
  toast(message: string): void {
    const el = this.toastEl;
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove("show"), 2200) as unknown as number;
  }

  /** The one sentence a player gets before a round (vision pillar 1). */
  showIntro(displayName: string, rule: string, round: number, of: number): void {
    this.banner.innerHTML =
      `<div class="card tilt"><div class="dim">round ${round} of ${of}</div>` +
      `<div class="big">${escapeHtml(displayName)}</div>` +
      `<p class="rule">${escapeHtml(rule)}</p>` +
      `<div id="count" class="count"></div></div>`;
    this.banner.style.display = "flex";
  }

  /**
   * Tick the count on the intro card (round-brief T2, T3).
   *
   * Driven from the render loop against the server's deadline, so no new message and no
   * per-second traffic: the whole feature is one subtraction. Only the text changes —
   * the card, and the rule on it, stay exactly as they were.
   */
  setCountdown(n: number): void {
    const el = this.banner.querySelector("#count") as HTMLElement | null;
    if (!el) return;
    const text = n > 0 ? String(n) : "";
    if (el.textContent === text) return; // no needless restart of the animation
    el.textContent = text;
    // Retrigger the landing animation for each new number.
    el.classList.remove("pulse");
    void el.offsetWidth;
    if (text) el.classList.add("pulse");
  }

  showRoundEnd(scores: Record<number, number>, players: PlayerView[]): void {
    const rows = players
      .map((p) => ({ p, pts: scores[p.slot] ?? 0 }))
      .filter((e) => e.pts > 0)
      .sort((a, b) => b.pts - a.pts || a.p.slot - b.p.slot)
      .map(
        (e) => `<div class="row"><span class="dot" style="background:${colourFor(e.p.slot)}"></span>
             <span class="nm">${escapeHtml(e.p.name)}</span><span class="sc">+${e.pts}</span></div>`,
      )
      .join("");
    this.banner.innerHTML = `<div class="card tilt"><div class="big">round over</div>${rows}</div>`;
    this.banner.style.display = "flex";
  }

  showMatchEnd(winner: PlayerView | undefined): void {
    const dot = winner
      ? `<span class="dot" style="background:${colourFor(winner.slot)}"></span> `
      : "";
    this.banner.innerHTML =
      `<div class="card tilt"><div class="dim">winner</div>` +
      `<div class="big">${dot}${winner ? escapeHtml(winner.name) : "nobody"}</div>` +
      // Nobody should be left wondering whether that was the end of the evening (R12).
      `<p class="rule">back to the lobby — start again whenever you like</p></div>`;
    this.banner.style.display = "flex";
  }

  /**
   * Joining a match already in progress (I8).
   *
   * `roundStart` only fires at the start of a round, so a player who arrives mid-round
   * has no arena, no camera and nothing drawn — an empty sky with no explanation. The
   * state machine was right; it just said nothing. Losing is watchable and so is
   * arriving late (vision pillar 3), but only once the screen admits what is going on.
   */
  showWaiting(): void {
    this.banner.innerHTML =
      `<div class="card tilt"><div class="big">joining in</div>` +
      `<p class="rule">the round in progress finishes first — you are in from the next one</p></div>`;
    this.banner.style.display = "flex";
  }

  hideBanner(): void {
    this.banner.style.display = "none";
  }
}

const TEMPLATE = `
<div id="hud"></div>
<div id="toast" class="toast"></div>

<div id="banner" class="overlay" style="display:none"></div>

<!--
  Portrait nudge (arena-framing T5). Always in the DOM; a media query decides whether
  it is seen, so nothing here has to track the orientation. It never covers the arena.
-->
<div id="rotate"><span>turn your phone sideways</span></div>

<div id="menu" class="overlay">
  <div class="card">
    <h1>ruckus</h1>
    <p class="tagline">8 players · 5 rounds · 10 minutes</p>
    <input id="name" placeholder="your name" maxlength="12" autocomplete="off">
    <button id="createBtn">create a room</button>
    <button id="joinNav" class="ghost">join with a code</button>
    <div id="nameNote" class="dim"></div>
    <div id="error" class="err"></div>
  </div>
</div>

<div id="joining" class="overlay" style="display:none">
  <div class="card">
    <h2>join a room</h2>
    <input id="code" class="codeinput" placeholder="code" maxlength="4"
           autocapitalize="characters" autocomplete="off" spellcheck="false">
    <button id="joinBtn">join</button>
    <button id="backBtn" class="ghost">back</button>
    <div id="joinNote" class="dim"></div>
    <div id="joinError" class="err"></div>
  </div>
</div>

<div id="lobby" class="overlay" style="display:none">
  <div class="card">
    <div class="codeblock">
      <div class="codelabel">room code</div>
      <div id="roomCode" class="code">----</div>
      <button id="shareBtn" class="iconbtn" aria-label="copy invite link" title="copy invite link">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <rect x="9" y="9" width="11" height="12" rx="2"></rect>
          <path d="M5 15V5a2 2 0 0 1 2-2h8"></path>
        </svg>
      </button>
      <input id="linkBox" class="linkbox" readonly style="display:none">
    </div>
    <div id="scoreboard"></div>
    <button id="startBtn">start</button>
    <div id="waitNote" class="dim"></div>
    <div id="lobbyError" class="err"></div>
  </div>
</div>`;
