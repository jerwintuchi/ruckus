/**
 * Screens: join, lobby, round intro, results. Plain DOM over the canvas — a party
 * game's UI is four screens of text and a button, and building it in WebGL would
 * cost legibility and accessibility for nothing.
 */
import type { PlayerView } from "@ruckus/shared";
import type { FlowEvent, FlowState } from "./flow.ts";
import { startState } from "./flow.ts";
import { PALETTE } from "./kit/palette.ts";

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
  /** The room code, kept so the lobby can show it and the copy button can share it. */
  private code = "";

  constructor(container: HTMLElement, private readonly handlers: UiHandlers) {
    this.root = container;
    this.root.innerHTML = TEMPLATE;
    this.menu = this.q("#menu");
    this.joining = this.q("#joining");
    this.lobby = this.q("#lobby");
    this.banner = this.q("#banner");
    this.scoreboard = this.q("#scoreboard");

    const name = (): string =>
      (this.q("#name") as HTMLInputElement).value.trim() || "player";

    this.q("#createBtn").addEventListener("click", () => this.handlers.onCreate(name()));
    this.q("#joinNav").addEventListener("click", () => this.handlers.onEvent({ t: "wantJoin" }));
    this.q("#backBtn").addEventListener("click", () => this.handlers.onEvent({ t: "back" }));
    this.q("#joinBtn").addEventListener("click", () => {
      const code = (this.q("#code") as HTMLInputElement).value;
      this.handlers.onJoin(code, name());
    });
    (this.q("#code") as HTMLInputElement).addEventListener("input", (e) => {
      this.handlers.onEvent({ t: "setCode", code: (e.target as HTMLInputElement).value });
    });
    this.q("#startBtn").addEventListener("click", () => this.handlers.onStart());
    this.q("#shareBtn").addEventListener("click", () => void this.share());
  }

  private q(sel: string): HTMLElement {
    const el = this.root.querySelector(sel);
    if (!el) throw new Error(`missing ${sel}`);
    return el as HTMLElement;
  }

  /**
   * One render, driven entirely by the flow state.
   *
   * Screens used to be whichever `style.display` had last been written, which is a
   * state machine nobody can test. Now `flow.ts` owns the state and this only draws it.
   */
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
    // A code from a shared link is not editable: half-editing an invite is worse than
    // not being able to edit it at all.
    codeInput.readOnly = state.codeLocked;
    (this.q("#joinBtn") as HTMLButtonElement).disabled = state.code.length !== 4;

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
      // Clipboard access needs a secure context, which a LAN address over plain http
      // is not — so on a phone this is the path that actually runs. Offer the link
      // selectable instead of failing silently.
      const box = this.q("#linkBox") as HTMLInputElement;
      box.style.display = "block";
      box.value = link;
      box.select();
      done("select and copy");
    }
  }

  /**
   * One row per player: their colour, their name, their score.
   *
   * A disconnected player is dimmed rather than removed (R5) — a room that silently
   * reshuffles underneath everyone is worse than one that shows a gap.
   */
  private renderScores(players: PlayerView[]): void {
    const sorted = [...players].sort((a, b) => b.score - a.score || a.slot - b.slot);
    this.scoreboard.innerHTML = sorted
      .map(
        (p) => `<div class="row${p.connected ? "" : " gone"}">
            <span class="dot" style="background:${p.colour}"></span>
            <span class="nm">${escapeHtml(p.name)}</span>
            <span class="sc">${p.score}</span>
          </div>`,
      )
      .join("");
  }

  /** The one sentence a player gets before a round (vision pillar 1). */
  showIntro(displayName: string, rule: string, round: number, of: number): void {
    this.banner.innerHTML = `<div class="big">${escapeHtml(displayName)}</div>
      <div class="rule">${escapeHtml(rule)}</div>
      <div class="dim">round ${round} of ${of}</div>`;
    this.banner.style.display = "flex";
  }

  showRoundEnd(scores: Record<number, number>, players: PlayerView[]): void {
    const named = players
      .map((p) => ({ p, pts: scores[p.slot] ?? 0 }))
      .filter((e) => e.pts > 0)
      .sort((a, b) => b.pts - a.pts);
    this.banner.innerHTML = `<div class="big">round over</div>` +
      named
        .map((e) => `<div class="rule"><span class="dot" style="background:${e.p.colour}"></span>
             ${escapeHtml(e.p.name)} +${e.pts}</div>`)
        .join("");
    this.banner.style.display = "flex";
  }

  showMatchEnd(winner: PlayerView | undefined): void {
    this.banner.innerHTML = `<div class="big">${winner ? escapeHtml(winner.name) : "nobody"} wins</div>`;
    this.banner.style.display = "flex";
  }

  hideBanner(): void {
    this.banner.style.display = "none";
  }

  setError(code: string): void {
    this.q("#error").textContent = ERRORS[code] ?? code;
  }
}

