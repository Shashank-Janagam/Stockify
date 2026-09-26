import os
from langchain_groq import ChatGroq
from langchain_google_genai import ChatGoogleGenerativeAI
from dotenv import load_dotenv

# Load env from the Aegis directory
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

def get_llm(temperature=0.1):
    """
    Factory function to return the correct LLM based on .env provider setting.
    """
    provider = os.getenv("AEGIS_LLM_PROVIDER", "gemini").strip().lower()
    
    if provider == "groq":
        # Default Groq model if AEGIS_MODEL is not set
        model_name = os.getenv("AEGIS_MODEL", "llama-3.3-70b-versatile")
        # If the user left AEGIS_MODEL as a gemini model or old decommissioned model, fallback to new groq model
        if "gemini" in model_name or ("llama3" in model_name and "8192" in model_name):
            model_name = "llama-3.3-70b-versatile"
            
        return ChatGroq(
            model=model_name,
            temperature=temperature,
            api_key=os.getenv("GROQ_API_KEY")
        )
    else:
        # Default Gemini model if AEGIS_MODEL is not set
        model_name = os.getenv("AEGIS_MODEL", "gemini-1.5-flash")
        # If the user left AEGIS_MODEL as a groq model, fallback to a gemini model
        if "llama" in model_name or "mixtral" in model_name or "gemma" in model_name:
            model_name = "gemini-1.5-flash"
            
        return ChatGoogleGenerativeAI(
            model=model_name,
            temperature=temperature,
            api_key=os.getenv("GEMINI_API_KEY")
        )
