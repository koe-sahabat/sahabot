"""Groq LLM integration — async-generator streaming interface."""

from collections.abc import AsyncIterator

from groq import AsyncGroq
from config import GROQ_API_KEY, LLM_MODEL, SYSTEM_PROMPT

_client: AsyncGroq | None = None


def _get_client() -> AsyncGroq:
    global _client
    if _client is None:
        _client = AsyncGroq(api_key=GROQ_API_KEY)
    return _client


async def stream_tokens(messages: list[dict]) -> AsyncIterator[str]:
    """Yield text tokens from Groq given conversation history."""
    client = _get_client()

    stream = await client.chat.completions.create(
        model=LLM_MODEL,
        messages=[{"role": "system", "content": SYSTEM_PROMPT}, *messages],
        max_tokens=300,
        temperature=0,
        stream=True,
    )

    async for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta
