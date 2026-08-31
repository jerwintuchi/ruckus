/**
 * The client's screen state machine (lobby-flow R6, R7).
 *
 * Pure: no DOM, no network, no timers. This is the piece that did not exist — the
 * client's screen used to be whatever `style.display` had last been written, which is
 * a state machine nobody can test and nobody can read.
 *
 * `reduce` is total (P3): every (state, event) pair returns a defined state, so no
 * sequence of server messages can strand a player on a screen with no way out.
 */
import type { ErrCode, MatchState, PlayerView } from "@ruckus/shared";
import { normalizeCode } from "@ruckus/shared";

export type Screen = "MENU" | "CREATING" | "JOINING" | "LOBBY" | "IN_MATCH";

export interface FlowState {
  screen: Screen;
  /** The room we are in, or the one being typed. Always upper case, always ≤ 4. */
  code: string;
  /** True when the code arrived from a shared link, so it must not be edited (R4). */
  codeLocked: boolean;
  name: string;
  error: string | null;
  /** A join is in flight. Without this a tap on Join has no visible consequence. */
  connecting: boolean;
  mySlot: number;
  host: number;
  players: PlayerView[];
}

export type FlowEvent =
  | { t: "connecting" }
  | { t: "setName"; name: string }
  | { t: "setCode"; code: string }
  | { t: "wantCreate" }
  | { t: "wantJoin" }
  | { t: "back" }
  | { t: "deepLink"; code: string }
  | { t: "welcome"; slot: number; code: string; host: number }
  | { t: "room"; players: PlayerView[]; host: number; state: MatchState }
  | { t: "err"; code: ErrCode }
  | { t: "disconnected" };

/**
 * What each error means and — the part that matters — what to do about it (P5).
 * An error that only says what went wrong leaves a player stuck.
 */
export const ERROR_TEXT: Record<ErrCode, string> = {
  NO_ROOM: "No room with that code. Check it, or create your own.",
  ROOM_FULL: "That room is full — 8 players is the limit.",
  NOT_HOST: "Only the host can start the match.",
  TOO_FEW: "You need at least two players to start.",
  BAD_CODE: "A room code is four characters. Check it and try again.",
  BAD_MSG: "Something went wrong. Try again.",
};

export const initialState = (): FlowState => ({
  screen: "MENU",
  code: "",
  codeLocked: false,
  name: "",
  connecting: false,
  error: null,
  mySlot: -1,
  host: -1,
  players: [],
});

/** Which screen an error returns you to, with your input intact (P4). */
function screenForError(state: FlowState): Screen {
  if (state.screen === "CREATING") return "MENU";
  if (state.screen === "JOINING") return "JOINING";
  return state.screen === "MENU" ? "MENU" : "LOBBY";
}

export function reduce(state: FlowState, event: FlowEvent): FlowState {
  switch (event.t) {
    case "connecting":
      return { ...state, connecting: true, error: null };

    case "setName":
      return { ...state, name: event.name.slice(0, 12), error: null };

    case "setCode":
      // A locked code came from a link; editing it would half-break the invite.
      if (state.codeLocked) return state;
      return { ...state, code: normalizeCode(event.code), error: null };

    case "wantCreate":
      return { ...state, screen: "CREATING", error: null };

    case "wantJoin":
      return { ...state, screen: "JOINING", error: null };

    case "back":
      // Leaving the join screen releases a linked code, so Back is a real way out
      // rather than a trap you can never edit your way off.
      return {
        ...state, screen: "MENU", error: null, codeLocked: false, code: "", connecting: false,
      };

    case "deepLink":
      return {
        ...state,
        screen: "JOINING",
        code: normalizeCode(event.code),
        codeLocked: true,
        error: null,
      };

    case "welcome":
      return {
        ...state,
        connecting: false,
        screen: "LOBBY",
        code: event.code,
        codeLocked: false,
        mySlot: event.slot,
        host: event.host,
        error: null,
      };

    case "room":
      return {
        ...state,
        // The server's own match state decides whether the lobby is showing.
        screen: state.screen === "MENU" || state.screen === "JOINING" || state.screen === "CREATING"
          ? state.screen
          : event.state === "LOBBY" ? "LOBBY" : "IN_MATCH",
        players: event.players,
        host: event.host,
      };

    case "err":
      return {
        ...state,
        screen: screenForError(state),
        error: ERROR_TEXT[event.code],
        connecting: false,
      };

    case "disconnected":
      // Never a frozen lobby: say what happened and offer the way back.
      return {
        ...initialState(),
        name: state.name,
        error: "Lost connection to the server.",
      };

    default:
      // Total by construction: an unknown event leaves the state untouched.
      return state;
  }
}

/** A name has to be typed, and short enough to fit a lobby row. */
export const NAME_MIN = 2;
export const NAME_MAX = 12;

