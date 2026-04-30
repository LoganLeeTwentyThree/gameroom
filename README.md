# Gameroom
Gameroom is a typescript package that makes building games with Cloudflare's Durable Objects easier. With Gameroom, you don't have to worry about the Durable Object lifecycle, and you can focus more on building your game.
## Installation and Usage
`npm install @loganlee23/gameroom`

TODO :)

## Features
### Gameroom
A `GameRoom` is a durable object class that handles the back end logic of your game. It is the "server" that players communicate with to sync state information and make moves. Each lobby has its own unique gameroom. Your game's back end simply extends GameRoom to get lots of useful functionality.

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
    override OnPlayerReconnect() {...}
}
```
Players communicate with the GameRoom using an `Action`. Each action has a type (a string) and a payload, which is a partial `GameState` containing updated values. You can either apply the payload directly to the state, or you might want to mutate the state based on the Action's type.
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

    // if ValidatePlayerAction is returns a valid ActionResult, 
    override OnValidPlayerAction(action : Action) 
    {
        //you can use its payload to mutate state directly
        this.state.UpdateState(action.payload)
        
        // or you can do your own thing!
        if(action.type === "Increment")
        {
            this.state.incrementField("count", 1)
        }

    }
}
```
### GameState
Each `GameRoom` keeps track of its `GameState`, which is an object representing the current state of the game. Your front end will care about how to display `GameState`. For a game of chess, your game state would probably be an array of all the moves taken in chess notation. 

Since game state needs to be serialized, it must be composed only of JSON serializable types. Gamestate's state is changed through setters so that appropriate hooks can be called.
```typescript
class GameState<T>
{
    let state
    constructor(state: T)
    {
        this.state = state
    }

    UpdateState(new : partial<T>) {...}
    GetState() {...}
}
```
### Game Config
In addition to handling GameState, each `GameRoom` also has a customizable configuratuion. By setting the room's config, you can set your desired rate limits, player count, or anything else you might need.
```typescript
type BaseConfig = 
{
    maxPlayers: number,
    isPrivate: boolean
}

type MyGameConfig = BaseConfig & 
    {
        maxItemCount: number, 
        gridSize: number,
        //whatever else you may need
    }
```

### Utilities
Game room comes bundled with a few utility durable objects that you can use if you want. You'll have to create bindings for these in your wrangler.toml if you plan on using them.
#### MatchMaker
A `MatchMaker` is a durable object class that handles matchmaking. It can assign players into queues and match them together into GameRooms. There should usually only be one matchmaker, but multiple can be used too.
#### RateLimiter
A `RateLimiter` is a durable object class that implements token bucket rate limiting. You can use a `RateLimiterClient` to query a `RateLimiter` per player to see if they are sending messages too fast.