from deepgram import AsyncDeepgramClient
from config import DEEPGRAM_API_KEY, TTS_VOICE

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

    response = await client.speak.v1.audio.generate(
        text=text,
        model=TTS_VOICE,
    )

    return response.stream.getvalue()
