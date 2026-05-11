import { env, exports } from "cloudflare:workers";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { runInDurableObject, listDurableObjectIds } from "cloudflare:test";
import { ChatRoom } from "../src/index.js"

describe("ChatRoom Durable Object", () => {

    

    it("should instantiate the room", async () => {
        const id = env.CHAT_ROOM.idFromName("test");
        const stub = env.CHAT_ROOM.get(id);

        await runInDurableObject(stub, async (instance, state) => {
            expect(instance).toBeInstanceOf(ChatRoom);
        });

    });

    it("should reject invalid messages", async () => {
        const id = env.CHAT_ROOM.idFromName("test");
        const stub = env.CHAT_ROOM.get(id);

        await runInDurableObject(stub, async (instance, state) => {
            const response = await instance.fetch!(
                new Request("https://example.com/websocket", {
                    headers: { "Upgrade": "websocket" },
                })
            );

            const serverWs = state.getWebSockets()[0];

            const sent: unknown[] = [];
            vi.spyOn(serverWs, "send").mockImplementation((data) => {
                sent.push(JSON.parse(data as string));
            });

            await instance.webSocketMessage(serverWs, "{ test: [] }");

            expect(sent[0]).toStrictEqual({
                message: { error: "Invalid message format" },
                playerId: expect.any(String),
            });
        });
    });

    it("should let chatters freely join and chat", async () => {
        const id = env.CHAT_ROOM.idFromName("test");
        const stub = env.CHAT_ROOM.get(id);

        await runInDurableObject(stub, async (instance, state) => {
            const response = await instance.validatePlayerTryJoin()
            expect(response).toStrictEqual({success: true});
            
            const testPlayer = {name: "test", id: "id", ip: "ip"}
            const testAction = {type: "CHAT", message: "test"}
            const tryChat = await instance.validatePlayerAction(testPlayer, testAction)
            expect(tryChat).toStrictEqual({success: true})
        });
    })

    it("should update chat history when chats are sent", async () => {
        const id = env.CHAT_ROOM.idFromName("test");
        const stub = env.CHAT_ROOM.get(id);

        await runInDurableObject(stub, async (instance, state) => {
            const response = await instance.fetch!(
                new Request("https://example.com/websocket", {
                    headers: { "Upgrade": "websocket" },
                })
            );

            const serverWs = state.getWebSockets()[0];
            await instance.webSocketMessage(serverWs, `{ "type": "CHAT", "payload": { "message": "Hello" } }`);

            expect(instance.currentGameState.getStateValues().chats).toStrictEqual(
                [{body: "Hello", sender: expect.any(String)}]
            );
        });
    })

    it("should push out state changes", async () => {
        const id = env.CHAT_ROOM.idFromName("test");
        const stub = env.CHAT_ROOM.get(id);

        await runInDurableObject(stub, async (instance, state) => {
            const response = await instance.fetch!(
                new Request("https://example.com/websocket", {
                    headers: { "Upgrade": "websocket" },
                })
            );

            const serverWs = state.getWebSockets()[0];

            const sent: unknown[] = [];
            vi.spyOn(serverWs, "send").mockImplementation((data) => {
                sent.push(JSON.parse(data as string));
            });

            await instance.webSocketMessage(serverWs, `{ "type": "CHAT", "payload": { "message": "Hello" } }`);

            expect(sent[0].message.state.chats[0].body).toStrictEqual(`Hello`)
        });
    })

  
});