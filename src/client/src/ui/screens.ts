/**
 * The screens (visual-direction T15, R12; lobby-flow T7–T10).
 *
 * Every panel here is built from the kit, so a menu card and a character slab share
 * one construction: flat fill, ink outline, hard offset shadow. `flow.ts` owns which
 * screen is showing; this only draws what it is handed.
 */
import type { PlayerView } from "@ruckus/shared";
import type { FlowEvent, FlowState } from "../flow.ts";
import { startState } from "../flow.ts";
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
  /** Kept so the share button can build a link without being handed state again. */
  private code = "";

  constructor(container: HTMLElement, private readonly handlers: UiHandlers) {
    this.root = container;
    this.root.innerHTML = TEMPLATE;
    this.menu = this.q("#menu");
    this.joining = this.q("#joining");
    this.lobby = this.q("#lobby");
    this.banner = this.q("#banner");
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

    this.q("#error").textContent = state.error ?? "";

    const codeInput = this.q("#code") as HTMLInputElement;
    if (codeInput.value !== state.code) codeInput.value = state.code;
    // A code from a shared link is not editable — half-editing an invite is worse
    // than not being able to edit it at all.
    codeInput.readOnly = state.codeLocked;
    (this.q("#joinBtn") as HTMLButtonElement).disabled = state.code.length !== 4;
    (this.q("#createBtn") as HTMLButtonElement).disabled = state.screen === "CREATING";

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

  private async share(): Promise<void> {
    const btn = this.q("#shareBtn");
    const link = `${location.origin}${location.pathname}?room=${this.code}`;
    const done = (msg: string): void => {
      btn.textContent = msg;
      setTimeout(() => (btn.textContent = "copy invite link"), 1800);
    };
    try {
      await navigator.clipboard.writeText(link);
      done("copied");
    } catch {
      // The clipboard needs a secure context, and a phone on a LAN over plain http is
      // not one — so this is the path that usually runs. Offer it selectable rather
      // than failing silently.
      const box = this.q("#linkBox") as HTMLInputElement;
      box.style.display = "block";
      box.value = link;
      box.select();
      done("select and copy");
    }
  }

  /** The one sentence a player gets before a round (vision pillar 1). */
  showIntro(displayName: string, rule: string, round: number, of: number): void {
    this.banner.innerHTML =
      `<div class="card tilt"><div class="dim">round ${round} of ${of}</div>` +
      `<div class="big">${escapeHtml(displayName)}</div>` +
      `<p class="rule">${escapeHtml(rule)}</p></div>`;
    this.banner.style.display = "flex";
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
      `<div class="big">${dot}${winner ? escapeHtml(winner.name) : "nobody"}</div></div>`;
    this.banner.style.display = "flex";
  }

  hideBanner(): void {
    this.banner.style.display = "none";
  }
}

const TEMPLATE = `
<div id="hud"></div>
<div id="banner" class="overlay" style="display:none"></div>

<div id="menu" class="overlay">
  <div class="card">
    <h1>ruckus</h1>
    <p class="tagline">8 players · 5 rounds · 10 minutes</p>
    <input id="name" placeholder="your name" maxlength="12" autocomplete="off">
    <button id="createBtn">create a room</button>
    <button id="joinNav" class="ghost">join with a code</button>
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
  </div>
</div>

<div id="lobby" class="overlay" style="display:none">
  <div class="card">
    <div class="codeblock">
      <div class="codelabel">room code</div>
      <div id="roomCode" class="code">----</div>
      <button id="shareBtn" class="ghost">copy invite link</button>
      <input id="linkBox" class="linkbox" readonly style="display:none">
    </div>
    <div id="scoreboard"></div>
    <button id="startBtn">start</button>
    <div id="waitNote" class="dim"></div>
  </div>
</div>`;
