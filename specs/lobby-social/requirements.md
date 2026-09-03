# Lobby Social — Requirements

> **The room before the game.** Who is here, what colour they are, whether they are ready,
> and the host's power to start it or remove someone (RD-108).

*The lobby currently lists names and lets the host start whenever they like. Everything
below is new except the join/leave notice, which exists and is being reworked.*

## Requirements

**R1**: A player readies up, and everyone can see who has.
- AC: a large READY control, the only prominent thing on a player's own lobby screen
- AC: readiness is per-player state on the server, never inferred by the client
- AC: every player's row shows their state, and it updates for everyone within one message
- AC: readying is reversible before the match starts — a player may un-ready
- AC: a player who readies and then disconnects does not hold the room ready

**R2**: The host starts, and only once everyone is ready.
- AC: START is visible to the host alone (this already holds and must not regress)
- AC: START is disabled until every **connected** player is ready, and says *why* it is
      disabled — naming who is being waited for, not just greying out (lobby-flow R9's rule)
- AC: readiness is a gate, not a trigger: the host still chooses the moment
- AC: a player who joins after everyone else readied resets the gate — they are not ready,
      so START closes again
- AC: `MIN_PLAYERS_TO_START` still applies; ready does not bypass it

**R3**: A player chooses their colour in the lobby.
- AC: the eight palette colours are shown as one row of tappable swatches
- AC: a colour already claimed by another player is visibly unavailable and cannot be taken
- AC: the claim is **server-authoritative** (I1): the client asks, the server decides
- AC: two players tapping the same colour in the same tick — one wins, the other is told,
      and no two players ever hold the same colour
- AC: a player who never chooses keeps the colour their slot was assigned, which is
      already distinct (RD-007) — choosing is an option, never a chore
- AC: a colour is released the moment its owner leaves the room

**R4**: The room says who arrived, who left, and who was removed.
- AC: a toast, not a permanent line: "sam joined", "sam left", "sam was removed"
- AC: it names the player in **their own colour**, so the name and the capsule agree
- AC: several arrivals at once do not stack into a wall of toasts
- AC: a player's own arrival is not announced to themselves

**R5**: The host can remove a player, and that player can come back.
- AC: a remove control appears on every row except the host's own, host-only
- AC: the removed player lands on the main menu with a plain reason — "the host removed
      you from the room"
- AC: they may rejoin with the code; this is not a ban (RD-108)
- AC: removal uses the **existing disconnect path**, so I8's guarantees are unchanged and
      no new server state is introduced
- AC: a non-host `kick` message is ignored — replied to that socket, nothing mutated,
      nothing broadcast (I2)
- AC: the host cannot remove themselves; host handover on leaving is unchanged (lobby R3)

**R6**: None of this can stall a room.
- AC: no lobby state requires every player to act
- AC: a disconnected player is not waited for by the ready gate, the colour claim or a toast
- AC: spamming ready, colour or kick messages cannot wedge the lobby or the match start

## Not this spec

- **Kicking mid-match.** The lobby is the only place it applies. Mid-match, a disruptive
  player is a disconnect (I8) and the round carries on.
- **A ban list.** RD-108 chose rejoinable removal deliberately.
- **Custom colours.** The palette is closed and chosen for colour-blindness (RD-007).
- **Chat.** Everyone is in the same room; that is the point.
