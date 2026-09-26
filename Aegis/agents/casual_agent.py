import os
import sys
from models.state import MarketState
from models.llm_factory import get_llm
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.messages import SystemMessage

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

llm = get_llm(temperature=0.3)

system_prompt = """You are Aegis, an intelligent financial assistant. 
The user has said something casual or conversational (e.g. "Hi", "How are you").
Respond in a friendly, helpful, and concise manner, but remind them that you are ready to assist with stock market data, fundamental research, quantitative strategies, and risk analysis.
Keep your response short and conversational."""

prompt = ChatPromptTemplate.from_messages([
    ("system", system_prompt),
    ("placeholder", "{messages}")
])

casual_chain = prompt | llm

async def casual_agent(state: MarketState):
    messages = list(state.get("messages", []))
    
    plan = state.get("plan", [])
    if plan:
        instruction = plan[0].split("|")[1] if "|" in plan[0] else plan[0]
        messages.append(SystemMessage(content=f"Current Plan Step: {instruction}"))
        
    response = await casual_chain.ainvoke({"messages": messages})
    return {"messages": [response]}
