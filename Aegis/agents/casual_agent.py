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
{name_context}
Respond in a friendly, helpful, and concise manner, but remind them that you are ready to assist with stock market data, fundamental research, quantitative strategies, and risk analysis.
Keep your response short and conversational."""



async def casual_agent(state: MarketState):
    messages = list(state.get("messages", []))
    
    display_name = state.get("displayName")
    name_context = f"The user's name is {display_name}. Use it to greet them warmly." if display_name else ""
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt.format(name_context=name_context)),
        ("placeholder", "{messages}")
    ])
    
    casual_chain = prompt | llm
    
    plan = state.get("plan", [])
    if plan:
        instruction = plan[0].split("|")[1] if "|" in plan[0] else plan[0]
        messages.append(SystemMessage(content=f"Current Plan Step: {instruction}"))
        
    response = await casual_chain.ainvoke({"messages": messages})
    return {"messages": [response]}
