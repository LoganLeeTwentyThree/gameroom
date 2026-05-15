import { env } from "cloudflare:workers"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { runInDurableObject } from "cloudflare:test"
import type { Player } from "../src/index.js"

describe("GameRoom hooks", () => {
    let stub: any

    beforeEach(() => {
        stub = env.CHAT_ROOM.get(env.CHAT_ROOM.newUniqueId())
    })

    //need to test onRoomStart, but can't runInDurableObject without triggering onRoomStart before

    it("should invoke onPlayerJoin", async () => {
        await runInDurableObject(stub, async (instance) => {
            const called: Player[] = []
            instance.onPlayerJoin = (player: Player) => { called.push(player) }

            await instance.fetch!(
                new Request("https://example.com/websocket", {
                    headers: { "Upgrade": "websocket" },
                })
            )

            expect(called.length).toBe(1)
            expect(called[0]).toMatchObject({ name: expect.any(String), id: expect.any(String) })
        })
    })

    it("should invoke onPlayerLeave when a non-last player disconnects", async () => {
        await runInDurableObject(stub, async (instance, state) => {
            // need 2 players so closeRoom doesn't fire instead
            await instance.fetch!(new Request("https://example.com/websocket", { headers: { "Upgrade": "websocket" } }))
            await instance.fetch!(new Request("https://example.com/websocket", { headers: { "Upgrade": "websocket" } }))

            const called: Player[] = []
            instance.onPlayerLeave = (player: Player) => { called.push(player) }

            const ws = state.getWebSockets()[0]
            await instance.webSocketClose(ws, 1000, "test", true)

            expect(called.length).toBe(1)
        })
    })

    it("should NOT invoke onPlayerLeave for the last player (closeRoom fires instead)", async () => {
        await runInDurableObject(stub, async (instance, state) => {
            await instance.fetch!(new Request("https://example.com/websocket", { headers: { "Upgrade": "websocket" } }))

            const called: bool[] = []
            instance.onPlayerLeave = (_player: Player) => { called.push(true) }
            instance.closeRoom = () => { called.push(true) }

            const ws = state.getWebSockets()[0]
            await instance.webSocketClose(ws, 1000, "test", true)

            expect(called.length).toBe(1)
        })
    })

    it("should invoke onPlayerReconnect and skip onPlayerJoin", async () => {
        let playerId: string

        await runInDurableObject(stub, async (instance, state) => {
            await instance.fetch!(new Request("https://example.com/websocket", { headers: { "Upgrade": "websocket" } }))
            playerId = state.getWebSockets()[0].deserializeAttachment().id
        })

        await runInDurableObject(stub, async (instance) => {
            const reconnects: Player[] = []
            const joins: Player[] = []
            instance.onPlayerReconnect = (p: Player) => { reconnects.push(p) }
            instance.onPlayerJoin = (p: Player) => { joins.push(p) }

            await instance.fetch!(
                new Request(`https://example.com/websocket?playerId=${playerId}`, {
                    headers: { "Upgrade": "websocket" },
                })
            )

            expect(reconnects.length).toBe(1)
            expect(reconnects[0].id).toBe(playerId)
            expect(joins.length).toBe(0)
        })
    })

    it("should invoke onStateUpdate after every state broadcast", async () => {
        await runInDurableObject(stub, async (instance, state) => {
            await instance.fetch!(new Request("https://example.com/websocket", { headers: { "Upgrade": "websocket" } }))

            const called: number[] = []
            instance.onStateUpdate = () => { called.push(1) }

            await instance.webSocketMessage(
                state.getWebSockets()[0],
                JSON.stringify({ type: "CHAT", payload: { message: "hello" } })
            )

            expect(called.length).toBeGreaterThanOrEqual(1)
        })
    })

    it("should invoke onPlayerError on websocket error", async () => {
        await runInDurableObject(stub, async (instance, state) => {
            await instance.fetch!(new Request("https://example.com/websocket", { headers: { "Upgrade": "websocket" } }))

            const errors: unknown[] = []
            instance.onPlayerError = (_player: Player, err: unknown) => { errors.push(err) }

            const ws = state.getWebSockets()[0]
            await instance.webSocketError(ws, new Error("DIE!!"))

            expect(errors.length).toBe(1)
        })
    })
})