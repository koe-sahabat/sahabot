"""SahaBot backend — FastAPI WebSocket server."""

import asyncio
import base64
import json
import logging
import os
import re

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles

from stt_live import LiveTranscriber
from llm import stream_response
from tts import synthesize

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("sahabot")

app = FastAPI(title="SahaBot")

_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()

    messages: list[dict] = []
    transcriber: LiveTranscriber | None = None

    try:
        while True:
            data = await ws.receive()

            if data.get("type") == "websocket.disconnect":
                break

            if "bytes" in data:
                if transcriber:
                    await transcriber.send_audio(data["bytes"])

            elif "text" in data:
                msg = json.loads(data["text"])
                msg_type = msg.get("type")

                if msg_type == "audio_start":
                    logger.info("Starting live transcription")

                    async def on_interim(text: str):
                        await ws.send_json({"type": "transcription_interim", "text": text})

                    async def on_speech_end():
                        await ws.send_json({"type": "speech_end"})

                    transcriber = LiveTranscriber(
                        on_interim=on_interim,
                        on_speech_end=on_speech_end,
                    )
                    await transcriber.connect()
                    await ws.send_json({"type": "listening"})

                elif msg_type == "audio_end":
                    if not transcriber:
                        continue

                    logger.info("Finishing live transcription")
                    text = await transcriber.finish()
                    transcriber = None

                    logger.info("Transcription: %s", text)

                    if not text:
                        await ws.send_json({
                            "type": "error",
                            "message": "I didn't catch that. Could you try again?",
                        })
                        continue

                    await ws.send_json({"type": "transcription", "text": text})
                    messages.append({"role": "user", "content": text})

                    await ws.send_json({"type": "response_start"})

                    sentence_buffer = ""
                    pending_tts: list[tuple[asyncio.Task, int]] = []
                    sent_index = 0
                    sentence_index = 0

                    async def send_ready_audio():
                        """Send audio chunks in order as they become ready."""
                        nonlocal sent_index
                        while pending_tts:
                            # Find the next chunk we need to send
                            for i, (task, idx) in enumerate(pending_tts):
                                if idx == sent_index and task.done():
                                    audio = task.result()
                                    audio_b64 = base64.b64encode(audio).decode("ascii")
                                    await ws.send_json({
                                        "type": "audio",
                                        "data": audio_b64,
                                        "mime": "audio/mp3",
                                    })
                                    pending_tts.pop(i)
                                    sent_index += 1
                                    break
                            else:
                                break

                    async def on_chunk(chunk: str):
                        nonlocal sentence_buffer, sentence_index
                        sentence_buffer += chunk
                        await ws.send_json({"type": "response_chunk", "text": chunk})

                        parts = _SENTENCE_SPLIT.split(sentence_buffer)
                        if len(parts) > 1:
                            for part in parts[:-1]:
                                s = part.strip()
                                if s:
                                    task = asyncio.create_task(synthesize(s))
                                    pending_tts.append((task, sentence_index))
                                    sentence_index += 1
                            sentence_buffer = parts[-1]

                        await send_ready_audio()

                    full_response = await stream_response(messages, on_chunk)
                    messages.append({"role": "assistant", "content": full_response})

                    # Flush remainder
                    remainder = sentence_buffer.strip()
                    if remainder:
                        task = asyncio.create_task(synthesize(remainder))
                        pending_tts.append((task, sentence_index))

                    await ws.send_json({"type": "response_end", "text": full_response})

                    # Wait for remaining TTS and send
                    while pending_tts:
                        await asyncio.sleep(0.05)
                        await send_ready_audio()

                    await ws.send_json({"type": "audio_done"})

    except WebSocketDisconnect:
        if transcriber:
            await transcriber.close()
    except Exception:
        logger.exception("WebSocket error")
        if transcriber:
            await transcriber.close()


dist_path = os.path.join(os.path.dirname(__file__), "..", "dist")
if os.path.isdir(dist_path):
    app.mount("/", StaticFiles(directory=dist_path, html=True), name="frontend")
