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

export type Action<State extends Record<string, JSONValue>> = {
    type: string,
    payload: Partial<State>
}

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