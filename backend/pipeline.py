"""LLM → sentence splitting → TTS → audio delivery pipeline.

Streams LLM tokens, splits them into sentences, synthesises each
sentence concurrently via TTS, and delivers audio chunks in order
through an asyncio.Queue-based architecture (no polling).

TTS tasks run concurrently (sentence 2 starts while sentence 1 is
still synthesising) but each sentence's audio is sent as a single
binary frame so the browser can decode it as a complete MP3.
"""

import asyncio
import io
import logging
import re

from fastapi import WebSocket

from llm import stream_tokens
from tts import stream_tts

logger = logging.getLogger("sahabot")

# Split after sentence-ending punctuation followed by whitespace.
_SENTENCE_RE = re.compile(r"(?<=[.!?])\s+")

# If the buffer grows past this many characters without a sentence
# boundary, force a split on the last comma-space.
_MAX_BUFFER = 150


class SentenceSplitter:
    """Accumulates streaming tokens and yields complete sentences."""

    def __init__(self):
        self._buffer = ""

    def push(self, token: str) -> list[str]:
        """Push a token; return any complete sentences ready for TTS."""
        self._buffer += token
        sentences: list[str] = []

        # Primary split: sentence-ending punctuation
        parts = _SENTENCE_RE.split(self._buffer)
        if len(parts) > 1:
            for part in parts[:-1]:
                s = part.strip()
                if s:
                    sentences.append(s)
            self._buffer = parts[-1]

        # Fallback: long buffer with no sentence boundary yet — split on
        # the last comma so TTS can start on the first clause.
        if len(self._buffer) > _MAX_BUFFER:
            idx = self._buffer.rfind(", ")
            if idx > 20:
                sentences.append(self._buffer[: idx + 1].strip())
                self._buffer = self._buffer[idx + 2 :]

        return sentences

    def flush(self) -> str | None:
        """Return any remaining buffered text (end-of-stream)."""
        remainder = self._buffer.strip()
        self._buffer = ""
        return remainder or None


_SENTINEL = object()


class Pipeline:
    """Orchestrates the LLM → TTS → WebSocket audio pipeline.

    Usage::

        pipeline = Pipeline(ws, messages)
        full_response = await pipeline.run()
    """

    def __init__(self, ws: WebSocket, messages: list[dict]):
        self._ws = ws
        self._messages = messages
        # Queue holds asyncio.Task objects (or _SENTINEL to signal end).
        # Tasks are enqueued in sentence order; the sender awaits each in
        # sequence so audio is always delivered in the correct order, while
        # TTS calls run concurrently.
        self._tts_queue: asyncio.Queue = asyncio.Queue()

    async def run(self) -> str:
        """Run the full pipeline. Returns the complete LLM response text."""
        sender = asyncio.create_task(self._send_loop())

        full_text = ""
        splitter = SentenceSplitter()

        try:
            async for token in stream_tokens(self._messages):
                full_text += token
                for sentence in splitter.push(token):
                    self._enqueue_tts(sentence)

            # Flush any remaining text after the stream ends.
            remainder = splitter.flush()
            if remainder:
                self._enqueue_tts(remainder)
        finally:
            # Signal sender to stop, even if the LLM stream errored.
            await self._tts_queue.put(_SENTINEL)

        await sender
        return full_text

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _enqueue_tts(self, sentence: str):
        task = asyncio.create_task(self._synthesize(sentence))
        self._tts_queue.put_nowait(task)

    @staticmethod
    async def _synthesize(sentence: str) -> bytes:
        """Collect all TTS chunks for a sentence into one MP3 buffer."""
        buf = io.BytesIO()
        async for chunk in stream_tts(sentence):
            buf.write(chunk)
        return buf.getvalue()

    async def _send_loop(self):
        """Await TTS tasks in order and send audio to the WebSocket."""
        while True:
            item = await self._tts_queue.get()
            if item is _SENTINEL:
                break
            try:
                audio = await item
                await self._ws.send_bytes(audio)
            except Exception:
                logger.exception("TTS/send error for a sentence — skipping")
