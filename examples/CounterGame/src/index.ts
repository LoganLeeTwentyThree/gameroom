
import { GameRoom } from "../../../src/GameRoom.js";
export { Matchmaker } from '../../../src/MatchMaker.js'
import { Action, FullState, Player, Result } from "../../../src/types.js";
import html from "../public/index.html"


type CounterRoomConfig = {
    maxCount: number
}

type CounterRoomState = {
    count: number
}

export class CounterRoom extends GameRoom<CounterRoomConfig, CounterRoomState, Env>
{

    getConfig(): CounterRoomConfig {
        return {
            maxCount: 10
        }
    }

    public validatePlayerTryJoin(): Result {
        return {success: true}
    }

    public validatePlayerAction(player: Player, action: Action<FullState<CounterRoomState>>): Result {
        if(this.currentGameState.getField("count") >= this.config.maxCount) {
            return { success: false, reason: "Max count reached" }
        }
        return { success: true }
    }

    public onValidPlayerAction(player: Player, action: Action<FullState<CounterRoomState>>): void {
        this.currentGameState.incrementField("count")
    }

    public onPlayerReconnect(player: Player): void {
        console.log(player.id + " just reconnected");
    }

    getInitialState(): FullState<CounterRoomState> {
        return {
            count: 0
        } as FullState<CounterRoomState>
    }
}

export default {
    async fetch(request: Request, env: Env) {
        const url = new URL(request.url)

        if(url.pathname === "/matchmaker") {
            const id = env.MATCHMAKER.idFromName("global")
            const stub = env.MATCHMAKER.get(id)
            return stub.fetch(request)
        }

        if(url.pathname === "/websocket") {
            if(request.headers.get("Upgrade") !== "websocket") {
                return new Response("Expected WebSocket", { status: 426 })
            }
            const lobbyId = url.searchParams.get("lobby") ?? "default"
            const id = env.COUNTER_ROOM.idFromName(lobbyId)
            const stub = env.COUNTER_ROOM.get(id)
            return stub.fetch(request)
        }

        return new Response(html, {
            headers: { "Content-Type": "text/html" }
        })
    }
}



