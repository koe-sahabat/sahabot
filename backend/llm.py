"""Claude LLM integration — async-generator streaming interface."""

from collections.abc import AsyncIterator

import anthropic
from config import ANTHROPIC_API_KEY, SYSTEM_PROMPT

_client: anthropic.AsyncAnthropic | None = None


def _get_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        _client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
    return _client


async def stream_tokens(messages: list[dict]) -> AsyncIterator[str]:
    """Yield text tokens from Claude given conversation history."""
    client = _get_client()

    async with client.messages.stream(
        model="claude-haiku-4-5-20251001",
        max_tokens=300,
        system=SYSTEM_PROMPT,
        messages=messages,
    ) as stream:
        async for text in stream.text_stream:
            yield text
