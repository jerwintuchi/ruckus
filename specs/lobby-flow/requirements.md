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
