export type BaseConfig = {
    
}

type JSONPrimitive = string | number | boolean | null;

export type JSONValue = 
  | JSONPrimitive 
  | JSONValue[] 
  | { [key: string]: JSONValue };


export class GameState<State extends Record<string, JSONValue>>
{
    private values: State
    private onStateChanged: (deltas: Partial<State>) => void
    constructor(onStateChanged: (deltas: Partial<State>) => void, existingState: State)
    {
        this.values = existingState
        this.onStateChanged = onStateChanged
    }

    public UpdateState(newState : Partial<State>) : void
    {
        Object.assign(this.values, newState)
        this.onStateChanged(newState)
    }

    public incrementField(key: keyof (State), by: number = 1) : void
    {
        this.UpdateState({ [key]: (this.values[key] as number) + by } as Partial<State>)
    }

    public decrementField(key: keyof (State), by: number = 1) : void
    {
        this.incrementField(key, -by)
    }

    public pushToField<K extends keyof State>(
        key: K,
        item: State[K] extends (infer Item)[] ? Item : never
    ): void {
        const current = this.values[key]
        if (!Array.isArray(current)) {
            throw new Error(`Field "${String(key)}" is not an array`)
        }
        this.UpdateState({ [key]: [...current, item] } as Partial<State>)
    }

    public getField<K extends keyof (State)>(key: K): (State)[K]
    {
        return this.values[key] as (State)[K]
    }

    public getValues() : State
    {
        return this.values
    }

}

/**
 * A map of action type strings to their payload shapes.
 * 
 * @example
 * type MyActions = {
 *   MOVE: { x: number, y: number },
 *   CHAT: { message: string },
 *   RESIGN: never,
 * }
 */
export type ActionMap = Record<string, JSONValue | never>

/**
 * Discriminated union of all actions derived from an ActionMap.
 * Each member has a `type` key and a `payload` key typed to match.
 * Actions whose payload is `never` have no `payload` property.
 */
export type Action<Actions extends ActionMap> = {
    [K in keyof Actions]: Actions[K] extends never
        ? { type: K }
        : { type: K; payload: Actions[K] }
}[keyof Actions]

export type Result = 
{
    success: true
} | 
{
    success: false,
    reason: string
}

export type Player = {
    name: string,
    id: string,
    spectator: boolean,
}

export type BaseState = {
    activePlayers: Record<string, Player>, 
    playerMap: Record<string, Player> 
}