const ERRORS: Record<string, string> = {
  NO_ROOM: "no room with that code",
  ROOM_FULL: "that room is full",
  NOT_HOST: "only the host can start",
  TOO_FEW: "you need at least two players",
  BAD_CODE: "a code is four characters",
  BAD_MSG: "something went wrong",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}

const TEMPLATE = `
<div id="banner" class="overlay" style="display:none"></div>

<div id="menu" class="overlay">
  <div class="card">
    <h1>ruckus</h1>
    <p class="tagline">8 players. 5 rounds. 10 minutes.</p>
    <input id="name" placeholder="your name" maxlength="12" autocomplete="off">
    <button id="createBtn">create a room</button>
    <button id="joinNav" class="ghost">join with a code</button>
    <div id="error" class="err"></div>
  </div>
</div>

<div id="joining" class="overlay" style="display:none">
  <div class="card">
    <h2>join a room</h2>
    <input id="code" placeholder="code" maxlength="4" autocapitalize="characters"
           autocomplete="off" spellcheck="false" class="codeinput">
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

export const UI_CSS = `
*{box-sizing:border-box}
html,body{margin:0;height:100%;overflow:hidden;background:${PALETTE.sky};
  font:16px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:${PALETTE.text};
  -webkit-user-select:none;user-select:none;touch-action:none}
canvas{display:block;position:fixed;inset:0}
.overlay{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
  flex-direction:column;gap:8px;z-index:10;pointer-events:none;text-align:center;
  background:rgba(14,16,20,.72);backdrop-filter:blur(3px)}
.card{pointer-events:auto;background:${PALETTE.panel};padding:24px;border-radius:14px;
  display:flex;flex-direction:column;gap:10px;min-width:260px}
h1{margin:0 0 4px;font-size:28px;letter-spacing:.08em;text-transform:lowercase}
input,button{font:inherit;padding:12px 14px;border-radius:10px;border:1px solid #2c3242;
  background:#11141b;color:${PALETTE.text}}
button{background:${PALETTE.accent};border:0;color:#04121f;font-weight:600;cursor:pointer}
button:disabled{background:#2c3242;color:${PALETTE.textDim};cursor:default}
.row{display:flex;align-items:center;gap:10px;padding:6px 2px}
.row.gone{opacity:.4}
.dot{width:12px;height:12px;border-radius:50%;display:inline-block;flex:0 0 auto}
.nm{flex:1;text-align:left}
.sc{font-variant-numeric:tabular-nums;font-weight:600}
.big{font-size:30px;font-weight:700}
.rule{font-size:19px;color:${PALETTE.text};max-width:80vw}
.dim{color:${PALETTE.textDim};font-size:14px}
.err{color:${PALETTE.hazard};font-size:14px;min-height:18px;max-width:26ch}
.tagline{color:${PALETTE.textDim};font-size:13.5px;margin:-4px 0 6px}
h2{margin:0 0 2px;font-size:20px;font-weight:600}
.codeinput{font-size:30px;text-align:center;letter-spacing:.26em;text-indent:.26em;
  font-weight:700;text-transform:uppercase}
.codeinput:read-only{opacity:.75}
.codeblock{display:flex;flex-direction:column;align-items:center;gap:6px;
  padding:4px 0 12px;border-bottom:1px solid #2c3242;margin-bottom:4px}
.codelabel{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:${PALETTE.textDim}}
.code{font-size:44px;font-weight:700;letter-spacing:.22em;line-height:1;
  font-variant-numeric:tabular-nums;text-indent:.22em;color:${PALETTE.text}}
button.ghost{background:transparent;border:1px solid #2c3242;color:${PALETTE.textDim};
  font-size:13px;padding:7px 14px;font-weight:500;min-height:36px}
button.ghost:hover{color:${PALETTE.text}}
.linkbox{font-size:12px;width:100%;text-align:center}
#hud{position:fixed;inset:auto 0 0 0;padding:10px 14px;z-index:5;
  display:flex;justify-content:space-between;color:${PALETTE.textDim};font-size:13px}
`;
