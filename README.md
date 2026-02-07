# SahaBot

A conversational gallery usher robot. Visitors speak to SahaBot through a web interface and it responds with voice, guiding them through five exhibition stations.

Built with React + Three.js on the frontend and a FastAPI streaming pipeline on the backend. Speech is handled by Deepgram (STT and TTS), and conversation by Claude.

## Architecture

```
Microphone → Deepgram Live STT (nova-3) → Claude Haiku 4.5 → Deepgram Aura TTS → Speaker
```

The backend streams LLM tokens, splits them into sentences, runs TTS concurrently for each sentence, and delivers audio to the client in order through an asyncio.Queue-based pipeline — no polling.

## Prerequisites

- Node.js 22+
- Python 3.11+
- [Anthropic API key](https://console.anthropic.com/)
- [Deepgram API key](https://console.deepgram.com/)

## Setup

```bash
# Install frontend dependencies
npm install

# Install backend dependencies
pip install -r backend/requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your API keys
```

## Development

Run the backend and frontend in separate terminals:

```bash
# Terminal 1 — backend (port 8000)
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2 — frontend dev server (port 5173)
npm run dev
```

The Vite dev server proxies WebSocket connections to the backend automatically.

## Production Build

```bash
npm run build
```

This compiles TypeScript and bundles the frontend into `dist/`. The backend serves it as static files when the directory exists.

## Project Structure

```
├── src/                    Frontend (React + TypeScript)
│   ├── components/
│   │   ├── HomeScreen.tsx    Welcome screen with Speak / Map buttons
│   │   ├── SpeakMode.tsx     Voice interaction UI
│   │   ├── MapView.tsx       3D gallery map (Three.js)
│   │   ├── RobotFace.tsx     Animated robot face
│   │   └── StationInfo.tsx   Station detail display
│   ├── data/stations.ts      Gallery station definitions
│   └── types/index.ts        Shared TypeScript types
│
├── backend/                Python backend (FastAPI)
│   ├── main.py               WebSocket server
│   ├── pipeline.py           LLM → TTS streaming pipeline
│   ├── llm.py                Claude async generator
│   ├── tts.py                Deepgram Aura TTS
│   ├── stt_live.py           Deepgram live STT
│   └── config.py             Environment and system prompt
│
├── package.json
├── vite.config.ts
└── .env.example
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for Claude |
| `DEEPGRAM_API_KEY` | Yes | Deepgram API key for STT and TTS |
| `TTS_VOICE` | No | Deepgram Aura voice model (default: `aura-2-asteria-en`) |
