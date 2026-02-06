"""Streaming STT using Deepgram's live WebSocket API."""

import asyncio
import json
from typing import Callable, Awaitable

import websockets
from config import DEEPGRAM_API_KEY

DEEPGRAM_WS_URL = (
    "wss://api.deepgram.com/v1/listen"
    "?model=nova-2"
    "&language=en"
    "&smart_format=true"
    "&interim_results=false"
    "&endpointing=300"
    "&utterance_end_ms=1000"
)


class LiveTranscriber:
    def __init__(self, on_speech_end: Callable[[], Awaitable[None]] | None = None):
        self.on_speech_end = on_speech_end
        self._ws = None
        self._receive_task = None
        self._final_transcript = ""
        self._closed = False
        self._speech_end_fired = False

    async def connect(self):
        headers = {"Authorization": f"Token {DEEPGRAM_API_KEY}"}
        self._ws = await websockets.connect(DEEPGRAM_WS_URL, additional_headers=headers)
        self._receive_task = asyncio.create_task(self._receive_loop())

    async def send_audio(self, chunk: bytes):
        if self._ws and not self._closed:
            await self._ws.send(chunk)

    async def finish(self) -> str:
        if self._ws and not self._closed:
            await self._ws.send(json.dumps({"type": "CloseStream"}))
            if self._receive_task:
                try:
                    await asyncio.wait_for(self._receive_task, timeout=2.0)
                except asyncio.TimeoutError:
                    pass
            await self._ws.close()
            self._closed = True
        return self._final_transcript

    async def close(self):
        self._closed = True
        if self._receive_task:
            self._receive_task.cancel()
        if self._ws:
            await self._ws.close()

    async def _receive_loop(self):
        try:
            async for message in self._ws:
                if self._closed:
                    break
                data = json.loads(message)
                msg_type = data.get("type")

                if msg_type == "Results":
                    alt = data.get("channel", {}).get("alternatives", [{}])[0]
                    transcript = alt.get("transcript", "")
                    is_final = data.get("is_final", False)

                    if transcript and is_final:
                        if self._final_transcript:
                            self._final_transcript += " " + transcript
                        else:
                            self._final_transcript = transcript

                elif msg_type == "UtteranceEnd":
                    if self.on_speech_end and not self._speech_end_fired and self._final_transcript:
                        self._speech_end_fired = True
                        await self.on_speech_end()

        except websockets.exceptions.ConnectionClosed:
            pass
        except Exception:
            pass
