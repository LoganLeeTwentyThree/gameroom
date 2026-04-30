# Gameroom
Gameroom is a typescript package that makes building games with Cloudflare's Durable Objects easier. With Gameroom, you don't have to worry about the Durable Object lifecycle, and you can focus more on building your game.
## Installation and Usage
`npm install gameroom`

TODO :)

## Features
### Gameroom
A `GameRoom` is a durable object class that handles the back end logic of your game. It is the "server" that players communicate with to sync state information and make moves. Each lobby has its own unique gameroom.

```typescript
class MyGame extends GameRoom<MyGameConfig, GameState<MyState>>
{
    constructor(ctx: DurableObjectState, env: Env)
    {
        //GameRoom's constructor handles deserializing state for you
        super(ctx, env)
    }

    //lots of helpful hooks for running a game!
    override OnPlayerJoin() {...}
    override OnPlayerLeave() {...}
    override ValidatePlayerAction() {...}
    override OnValidPlayerAction() {...}
    override OnGameTick() {...}
    override OnStateUpdate() {...}
    override OnGameStart() {...}
    override OnGameEnd() {...}
    override OnPlayerReconnect() {...}
}
```
Players communicate with the GameRoom using an `Action`. Each action has a type (a string) and a payload, which is a partial `GameState` containing updated values.
```typescript
class MyGame extends GameRoom<MyGameConfig, GameState<MyState>>
{
    // use OnPlayerAction to validate player actions before they're used to mutate state
    override ValidatePlayerAction(player: Player, action : Action) : ActionResult
    {
        if(IsPlayerTurn(player) && action.type == "MOVE") //Validate however you want
        {
            return new ActionResult(true)
        }

        return new ActionResult(false, "Not your turn!")
    }

    // if ValidatePlayerAction is returns a valid ActionResult, the GameRoom uses its payload to mutate state
    override OnValidPlayerAction(action : Action) 
    {
        this.state.UpdateState(action.payload)
    }
}
```
### GameState
Each `GameRoom` keeps track of its `GameState`, which is an object representing the current state of the game. Your front end will care about how to display `GameState`. For a game of chess, your game state would probably be an array of all the moves taken in chess notation. 

Since game state needs to be serialized, it must be composed only of JSON serializable types. 
```typescript
class GameState<T>
{
    let state
    constructor(state: T)
    {
        this.state = state
    }

    override UpdateState(new : partial<T>) {...}
    override GetState() {...}
}
```
### Game Config
In addition to handling GameState, each `GameRoom` also has a customizable configuratuion. By setting the room's config, you can set your desired rate limits, player count, or anything else you might need.
```typescript
type BaseConfig = 
{
    maxPlayers: number,
    isPrivate: boolean, 
    maxActionsPerSecond: number,
    onRateLimitExceeded: "drop" | "kick" | "warn"
}

type MyGameConfig = BaseConfig & {maxItemCount: number, gridSize: number}
```

### Matchmaker
A `MatchMaker` is a durable object class that handles matchmaking. It can assign players into queues and match them together into GameRooms. There should usually only be one matchmaker, but multiple can be used too.