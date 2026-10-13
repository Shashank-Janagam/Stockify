import os
from langchain_groq import ChatGroq
from langchain_google_genai import ChatGoogleGenerativeAI
from dotenv import load_dotenv

# Load env from the Aegis directory
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

def get_llm(temperature=0.1):
    """
    Factory function to return the correct LLM based on .env provider setting.
    Gracefully falls back between Gemini and Groq if one key is missing.
    """
    gemini_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    groq_key = os.getenv("GROQ_API_KEY") or os.getenv("GROK_API_KEY")
    
    provider = os.getenv("AEGIS_LLM_PROVIDER", "").strip().lower()
    
    # Auto-select provider if not specified, or fallback if configured provider has no key
    if provider == "groq" and not groq_key and gemini_key:
        provider = "gemini"
    elif provider == "gemini" and not gemini_key and groq_key:
        provider = "groq"
    elif not provider:
        provider = "gemini" if gemini_key else ("groq" if groq_key else "gemini")

    if provider == "groq":
        if not groq_key:
            raise ValueError("GROQ_API_KEY (or GROK_API_KEY) is required but not configured.")
        model_name = os.getenv("AEGIS_MODEL", "llama-3.3-70b-versatile")
        if "gemini" in model_name or ("llama3" in model_name and "8192" in model_name):
            model_name = "llama-3.3-70b-versatile"
            
        return ChatGroq(
            model=model_name,
            temperature=temperature,
            api_key=groq_key
        )
    else:
        if not gemini_key:
            raise ValueError("GEMINI_API_KEY (or GOOGLE_API_KEY) is required but not configured.")
        model_name = os.getenv("AEGIS_MODEL", "gemini-1.5-flash")
        if "llama" in model_name or "mixtral" in model_name or "gemma" in model_name or "3.5" in model_name:
            model_name = "gemini-1.5-flash"
            
        return ChatGoogleGenerativeAI(
            model=model_name,
            temperature=temperature,
            api_key=gemini_key
        )
