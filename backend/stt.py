from deepgram import DeepgramClient
from config import DEEPGRAM_API_KEY

_client: DeepgramClient | None = None


def _get_client() -> DeepgramClient:
    global _client
    if _client is None:
        _client = DeepgramClient(DEEPGRAM_API_KEY)
    return _client


async def transcribe(audio_bytes: bytes) -> str:
    """Transcribe audio bytes using Deepgram's cloud API.

    Accepts any common format (webm, wav, mp3, ogg, etc.).
    Returns the transcribed text, or empty string if nothing detected.
    """
    client = _get_client()

    response = await client.listen.asyncrest.v("1").transcribe_file(
        request=audio_bytes,
        model="nova-3",
        smart_format=True,
        language="en",
    )

    transcript = (
        response.results.channels[0].alternatives[0].transcript
        if response.results.channels
        else ""
    )
    return transcript.strip()
