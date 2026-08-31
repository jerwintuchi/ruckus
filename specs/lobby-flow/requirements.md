# Lobby Flow — Requirements

> **The flow:** open the game → create a room or join one → share the code → play.

Today there is no such flow. Every player types a code they invent, and the server
creates that room if it does not exist. Three consequences, all found in a real
playtest:

- **Codes collide.** Two unrelated groups who both type `PLAY` land in *the same room*
  and are dropped into a match together.
- **A typo is silent.** Mistyping a friend's code creates an empty room and leaves you
  alone in it, with nothing on screen saying so.
- **The code minter is dead code.** `newRoomCode()` avoids collisions and `/room`
  serves it; nothing has ever called either.

This spec settles the flow. The *look* of these screens belongs to
`specs/visual-direction/` (R10–R12, T13–T17) and is not restated here — this spec says
what happens, that one says what it looks like.

## Creating

**R1**: As a player, I create a room and the server gives me a code nobody else has.
- AC: a new `create` message mints a code server-side and joins me to it in one step
- AC: the code never collides with a live room
- AC: a code from a room that has just closed is **not** reissued for `CODE_COOLDOWN_MS`,
      so a stale link cannot drop someone into strangers' game
- AC: the creator is the host
- AC: the client never invents a code — the server is the only thing that mints one

**R2**: As the host, sharing the room is one action.
- AC: the lobby shows the code at a size readable across a room
- AC: one control copies an invite link containing the code
- AC: where the clipboard is unavailable — a phone on a LAN over plain http is not a
      secure context — the link is offered selectable instead of failing silently

## Getting in without being told off

**R9**: A player needs a name, and the controls say so before they are pressed.
- AC: `create` and `join` are unavailable until a name of 2–12 characters is entered,
      and each says *why* rather than sitting dead (the treatment `joinState` already
      gives Join — no control in this game is ever silently disabled)
- AC: the note updates as the player types, not on submit
- AC: **the server keeps sanitizing regardless** (I2). The client rule is a courtesy to
      the player; the server rule is the trust boundary, and neither replaces the other.
- AC: two characters, so initials work

**R10**: Copying the invite is one tap, and the player is told it worked.
- AC: the control is an icon, not a sentence, and carries an accessible label
- AC: a transient banner confirms the copy; no link text is shown in the normal case
- AC: **it works over plain http.** `navigator.clipboard` needs a secure context and a
      phone on a LAN does not have one, so the legacy `execCommand` path is not a
      nicety — it is the path that runs. Showing selectable text survives only as the
      last resort when both fail.

**R11**: The lobby says who arrived and who left.
- AC: a transient line names a player joining or dropping, so the roster is not a
      silent list that mutates while you look away
- AC: it never interrupts: no dialog, nothing to dismiss, nothing that blocks Start

**R12**: A match can be played again without leaving the room.
- AC: the room returns to the lobby after the match result, with round and scores reset
- AC: the match-result card says so, so nobody is left wondering whether it is over

## Results

**R13**: Every result names every player, including the ones who scored nothing.
- AC: the round result lists **all connected players**, ranked by points that round,
      with zeros shown rather than dropped. Filtering to scorers meant a player who had
      a bad round vanished from the board entirely
- AC: the match result shows **final standings**, not only the winner. Losing is
      supposed to stay watchable (vision pillar 3); being absent is the opposite
- AC: **you can find yourself at a glance** — the local player's row is marked
- AC: a disconnected player is still listed, because they were still in the match
- AC: eight rows fit a landscape phone without the card leaving the screen

## Joining

**R3**: As a player, I join an existing room by its code.
- AC: `join` **never creates a room**. An unknown code returns `NO_ROOM`
- AC: the error says the room was not found, and the code stays in the field so it can
      be corrected rather than retyped
- AC: codes are case-insensitive on entry and always displayed upper case
- AC: whitespace and dashes pasted around a code are ignored

**R4**: A shared link joins directly.
- AC: opening `?room=CODE` skips the menu and offers to join that room
- AC: the code arrives filled in and read-only, so a shared link cannot be half-edited
- AC: if that room has gone, the error explains it and offers the menu rather than a
      dead end

**R5**: The lobby tells a player what is happening.
- AC: every player is listed with their colour, name and connection state
- AC: the host is marked, and non-hosts are told who they are waiting for
- AC: the start control states why it is unavailable ("waiting for one more") rather
      than being merely disabled
- AC: a player who leaves is shown as disconnected rather than vanishing, so the room
      does not silently reshuffle underneath everyone

## The state machine

**R6**: The client has one screen at a time, and every transition is explicit.
- AC: states are `MENU → CREATING | JOINING → LOBBY → (match) → LOBBY`
- AC: an error returns to the screen that caused it with the input intact
- AC: a disconnect returns to `MENU` with an explanation, never a frozen lobby
- AC: property — every state is reachable and every error path leads somewhere

**R7**: The flow is testable without a browser.
- AC: the state machine is a pure module, separate from the DOM that renders it
- AC: property — feeding any legal sequence of server messages never lands the client
      in an undefined state

## What does not change

**R8**: The trust boundary and the wire hold.
- AC: `create` is validated like every other client message (I2)
- AC: the client still sends intentions only; the server still decides
- AC: bots keep working unchanged — they join by code, which is still a first-class path
