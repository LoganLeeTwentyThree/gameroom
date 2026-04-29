import { DurableObject } from "cloudflare:workers";

type Config = {}

class GameState<State>
{
    currentState: State
    constructor(existingState: State | undefined = undefined )
    {
        if(existingState)
        {
            this.currentState = existingState
        }else
        {
            this.currentState = {} as State
        }
    }

}

type BaseState = {
    numPlayers: number, 
}

export abstract class GameRoom<Config, State, Env = unknown> extends DurableObject<Env> {
    currentGameState : GameState<State & BaseState>
    sessions : Map<WebSocket, number> = new Map()

    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);

        const oldState : State & BaseState | null | undefined = this.ctx.storage.kv.get("gamestate")

        //if there is existing state and one or more existing websocket connections
        if(oldState && this.ctx.getWebSockets().length > 0)
        {
            this.currentGameState = new GameState<State & BaseState>(oldState)
            
            for( const ws of this.ctx.getWebSockets())
            {
                this.sessions.set(ws, ws.deserializeAttachment())
            }
        }else 
        {
            this.currentGameState = new GameState<State & BaseState>(this.getInitialState())
        }
        
    }

    //User defines their state defaults in their own class
    abstract getInitialState(): State & BaseState

    async getPlayers() : Promise<number>
    {
        return this.sessions.size
    }

    //----- DURABLE OBJECT LIFECYCLE -----

    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url)

        // Creates two ends of a WebSocket connection.
        const webSocketPair = new WebSocketPair();
        const [client, server] = Object.values(webSocketPair) as [WebSocket, WebSocket]

        // save id for persistence between hibernations
        const id : number = await this.getPlayers()
        
        this.sessions.set(server, id)
        server.serializeAttachment(id)

        this.ctx.acceptWebSocket(server);

        return new Response(null, {
            status: 101,
            webSocket: client,
        });
    }

    async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
        
    }

    async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean,
    ) {
        //do stuff
    }

    // ----- HOOKS -----

    OnPlayerJoin() {}
    OnPlayerLeave() {}
    ValidatePlayerAction() {}
    OnValidPlayerAction() {}
    OnGameTick() {}
    OnStateUpdate() {}
    OnGameStart() {}
    OnGameEnd() {}
    OnPlayerReconnect() {}
}