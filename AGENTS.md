# AGENTS.md

This file gives AI coding agents orientation on the `gameroom` package — a Cloudflare Durable Objects framework for building multiplayer games. Read this before touching any file.

---

## What This Project Is

`gameroom` is a TypeScript library that provides abstract Durable Object base classes for multiplayer game servers on Cloudflare Workers. Consumers extend the base classes and implement a handful of abstract methods — the framework handles WebSocket lifecycle, state broadcasting, persistence, and player tracking automatically.

### Package Layout

```
src/
├── GameRoom.ts    — Abstract base for turn-based / event-driven rooms
├── MatchMaker.ts  — Groups queued WebSocket connections into lobbies via alarms
├── ChatRoom.ts    — Concrete reference implementation of GameRoom
├── types.ts       — Shared types: Player, Action, Result, GameState, JSONValue, ActionMap
└── index.ts       — Public re-exports (this is the package surface)
```

**Public surface (`index.ts`):** `GameRoom`, `MatchMaker`, `ChatRoom`, and types `Player`, `Action`, `Result`, `JSONValue`, `ActionMap`. `GameState` is not exported — consumers interact with it only through `this.currentGameState`.

---

## Core Concepts

### GameRoom

Consumers subclass `GameRoom<State, Actions, Config, Env>` and implement five abstract methods:

| Method | Purpose |
|---|---|
| `getInitialState()` | Returns the starting state — called once on first construction only, never after hibernation recovery |
| `getConfig()` | Returns room config — called every construction including after hibernation; keep it static |
| `validatePlayerTryJoin()` | Gate incoming WebSocket connections; return `{ success: false, reason }` to reject |
| `validatePlayerAction(player, action)` | Validate each incoming action before it is applied; `async` |
| `onValidPlayerAction(player, action)` | Apply the validated action to state |

State lives in `this.currentGameState` (a `GameState<State>` instance). Every `UpdateState()` call automatically broadcasts the full state to all connected clients and persists it to Durable Object storage. Never manually broadcast or persist state — `UpdateState()` handles both.

### State Broadcasting Rules

- `UpdateState(partial)` merges the partial, broadcasts to all clients, and persists — one call does all three.
- Any key named `secrets` is stripped from the broadcast payload but kept in storage. Use it for hidden server-side data.
- Batch related changes into a single `UpdateState()` call to avoid redundant broadcasts.
- After every state update, the `onStateUpdate()` hook fires. Override it if you need a post-broadcast side effect.

### GameState API

`this.currentGameState` exposes these methods:

| Method | Notes |
|---|---|
| `UpdateState(partial)` | Merge partial and trigger broadcast + persist |
| `getField(key)` | Read a single field |
| `getStateValues()` | Read full state object |
| `incrementField(key, by?)` | Numeric increment; calls `UpdateState` |
| `decrementField(key, by?)` | Numeric decrement; calls `UpdateState` |
| `pushToField(key, item)` | Append to an array field; calls `UpdateState` |

Every method that mutates state triggers a broadcast. Don't chain multiple mutating calls when one `UpdateState` with a merged partial will do.

### Player Lifecycle

- `onRoomStart()` — fires on first construction (no prior persisted state). Use it to set up initial server-side logic.
- `onPlayerJoin(player)` — fires after the player is registered and state has been broadcast.
- `onPlayerLeave(player)` — fires after disconnect and removal from active players. **Not called for the last player.**
- When the **last player disconnects**, `closeRoom()` fires automatically. `onPlayerLeave` is skipped.
- `onPlayerReconnect(player)` — fires when a WebSocket arrives with a matching `?playerId=` param. The existing player record is reused; `onPlayerJoin` does not fire.

### MatchMaker

Single Durable Object, accessed by name (e.g. `idFromName('global')`). Accepts WebSocket upgrades with a `?queue=N` param. When `matchSize` players are queued under the same key, sends each a `{ command: "Match", lobby: "<uuid>" }` message and closes their connections. The alarm fires 100ms after every new connection. Default `matchSize` is `2`; set it via `setMatchSize(n)`.

---

## Action Type System

`ActionMap` maps action type strings to payload shapes. Use `never` for actions with no payload. The `Action<ActionMap>` union narrows correctly inside `if (action.type === '...')` blocks.

```typescript
type Actions = {
  MOVE: { x: number; y: number }  // action.payload is { x, y }
  RESIGN: never                    // no payload property at all
}
```

---

## Message Wire Format

All messages sent to clients via `safeWsSend` are wrapped as `{ message, playerId }`. Account for this envelope in client-side handling and tests.

Actions sent from clients must be `{ type: string, payload?: JSONValue }` JSON strings.

---

## WebSocket Connection URLs

| Path | Purpose |
|---|---|
| `/websocket` | Join a GameRoom (requires `Upgrade: websocket`) |
| `/` | Passthrough (no-op in base class) |

Query params for `/websocket`:
- `?playerName=Alice` — display name for a new player
- `?playerId=<uuid>` — reconnect with an existing identity

---

## What Agents Should and Should Not Do

**Do:**
- Extend `GameRoom` — never modify the base class.
- Use `this.currentGameState.UpdateState(...)` to mutate state.
- Use `this.sendMessageToPlayer(player, message)` for targeted messages.
- Use `this.getActivePlayers()`, `this.getLifeTimePlayers()`, and `this.getPlayer(id)` for player lookups.
- Implement `validatePlayerTryJoin` and `validatePlayerAction` defensively — these are the only trust boundaries between clients and server state.
- Export new Durable Object classes from `src/index.ts` and add the corresponding binding to `wrangler.toml` with a migration entry.
- Look at `ChatRoom.ts` as the canonical example of a minimal `GameRoom` implementation.

**Do not:**
- Directly iterate `this.ctx.getWebSockets()` to broadcast — `UpdateState()` already does this.
- Mutate `this.baseState.activePlayers` or `this.baseState.playerMap` directly — these are managed by the framework's `_OnPlayerJoin` and `_OnPlayerLeave` private methods.
- Add `async` to `getInitialState()` or `getConfig()` — both are called synchronously in the constructor.
- Assume `onPlayerLeave` fires for the last player — it does not.
- Store non-`JSONValue` types in state — everything in `State` must be JSON-serializable.
- Skip the `wrangler.toml` migration step when adding a new Durable Object class — Cloudflare requires it and the deploy will fail without it.

---

## wrangler.toml Pattern

Every Durable Object class used must have a binding and a migration entry. Note the correct casing: `MatchMaker`, not `Matchmaker`.

```toml
[[durable_objects.bindings]]
name = "GAME_ROOM"
class_name = "MyGame"

[[migrations]]
tag = "v1"
new_classes = ["MyGame", "MatchMaker"]
```

---

## Testing Notes

- All classes are Durable Objects and require the Cloudflare Workers runtime or Miniflare to instantiate. Standard Node.js test runners cannot run them directly.
- Unit-test pure logic (state transitions, validation functions) by extracting it from the class.
- Use Miniflare for integration tests that exercise WebSocket connections or storage.