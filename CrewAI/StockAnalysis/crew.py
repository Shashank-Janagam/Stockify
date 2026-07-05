from crewai import Crew
from agents import stock_investor_agent, trading_agent
from tasks import stock_investor_task, get_tasks, trading_task

crew = Crew(
    agents=[stock_investor_agent],
    tasks=[stock_investor_task],
    verbose=False
)

def create_crew():
    n_task, f_task, t_task, s_task = get_tasks()
    return Crew(
        agents=[stock_investor_agent],
        tasks=[s_task],
        verbose=False
    )

def create_trading_crew():
    return Crew(
        agents=[trading_agent],
        tasks=[trading_task],
        verbose=False
    )

