import { DurableObject } from "cloudflare:workers";

export class Matchmaker<Env = unknown> extends DurableObject<Env>
{
    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);
    }

    async fetch(request: Request): Promise<Response> {
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
            if(players.length >= 2) {
                const matched = players.splice(0, 2)
                const lobbyId = crypto.randomUUID()

                for(const ws of matched) {
                    ws.serializeAttachment({ lobbyId })
                    ws.send(JSON.stringify({ command: "Match", lobby: lobbyId }))
                    this.webSocketClose(ws, 1000, "Matched", false)
                }
            }
        }
    }

    async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
        
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