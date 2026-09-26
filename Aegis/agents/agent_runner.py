"""
agent_runner.py
───────────────
Generic retry wrapper for all Aegis specialist agents.

Features:
  - Retries up to MAX_RETRIES times on transient errors (429, 503, ConnectionError, TimeoutError)
  - Exponential backoff: 2s → 4s → 8s
  - 45-second hard timeout per attempt
  - Returns a structured error message on permanent failure so the graph always makes progress
"""

import asyncio
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

MAX_RETRIES = 3
BASE_DELAY = 2  # seconds


def _is_retryable(exc: Exception) -> bool:
    """Returns True if the exception is likely a transient API error."""
    msg = str(exc).lower()
    retryable_keywords = [
        "429", "503", "rate limit", "too many requests",
        "unavailable", "connection", "timeout", "service unavailable",
        "resource exhausted", "quota"
    ]
    return any(kw in msg for kw in retryable_keywords)


async def run_agent_with_retry(
    agent_executor,
    messages: list,
    agent_name: str,
    timeout: int = 45
) -> str:
    """
    Run an agent executor with retry logic and timeout.
    
    Args:
        agent_executor: The langchain agent executor (has .ainvoke)
        messages: The message list to pass to the agent
        agent_name: Human-readable name for logging
        timeout: Max seconds per attempt
    
    Returns:
        The text content of the final AI message, or an error string.
    """
    last_error = None

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            logger.info(f"[{agent_name}] Attempt {attempt}/{MAX_RETRIES}")
            # Gemini requires the final message to be from a Human
            invoke_msgs = list(messages)
            if invoke_msgs and hasattr(invoke_msgs[-1], "type") and invoke_msgs[-1].type != "human":
                from langchain_core.messages import HumanMessage
                invoke_msgs.append(HumanMessage(content="Please continue your analysis based on the context above."))

            result = await asyncio.wait_for(
                agent_executor.ainvoke({"messages": invoke_msgs}),
                timeout=timeout
            )
            
            # Extract text from result
            final_msg = result["messages"][-1]
            content = final_msg.content if hasattr(final_msg, "content") else str(final_msg)
            
            # Handle Gemini multimodal list content
            if isinstance(content, list):
                content = "".join(
                    p.get("text", "") if isinstance(p, dict) else str(p)
                    for p in content
                )
            
            logger.info(f"[{agent_name}] Success on attempt {attempt}")
            return content

        except asyncio.TimeoutError:
            last_error = f"Timeout after {timeout}s"
            logger.warning(f"[{agent_name}] Attempt {attempt} timed out.")
        except Exception as exc:
            last_error = str(exc)
            if _is_retryable(exc):
                logger.warning(f"[{agent_name}] Attempt {attempt} failed (retryable): {exc}")
            else:
                # Non-retryable error — fail immediately
                logger.error(f"[{agent_name}] Non-retryable error: {exc}")
                return f"⚠️ **{agent_name}** encountered an error: {exc}"

        if attempt < MAX_RETRIES:
            delay = BASE_DELAY ** attempt
            logger.info(f"[{agent_name}] Retrying in {delay}s...")
            await asyncio.sleep(delay)

    logger.error(f"[{agent_name}] All {MAX_RETRIES} attempts failed. Last error: {last_error}")
    return f"⚠️ **{agent_name}** is temporarily unavailable (tried {MAX_RETRIES}x). Please try again shortly."
