import { GameRoom } from "./GameRoom.js"
import { Action, JSONValue, Player, Result } from "./types.js"

export abstract class GameRoomPlugin {
    room: GameRoom<any, any, any, any>
    constructor(room : GameRoom<any, any, any, any>)
    {
        this.room = room
    }

    abstract serialize() : Record<string, JSONValue>
    abstract hydrate(data: Record<string, JSONValue>): void 

    // lifecycle hooks — all optional
    onRoomStart(): void {}
    onPlayerJoin(player: Player): void {}
    onPlayerLeave(player: Player): void {}
    onPlayerReconnect(player: Player): void {}
    onStateUpdate(): void {}
}

export class TurnManager extends GameRoomPlugin
{
    private players : Player[]
    private index : number = 0

    constructor(room : GameRoom<any, any, any, any>)
    {
        super(room)
        this.players = this.room.getActivePlayers()
    }

    public advance()
    {
        if(this.index < this.players.length - 1)
        {
            this.index++
        }else {
            this.index = 0
        }
    }

    public getActivePlayer() : Player | undefined
    {
        return this.players[this.index]
    }

    onPlayerJoin(player: Player): void {
        this.players.push(player)
    }

    onPlayerLeave(player: Player): void {
        const index = this.players.findIndex((p) => p.id === player.id) ?? -1

        if(this.index >= index)
        {
            this.index--
        }
        this.players = this.room.getActivePlayers()

    }

    serialize(): Record<string, JSONValue> {
        return { players: this.players, index: this.index}
    }

    hydrate(data: Record<string, JSONValue>): void {
        this.players = data.players as Player[]
        this.index = this.index as number
    }
}

// ─── ReadyCheck ───────────────────────────────────────────────────────────────
// Tracks which players have readied up. Fires onAllReady() when every active
// player is ready. Call reset() to clear and reuse (e.g. between rounds).
 
export class ReadyCheck extends GameRoomPlugin {
    private ready = new Set<string>()
    onAllReady: () => void
 
    constructor(room: GameRoom<any, any, any, any>, onAllReady: () => void) {
        super(room)
        this.onAllReady = onAllReady
    }
 
    markReady(player: Player): void {
        this.ready.add(player.id)
        const active = this.room.getActivePlayers()
        if (active.length > 0 && active.every(p => this.ready.has(p.id))) {
            this.onAllReady()
        }
    }
 
    isReady(player: Player): boolean {
        return this.ready.has(player.id)
    }
 
    reset(): void {
        this.ready.clear()
    }
 
    onPlayerLeave(player: Player): void {
        this.ready.delete(player.id)
        const active = this.room.getActivePlayers()
        if (active.length > 0 && active.every(p => this.ready.has(p.id))) {
            this.onAllReady()
        }
    }
 
    serialize(): Record<string, JSONValue> {
        return { ready: [...this.ready] }
    }
 
    hydrate(data: Record<string, JSONValue>): void {
        this.ready = new Set(data.ready as string[])
    }
}

// ─── VoteKick ─────────────────────────────────────────────────────────────────
// Players vote to remove a target. When votes reach threshold (default: majority),
// onKickApproved() fires. Call vote(voter, targetId) from your action handler.
 
export class VoteKick extends GameRoomPlugin {
    private votes = new Map<string, Set<string>>() // targetId -> Set of voter ids
    private threshold: number | null
    private onKickApproved: (target: Player) => void
 
    // threshold: fixed number of votes required. null = simple majority.
    constructor(
        room: GameRoom<any, any, any, any>,
        onKickApproved: (target: Player) => void,
        threshold: number | null = null
    ) {
        super(room)
        this.onKickApproved = onKickApproved
        this.threshold = threshold
    }
 
    vote(voter: Player, targetId: string): void {
        if (!this.votes.has(targetId)) this.votes.set(targetId, new Set())
        this.votes.get(targetId)!.add(voter.id)
 
        const required = this.threshold ?? Math.ceil(this.room.getActivePlayers().length / 2)
        if (this.votes.get(targetId)!.size >= required) {
            const target = this.room.getPlayer(targetId)
            if (target) {
                this.votes.delete(targetId)
                this.onKickApproved(target)
            }
        }
    }
 
    onPlayerLeave(player: Player): void {
        this.votes.delete(player.id)
        for (const [, voters] of this.votes) {
            voters.delete(player.id)
        }
    }
 
    serialize(): Record<string, JSONValue> {
        // Map<string, Set<string>> -> { [targetId]: voterId[] }
        const votes: Record<string, string[]> = {}
        for (const [targetId, voters] of this.votes) {
            votes[targetId] = [...voters]
        }
        return { votes }
    }
 
    hydrate(data: Record<string, JSONValue>): void {
        const votes = data.votes as Record<string, string[]>
        this.votes = new Map(
            Object.entries(votes).map(([targetId, voters]) => [targetId, new Set(voters)])
        )
    }
}
 
