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
    logger.info("Client WebSocket connected")

    messages: list[dict] = []
    transcriber: LiveTranscriber | None = None
    pipeline_task: asyncio.Task | None = None

    async def run_pipeline(text: str):
        """Run the LLM → TTS pipeline for a given user utterance."""
        nonlocal pipeline_task
        logger.info("User said: %s", text)
        messages.append({"role": "user", "content": text})

        pipeline = Pipeline(ws, messages)
        full_response = await pipeline.run()

        messages.append({"role": "assistant", "content": full_response})
        await ws.send_json({"type": "audio_done"})
        logger.info("Turn complete")
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
                    logger.info("Waiting for previous pipeline to finish")
                    await pipeline_task
                    pipeline_task = None

                # Close any leftover transcriber from a previous turn.
                if transcriber:
                    logger.warning("Closing stale transcriber before starting new one")
                    await transcriber.close()
                    transcriber = None

                logger.info("audio_start — opening Deepgram session")

                async def on_speech_end(transcript: str):
                    nonlocal pipeline_task
                    # Tell the client to stop recording immediately.
                    await ws.send_json({"type": "speech_end"})
                    # Start the LLM pipeline right away — don't wait for audio_end.
                    if not pipeline_task:
                        logger.info("UtteranceEnd — starting pipeline early")
                        pipeline_task = asyncio.create_task(run_pipeline(transcript))

                try:
                    transcriber = LiveTranscriber(on_speech_end=on_speech_end)
                    await transcriber.connect()
                except Exception:
                    logger.exception("Failed to connect to Deepgram")
                    transcriber = None
                    await ws.send_json({"type": "error"})

            elif msg_type == "audio_end":
                logger.info("audio_end received")
                if not transcriber:
                    logger.warning("audio_end but no active transcriber")
                    if not pipeline_task:
                        await ws.send_json({"type": "error"})
                    continue

                # If pipeline already started (from UtteranceEnd), just clean up
                # the transcriber and wait for the pipeline to finish.
                if pipeline_task:
                    logger.info("Pipeline already running — closing transcriber and awaiting")
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
                    logger.warning("Empty transcript")
                    await ws.send_json({"type": "error"})
                    continue

                await run_pipeline(text)

    except WebSocketDisconnect:
        logger.info("Client disconnected")
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
