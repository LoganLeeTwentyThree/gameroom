import { ActionMap, JSONValue } from "./types.js"
import { GameRoom } from "./GameRoom.js";

type RealTimeRoomConfig = {
    tickRateMs: number,
    emptyRoomTtlMs: number
}

type RealTimeBaseState = {
    intervalId : number | undefined
}

export abstract class RealTimeGameRoom<
    State extends Record<string, JSONValue>,
    Actions extends ActionMap,
    Config = {},
    Env = unknown
> extends GameRoom<State, Actions, Config & RealTimeRoomConfig, Env> 
{
    realTimeBaseState : RealTimeBaseState
    lastMessageTime : number = Date.now()

    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);
        
        const oldBaseState : RealTimeBaseState | null | undefined = this.ctx.storage.kv.get("realtimebasestate")

        if(oldBaseState)
        {
            this.realTimeBaseState = oldBaseState
        }else
        {
            this.realTimeBaseState = 
            {
                intervalId: undefined
            }
        }
    }

    override async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string): Promise<void> {
        this.lastMessageTime = Date.now()
        super.webSocketMessage(ws, message)
    }

    private _onGameTick(): void {
        const ttlMs = this.config.emptyRoomTtlMs
        if(Date.now() - this.lastMessageTime > ttlMs) {
            this.closeRoom()
            return
        }
        this.onGameTick()
    }

    public startGameLoop() : void
    {
        const id = setInterval(() => this._onGameTick(), this.config.tickRateMs)
        this.realTimeBaseState.intervalId = id
        this.ctx.storage.kv.put("realtimebasestate", this.realTimeBaseState)
    }

    public endGameLoop() : void
    {
        clearInterval(this.realTimeBaseState.intervalId)
    }

    public abstract onGameTick() : void
}