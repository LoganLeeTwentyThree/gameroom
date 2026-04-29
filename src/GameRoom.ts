import { DurableObject } from "cloudflare:workers";

type Config = {}

class GameState<State>
{
    private values: FullState<State>
    constructor(existingState: FullState<State> | undefined = undefined )
    {
        if(existingState)
        {
            this.values = existingState
        }else
        {
            this.values = {
                numPlayers: 0,
                idCounter: 0
            } as FullState<State>
        }
    }

    public UpdateState(newState : Partial<FullState<State>>)
    {
        Object.assign(this.values, newState)
    }

    public incrementField(key: keyof FullState<State>, by: number = 1) {
        this.UpdateState({ [key]: (this.values[key] as number) + by } as Partial<FullState<State>>)
    }

    public decrementField(key: keyof FullState<State>, by: number = 1) {
        this.incrementField(key, -by)
    }

    public getField<K extends keyof FullState<State>>(key: K): FullState<State>[K] {
        return this.values[key] as FullState<State>[K]
    }

}

type FullState<State> = State & BaseState

type Action<State> = {
    type: string,
    payload: Partial<FullState<State>>
}

type ActionResult = 
{
    valid: true
} | 
{
    valid: false,
    reason: string
}

type Player = {
    name: string,
    id: number,
}

type BaseState = {
    numPlayers: number, 
    idCounter: number
}

export abstract class GameRoom<Config, State, Env = unknown> extends DurableObject<Env> {
    currentGameState : GameState<FullState<State>>

    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);

        const oldState : FullState<State> | null | undefined = this.ctx.storage.kv.get("gamestate")

        //if there is existing state and one or more existing websocket connections
        if(oldState && this.ctx.getWebSockets().length > 0)
        {
            this.currentGameState = new GameState<FullState<State>>(oldState)
        }else 
        {
            this.currentGameState = new GameState<FullState<State>>(this.getInitialState())
        }
        
    }

    //User defines their state defaults in their child class
    abstract getInitialState(): FullState<State>

    async getPlayers() : Promise<number>
    {
        return this.currentGameState.getField("numPlayers")
    }

    //----- DURABLE OBJECT LIFECYCLE -----

    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url)

        // Creates two ends of a WebSocket connection.
        const webSocketPair = new WebSocketPair();
        const [client, server] = Object.values(webSocketPair) as [WebSocket, WebSocket]

        // save id for persistence between hibernations
        const id : number = this.currentGameState.getField("idCounter")
        this.currentGameState.incrementField("idCounter", 1)
        
        const player : Player = {
            name: "Test", //will be from URL params later
            id: id
        }

        server.serializeAttachment(player)

        this.ctx.acceptWebSocket(server);

        this._OnPlayerJoin(player)

        return new Response(null, {
            status: 101,
            webSocket: client,
        });
    }

    async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
        try {
            const action = JSON.parse(message as string) as Action<FullState<State>>
            const player : Player = ws.deserializeAttachment()
            const result : ActionResult = this.validatePlayerAction(player, action)

            if(result.valid)
            {
                this._OnValidPlayerAction(player, action)
            }else
            {
                ws.send(JSON.stringify({ error: result.reason }))
            }
        } catch (e) {
            ws.send(JSON.stringify({ error: "Invalid message format" }))
        }
        
    }

    async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean,
    ) {
        ws.close(code, reason);
        this._OnPlayerLeave(ws.deserializeAttachment() as Player)
    }

    // ----- PRIVATE ------

    private _OnPlayerJoin(player : Player)
    {
        this.onPlayerJoin(player)
    }

    private _OnPlayerLeave(player : Player)
    {
        this.currentGameState.decrementField("numPlayers", 1)

        if(this.currentGameState.getField("numPlayers") == 0)
        {
            this.ctx.abort()
            return
        }

        this.onPlayerLeave(player)
    }

    private _OnValidPlayerAction(player : Player, action : Action<FullState<State>>) : void 
    {
        this.currentGameState.UpdateState(action.payload)
        this.onStateUpdate(this.currentGameState)
    }

    // ----- PUBLIC HOOKS -----

    public onPlayerJoin(player : Player) : void {}
    public onPlayerLeave(player : Player) : void {}

    public abstract validatePlayerAction(player : Player, action : Action<FullState<State>>) : ActionResult
    public abstract onValidPlayerAction(player : Player, action : Action<FullState<State>>) : void 

    public onGameTick() : void {}
    public onStateUpdate(state : GameState<FullState<State>>) : void {}
    public onGameStart() : void {}
    public onGameEnd() : void {}
    public onPlayerReconnect(player : Player) : void {}
}