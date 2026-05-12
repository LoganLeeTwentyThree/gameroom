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

These must be implemented by every subclass.

#### `getInitialState(): State`

Returns the starting state object. Called **once** on first construction. Never called again after hibernation recovery — state is restored from Durable Object storage instead.

Do not make this `async`. It is called synchronously in the constructor.

---

#### `getConfig(): Config`

Returns the room config. Called on **every** construction, including after hibernation. Keep it static — do not derive config from async sources.

Do not make this `async`. It is called synchronously in the constructor.

---

#### `validatePlayerTryJoin(): Result`

Called when an incoming WebSocket connection arrives at `/websocket`, before the connection is accepted. Return `{ success: false, reason: string }` to reject with a 406 response.

```typescript
public validatePlayerTryJoin(): Result
```

---

#### `validatePlayerAction(player: Player, action: Action<Actions>): Promise<Result>`

Called for every message received from a connected client. Return `{ success: false, reason: string }` to reject the action — the error is sent back to the client and `onValidPlayerAction` is not called.

```typescript
public async validatePlayerAction(player: Player, action: Action<Actions>): Promise<Result>
```

---

#### `onValidPlayerAction(player: Player, action: Action<Actions>): void`

Called after `validatePlayerAction` returns `{ success: true }`. Apply the action to state here.

```typescript
public onValidPlayerAction(player: Player, action: Action<Actions>): void
```

---

### Overridable Hooks

These have empty default implementations. Override as needed.

#### `onRoomStart(): void`

Fires on first construction when no prior persisted state exists. Use it for one-time server-side setup.

---

#### `onPlayerJoin(player: Player): void`

Fires after a new player is registered and the updated state has been broadcast to all clients.

---

#### `onPlayerLeave(player: Player): void`

Fires after a player disconnects and is removed from active players. **Not called for the last player** — `closeRoom()` fires instead.

---

#### `onPlayerReconnect(player: Player): void`

Fires when a WebSocket arrives with a `?playerId=<uuid>` query param matching an existing player record. The existing `Player` object is reused. `onPlayerJoin` does not fire.

---

#### `onStateUpdate(): void`

Fires after every state broadcast. Override for post-broadcast side effects.

---

### Public Methods

#### `closeRoom(): void`

Closes all WebSocket connections, deletes all Durable Object storage, and aborts the object. Called automatically when the last player disconnects. Can be called manually to force-close a room.

---

#### `sendMessageToPlayer(player: Player, message: JSONValue): Result`

Sends a message to a single player. The message is wrapped in the standard `{ message, playerId }` envelope.

Returns `{ success: false, reason }` if the player's WebSocket is not found or not open.

```typescript
public sendMessageToPlayer(player: Player, message: JSONValue): Result
```

---

#### `getActivePlayers(): Player[]`

Returns all players currently connected to the room.

---

#### `getLifeTimePlayers(): Player[]`

Returns all players that have ever connected during this room's current lifetime, including those who have since disconnected.

---

#### `getPlayer(id: string): Player | undefined`

Looks up a player by ID from the lifetime player map. Returns `undefined` if not found.

---

### Protected Properties

#### `currentGameState: GameState<State>`

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
| `playerName` | No | Display name for a new player. Defaults to `"Player"`. |
| `playerId` | No | UUID of an existing player. Triggers reconnect flow instead of join. |

A `GET /` request is a no-op passthrough in the base class. All other paths return 404.

---

### Wire Format

**Server → Client**

All outgoing messages are JSON-encoded and wrapped:

```json
{ "message": <payload>, "playerId": "<uuid>" }
```

The `secrets` key is stripped from state before broadcast but retained in storage.

**Client → Server**

Actions must be JSON-encoded:

```json
{ "type": "ACTION_TYPE", "payload": <JSONValue> }
```

Actions with a `never` payload omit the `payload` key entirely.

---

---

## `GameState<State>`

**`src/types.ts`** — not exported from `index.ts`. Accessed only via `this.currentGameState` inside a `GameRoom` subclass.

Every mutating method triggers a state broadcast and persist. Do not chain multiple mutating calls when a single `UpdateState` with a merged partial will do.

---

### Methods

#### `UpdateState(newState: Partial<State>): void`

Merges `newState` into current state, broadcasts to all clients, and persists to Durable Object storage.

---

#### `getField<K extends keyof State>(key: K): State[K]`

Returns the current value of a single state field.

---

#### `getStateValues(): State`

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

**`src/MatchMaker.ts`** — a single shared Durable Object that queues players and groups them into lobbies.

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

Accepts WebSocket upgrade requests. Each connection is tagged with a queue key from the `?queue=` query param (defaults to `"0"`). An alarm fires 100ms after each new connection.

When the alarm fires, for each queue with at least `matchSize` waiting players, it groups them, sends each a match message, and closes their connections:

```json
{ "command": "Match", "lobby": "<uuid>" }
```

Players who disconnect before being matched are silently skipped.

---

### Properties

#### `matchSize: number`

Number of players required to form a match. Default `2`.

---

### Methods

#### `setMatchSize(size: number): Promise<void>`

Updates `matchSize`. Call this on the stub before players start queuing.

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

**`src/ChatRoom.ts`** — a minimal concrete `GameRoom` implementation. Use it as a reference when building your own room.

```typescript
class ChatRoom<Env> extends GameRoom<ChatState, ChatActions, {}, Env>
```

### State shape

```typescript
type ChatState = {
  connected: Array<string>
  chats: Array<{ body: string; sender: string }>
}
```

### Actions

```typescript
type ChatActions = {
  CHAT: { message: string }
}
```

`CHAT` appends `{ body: action.payload.message, sender: player.id }` to the `chats` array. All connections are accepted. All actions are accepted.

---

---

## Types

**`src/types.ts`**

---

### `Player`

```typescript
type Player = {
  name: string
  id: string   // crypto.randomUUID()
  ip: string   // CF-Connecting-IP header
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

Internal type managed by `GameRoom`. Not exported. Do not mutate directly.

```typescript
type BaseState = {
  activePlayers: Record<string, Player>
  playerMap: Record<string, Player>
}
```