/**
 * Is this name usable, and if not, what should the player be told? (R9)
 *
 * A courtesy to the player, not a security boundary. `sanitizeName` on the server is
 * the boundary and still runs on everything (I2) — it strips control characters and
 * truncates, and it always will, because a client is untrusted no matter how polite
 * this function is.
 */
export function nameState(raw: string): { valid: boolean; note: string } {
  const name = raw.trim();
  if (name.length === 0) return { valid: false, note: "Type a name so people know who you are." };
  if (name.length < NAME_MIN) {
    const short = NAME_MIN - name.length;
    return { valid: false, note: `${short} more character${short === 1 ? "" : "s"}.` };
  }
  return { valid: true, note: "" };
}

/**
 * Can this player press Create, and if not, why not? (R9)
 *
 * Start has always explained itself and Join learned to (RD-029). Create was the last
 * control that could sit dead with nothing said.
 */
export function createState(state: FlowState): { canCreate: boolean; note: string } {
  if (state.screen === "CREATING" || state.connecting) {
    return { canCreate: false, note: "Creating…" };
  }
  return { canCreate: nameState(state.name).valid, note: nameState(state.name).note };
}

/**
 * Should the "joining in" card show for this room update?
 *
 * Only for a player who arrived while a match was already running — one who has seen
 * neither an intro nor a round start since joining. The first version asked "is the
 * match not in the lobby and are we not playing", which is also true at the round
 * intro and at round end, so the card appeared over the rule card and over the
 * scoreboard during perfectly normal play (RD-035).
 */
export const shouldShowWaiting = (state: MatchState, roundSeen: boolean): boolean =>
  state !== "LOBBY" && !roundSeen;

/**
 * Can this player press Join, and if not, what should they be told? (P5)
 *
 * The Start button has always explained itself. Join did not: it was `disabled` with
 * nothing said, so on a phone — where there is no cursor to reveal a dead control — a
 * tap on it was indistinguishable from a broken game. Found in a playtest, not by a
 * test, which is the same way RD-008 was found.
 */
export function joinState(state: FlowState): { canJoin: boolean; note: string } {
  if (state.connecting) return { canJoin: false, note: "Connecting…" };
  // A name first: joining without one puts another "player" in the lobby (R9).
  const named = nameState(state.name);
  if (!named.valid) return { canJoin: false, note: named.note };
  if (state.code.length === 0) {
    return { canJoin: false, note: "Type the room's four-character code." };
  }
  if (state.code.length < 4) {
    const short = 4 - state.code.length;
    return { canJoin: false, note: `${short} more character${short === 1 ? "" : "s"}.` };
  }
  return { canJoin: true, note: "" };
}

/** Can this player press Start, and if not, what should they be told? */
export function startState(state: FlowState): { canStart: boolean; label: string; note: string } {
  const connected = state.players.filter((p) => p.connected);
  const isHost = state.mySlot === state.host;
  const hostName = state.players.find((p) => p.slot === state.host)?.name ?? "the host";
  if (!isHost) return { canStart: false, label: "", note: `Waiting for ${hostName} to start` };
  if (connected.length < 2) return { canStart: false, label: "Waiting for one more", note: "" };
  return { canStart: true, label: "Start", note: "" };
}

/**
 * Who arrived and who left between two rosters (R11).
 *
 * Pure and order-independent: the server sends whole rosters, not deltas, so the
 * client works out the change itself. Comparing by slot rather than by name, because
 * two players may legitimately share one.
 */
export function rosterChange(
  before: readonly PlayerView[],
  after: readonly PlayerView[],
): { joined: string[]; left: string[] } {
  const was = new Map(before.map((p) => [p.slot, p.name]));
  const is = new Map(after.map((p) => [p.slot, p.name]));
  const joined = [...is].filter(([slot]) => !was.has(slot)).map(([, name]) => name);
  const left = [...was].filter(([slot]) => !is.has(slot)).map(([, name]) => name);
  return { joined, left };
}

export interface Standing {
  player: PlayerView;
  points: number;
  /** 1-based, with ties sharing a place. */
  place: number;
}

/**
 * Everyone, ranked (lobby-flow R13).
 *
 * **Including the players who scored nothing.** The round card used to filter to
 * `points > 0`, so a player who had a bad round simply vanished from the board — which
 * is the exact opposite of "losing is still watchable" (vision pillar 3). A leaderboard
 * that omits you is not a leaderboard you are in.
 *
 * Ties share a place and break by slot, so the order is stable across renders and
 * across clients: two players on the same points always appear in the same order.
 */
export function standings(
  players: readonly PlayerView[],
  points: Record<number, number>,
): Standing[] {
  const ranked = [...players]
    .map((player) => ({ player, points: points[player.slot] ?? 0 }))
    .sort((a, b) => b.points - a.points || a.player.slot - b.player.slot);

  let place = 0;
  let previous = Number.NaN;
  return ranked.map((row, i) => {
    if (row.points !== previous) {
      place = i + 1;
      previous = row.points;
    }
    return { ...row, place };
  });
}
