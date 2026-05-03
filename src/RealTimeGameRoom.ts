import { BaseState, JSONValue } from "./types"
import { GameRoom } from "./GameRoom";

type RealTimeRoomConfig = {
    tickRateMs: number,
    emptyRoomTtlMs: number
}

type RealTimeBaseState = {
    intervalId : number | undefined
}

export abstract class RealTimeGameRoom<State extends Record<string, JSONValue>, Config = {}, Env = unknown> extends GameRoom<State, Config & RealTimeRoomConfig, Env> 
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

    // ----- PUBLIC HOOKS -----

    /** 
    *   Starts the game loop. onGameTick will be invoked once every tickRateMs as defined in this room's config
    *
    *   @returns the intervalId of the game loop
    */
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