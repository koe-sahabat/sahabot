"""Streaming STT using Deepgram's live WebSocket API."""

import asyncio
import json
import logging
from typing import Awaitable, Callable

import websockets
from config import DEEPGRAM_API_KEY

logger = logging.getLogger("sahabot")

DEEPGRAM_WS_URL = (
    "wss://api.deepgram.com/v1/listen"
    "?model=nova-2"
    "&language=en"
    "&smart_format=true"
    "&interim_results=true"
    "&endpointing=300"
    "&utterance_end_ms=1000"
)


class LiveTranscriber:
    """Manages a single Deepgram live transcription session.

    Streams audio chunks to Deepgram, accumulates final transcripts,
    and fires an optional callback when VAD detects the speaker stopped.
    """

    def __init__(self, on_speech_end: Callable[[], Awaitable[None]] | None = None):
        self.on_speech_end = on_speech_end
        self._ws: websockets.WebSocketClientProtocol | None = None
        self._receive_task: asyncio.Task | None = None
        self._final_transcript = ""
        self._closed = False
        self._speech_end_fired = False

    async def connect(self):
        headers = {"Authorization": f"Token {DEEPGRAM_API_KEY}"}
        self._ws = await websockets.connect(
            DEEPGRAM_WS_URL, additional_headers=headers
        )
        self._receive_task = asyncio.create_task(self._receive_loop())
        logger.info("Deepgram live session connected")

    async def send_audio(self, chunk: bytes):
        if self._ws and not self._closed:
            await self._ws.send(chunk)

    async def finish(self) -> str:
        """Close the Deepgram stream and return the full transcript."""
        if self._ws and not self._closed:
            await self._ws.send(json.dumps({"type": "CloseStream"}))
            if self._receive_task:
                try:
                    await asyncio.wait_for(self._receive_task, timeout=2.0)
                except asyncio.TimeoutError:
                    pass
            await self._ws.close()
            self._closed = True
        logger.info("Transcript: %s", self._final_transcript)
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
                    if (
                        self.on_speech_end
                        and not self._speech_end_fired
                        and self._final_transcript
                    ):
                        self._speech_end_fired = True
                        logger.info("VAD speech-end triggered")
                        await self.on_speech_end()

                elif msg_type == "Error":
                    logger.error("Deepgram error: %s", data)

        except websockets.exceptions.ConnectionClosed as e:
            logger.warning("Deepgram connection closed: %s", e)
        except Exception:
            logger.exception("Deepgram receive loop error")
