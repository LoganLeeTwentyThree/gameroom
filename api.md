# API Reference

---

## `GameRoom<State, Actions, Config, Env>`

**`src/GameRoom.ts`** — extend this to build a game room.

```typescript
abstract class GameRoom<
  State extends Record<string, JSONValue>,
  Actions extends ActionMap,
  Config,
  Env
> extends DurableObject<Env>
```

---

### Abstract Methods

#### `getInitialState(): State`

Returns the starting state. Called **once** on first construction. Never called after hibernation recovery — state is restored from storage.

Do not make this `async`. Called synchronously in the constructor.

---

#### `getConfig(): Config`

Returns the room config. Called on **every** construction, including after hibernation. Keep it static — do not derive config from async sources.

Do not make this `async`. Called synchronously in the constructor.

---

#### `validatePlayerTryJoin(): Result`

Called when an incoming WebSocket connection arrives at `/websocket`, before the connection is accepted. Return `{ success: false, reason: string }` to reject with a 406 response.

---

#### `validatePlayerAction(player: Player, action: Action<Actions>): Promise<Result> | Result`

Called for every message from a connected client. Return `{ success: false, reason: string }` to reject — the error is sent back to the client and `onValidPlayerAction` is not called.

---

#### `onValidPlayerAction(player: Player, action: Action<Actions>): void`

Called after `validatePlayerAction` returns `{ success: true }`. Apply the action to state here.

---

### Overridable Hooks

All have empty default implementations.

#### `onRoomStart(): void`

Fires on first construction when no prior persisted state exists.

---

#### `onPlayerJoin(player: Player): void`

Fires after a new player is registered and state has been broadcast to all clients.

---

#### `onPlayerLeave(player: Player): void`

Fires after a player disconnects and is removed from active players. **Not called for the last player** — `closeRoom()` fires instead.

---

#### `onPlayerReconnect(player: Player): void`

Fires when a WebSocket arrives with a `?playerId=<uuid>` query param matching an existing player. The existing `Player` object is reused. `onPlayerJoin` does not fire.

---

#### `onPlayerError(player: Player, error: unknown): void`

Fires when a WebSocket error occurs for a connected player.

---

#### `onStateUpdate(): void`

Fires after every state broadcast.

---

### Public Methods

#### `closeRoom(): void`

Closes all WebSocket connections, deletes all Durable Object storage, and aborts the object. Called automatically when the last player disconnects. Can be called manually to force-close a room.

---

#### `sendMessageToPlayer(player: Player, message: JSONValue): Result`

Sends a message to a single player. Wrapped in the standard `{ message, playerId }` envelope.

Returns `{ success: false, reason }` if the player's WebSocket is not found or not open.

---

#### `getActivePlayers(): Player[]`

Returns all players currently connected (excludes spectators).

---

#### `getLifeTimePlayers(): Player[]`

Returns all players that have ever connected during this room's current lifetime, including those who have since disconnected.

---

#### `getPlayer(id: string): Player | undefined`

Looks up a player by ID from the lifetime player map.

---

### Protected Properties

#### `state: GameState<State>`

The room's state instance. Use its methods to read and mutate state. Do not replace this reference.

#### `config: Config`

The value returned by `getConfig()`, set once during construction.

---

### WebSocket URL

```
GET /websocket
Upgrade: websocket
```

| Query param | Required | Description |
|---|---|---|
| `playerName` | No | Display name for a new player. Defaults to `"Player<n>"`. |
| `playerId` | No | UUID of an existing player. Triggers reconnect flow. |
| `spectator` | No | Any truthy value. Connects as a spectator — receives broadcasts, cannot act. |

`GET /` is a no-op passthrough. All other paths return 404.

---

### Wire Format

**Server → Client**

All outgoing messages are JSON and wrapped:

```json
{ "message": <payload>, "playerId": "<uuid>" }
```

State broadcasts send `{ state, players }` as the `message`. The `secrets` key is stripped from state before broadcast but retained in storage.

**Client → Server**

```json
{ "type": "ACTION_TYPE", "payload": <JSONValue> }
```

Actions with a `never` payload omit `payload`.

---

