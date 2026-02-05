"""SahaBot backend — FastAPI WebSocket server.

Pipeline: Browser audio → STT → Claude → TTS → Browser playback

TTS is pipelined with LLM streaming — each sentence is synthesized as
soon as it appears, overlapping with continued LLM generation.

Run:
    cd backend
    uvicorn main:app --host 0.0.0.0 --port 8000 --reload
"""

import asyncio
import base64
import json
import logging
import os
import re

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles

from stt import transcribe
from llm import stream_response
from tts import synthesize

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("sahabot")

app = FastAPI(title="SahaBot")

# Regex: split after sentence-ending punctuation followed by whitespace
_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")


# ---------------------------------------------------------------------------
# WebSocket endpoint
# ---------------------------------------------------------------------------

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    logger.info("Client connected")

    # Conversation history for this session
    messages: list[dict] = []

    try:
        while True:
            data = await ws.receive()

            # Binary frame = audio blob from MediaRecorder
            if "bytes" in data:
                audio_bytes: bytes = data["bytes"]
                logger.info("Received audio: %d bytes", len(audio_bytes))

                # ── 1. Speech-to-Text (Deepgram cloud) ────────
                await ws.send_json({"type": "status", "status": "transcribing"})
                text = await transcribe(audio_bytes)
                logger.info("Transcription: %s", text)

                if not text:
                    await ws.send_json({
                        "type": "error",
                        "message": "I didn't catch that. Could you try again?",
                    })
                    continue

                await ws.send_json({"type": "transcription", "text": text})
                messages.append({"role": "user", "content": text})

                # ── 2. LLM Inference + pipelined TTS ──────────
                await ws.send_json({"type": "response_start"})

                sentence_buffer = ""
                tts_tasks: list[asyncio.Task] = []

                async def on_chunk(chunk: str):
                    nonlocal sentence_buffer
                    sentence_buffer += chunk
                    await ws.send_json({"type": "response_chunk", "text": chunk})

                    # Split completed sentences and fire off TTS immediately
                    parts = _SENTENCE_SPLIT.split(sentence_buffer)
                    if len(parts) > 1:
                        # All but last part are complete sentences
                        for part in parts[:-1]:
                            s = part.strip()
                            if s:
                                tts_tasks.append(
                                    asyncio.create_task(synthesize(s))
                                )
                        sentence_buffer = parts[-1]

                full_response = await stream_response(messages, on_chunk)
                messages.append({"role": "assistant", "content": full_response})

                # Flush any remaining text
                remainder = sentence_buffer.strip()
                if remainder:
                    tts_tasks.append(asyncio.create_task(synthesize(remainder)))

                await ws.send_json({
                    "type": "response_end",
                    "text": full_response,
                })
                logger.info("Response: %s", full_response[:100])

                # ── 3. Send audio chunks in order ─────────────
                for task in tts_tasks:
                    audio = await task
                    audio_b64 = base64.b64encode(audio).decode("ascii")
                    await ws.send_json({
                        "type": "audio",
                        "data": audio_b64,
                        "mime": "audio/mp3",
                    })

                await ws.send_json({"type": "audio_done"})
                logger.info("Sent %d audio chunks", len(tts_tasks))

            # Text frame = JSON control messages
            elif "text" in data:
                msg = json.loads(data["text"])
                msg_type = msg.get("type")

                if msg_type == "ping":
                    await ws.send_json({"type": "pong"})

                elif msg_type == "clear":
                    messages.clear()
                    await ws.send_json({"type": "cleared"})
                    logger.info("Conversation cleared")

    except WebSocketDisconnect:
        logger.info("Client disconnected")
    except Exception:
        logger.exception("WebSocket error")


# ---------------------------------------------------------------------------
# Serve built frontend in production
# ---------------------------------------------------------------------------

dist_path = os.path.join(os.path.dirname(__file__), "..", "dist")
if os.path.isdir(dist_path):
    app.mount("/", StaticFiles(directory=dist_path, html=True), name="frontend")
