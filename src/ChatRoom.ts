import { GameRoom } from "./GameRoom.js";
import { Result, Player, Action } from "./types.js";

type Chat = {
    body: string,
    sender: string
}

type ChatState = {
    chats: Array<Chat>
}

type ChatActions = {
    CHAT: {message: string},
}

export class ChatRoom<Env> extends GameRoom<ChatState, ChatActions, {}, Env>
{
    getInitialState(): ChatState {
        return {
            chats: []
        }
    }

    getConfig(): {} {
        return {}
    }

    public validatePlayerTryJoin(): Result {
        return {success: true}
    }

    public async validatePlayerAction(player: Player, action: Action<ChatActions>): Promise<Result> {
        //optional profanity filter?
        return {success: true}
    }

    public onValidPlayerAction(player: Player, action: Action<ChatActions>): void {
    if (action.type == "CHAT") {
            this.state.pushToField("chats", {
                body: action.payload.message,
                sender: player.id
            })
        }
    }
}
    

