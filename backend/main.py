"""SahaBot backend — FastAPI WebSocket server.

Pipeline: Browser audio → STT → Claude → TTS → Browser playback

Run:
    cd backend
    uvicorn main:app --host 0.0.0.0 --port 8000 --reload
"""

import base64
import json
import logging
import os

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles

from stt import transcribe
from llm import stream_response
from tts import synthesize

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("sahabot")

app = FastAPI(title="SahaBot")


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

                # ── 2. LLM Inference (streaming) ───────────────
                await ws.send_json({"type": "response_start"})

                async def on_chunk(chunk: str):
                    await ws.send_json({"type": "response_chunk", "text": chunk})

                full_response = await stream_response(messages, on_chunk)
                messages.append({"role": "assistant", "content": full_response})

                await ws.send_json({
                    "type": "response_end",
                    "text": full_response,
                })
                logger.info("Response: %s", full_response[:100])

                # ── 3. Text-to-Speech ──────────────────────────
                await ws.send_json({"type": "status", "status": "synthesizing"})
                audio = await synthesize(full_response)
                audio_b64 = base64.b64encode(audio).decode("ascii")

                await ws.send_json({
                    "type": "audio",
                    "data": audio_b64,
                    "mime": "audio/mp3",
                })
                logger.info("TTS audio: %d bytes", len(audio))

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
