from crewai import LLM
from dotenv import load_dotenv
import os

load_dotenv()


llm = LLM(
    model="groq/meta-llama/llama-4-scout-17b-16e-instruct",
    temperature=0.3,
)

fast_llm = LLM(
    model="groq/meta-llama/llama-4-scout-17b-16e-instruct",
    temperature=0.1,
)


