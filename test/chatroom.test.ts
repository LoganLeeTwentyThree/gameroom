import { env, exports } from "cloudflare:workers";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { runInDurableObject, listDurableObjectIds } from "cloudflare:test";
import { ChatRoom } from "../src/index.js"

describe("ChatRoom Durable Object", () => {
    const id = env.CHAT_ROOM.idFromName("test");
    const stub = env.CHAT_ROOM.get(id);

    it("should instantiate the room", async () => {
        await runInDurableObject(stub, async (instance, state) => {
            expect(instance).toBeInstanceOf(ChatRoom);
        });

    });

    it("should reject invalid messages", async () => {
        await runInDurableObject(stub, async (instance, state) => {
            await instance.fetch!(
                new Request("https://example.com/websocket", {
                    headers: { "Upgrade": "websocket" },
                })
            );

            const serverWs = state.getWebSockets()[0];
            const sent: unknown[] = [];

            vi.spyOn(serverWs, "send").mockImplementation((data) => {
                sent.push(JSON.parse(data as string));
            });

            await instance.webSocketMessage(serverWs, `{ test: [] }`);

            expect(sent[0]).toStrictEqual({
                message: { error: "Invalid message format" },
                playerId: expect.any(String),
            });
        });
    });

    it("should let chatters freely join and chat", async () => {
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

        await runInDurableObject(stub, async (instance, state) => {
            await instance.fetch!(
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

    it("should let spectators join and recieve messages", async () => {
        await runInDurableObject(stub, async (instance, state) => {
            const response = await instance.fetch!(
                new Request("https://example.com/websocket?spectator=true", {
                    headers: { "Upgrade": "websocket" },
                })
            );

            expect(response.status).toBe(101)
            expect(instance.getActivePlayers().length).toBe(state.getWebSockets().length - 1)
        
            const spectatorWs = state.getWebSockets().find(ws => 
                ws.deserializeAttachment().spectator === true
            )!;

            expect(spectatorWs).toBeDefined()

            const sent: unknown[] = [];
            vi.spyOn(spectatorWs, "send").mockImplementation((data) => {
                sent.push(JSON.parse(data as string));
            });

            const serverWs = state.getWebSockets().find(ws => 
                ws.deserializeAttachment().spectator === false
            )!;

            await instance.webSocketMessage(serverWs, `{ "type": "CHAT", "payload": { "message": "Hello" } }`);
        
            expect(sent[0]).toStrictEqual({
                message: { state: expect.any(Object), players: expect.any(Object) },
                playerId: expect.any(String),
            })
        });
    })

    it("should prevent spectators from chatting", async () => {
        await runInDurableObject(stub, async (instance, state) => {
        
            const spectatorWs = state.getWebSockets().find(ws => 
                ws.deserializeAttachment().spectator === true
            )!;

            expect(spectatorWs).toBeDefined()

            const sent: unknown[] = [];
            vi.spyOn(spectatorWs, "send").mockImplementation((data) => {
                sent.push(JSON.parse(data as string));
            });


            const serverWs = state.getWebSockets().find(ws => 
                ws.deserializeAttachment().spectator === false
            )!;

            await instance.webSocketMessage(spectatorWs, `{ "type": "CHAT", "payload": { "message": "Hello" } }`);
        
            expect(sent[0]).toStrictEqual({
                message: { error: "Spectators can't act." },
                playerId: expect.any(String),
            })
        });
    })

    it("should persist state through hibernation", async () => {
        const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        await sleep(10000) // 10 secs -> hibernation started

        await runInDurableObject(stub, async (instance, state) => {
            const response = await instance.fetch!(
                new Request("https://example.com/websocket", {
                    headers: { "Upgrade": "websocket" },
                })
            );

            expect(instance.currentGameState.getStateValues().chats[0].body).toStrictEqual(`Hello`)
        });


    }, 11_000)

  
});