export type BaseConfig = {
    doServerTick: boolean, // for realtime games, ther server needs to perform calculations on it own
}

export type FullConfig<Config> = Config & BaseConfig

type JSONPrimitive = string | number | boolean | null;

export type JSONValue = 
  | JSONPrimitive 
  | JSONValue[] 
  | { [key: string]: JSONValue };

export type FullState<State extends Record<string, JSONValue>> = State & BaseState

export class GameState<State extends Record<string, JSONValue>>
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
                activePlayerCount: 0,
                playerMap: {}
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
    }

    public decrementField(key: keyof FullState<State>, by: number = 1) : void
    {
        this.incrementField(key, -by)
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

export type Action<State extends Record<string, JSONValue>> = {
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
    id: string,
    ip: string,
}

export type BaseState = {
    activePlayerCount: number,
    activePlayers: Record<string, Player>, 
    playerMap: Record<string, Player> 
}