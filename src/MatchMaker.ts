import { DurableObject } from "cloudflare:workers";

export class MatchMaker<Env> extends DurableObject<Env>
{
    matchSize = 2
    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);
    }

    async fetch(request: Request): Promise<Response> {
        if (request.headers.get("Upgrade") != "websocket") {
            return new Response("Expected websocket", { status: 406 })
        }
        
        const url = new URL(request.url)

        const queueNo : string = url.searchParams.get("queue") ?? "0"; 

        // Creates two ends of a WebSocket connection.
        const webSocketPair = new WebSocketPair();
        const [client, server] = Object.values(webSocketPair) as [WebSocket, WebSocket];

        // Each websocket connection is attached to the queue number its queued for
        server.serializeAttachment({ queue: queueNo })
        this.ctx.acceptWebSocket(server);

        await this.ctx.storage.setAlarm(Date.now() + 100)

        return new Response(null, {
            status: 101,
            webSocket: client,
        });
    }

    async alarm() {
        const queues = new Map<string, WebSocket[]>()

        // group connected sockets by queue tag
        for(const ws of this.ctx.getWebSockets()) {
            const { queue } = ws.deserializeAttachment()
            if(!queues.has(queue)) queues.set(queue, [])
            queues.get(queue)!.push(ws)
        }

        // match players in each queue
        for(const [queueNo, players] of queues) {
            while(players.length >= this.matchSize) {
                const matched = players.splice(0, this.matchSize)
                const lobbyId = crypto.randomUUID()

                for(const ws of matched) {
                    try {
                        ws.serializeAttachment({ ...ws.deserializeAttachment(), matched: true })
                        ws.send(JSON.stringify({ command: "Match", lobby: lobbyId }))
                        ws.close(1000, "Matched")
                    } catch {
                        // socket already closed, skip
                        continue
                    }
                }
            }
        }
    }

    async setMatchSize(size : number)
    {
        this.matchSize = size
    }

    async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
        return
    }

    async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean,
    ) 
    {
        try{
            ws.close(code, "Durable Object is closing WebSocket: " + reason); 
        }catch (e)
        {
            console.log(e)
        }
        
    }
}