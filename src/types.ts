export type Config = {}

export class GameState<State>
{
    private values: FullState<State>
    private onStateChanged: () => void
    constructor(onStateChanged: () => void, existingState: FullState<State> | undefined = undefined )
    {
        if(existingState)
        {
            this.values = existingState
        }else
        {
            this.values = {
                numPlayers: 0,
                idCounter: 0
            } as FullState<State>
        }

        this.onStateChanged = onStateChanged
    }

    public UpdateState(newState : Partial<FullState<State>>) : void
    {
        Object.assign(this.values, newState)
        this.onStateChanged()
    }

    public incrementField(key: keyof FullState<State>, by: number = 1) : void
    {
        this.UpdateState({ [key]: (this.values[key] as number) + by } as Partial<FullState<State>>)
        this.onStateChanged()
    }

    public decrementField(key: keyof FullState<State>, by: number = 1) : void
    {
        this.incrementField(key, -by)
        this.onStateChanged()
    }

    public getField<K extends keyof FullState<State>>(key: K): FullState<State>[K]
    {
        return this.values[key] as FullState<State>[K]
    }

    public getStateValues() : FullState<State>
    {
        return this.values
    }

}

export type FullState<State> = State & BaseState

export type Action<State> = {
    type: string,
    payload: Partial<FullState<State>>
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
    id: number,
}

export type BaseState = {
    numPlayers: number, 
    idCounter: number
}