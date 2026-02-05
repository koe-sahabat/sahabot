from faster_whisper import WhisperModel
from config import WHISPER_MODEL

_model: WhisperModel | None = None


def _get_model() -> WhisperModel:
    global _model
    if _model is None:
        _model = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")
    return _model


def transcribe(audio_path: str) -> str:
    """Transcribe an audio file to text using faster-whisper.

    Accepts any format ffmpeg can decode (webm, wav, mp3, ogg, etc.).
    Returns the transcribed text, or empty string if nothing detected.
    """
    model = _get_model()
    segments, _info = model.transcribe(audio_path, beam_size=5)
    text = " ".join(segment.text for segment in segments)
    return text.strip()
