import { env, exports } from "cloudflare:workers";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { runInDurableObject, listDurableObjectIds, runDurableObjectAlarm } from "cloudflare:test";

describe("MatchMaker Durable Object", () => { 
    const id = env.MATCHMAKER.idFromName("test");
    let stub = env.MATCHMAKER.get(id);

    beforeEach(() => {
        let newId = env.MATCHMAKER.newUniqueId()
        stub = env.MATCHMAKER.get(newId);
    })

    it("should let players queue", async () => {
        await runInDurableObject(stub, async (instance, state) => {
            await instance.fetch!( 
                new Request("https://example.com/?queue=0", {
                    headers: { "Upgrade": "websocket" },
                })
            )

            const queueNo = state.getWebSockets()[0].deserializeAttachment()

            expect(queueNo).toStrictEqual({ queue: "0" })
        })
    })

    

    it("should match players together", async () => {
        const sent: unknown[] = [];
        await runInDurableObject(stub, async (instance, state) => {
            await instance.fetch!( 
                new Request("https://example.com/?queue=0", {
                    headers: { "Upgrade": "websocket" },
                })
            )

            await instance.fetch!( 
                new Request("https://example.com/?queue=0", {
                    headers: { "Upgrade": "websocket" },
                })
            )

            const serverWs = state.getWebSockets()[0];
            
            vi.spyOn(serverWs, "send").mockImplementation((data) => {
                sent.push(JSON.parse(data as string));
            });

            await instance.alarm!()

        })


        expect(sent[0]).toStrictEqual({ command: "Match", lobby: expect.any(String) })
    })

    it("should support multiple queues", async () => {
        let sent: unknown[] = [];
        await runInDurableObject(stub, async (instance, state) => {
            await instance.fetch!( 
                new Request("https://example.com/?queue=1", {
                    headers: { "Upgrade": "websocket" },
                })
            )

            await instance.fetch!( 
                new Request("https://example.com/?queue=0", {
                    headers: { "Upgrade": "websocket" },
                })
            )

            await instance.fetch!( 
                new Request("https://example.com/?queue=1", {
                    headers: { "Upgrade": "websocket" },
                })
            )

            const serverWs = state.getWebSockets()[0];
            
            vi.spyOn(serverWs, "send").mockImplementation((data) => {
                sent.push(JSON.parse(data as string));
            });

            await instance.alarm!()
            expect(sent.length).toBe(1)
            expect(state.getWebSockets().filter((ws) => ws.readyState == 1).length).toBe(1)
            
            sent = []

            const qZeroWs = state.getWebSockets()[0];
            
            vi.spyOn(qZeroWs, "send").mockImplementation((data) => {
                sent.push(JSON.parse(data as string));
            });

            await instance.fetch!( 
                new Request("https://example.com/?queue=0", {
                    headers: { "Upgrade": "websocket" },
                })
            )

            instance.alarm!()

            expect(state.getWebSockets().filter((ws) => ws.readyState == 1).length).toBe(0)
            expect(sent[0]).toStrictEqual({ command: "Match", lobby: expect.any(String) })
        })
    })

    it("should support different match sizes", async () => {
        await stub.setMatchSize(3)

        await runInDurableObject(stub, async (instance, state) => {
            await instance.fetch!( 
                new Request("https://example.com/?queue=0", {
                    headers: { "Upgrade": "websocket" },
                })
            )

            await instance.fetch!( 
                new Request("https://example.com/?queue=0", {
                    headers: { "Upgrade": "websocket" },
                })
            )

            const sent = []
            const serverWs = state.getWebSockets()[0];
            
            vi.spyOn(serverWs, "send").mockImplementation((data) => {
                sent.push(JSON.parse(data as string));
            });

            await instance.alarm!()
            expect(sent.length).toBe(0)

            await instance.fetch!( 
                new Request("https://example.com/?queue=0", {
                    headers: { "Upgrade": "websocket" },
                })
            )

            await instance.alarm!()
            expect(sent.length).toBe(1)
            expect(state.getWebSockets().filter((ws) => ws.readyState == 1).length).toBe(0)
            expect(sent[0]).toStrictEqual({ command: "Match", lobby: expect.any(String) })

        })
    })

    it("should persist state through hibernation", async () => {
        const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        stub.setMatchSize(3)
        await sleep(10000) // 10 secs -> hibernation started

        await runInDurableObject(stub, async (instance, state) => {
            expect(instance.matchSize).toBe(3)
        });


    }, 11_000)
})