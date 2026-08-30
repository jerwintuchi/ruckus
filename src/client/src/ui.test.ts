import { describe, expect, it, vi } from "vitest";
import { Ui } from "./ui.ts";

/**
 * A tiny DOM stub. Enough to prove the room code actually reaches the screen, which
 * is the thing that was missing: the code existed only in the join input and the URL,
 * so once you were in the lobby it was nowhere on screen — in a party game, the one
 * piece of information you have to read aloud.
 */
function stubDom() {
  class El {
    tagName: string;
    children: El[] = [];
    style: Record<string, string> = {};
    textContent = "";
    value = "";
    disabled = false;
    id = "";
    className = "";
    listeners: Record<string, (() => void)[]> = {};
    private html = "";

    constructor(tag: string) { this.tagName = tag; }
    set innerHTML(v: string) { this.html = v; this.parse(v); }
    get innerHTML(): string { return this.html; }
    addEventListener(ev: string, fn: () => void) { (this.listeners[ev] ??= []).push(fn); }
    click() { for (const fn of this.listeners.click ?? []) fn(); }
    select() {}
    querySelector(sel: string): El | null {
      const id = sel.replace("#", "");
      const walk = (n: El): El | null => {
        if (n.id === id) return n;
        for (const c of n.children) { const hit = walk(c); if (hit) return hit; }
        return null;
      };
      for (const c of this.children) { const hit = walk(c); if (hit) return hit; }
      return null;
    }
    /** Build a flat element per id in the template — enough for lookups by id. */
    private parse(html: string) {
      this.children = [];
      for (const m of html.matchAll(/<(\w+)[^>]*id="([^"]+)"/g)) {
        const el = new El(m[1]!);
        el.id = m[2]!;
        this.children.push(el);
      }
    }
  }
  const root = new El("div");
  return { root: root as unknown as HTMLElement, El };
}

const players = (n: number) =>
  Array.from({ length: n }, (_, slot) => ({
    slot, name: `p${slot}`, colour: "#1ab0ff", score: 0, connected: true,
  }));

describe("the room code is on screen (shell T18)", () => {
  it("renders the code the server confirmed, not the one that was typed", () => {
    const { root } = stubDom();
    const ui = new Ui(root, { onJoin: () => {}, onStart: () => {} });
    ui.setCode("WXYZ");
    expect(root.querySelector("#roomCode")!.textContent).toBe("WXYZ");
  });

  it("shows a placeholder before a room is joined, never a stale code", () => {
    const { root } = stubDom();
    new Ui(root, { onJoin: () => {}, onStart: () => {} });
    expect(root.querySelector("#roomCode")!.textContent).not.toMatch(/[A-Z]{4}/);
  });

  it("keeps showing the code across lobby re-renders", () => {
    const { root } = stubDom();
    const ui = new Ui(root, { onJoin: () => {}, onStart: () => {} });
    ui.setCode("ABCD");
    ui.showLobby(players(3), 0, 0, "LOBBY");
    ui.showLobby(players(4), 0, 0, "LOBBY");
    expect(root.querySelector("#roomCode")!.textContent).toBe("ABCD");
  });

  it("copies an invite link containing the code", async () => {
    const { root } = stubDom();
    const written: string[] = [];
    vi.stubGlobal("navigator", { clipboard: { writeText: async (t: string) => { written.push(t); } } });
    vi.stubGlobal("location", { origin: "http://192.168.1.9:5173", pathname: "/" });

    const ui = new Ui(root, { onJoin: () => {}, onStart: () => {} });
    ui.setCode("PLAY");
    (root.querySelector("#shareBtn") as unknown as { click(): void }).click();
    await new Promise((r) => setTimeout(r, 0));

    expect(written).toHaveLength(1);
    expect(written[0]).toContain("?room=PLAY");
    vi.unstubAllGlobals();
  });

  it("falls back to a selectable box when the clipboard is unavailable", async () => {
    // A LAN address over plain http is not a secure context, so on a phone this is
    // the path that actually runs — it must not fail silently.
    const { root } = stubDom();
    vi.stubGlobal("navigator", { clipboard: { writeText: async () => { throw new Error("insecure"); } } });
    vi.stubGlobal("location", { origin: "http://192.168.1.9:5173", pathname: "/" });

    const ui = new Ui(root, { onJoin: () => {}, onStart: () => {} });
    ui.setCode("PLAY");
    (root.querySelector("#shareBtn") as unknown as { click(): void }).click();
    await new Promise((r) => setTimeout(r, 0));

    const box = root.querySelector("#linkBox")!;
    expect(box.style.display).toBe("block");
    expect((box as unknown as { value: string }).value).toContain("?room=PLAY");
    vi.unstubAllGlobals();
  });
});

