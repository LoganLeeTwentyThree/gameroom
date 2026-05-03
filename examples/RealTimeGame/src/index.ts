import { RealTimeGameRoom } from "../../../src/RealTimeGameRoom.js"
import { Action, BaseState, Player, Result } from "../../../src/types.js"

type TickState = {
    ticks: number
}

type TickConfig = {

}

export class TickRoom extends RealTimeGameRoom<TickState, TickConfig, Env> {
    getConfig() {
        return {
            tickRateMs: 10,
            emptyRoomTtlMs: 10000,
        } 
    }

    public validatePlayerTryJoin(): Result {
        return {success: true}
    }

    public validatePlayerAction(player: Player, action: Action<TickState>): Result {
        return { success: true }
    }

    public onValidPlayerAction(player: Player, action: Action<TickState>): void {
        return 
    }

    getInitialState(): TickState {
        return {
            ticks: 0
        } as TickState 
    }

    onGameTick(): void {
        this.currentGameState.incrementField("ticks")
    }
}

export default {
    async fetch(request: Request, env: Env) {
        const url = new URL(request.url)

        if(url.pathname === "/websocket") {
            if(request.headers.get("Upgrade") !== "websocket") {
                return new Response("Expected WebSocket", { status: 426 })
            }
            const lobbyId = url.searchParams.get("lobby") ?? "default"
            const id = env.TICK_ROOM.idFromName(lobbyId)
            const stub = env.TICK_ROOM.get(id)
            stub.startGameLoop()
            return stub.fetch(request)
        }

        

        return await env.ASSETS.fetch(request)
    }
}