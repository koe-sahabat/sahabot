"""Streaming STT using Deepgram's live WebSocket API."""

import asyncio
import json
import logging
from typing import Callable, Awaitable

import websockets
from config import DEEPGRAM_API_KEY

logger = logging.getLogger("sahabot")

DEEPGRAM_WS_URL = (
    "wss://api.deepgram.com/v1/listen"
    "?model=nova-3"
    "&language=en"
    "&smart_format=true"
    "&interim_results=true"
    "&endpointing=300"
    "&utterance_end_ms=1000"  # Fire UtteranceEnd after 1s of silence
)


class LiveTranscriber:
    """Manages a live transcription session with Deepgram."""

    def __init__(
        self,
        on_interim: Callable[[str], Awaitable[None]] | None = None,
        on_final: Callable[[str], Awaitable[None]] | None = None,
        on_speech_end: Callable[[], Awaitable[None]] | None = None,
    ):
        self.on_interim = on_interim
        self.on_final = on_final
        self.on_speech_end = on_speech_end
        self._ws: websockets.WebSocketClientProtocol | None = None
        self._receive_task: asyncio.Task | None = None
        self._final_transcript = ""
        self._closed = False
        self._speech_end_fired = False

    async def connect(self):
        """Open connection to Deepgram live API."""
        headers = {"Authorization": f"Token {DEEPGRAM_API_KEY}"}
        self._ws = await websockets.connect(DEEPGRAM_WS_URL, additional_headers=headers)
        self._receive_task = asyncio.create_task(self._receive_loop())
        logger.info("Deepgram live connection opened")

    async def send_audio(self, chunk: bytes):
        """Send an audio chunk to Deepgram."""
        if self._ws and not self._closed:
            await self._ws.send(chunk)

    async def finish(self) -> str:
        """Signal end of audio and get final transcript."""
        if self._ws and not self._closed:
            # Send close stream message
            await self._ws.send(json.dumps({"type": "CloseStream"}))
            # Wait for receive loop to finish
            if self._receive_task:
                try:
                    await asyncio.wait_for(self._receive_task, timeout=5.0)
                except asyncio.TimeoutError:
                    logger.warning("Timeout waiting for final transcript")
            await self._ws.close()
            self._closed = True
        logger.info("Final transcript: %s", self._final_transcript)
        return self._final_transcript

    async def close(self):
        """Force close the connection."""
        self._closed = True
        if self._receive_task:
            self._receive_task.cancel()
        if self._ws:
            await self._ws.close()

    async def _receive_loop(self):
        """Receive and process transcription results from Deepgram."""
        try:
            async for message in self._ws:
                if self._closed:
                    break
                data = json.loads(message)

                msg_type = data.get("type")

                # Handle transcription results
                if msg_type == "Results":
                    alt = data.get("channel", {}).get("alternatives", [{}])[0]
                    transcript = alt.get("transcript", "")
                    is_final = data.get("is_final", False)

                    if transcript:
                        if is_final:
                            # Accumulate final transcripts
                            if self._final_transcript:
                                self._final_transcript += " " + transcript
                            else:
                                self._final_transcript = transcript
                            if self.on_final:
                                await self.on_final(self._final_transcript)
                        else:
                            # Interim result
                            if self.on_interim:
                                # Show accumulated final + current interim
                                display = self._final_transcript
                                if display:
                                    display += " " + transcript
                                else:
                                    display = transcript
                                await self.on_interim(display)

                # UtteranceEnd = speaker stopped talking (VAD)
                elif msg_type == "UtteranceEnd":
                    if self.on_speech_end and not self._speech_end_fired and self._final_transcript:
                        self._speech_end_fired = True
                        logger.info("VAD: utterance end detected")
                        await self.on_speech_end()

        except websockets.exceptions.ConnectionClosed:
            logger.info("Deepgram connection closed")
        except Exception:
            logger.exception("Error in Deepgram receive loop")
