# Gameroom
Gameroom is a typescript package that makes building games with Cloudflare's Durable Objects easier. With Gameroom, you don't have to worry about the Durable Object lifecycle, and you can focus more on building your game.
## Installation
Run `npm install @loganlee23/gameroom`

## Quick Start

In `src/index.ts`
1. Import gameroom and its types 
`import * as gr from "@loganlee23/gameroom";`

2. Define your game's state and message structure
```typescript

type MyState = 
{
    count: number,
    //whatever you need for your game
}

// Define all actions and their payload shapes here.
// Use `never` for actions that carry no payload.
type MyActions = {
    INCREASE: { count: string },
}
```

3. Extend the `GameRoom` class and implement the required hooks
```typescript
class MyGame<Env> extends GameRoom<MyState, MyActions, {}, Env>
{
    constructor(ctx: DurableObjectState, env: Env)
    {
        //GameRoom's constructor handles state between hibernations for you
        super(ctx, env)
    }

    //Anyone can join at any time 
    public validatePlayerTryJoin() : Result 
    { return {sucess: true} }

    //All actions are legal
    public validatePlayerAction(player : Player, action : Action<FullState<State>>) : Result 
    { return {success: true} }

    //This game just lets players increase a number (is that a game?)
    public onValidPlayerAction(player : Player, action : Action<FullState<State>>) : void 
    {
        if(action.type === "INCREASE")
        {
            this.currentGameState.incrementField("count", action.payload.count )
        }
        
    }
}
```

4. Create your worker to route requests
```typescript
export default 
{
    async fetch(request: Request, env: Env) {
        const url = new URL(request.url)

        if(url.pathname === "/websocket") {
            if(request.headers.get("Upgrade") !== "websocket") {
                return new Response("Expected WebSocket", { status: 426 })
            }
            const lobbyId = url.searchParams.get("lobby") ?? "default"
            const id = env.MY_GAME.idFromName(lobbyId)
            const stub = env.MY_GAME.get(id)
            return stub.fetch(request)
        }

        return await env.ASSETS.fetch(request)
    }
}
```
Make sure you have your wrangler file and run `npx wrangler types` to generate your types.

5. Your back end is done 🎉.

You can design your front end however you'd like. Make sure that you communicate with the server with the same Action Shape that you already defined.

Put any static files in the `public` directory of your project and that content will be served by your worker. Connect to a specific room with a websocket connection and send actions however you wish. Each client will automatically recieve an updated copy of the game state whenever it changes. 

(run `npx wrangler dev` to test it out)


## Features
### Gameroom
A `GameRoom` is a durable object class that handles the back end logic of your game. It is the "server" that players communicate with to sync state information and make moves. Each lobby has its own unique gameroom. Your game's back end simply extends GameRoom to get lots of useful functionality.

Players communicate with the GameRoom using an `Action`. Each action has a type (a string) and a payload, which is an object that represents the game action that is to be performed, should the server accept it. 
```typescript
class MyGame<Env> extends GameRoom<MyState, MyActions, MyConfig, Env>
{
    // use OnPlayerAction to validate player actions before they're used to mutate state
    override ValidatePlayerAction(player: Player, action : Action) : ActionResult
    {
        if(isPlayerTurn(player) && action.type == "MOVE") //Validate however you want
        {
            return {success: true}
        }

        return {sucess: false, reason: "Not your turn!"}
    }

    // if validatePlayerAction is returns a valid ActionResult, 
    override onValidPlayerAction(action : Action) 
    {
        //you can use its payload to mutate state 
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

### Game Config
In addition to handling GameState, each `GameRoom` also has a customizable configuratuion. By setting the room's config, you can set your player count, lobby privacy, or anything else you might need.
```typescript
type BaseConfig = 
{
    maxPlayers: number,
    isPrivate: boolean
}

type MyGameConfig =
{
    maxItemCount: number, 
    gridSize: number,
    //whatever else you may need
}
```

### Utilities
Game room comes bundled with a MatchMaker durable object that you can use if you want. You'll have to create bindings for it in your wrangler.toml if you plan on using it. There may be more utilities in the future.
#### MatchMaker
A `MatchMaker` is a durable object class that handles matchmaking. It can assign players into queues and match them together into GameRooms. There should usually only be one matchmaker, but multiple can be used too.

#### ChatRoom
A `ChatRoom` is a durable object class that lets players chat with each other. You may want this for during or after your game, so players can chat. Usually, each room would have its own ChatRoom, but you can have a global one if you want.
## Examples
Check out the [WordleVS](https://github.com/LoganLeeTwentyThree/wordle-versus) repo, which uses gameroom to create a simple two player version of wordle.