import io
import logging
from deepgram import AsyncDeepgramClient
from config import DEEPGRAM_API_KEY, TTS_VOICE

logger = logging.getLogger("sahabot")

_client: AsyncDeepgramClient | None = None


def _get_client() -> AsyncDeepgramClient:
    global _client
    if _client is None:
        _client = AsyncDeepgramClient(api_key=DEEPGRAM_API_KEY)
    return _client


async def synthesize(text: str) -> bytes:
    """Convert text to speech using Deepgram Aura TTS.

    Returns raw mp3 audio bytes.
    """
    client = _get_client()

    buffer = io.BytesIO()
    async for chunk in client.speak.v1.audio.generate(
        text=text,
        model=TTS_VOICE,
    ):
        logger.info("TTS chunk type: %s, value preview: %r", type(chunk).__name__, str(chunk)[:100])
        if isinstance(chunk, bytes):
            buffer.write(chunk)
        elif hasattr(chunk, "read"):
            buffer.write(chunk.read())
        elif hasattr(chunk, "content"):
            buffer.write(chunk.content)
        else:
            # Try converting to bytes
            buffer.write(bytes(chunk) if chunk else b"")

    result = buffer.getvalue()
    logger.info("TTS synthesized %d bytes for: %s", len(result), text[:50])
    return result
