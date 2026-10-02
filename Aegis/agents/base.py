import json
from datetime import datetime, timezone

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import StructuredTool
from langgraph.errors import GraphRecursionError
from langgraph.prebuilt import create_react_agent
from pydantic import create_model

from models.agent_state import SpecialistInput
from models.schemas import Result

HISTORY_WINDOW = 10        # messages shown to agents that need conversation history
RECURSION_LIMIT = 12       # hard stop on tool loops
DEP_CHAR_LIMIT = 6000      # cap on results from earlier tasks injected into the prompt


def bind_user(tool, user_id: str):
    """Hide user_id from the model and inject it in code.
    If a tool has no user_id argument it is returned unchanged."""
    schema = getattr(tool, "args_schema", None)
    fields = getattr(schema, "model_fields", {})
    if "user_id" not in fields:
        return tool

    slim = create_model(
        f"{tool.name}_args",
        **{n: (f.annotation, f) for n, f in fields.items() if n != "user_id"},
    )

    def run(**kwargs):
        return tool.invoke({**kwargs, "user_id": user_id})

    return StructuredTool.from_function(
        func=run, name=tool.name, description=tool.description, args_schema=slim
    )


def _parse(content):
    if isinstance(content, str):
        try:
            return json.loads(content)
        except ValueError:
            return content
    return content


def _unique_key(data: dict, name: str) -> str:
    """Same tool called twice (e.g. quote for TCS and INFY) must not overwrite itself."""
    key, i = name, 2
    while key in data:
        key, i = f"{name}#{i}", i + 1
    return key


def make_specialist_node(agent_name, tools, system_prompt, llm, use_history=False):
    """Build a graph node that runs one specialist agent and returns a typed Result.
    use_history=True: agent sees recent chat (needed for portfolio trade confirmations).
    use_history=False: agent sees only its task goal (keeps read-only agents focused)."""

    def node(state: SpecialistInput):
        task = state.get("task") or {}
        task_id = task.get("id", "t0")
        goal = task.get("goal") or state.get("intent", {}).get("goal", "")
        dep = state.get("dep_results") or {}

        text = f"{system_prompt}\n\n## Current task\n{goal}"
        if dep:
            text += ("\n\n## Results from earlier tasks (already fetched, do not refetch)\n"
                     + json.dumps(dep, default=str)[:DEP_CHAR_LIMIT])
        system = SystemMessage(text)

        bound = [bind_user(t, state["user_id"]) for t in tools]
        agent = create_react_agent(
            model=llm, tools=bound, prompt=lambda s: [system, *s["messages"]]
        )
        history = state["messages"][-HISTORY_WINDOW:] if use_history else [HumanMessage(goal)]

        data, sources, errors, reply = {}, [], [], ""
        try:
            config = {"recursion_limit": RECURSION_LIMIT, "configurable": {"uid": str(state.get("user_id", ""))}}
            out = agent.invoke({"messages": history}, config)
            new_msgs = out["messages"][len(history):]
            for m in new_msgs:
                if isinstance(m, ToolMessage):
                    if getattr(m, "status", None) == "error":
                        errors.append(f"{m.name}: {m.content}")
                    else:
                        parsed_content = _parse(m.content)
                        if isinstance(parsed_content, dict) and "error" in parsed_content:
                            errors.append(f"{m.name}: {parsed_content['error']}")
                        data[_unique_key(data, m.name)] = parsed_content
                        sources.append(f"{m.name}@{datetime.now(timezone.utc).isoformat()}")
            last = next((m for m in reversed(new_msgs) if isinstance(m, AIMessage) and m.content), None)
            reply = last.content if last else ""
        except GraphRecursionError:
            errors.append(f"{agent_name} agent hit the step limit")
        except Exception as e:
            errors.append(str(e))

        if reply:
            data["agent_reply"] = reply

        result = Result(
            task_id=task_id, agent=agent_name,
            ok=bool(data) and not errors,
            data=data, sources=sources, error="; ".join(errors) or None,
        )
        return {"results": {task_id: result.model_dump()}}

    node.__name__ = f"run_{agent_name}"
    return node