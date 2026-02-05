import io
import edge_tts
from config import TTS_VOICE


async def synthesize(text: str) -> bytes:
    """Convert text to speech using edge-tts.

    Returns raw mp3 audio bytes.
    """
    communicate = edge_tts.Communicate(text, TTS_VOICE)
    buffer = io.BytesIO()

    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            buffer.write(chunk["data"])

    return buffer.getvalue()