---

## `GameState<State>`

Accessed only via `this.state` inside a `GameRoom` subclass. Every mutating method triggers a full state broadcast and persist.

---

### Methods

#### `UpdateState(newState: Partial<State>): void`

Merges `newState` into current state, broadcasts to all clients, and persists to storage.

---

#### `getField<K extends keyof State>(key: K): State[K]`

Returns the current value of a single field.

---

#### `getValues(): State`

Returns the full current state object.

---

#### `incrementField(key: keyof State, by?: number): void`

Increments a numeric field by `by` (default `1`). Calls `UpdateState` internally.

---

#### `decrementField(key: keyof State, by?: number): void`

Decrements a numeric field by `by` (default `1`). Calls `UpdateState` internally.

---

#### `pushToField<K extends keyof State>(key: K, item: ArrayElement<State[K]>): void`

Appends `item` to an array field. Throws if the field is not an array. Calls `UpdateState` internally.

---

---

## `MatchMaker<Env>`

**`src/MatchMaker.ts`** — single shared Durable Object that queues players and groups them into lobbies.

```typescript
class MatchMaker<Env> extends DurableObject<Env>
```

Access by name, not by ID:

```typescript
const id = env.MATCH_MAKER.idFromName('global')
const stub = env.MATCH_MAKER.get(id)
```

---

### Behavior

Accepts WebSocket upgrade requests. Each connection is tagged with a queue key from `?queue=` (defaults to `"0"`). An alarm fires 100ms after each new connection.

When the alarm fires, for each queue with at least `matchSize` waiting players, it groups them, sends each a match message, and closes their connections:

```json
{ "command": "Match", "lobby": "<uuid>" }
```

Players who disconnect before being matched are silently skipped.

---

### Properties

#### `matchSize: number`

Number of players required to form a match. Default `2`. Persisted across hibernation via `ctx.storage.kv`.

---

### Methods

#### `setMatchSize(size: number): Promise<void>`

Updates `matchSize` and persists it. Call this on the stub before players start queuing.

---

### WebSocket URL

```
GET /?queue=<key>
Upgrade: websocket
```

| Query param | Required | Description |
|---|---|---|
| `queue` | No | Queue bucket key. Defaults to `"0"`. |

---

---

## `ChatRoom<Env>`

**`src/ChatRoom.ts`** — minimal concrete `GameRoom` implementation. Use as a reference.

```typescript
class ChatRoom<Env> extends GameRoom<ChatState, ChatActions, {}, Env>
```

### State

```typescript
type ChatState = {
  chats: Array<{ body: string; sender: string }>
}
```

### Actions

```typescript
type ChatActions = {
  CHAT: { message: string }
}
```

`CHAT` appends `{ body: action.payload.message, sender: player.id }` to `chats`. All connections accepted. All actions accepted.

---

---

## Types

### `Player`

```typescript
type Player = {
  name: string
  id: string        // crypto.randomUUID()
  spectator: boolean
}
```

---

### `ActionMap`

```typescript
type ActionMap = Record<string, JSONValue | never>
```

Maps action type strings to payload shapes. Use `never` for payload-less actions.

```typescript
type MyActions = {
  MOVE: { x: number; y: number }  // has payload
  RESIGN: never                    // no payload property
}
```

---

### `Action<Actions extends ActionMap>`

Discriminated union derived from an `ActionMap`. Narrows correctly in `if (action.type === '...')` blocks.

```typescript
type Action<Actions extends ActionMap> = {
  [K in keyof Actions]: Actions[K] extends never
    ? { type: K }
    : { type: K; payload: Actions[K] }
}[keyof Actions]
```

---

### `Result`

```typescript
type Result =
  | { success: true }
  | { success: false; reason: string }
```

---

### `JSONValue`

```typescript
type JSONValue =
  | string | number | boolean | null
  | JSONValue[]
  | { [key: string]: JSONValue }
```

All state fields must be assignable to `JSONValue`.

---

### `BaseState`

Internal. Not exported. Do not mutate directly.

```typescript
type BaseState = {
  activePlayers: Record<string, Player>
  playerMap: Record<string, Player>
}
```