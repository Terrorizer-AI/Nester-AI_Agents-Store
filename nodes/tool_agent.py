"""
Tool agent — shared agentic tool-calling loop for all MCP-connected nodes.

Binds LangChain tools to the LLM, invokes, executes tool calls,
feeds results back, and repeats until the LLM produces a final text response.

Used by all nodes that declare mcp_tools in their YAML config.
Nodes without tools (persona_builder, email_composer, etc.) bypass this entirely.
"""

import logging
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import StructuredTool
from langchain_openai import ChatOpenAI

logger = logging.getLogger(__name__)


MAX_TOOL_RESULT_CHARS = 60_000  # ~15K tokens — keeps total context well under 128K


async def run_tool_agent(
    llm: ChatOpenAI,
    tools: list[StructuredTool],
    messages: list[dict[str, str]],
    max_iterations: int = 10,
    agent_name: str = "agent",
) -> AIMessage:
    """
    Execute an agentic tool-calling loop.

    1. Bind tools to LLM
    2. Invoke LLM with messages
    3. If LLM returns tool_calls, execute each tool and feed results back
    4. Repeat until LLM produces a final text response or max_iterations hit

    If tools is empty, falls back to a plain LLM call (no tool binding).
    Returns the final AIMessage.
    """
    import time

    # Convert dict messages to LangChain message objects
    lc_messages = _convert_messages(messages)

    if not tools:
        logger.info("  [%s] thinking...", agent_name)
        return await llm.ainvoke(lc_messages)

    llm_with_tools = llm.bind_tools(tools)
    tool_map = {t.name: t for t in tools}
    call_count = 0

    for iteration in range(max_iterations):
        response = await llm_with_tools.ainvoke(lc_messages)

        if not response.tool_calls:
            # LLM produced a final text response — done
            logger.info(
                "  [%s] synthesizing response after %d tool call(s)...",
                agent_name, call_count,
            )
            return response

        # Execute each tool call
        lc_messages.append(response)

        for tool_call in response.tool_calls:
            tool_name = tool_call["name"]
            tool_args = tool_call["args"]
            tool_call_id = tool_call["id"]

            # Build a compact args summary for the log
            args_summary = ", ".join(
                f"{k}={repr(v)[:60]}" for k, v in tool_args.items()
            )

            tool = tool_map.get(tool_name)
            if tool is None:
                logger.warning(
                    "  [%s] ✗ unknown tool requested: %s",
                    agent_name, tool_name,
                )
                result = f"Error: tool '{tool_name}' not found"
            else:
                t0 = time.monotonic()
                try:
                    result = await tool.ainvoke(tool_args)
                    elapsed = (time.monotonic() - t0) * 1000
                    call_count += 1
                    logger.info(
                        "  [%s] ↳ %s(%s) → %d chars (%.0fms)",
                        agent_name, tool_name, args_summary,
                        len(str(result)), elapsed,
                    )
                except Exception as exc:
                    elapsed = (time.monotonic() - t0) * 1000
                    logger.error(
                        "  [%s] ✗ %s(%s) failed (%.0fms): %s",
                        agent_name, tool_name, args_summary, elapsed, exc,
                    )
                    result = f"Error calling {tool_name}: {exc}"

            result_str = str(result)
            if len(result_str) > MAX_TOOL_RESULT_CHARS:
                result_str = result_str[:MAX_TOOL_RESULT_CHARS] + "\n\n[... truncated — full result was {:,} chars]".format(len(str(result)))
            lc_messages.append(
                ToolMessage(content=result_str, tool_call_id=tool_call_id)
            )

    # Max iterations reached — return last response
    logger.warning("  [%s] max iterations (%d) reached", agent_name, max_iterations)
    return await llm_with_tools.ainvoke(lc_messages)


def _convert_messages(messages: list[dict[str, str]]) -> list:
    """Convert plain dict messages to LangChain message objects."""
    result = []
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role == "system":
            result.append(SystemMessage(content=content))
        elif role == "user":
            result.append(HumanMessage(content=content))
        elif role == "assistant":
            result.append(AIMessage(content=content))
    return result
