"""LLM → sentence splitting → TTS → audio delivery pipeline.

Streams LLM tokens, splits them into sentences, synthesises each
sentence concurrently via TTS, and delivers audio chunks in order
through an asyncio.Queue-based architecture (no polling).

Each sentence gets its own chunk queue.  TTS tasks fill these queues
concurrently (so sentence 2's TTS can start while sentence 1 is still
streaming).  The send loop drains them strictly in sentence order,
forwarding each audio chunk to the WebSocket as it arrives.
"""

import asyncio
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
        # Queue holds per-sentence chunk queues (or _SENTINEL to signal end).
        # Each chunk queue is an asyncio.Queue filled by a background TTS task.
        self._sentence_queue: asyncio.Queue = asyncio.Queue()

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
            await self._sentence_queue.put(_SENTINEL)

        await sender
        return full_text

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _enqueue_tts(self, sentence: str):
        chunk_q: asyncio.Queue[bytes | None] = asyncio.Queue()
        asyncio.create_task(self._fill_chunks(sentence, chunk_q))
        self._sentence_queue.put_nowait(chunk_q)

    @staticmethod
    async def _fill_chunks(sentence: str, chunk_q: asyncio.Queue):
        """Stream TTS chunks into the per-sentence queue."""
        try:
            async for chunk in stream_tts(sentence):
                await chunk_q.put(chunk)
        except Exception:
            logger.exception("TTS error for sentence")
        finally:
            await chunk_q.put(None)  # end-of-sentence sentinel

    async def _send_loop(self):
        """Drain per-sentence chunk queues in order, sending each chunk."""
        while True:
            item = await self._sentence_queue.get()
            if item is _SENTINEL:
                break
            # item is a per-sentence chunk queue
            try:
                while True:
                    chunk = await item.get()
                    if chunk is None:
                        break
                    await self._ws.send_bytes(chunk)
            except Exception:
                logger.exception("Send error — skipping sentence")
