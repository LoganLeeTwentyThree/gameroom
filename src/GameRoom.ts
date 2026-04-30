import { DurableObject } from "cloudflare:workers";
import { GameState, FullState, Action, Player, Config, Result } from "./types"

export abstract class GameRoom<Config, State, Env = unknown> extends DurableObject<Env> {
    protected currentGameState : GameState<FullState<State>>
    protected config : Config

    //----- DURABLE OBJECT LIFECYCLE -----

    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);

        const oldState : FullState<State> | null | undefined = this.ctx.storage.kv.get("gamestate")

        //if there is existing state and one or more existing websocket connections
        if(oldState && this.ctx.getWebSockets().length > 0)
        {
            this.currentGameState = new GameState<FullState<State>>(() => this._OnStateUpdate(), oldState)
        }else 
        {
            this.currentGameState = new GameState<FullState<State>>(() => this._OnStateUpdate(), this.getInitialState())
            this.onRoomStart()
        }

        this.config = this.getConfig()
        
    }

    //User defines their state and config defaults in their child class
    abstract getInitialState(): FullState<State>
    abstract getConfig() : Config

    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url)

        switch (url.pathname) {
        case "/websocket":
            if (request.headers.get("Upgrade") != "websocket") {
                return new Response("Expected websocket", { status: 406 })
            }

            const attempt = this.validatePlayerTryJoin()

            if(!attempt.success)
            {
                return new Response(attempt.reason, { status: 406 })
            }

            break;
        case "/":
            break;
        default:
            return new Response("Not found", { status: 404 });
        }

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

    /**
     * Begins the validation pipeline when a message is recieved. 
     * Sends back an error if message is malformed or deemed invalid by server.
     * 
     * @param ws - WebSocket that message was sent on.
     * @param message - Message that was sent.
     */
    async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
        try {
            const action = JSON.parse(message as string) as Action<FullState<State>>
            const player : Player = ws.deserializeAttachment()
            const result : Result = this.validatePlayerAction(player, action)

            if(result.success)
            {
                this.onValidPlayerAction(player, action)
            }else
            {
                if(ws.OPEN)
                {
                    ws.send(JSON.stringify({ error: result.reason }))
                }
                
            }
        } catch (e) {
            if(ws.OPEN)
            {
                ws.send(JSON.stringify({ error: "Invalid message format" }))
            }
        }
        
    }


    /**
     * Closes a websocket.
     * 
     * @param ws - WebSocket to close.
     * @param code - Four-digit integer used to indicate why the connection was terminated.
     * @param reason - Why the connection was terminated.
     * @param wasClean - Indicates if the termination occured after a proper handshake.
     */
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
    // These are run before the hooks are invoked so that certain functionality is always run

    private _OnPlayerJoin(player : Player)
    {
        this.currentGameState.incrementField("numPlayers", 1)
        this._OnStateUpdate()
        this.onPlayerJoin(player)
    }

    private _OnPlayerLeave(player : Player)
    {
        this.currentGameState.decrementField("numPlayers", 1)

        if(this.currentGameState.getField("numPlayers") == 0)
        {
            //lobbies need not remember previous game states
            this.ctx.storage.deleteAll()
            this.ctx.abort()
            return
        }

        this._OnStateUpdate()
        this.onPlayerLeave(player)
    }

    private _OnStateUpdate() : void
    {
        for(const ws of this.ctx.getWebSockets())
        {
            if(ws.OPEN)
            {
                ws.send(JSON.stringify({ state: this.currentGameState.getStateValues() } ))
            }
        }

        this.onStateUpdate()
    }

    // ----- PUBLIC HOOKS -----

    /**
     * Called when a player joins the room.
     * 
     * @param player - The player that joined.
     */
    public onPlayerJoin(player : Player) : void {}

    /**
     * Called when a player leaves the room.
     * 
     * @param player - The player that left.
     */
    public onPlayerLeave(player : Player) : void {}

    /**
     * Validates a player attempt to join the room.
     * 
     * @returns an error Result if the player can't join, and a success result otherwise
     */
    public abstract validatePlayerTryJoin() : Result

    /**
     * Validates a player's action before it is applied to state
     * 
     * @param player - The attempting player.
     * @param action - The state change that the player is attempting.
     * @returns an error Result if the Action is invalid, and a success result otherwise
     */
    public abstract validatePlayerAction(player : Player, action : Action<FullState<State>>) : Result
   
    /**
     * Called when a valid player action is processed.
     * 
     * @param player - The player who did the action.
     * @param action - The state change that the player requested.
     */
    public abstract onValidPlayerAction(player : Player, action : Action<FullState<State>>) : void 

    /**
     * Called when the room's state updates.
     * 
     * @param state - The state after update
     */
    public onStateUpdate() : void {}

    /**
     * Called when the room starts.
     */
    public onRoomStart() : void {}

    /**
     * Called when the game starts.
     */
    public onGameStart() : void {}

    /**
     * Called when the game ends.
     */
    public onGameEnd() : void {}

    /**
     * Called when a player reconnects.
     * 
     * @param player - The player that is reconnecting.
     */
    public onPlayerReconnect(player : Player) : void {}


    /**
     * Sends a message to a specific player.
     * 
     * @param player - The player to send the message to.
     * @param message - The message to send.
     * @returns An error result if the player can't be found, a success result otherwise
     */
    public sendMessageToPlayer(player : Player, message : string) : Result 
    {
        for(const ws of this.ctx.getWebSockets())
        {
            if(ws.deserializeAttachment().id === player.id)
            {
                ws.send(message)
                return {success: true} as Result
            }
        }

        return {success: false, reason: "Player not found."} as Result
    }
}