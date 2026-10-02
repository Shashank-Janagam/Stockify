"""Typed objects that move through the graph. Store them in state as dicts (model_dump())."""
from typing import Literal, Optional
from pydantic import BaseModel, Field

AgentName = Literal["portfolio", "market", "research", "strategy", "algo", "execution", "general"]


class ActionRequest(BaseModel):
    """A money action the user asked for. Extend `kind` later (algo start/stop, delete strategy)."""
    kind: Literal["buy", "sell", "cancel_stoploss"]
    symbol: Optional[str] = None
    quantity: Optional[int] = Field(default=None, description="Whole number of shares")
    order_id: Optional[str] = None


class Intent(BaseModel):
    agent: AgentName
    goal: str = Field(description="One-sentence restatement of what the user wants")
    symbols: list[str] = Field(default_factory=list, description="Stock symbols, references resolved")
    timeframe: Optional[str] = None
    needs_clarification: bool = False
    clarification_question: Optional[str] = None
    action: Optional[ActionRequest] = None                 # only for agent == "execution"
    confirmation: Optional[Literal["yes", "no"]] = None    # only when a pending action exists


class Task(BaseModel):
    id: str
    agent: Literal["portfolio", "market", "research", "strategy", "algo", "trading"]
    goal: str
    depends_on: list[str] = Field(default_factory=list)


class Plan(BaseModel):
    tasks: list[Task]
    done_when: list[str] = Field(description="Checklist that must be satisfied to answer the user")


class Result(BaseModel):
    task_id: str
    agent: str
    ok: bool
    data: dict = Field(default_factory=dict)
    sources: list[str] = Field(default_factory=list)
    error: Optional[str] = None


class PendingAction(BaseModel):
    """A proposed order waiting for the user's yes/no."""
    action_id: str
    kind: Literal["buy", "sell", "cancel_stoploss"]
    params: dict
    summary: str
    warnings: list[str] = Field(default_factory=list)
    expires_at: float                                       # epoch seconds


class Verdict(BaseModel):
    ok: bool
    unsupported_claims: list[str] = Field(default_factory=list)
    rule_violations: list[str] = Field(default_factory=list)