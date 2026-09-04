/**
 * Who you are and which room you were in, remembered on the device (RD-110).
 *
 * iOS discards a backgrounded tab under memory pressure and RELOADS it when you come
 * back. Every bit of JS state goes with it — the socket, the roster, the name you typed.
 * RD-109 taught the socket to reconnect, which does nothing here: there is no socket left
 * to reconnect and no name to rejoin with. The playtester came back to an empty name field
 * and a join screen, twice, having been host both times.
 *
 * So the identity outlives the page. On load, a link carrying `?room=CODE` plus a
 * remembered name for THAT room is enough to walk straight back in, and the server's
 * join-by-name reclaims the slot and the score (I8).
 *
 * Deliberately narrow: this is a convenience for getting back into a room you were
 * already in. It is not a profile, not an account, and nothing here is trusted — the
 * server validates the name and the code exactly as it would from a stranger (I2).
 */

const KEY = "ruckus.session";

/**
 * How long a remembered session is worth offering.
 *
 * A match is ten minutes and a room retires when it empties, so half an hour is generous
 * and still short enough that yesterday's tab does not rejoin itself when you open it.
 */
export const SESSION_TTL_MS = 30 * 60 * 1000;

export interface Session {
  name: string;
  code: string;
}

interface Stored extends Session {
  at: number;
}

/**
 * Remember it, or do not — never throw.
 *
 * A private window and a browser set to block site data both make every call here throw,
 * and neither is a reason for the game to stop working. Same discipline the mute
 * preference already uses (RD-068).
 */
export function rememberSession(store: Storage | null, s: Session, now: number): void {
  if (!store) return;
  try {
    store.setItem(KEY, JSON.stringify({ name: s.name, code: s.code, at: now } as Stored));
  } catch { /* storage is a convenience, never a dependency */ }
}

export function forgetSession(store: Storage | null): void {
  if (!store) return;
  try { store.removeItem(KEY); } catch { /* as above */ }
}

/**
 * The session for `code`, if there is a usable one.
 *
 * Returns null rather than anything doubtful: wrong room, too old, malformed, or a name
 * that would not survive the server's own sanitiser. A remembered session that is merely
 * *probably* right would drag a player into a room they did not tap.
 */
export function loadSession(store: Storage | null, code: string, now: number): Session | null {
  if (!store) return null;
  let raw: string | null;
  try { raw = store.getItem(KEY); } catch { return null; }
  if (!raw) return null;

  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return null; }
  if (typeof parsed !== "object" || parsed === null) return null;

  const { name, code: stored, at } = parsed as Partial<Stored>;
  if (typeof name !== "string" || typeof stored !== "string" || typeof at !== "number") return null;
  if (!Number.isFinite(at) || now - at > SESSION_TTL_MS) return null;
  if (stored !== code) return null;
  // The server trims and clamps names; a stored one that trims to nothing is not a name.
  if (name.trim().length === 0) return null;

  return { name, code: stored };
}

/**
 * The query string with `room` set, and everything else left alone (RD-112).
 *
 * The invite link is the whole sharing flow, so the code goes in the URL — but the line
 * that did it wrote `?room=CODE` and thereby replaced the ENTIRE query string. Creating
 * or joining a room silently destroyed:
 *
 *   ?debug=1    the on-device instrument every playtest reads
 *   ?server=    pointing a client at another host
 *   ?surface=   the screenshot harness's touch override (RD-052)
 *   ?insets=    a real phone's safe areas, replayed (RD-055)
 *
 * Found when a page iOS had discarded came back without its debug overlay — the URL it
 * reloaded was the one this function had already stripped.
 */
export function withRoom(search: string, code: string): string {
  const params = new URLSearchParams(search);
  params.set("room", code);
  return `?${params.toString()}`;
}

/**
 * A panel the screenshot harness has been asked to open on load (RD-116).
 *
 * The harness photographs a page it cannot touch, so a panel that only exists after a tap
 * is a panel no automated shot can ever check — which is how the settings overlay shipped
 * opening UNDERNEATH the lobby card (RD-115). This is the same idiom `?surface=` (RD-052)
 * and `?insets=` (RD-055) already established: a URL switch that lets the harness reach a
 * state, and does nothing whatsoever without the parameter.
 *
 * A closed set, matched exactly. A switch a stranger might have in a shared link must
 * never be able to do something surprising, so anything unrecognised opens nothing.
 */
export type OpenablePanel = "settings";

export function openOnLoad(search: string): OpenablePanel | null {
  let value: string | null;
  try { value = new URLSearchParams(search).get("open"); } catch { return null; }
  return value === "settings" ? "settings" : null;
}
