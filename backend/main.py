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

# Split on sentence endings and commas for faster first audio
_SENTENCE_SPLIT = re.compile(r"(?<=[.!?,])\s+")


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
                    async def on_speech_end():
                        await ws.send_json({"type": "speech_end"})

                    transcriber = LiveTranscriber(on_speech_end=on_speech_end)
                    await transcriber.connect()

                elif msg_type == "audio_end":
                    if not transcriber:
                        continue

                    text = await transcriber.finish()
                    transcriber = None

                    if not text:
                        await ws.send_json({"type": "error"})
                        continue

                    messages.append({"role": "user", "content": text})

                    # LLM + TTS pipeline
                    sentence_buffer = ""
                    pending_tts: list[tuple[asyncio.Task, int]] = []
                    sent_index = 0
                    sentence_index = 0

                    async def send_ready_audio():
                        nonlocal sent_index
                        while pending_tts:
                            for i, (task, idx) in enumerate(pending_tts):
                                if idx == sent_index and task.done():
                                    audio = task.result()
                                    audio_b64 = base64.b64encode(audio).decode("ascii")
                                    await ws.send_json({"type": "audio", "data": audio_b64})
                                    pending_tts.pop(i)
                                    sent_index += 1
                                    break
                            else:
                                break

                    async def on_chunk(chunk: str):
                        nonlocal sentence_buffer, sentence_index
                        sentence_buffer += chunk

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

                    # Send remaining audio
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