// ─── ActionLog ────────────────────────────────────────────────────────────────
// Records every valid action with timestamp and player. Useful for replay,
// audit, or undo. Access via getLog().
 
type LogEntry = {
    timestamp: number
    player: Player
    action: { type: string; payload?: any }
}
 
export class ActionLog extends GameRoomPlugin {
    private log: LogEntry[] = []
    private maxEntries: number
 
    constructor(room: GameRoom<any, any, any, any>, maxEntries = 1000) {
        super(room)
        this.maxEntries = maxEntries
    }
 
    record(player: Player, action: { type: string; payload?: any }): void {
        this.log.push({ timestamp: Date.now(), player, action })
        if (this.log.length > this.maxEntries) {
            this.log.shift()
        }
    }
 
    getLog(): LogEntry[] {
        return this.log
    }
 
    getPlayerLog(player: Player): LogEntry[] {
        return this.log.filter(e => e.player.id === player.id)
    }
 
    clear(): void {
        this.log = []
    }
 
    serialize(): Record<string, JSONValue> {
        return { log: this.log as unknown as JSONValue }
    }
 
    hydrate(data: Record<string, JSONValue>): void {
        this.log = data.log as unknown as LogEntry[]
    }
}
 
// ─── Rematch ──────────────────────────────────────────────────────────────────
// Tracks rematch votes. When all active players have voted to rematch,
// onAllAgreed() fires. Call vote() from your action handler.
 
export class Rematch extends GameRoomPlugin {
    private votes = new Set<string>()
    private onAllAgreed: () => void
 
    constructor(room: GameRoom<any, any, any, any>, onAllAgreed: () => void) {
        super(room)
        this.onAllAgreed = onAllAgreed
    }
 
    vote(player: Player): void {
        this.votes.add(player.id)
        const active = this.room.getActivePlayers()
        if (active.length > 0 && active.every(p => this.votes.has(p.id))) {
            this.votes.clear()
            this.onAllAgreed()
        }
    }
 
    hasVoted(player: Player): boolean {
        return this.votes.has(player.id)
    }
 
    onPlayerLeave(player: Player): void {
        this.votes.delete(player.id)
        const active = this.room.getActivePlayers()
        if (active.length > 0 && active.every(p => this.votes.has(p.id))) {
            this.votes.clear()
            this.onAllAgreed()
        }
    }
 
    serialize(): Record<string, JSONValue> {
        return { votes: [...this.votes] }
    }
 
    hydrate(data: Record<string, JSONValue>): void {
        this.votes = new Set(data.votes as string[])
    }
}
 
// ─── MoveTimer (chess clock) ──────────────────────────────────────────────────
// Per-player time bank. Each player starts with bankMs. Call start(player) when
// their turn begins, stop(player) when it ends. onExpire fires when a player
// exhausts their bank. Uses Date.now() diffs — no alarm needed.
 
export class MoveTimer extends GameRoomPlugin {
    private banks = new Map<string, number>()    // remaining ms per player
    private turnStart = new Map<string, number>() // Date.now() when turn started
    private bankMs: number
    private onExpire: (player: Player) => void
 
    constructor(room: GameRoom<any, any, any, any>, bankMs: number, onExpire: (player: Player) => void) {
        super(room)
        this.bankMs = bankMs
        this.onExpire = onExpire
    }
 
    start(player: Player): void {
        if (!this.banks.has(player.id)) this.banks.set(player.id, this.bankMs)
        this.turnStart.set(player.id, Date.now())
    }
 
    stop(player: Player): void {
        const start = this.turnStart.get(player.id)
        if (start === undefined) return
        const elapsed = Date.now() - start
        const remaining = (this.banks.get(player.id) ?? this.bankMs) - elapsed
        this.banks.set(player.id, remaining)
        this.turnStart.delete(player.id)
        if (remaining <= 0) this.onExpire(player)
    }
 
    remainingMs(player: Player): number {
        const bank = this.banks.get(player.id) ?? this.bankMs
        const start = this.turnStart.get(player.id)
        if (start === undefined) return bank
        return bank - (Date.now() - start)
    }
 
    onPlayerLeave(player: Player): void {
        this.banks.delete(player.id)
        this.turnStart.delete(player.id)
    }
 
    serialize(): Record<string, JSONValue> {
        // Snapshot remaining time for any active turn by computing elapsed so far.
        const banks: Record<string, number> = {}
        for (const [id, bank] of this.banks) {
            const start = this.turnStart.get(id)
            banks[id] = start !== undefined ? bank - (Date.now() - start) : bank
        }
        // turnStart is not persisted — on hydration the active player's turn is
        // treated as paused. Call start() again after rehydration if needed.
        return { banks }
    }
 
    hydrate(data: Record<string, JSONValue>): void {
        const banks = data.banks as Record<string, number>
        this.banks = new Map(Object.entries(banks))
        this.turnStart.clear()
    }
}