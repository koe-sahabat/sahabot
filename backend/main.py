"""SahaBot backend — FastAPI WebSocket server."""

import json
import logging
import os

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles

from stt_live import LiveTranscriber
from pipeline import Pipeline

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("sahabot")

app = FastAPI(title="SahaBot")


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    logger.info("Client WebSocket connected")

    messages: list[dict] = []
    transcriber: LiveTranscriber | None = None

    try:
        while True:
            data = await ws.receive()

            if data.get("type") == "websocket.disconnect":
                break

            # Binary frames: forward audio to the live transcriber.
            if "bytes" in data:
                if transcriber:
                    await transcriber.send_audio(data["bytes"])
                continue

            if "text" not in data:
                continue

            msg = json.loads(data["text"])
            msg_type = msg.get("type")

            if msg_type == "audio_start":
                # Close any leftover transcriber from a previous turn.
                if transcriber:
                    logger.warning("Closing stale transcriber before starting new one")
                    await transcriber.close()
                    transcriber = None

                logger.info("audio_start — opening Deepgram session")

                async def on_speech_end():
                    await ws.send_json({"type": "speech_end"})

                try:
                    transcriber = LiveTranscriber(on_speech_end=on_speech_end)
                    await transcriber.connect()
                except Exception:
                    logger.exception("Failed to connect to Deepgram")
                    transcriber = None
                    await ws.send_json({"type": "error"})

            elif msg_type == "audio_end":
                logger.info("audio_end — finishing transcription")
                if not transcriber:
                    logger.warning("audio_end received but no active transcriber")
                    await ws.send_json({"type": "error"})
                    continue

                text = await transcriber.finish()
                transcriber = None

                if not text:
                    logger.warning("Empty transcript")
                    await ws.send_json({"type": "error"})
                    continue

                logger.info("User said: %s", text)
                messages.append({"role": "user", "content": text})

                # Run the LLM → TTS pipeline.
                pipeline = Pipeline(ws, messages)
                full_response = await pipeline.run()

                messages.append({"role": "assistant", "content": full_response})
                await ws.send_json({"type": "audio_done"})
                logger.info("Turn complete")

    except WebSocketDisconnect:
        logger.info("Client disconnected")
    except Exception:
        logger.exception("WebSocket error")
    finally:
        if transcriber:
            await transcriber.close()


# Serve the built frontend if available.
dist_path = os.path.join(os.path.dirname(__file__), "..", "dist")
if os.path.isdir(dist_path):
    app.mount("/", StaticFiles(directory=dist_path, html=True), name="frontend")
