/**
 * Screens: join, lobby, round intro, results. Plain DOM over the canvas — a party
 * game's UI is four screens of text and a button, and building it in WebGL would
 * cost legibility and accessibility for nothing.
 */
import type { MatchState, PlayerView } from "@ruckus/shared";
import { PALETTE } from "./kit/palette.ts";

export interface UiHandlers {
  onJoin(code: string, name: string): void;
  onStart(): void;
}

export class Ui {
  private readonly root: HTMLElement;
  private readonly join: HTMLElement;
  private readonly lobby: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly scoreboard: HTMLElement;

  constructor(container: HTMLElement, private readonly handlers: UiHandlers) {
    this.root = container;
    this.root.innerHTML = TEMPLATE;
    this.join = this.q("#join");
    this.lobby = this.q("#lobby");
    this.banner = this.q("#banner");
    this.scoreboard = this.q("#scoreboard");

    this.q("#joinBtn").addEventListener("click", () => {
      const code = (this.q("#code") as HTMLInputElement).value.trim().toUpperCase();
      const name = (this.q("#name") as HTMLInputElement).value.trim() || "player";
      if (code.length === 4) this.handlers.onJoin(code, name);
    });
    this.q("#startBtn").addEventListener("click", () => this.handlers.onStart());
  }

  private q(sel: string): HTMLElement {
    const el = this.root.querySelector(sel);
    if (!el) throw new Error(`missing ${sel}`);
    return el as HTMLElement;
  }

  showJoin(): void {
    this.join.style.display = "flex";
    this.lobby.style.display = "none";
  }

  /** The lobby is also the between-rounds scoreboard; it is the same information. */
  showLobby(players: PlayerView[], host: number, mySlot: number, state: MatchState): void {
    this.join.style.display = "none";
    const inMatch = state !== "LOBBY";
    this.lobby.style.display = inMatch ? "none" : "flex";
    this.renderScores(players);

    const btn = this.q("#startBtn") as HTMLButtonElement;
    btn.style.display = mySlot === host ? "block" : "none";
    btn.disabled = players.filter((p) => p.connected).length < 2;
    btn.textContent = btn.disabled ? "waiting for one more" : "start";
  }

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
  BAD_CODE: "a code is four letters",
  BAD_MSG: "something went wrong",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}

const TEMPLATE = `
<div id="banner" class="overlay" style="display:none"></div>
<div id="join" class="overlay">
  <div class="card">
    <h1>ruckus</h1>
    <input id="name" placeholder="your name" maxlength="12" autocomplete="off">
    <input id="code" placeholder="room code" maxlength="4" autocapitalize="characters" autocomplete="off">
    <button id="joinBtn">join</button>
    <div id="error" class="err"></div>
  </div>
</div>
<div id="lobby" class="overlay" style="display:none">
  <div class="card">
    <div id="scoreboard"></div>
    <button id="startBtn">start</button>
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
.err{color:${PALETTE.hazard};font-size:14px;min-height:18px}
#hud{position:fixed;inset:auto 0 0 0;padding:10px 14px;z-index:5;
  display:flex;justify-content:space-between;color:${PALETTE.textDim};font-size:13px}
`;
