import { DurableObject } from "cloudflare:workers";
import { GameState, Action, ActionMap, Player, Result, JSONValue, BaseState } from "./types.js"

/**
 * A lobby that tracks state and invokes hooks for your game.
 */
export abstract class GameRoom<State extends Record<string, JSONValue>, Actions extends ActionMap, Config = {}, Env = unknown> extends DurableObject<Env> {
    protected baseState : BaseState
    protected currentGameState : GameState<State>
    protected config : Config

    //----- DURABLE OBJECT LIFECYCLE -----

    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);

        const oldState : State | null | undefined = this.ctx.storage.kv.get("gamestate")
        const oldBaseState : BaseState | null | undefined = this.ctx.storage.kv.get("basestate")

        //if we are being reconstructed after hibernation, we restore the old state from pre hibernation
        if(oldBaseState)
        {
            this.baseState = oldBaseState
        }else
        {
            this.baseState = 
            {
                activePlayers: {},
                playerMap: {}
            }
        }

        if(oldState && this.ctx.getWebSockets().length > 0)
        {
            this.currentGameState = new GameState<State>(() => this._OnStateUpdate(), oldState)
        }else 
        {
            this.currentGameState = new GameState<State>(() => this._OnStateUpdate(), this.getInitialState())
            this.onRoomStart()
        }

        // set the config according to user defined config 
        this.config = this.getConfig()
    }

    //User defines their state and config defaults in their child class
    abstract getInitialState(): State
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

        //check if this is a reconnect or a new player
        const existingId = url.searchParams.get("playerId")
        const existingPlayer = existingId 
            ? this.baseState.playerMap[existingId]
            : undefined

        const player: Player = existingPlayer ?? {
            name: url.searchParams.get("playerName") ?? "Player",
            id: crypto.randomUUID(),
            ip: request.headers.get("CF-Connecting-IP") ?? "0.0.0.0" // for use with rate limiting
        }

        server.serializeAttachment(player)

        this.ctx.acceptWebSocket(server);

        if(existingPlayer) {
            this.onPlayerReconnect(player)
        } else {
            this._OnPlayerJoin(player)
        }

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
            const action = JSON.parse(message as string) as Action<ActionMap>
            const player : Player = ws.deserializeAttachment()
            const result : Result = this.validatePlayerAction(player, action)

            if(result.success)
            {
                this.onValidPlayerAction(player, action)
            }else
            {
                this.safeWsSend(ws, { error: result.reason })
            }
        } catch (e) {
            this.safeWsSend(ws, { error: "Invalid message format" })
        }
        
    }

    safeWsSend(ws: WebSocket, message: JSONValue)
    {
        try
        {
            ws.send(JSON.stringify({ message, playerId: ws.deserializeAttachment().id }))
        }catch
        {
            return 
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
        try{
            ws.close(code, reason);
        }catch
        {
            //shhh
        }
        

        //prevents infinite closeRoom -> onPlayerLeave loop
        if(this.getActivePlayers().length > 0)
        {
            this._OnPlayerLeave(ws.deserializeAttachment() as Player)
        }
        
    }

    // ----- PRIVATE ------
    // These are run before the hooks are invoked so that certain functionality is always run

    private _OnPlayerJoin(player : Player)
    {
        this.currentGameState.incrementField("activePlayerCount", 1)

        //add player to the map and active players list
        this.baseState.playerMap = 
        {
            ...this.baseState.playerMap,
            [player.id]: player
        }
            
        this.baseState.activePlayers = {
            ...this.baseState.playerMap,
            [player.id]: player
        }
        

        this._OnStateUpdate()
        this.onPlayerJoin(player)
    }

    private _OnPlayerLeave(player : Player)
    {
        let newActivePlayers = this.baseState.activePlayers
        delete newActivePlayers[player.id]

        this.baseState.activePlayers = newActivePlayers

        if(this.getActivePlayers().length == 0)
        {
            this.closeRoom()
            return
        }

        this._OnStateUpdate()
        this.onPlayerLeave(player)
    }

    private _OnStateUpdate() : void
    {
        for(const ws of this.ctx.getWebSockets())
        {
            //dont send the secrets!
            const { secrets: secrets, ...safeState } = this.currentGameState.getStateValues()
            this.safeWsSend(ws, { state: safeState })
        }

        this.ctx.storage.put("gamestate", this.currentGameState.getStateValues())
        this.ctx.storage.put("basestate", this.baseState)

        this.onStateUpdate()
    }

    // ----- PUBLIC HOOKS -----

    /**
     * Closes all websocket connections and aborts this room
     */
    public closeRoom() : void
    {
        console.log("Closing room")
        for( const ws of this.ctx.getWebSockets())
        {
            this.webSocketClose(ws, 1001, "Server is shutting down", false)
        }

        this.ctx.storage.deleteAll()
        this.ctx.abort()
        return
    }

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
    public abstract validatePlayerAction(player : Player, action : Action<ActionMap>) : Result
   
    /**
     * Called when a valid player action is processed.
     * 
     * @param player - The player who did the action.
     * @param action - The state change that the player requested.
     */
    public abstract onValidPlayerAction(player : Player, action : Action<ActionMap>) : void 

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
     * Called when a player reconnects.
     * 
     * @param player - The player that is reconnecting.
     */
    public onPlayerReconnect(player : Player) : void {}


    // ----- PUBLIC API -----

    /**
     * Sends a message to a specific player.
     * 
     * @param player - The player to send the message to.
     * @param message - The message to send.
     * @returns An error result if the player can't be found, a success result otherwise
     */
    public sendMessageToPlayer(player : Player, message : JSONValue) : Result 
    {
        for(const ws of this.ctx.getWebSockets())
        {
            if(ws.deserializeAttachment().id === player.id)
            {
                if(!ws.OPEN) { return {success: false, reason: "Player web socket not open."} as Result }

                this.safeWsSend(ws, message)
                return {success: true} as Result
            }
        }

        return {success: false, reason: "Player not found."} as Result
    }

    /**
     * Gets a player that has been in this game room at any point in its current lifetime
     * 
     * @param id the id of the player to get
     * @returns the player object if found, undefined otherwise
     */
    getPlayer(id: string): Player | undefined { return this.baseState.playerMap[id] }
    
    /**
     * Gets a list of the players currently connected to this game room
     * 
     * @returns an array of active Players
     */
    getActivePlayers() : Player[] { return Object.values(this.baseState.activePlayers) }


    /**
     * Gets a list of players that have been in this game room at any point in its current lifetime
     * 
     * @returns An array of lifetime Players 
     */
    getLifeTimePlayers() : Player[] { return Object.values(this.baseState.playerMap) }

}