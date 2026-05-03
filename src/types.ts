export type BaseConfig = {
    //may want something here in the future...
}

type JSONPrimitive = string | number | boolean | null;

export type JSONValue = 
  | JSONPrimitive 
  | JSONValue[] 
  | { [key: string]: JSONValue };


export class GameState<State extends Record<string, JSONValue>>
{
    private values: State
    private onStateChanged: () => void
    constructor(onStateChanged: () => void, existingState: State)
    {
        this.values = existingState
        this.onStateChanged = onStateChanged
    }

    public UpdateState(newState : Partial<State>) : void
    {
        Object.assign(this.values, newState)
        this.onStateChanged()
    }

    public incrementField(key: keyof (State), by: number = 1) : void
    {
        this.UpdateState({ [key]: (this.values[key] as number) + by } as Partial<State>)
    }

    public decrementField(key: keyof (State), by: number = 1) : void
    {
        this.incrementField(key, -by)
    }

    public getField<K extends keyof (State)>(key: K): (State)[K]
    {
        return this.values[key] as (State)[K]
    }

    public getStateValues() : State
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
    ip: string,
}

export type BaseState = {
    activePlayers: Record<string, Player>, 
    playerMap: Record<string, Player> 
}