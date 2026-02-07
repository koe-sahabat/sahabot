from typing import Callable, Awaitable

import anthropic
from config import ANTHROPIC_API_KEY, SYSTEM_PROMPT

_client: anthropic.AsyncAnthropic | None = None


def _get_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        _client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
    return _client


async def stream_response(
    messages: list[dict],
    on_chunk: Callable[[str], Awaitable[None]],
) -> str:
    """Stream a response from Claude given conversation history.

    Calls on_chunk(text) for each streamed token.
    Returns the full response text.
    """
    client = _get_client()

    full_text = ""
    async with client.messages.stream(
        model="claude-3-haiku-20240307",
        max_tokens=100,
        system=SYSTEM_PROMPT,
        messages=messages,
    ) as stream:
        async for text in stream.text_stream:
            full_text += text
            await on_chunk(text)

    return full_text
