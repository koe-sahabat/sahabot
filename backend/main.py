"""SahaBot backend — FastAPI WebSocket server."""

import asyncio
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

    messages: list[dict] = []
    transcriber: LiveTranscriber | None = None
    pipeline_task: asyncio.Task | None = None

    async def run_pipeline(text: str):
        """Run the LLM → TTS pipeline for a given user utterance."""
        nonlocal pipeline_task
        messages.append({"role": "user", "content": text})

        pipeline = Pipeline(ws, messages)
        full_response = await pipeline.run()

        messages.append({"role": "assistant", "content": full_response})
        await ws.send_json({"type": "audio_done"})
        pipeline_task = None

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
                # Wait for any in-flight pipeline before starting a new turn.
                if pipeline_task:
                    await pipeline_task
                    pipeline_task = None

                # Close any leftover transcriber from a previous turn.
                if transcriber:
                    await transcriber.close()
                    transcriber = None

                async def on_speech_end(transcript: str):
                    nonlocal pipeline_task
                    await ws.send_json({"type": "speech_end"})
                    if not pipeline_task:
                        pipeline_task = asyncio.create_task(run_pipeline(transcript))

                try:
                    transcriber = LiveTranscriber(on_speech_end=on_speech_end)
                    await transcriber.connect()
                except Exception:
                    logger.exception("Failed to connect to Deepgram")
                    transcriber = None
                    await ws.send_json({"type": "error"})

            elif msg_type == "audio_end":
                if not transcriber:
                    if not pipeline_task:
                        await ws.send_json({"type": "error"})
                    continue

                # If pipeline already started (from UtteranceEnd), just clean up
                # the transcriber and wait for the pipeline to finish.
                if pipeline_task:
                    await transcriber.close()
                    transcriber = None
                    await pipeline_task
                    pipeline_task = None
                    continue

                # Fallback: UtteranceEnd never fired (e.g. user pressed stop
                # manually before VAD triggered). Finish transcription normally.
                text = await transcriber.finish()
                transcriber = None

                if not text:
                    await ws.send_json({"type": "error"})
                    continue

                await run_pipeline(text)

    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("WebSocket error")
    finally:
        if transcriber:
            await transcriber.close()
        if pipeline_task:
            pipeline_task.cancel()


# Serve the built frontend if available.
dist_path = os.path.join(os.path.dirname(__file__), "..", "dist")
if os.path.isdir(dist_path):
    app.mount("/", StaticFiles(directory=dist_path, html=True), name="frontend")