describe("the lobby explains itself (shell T18)", () => {
  it("offers the start button to the host and hides it from everyone else", () => {
    const { root } = stubDom();
    const ui = new Ui(root, { onJoin: () => {}, onStart: () => {} });
    ui.showLobby(players(3), 0, 0, "LOBBY");
    expect(root.querySelector("#startBtn")!.style.display).toBe("block");
    ui.showLobby(players(3), 0, 2, "LOBBY");
    expect(root.querySelector("#startBtn")!.style.display).toBe("none");
  });

  it("tells a non-host who they are waiting for, by name", () => {
    const { root } = stubDom();
    const ui = new Ui(root, { onJoin: () => {}, onStart: () => {} });
    ui.showLobby(players(3), 0, 2, "LOBBY");
    expect(root.querySelector("#waitNote")!.textContent).toContain("p0");
  });

  it("says why the button is dead rather than just disabling it", () => {
    const { root } = stubDom();
    const ui = new Ui(root, { onJoin: () => {}, onStart: () => {} });
    ui.showLobby(players(1), 0, 0, "LOBBY");
    const btn = root.querySelector("#startBtn")!;
    expect((btn as unknown as { disabled: boolean }).disabled).toBe(true);
    expect(btn.textContent).toContain("waiting");
  });

  it("hides the lobby once a match is running", () => {
    const { root } = stubDom();
    const ui = new Ui(root, { onJoin: () => {}, onStart: () => {} });
    ui.showLobby(players(3), 0, 0, "ROUND_PLAY");
    expect(root.querySelector("#lobby")!.style.display).toBe("none");
  });
});

describe("the round card and results (shell T18)", () => {
  it("renders the minigame's one sentence verbatim", () => {
    const { root } = stubDom();
    const ui = new Ui(root, { onJoin: () => {}, onStart: () => {} });
    const rule = "The floor is falling, so keep moving.";
    ui.showIntro("Falling Floor", rule, 3, 5);
    const html = root.querySelector("#banner")!.innerHTML;
    expect(html).toContain(rule);
    expect(html).toContain("Falling Floor");
    expect(html).toContain("round 3 of 5");
  });

  it("escapes a name rather than letting it inject markup", () => {
    // Names come from other players and are shown to everyone (I2).
    const { root } = stubDom();
    const ui = new Ui(root, { onJoin: () => {}, onStart: () => {} });
    ui.showRoundEnd({ 0: 3 }, [
      { slot: 0, name: "<img src=x>", colour: "#1ab0ff", score: 3, connected: true },
    ]);
    expect(root.querySelector("#banner")!.innerHTML).not.toContain("<img");
  });

  it("orders the round result by points, highest first", () => {
    const { root } = stubDom();
    const ui = new Ui(root, { onJoin: () => {}, onStart: () => {} });
    ui.showRoundEnd({ 0: 1, 1: 3, 2: 2 }, players(3));
    const html = root.querySelector("#banner")!.innerHTML;
    const order = ["p1", "p2", "p0"].map((n) => html.indexOf(n));
    expect(order[0]).toBeLessThan(order[1]!);
    expect(order[1]).toBeLessThan(order[2]!);
  });

  it("leaves nobody who scored zero on the round card", () => {
    const { root } = stubDom();
    const ui = new Ui(root, { onJoin: () => {}, onStart: () => {} });
    ui.showRoundEnd({ 0: 3, 1: 0 }, players(2));
    const html = root.querySelector("#banner")!.innerHTML;
    expect(html).toContain("p0");
    expect(html).not.toContain("p1");
  });

  it("names the winner at the end of a match", () => {
    const { root } = stubDom();
    const ui = new Ui(root, { onJoin: () => {}, onStart: () => {} });
    ui.showMatchEnd(players(2)[1]);
    expect(root.querySelector("#banner")!.innerHTML).toContain("p1");
  });
});
