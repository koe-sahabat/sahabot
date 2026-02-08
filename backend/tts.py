"""Text-to-speech via Deepgram Aura — streaming interface."""

from collections.abc import AsyncIterator

from deepgram import AsyncDeepgramClient
from config import DEEPGRAM_API_KEY, TTS_VOICE

_client: AsyncDeepgramClient | None = None


def _get_client() -> AsyncDeepgramClient:
    global _client
    if _client is None:
        _client = AsyncDeepgramClient(api_key=DEEPGRAM_API_KEY)
    return _client


async def stream_tts(text: str) -> AsyncIterator[bytes]:
    """Yield audio chunks from Deepgram Aura TTS as they arrive."""
    client = _get_client()

    async for chunk in client.speak.v1.audio.generate(text=text, model=TTS_VOICE):
        if isinstance(chunk, bytes):
            yield chunk
        elif hasattr(chunk, "read"):
            yield chunk.read()
        elif hasattr(chunk, "content"):
            yield chunk.content
