import asyncio
import websockets

async def client():
    async with websockets.connect("ws://0.0.0.0:8765") as websocket:
        await websocket.send("Привет!")
        response = await websocket.recv()
        print(f"Ответ: {response}")

asyncio.run(client())
