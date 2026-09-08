"""
session.py — PaperBull Active Session State, Persistence & Claude Desktop Config Sync
"""

import json
import os
from typing import Optional
from config import (
    BASE_URL,
    DEFAULT_SESSION_COOKIE,
    DEFAULT_USER_EMAIL,
    DEFAULT_USER_ID,
    SESSION_FILE_PATH,
)

# Active user session state (allows switching / authenticating users dynamically)
ACTIVE_SESSION = {
    "user_id": DEFAULT_USER_ID,
    "user_email": DEFAULT_USER_EMAIL,
    "session_cookie": DEFAULT_SESSION_COOKIE,
    "user_name": "Trader",
    "auth_type": "env" if (DEFAULT_USER_ID or DEFAULT_USER_EMAIL) else "bypass",
}

def load_saved_session():
    """Load persistent session from .paperbull_session.json if available."""
    target_path = SESSION_FILE_PATH if os.path.exists(SESSION_FILE_PATH) else "/tmp/.paperbull_session.json"
    if os.path.exists(target_path):
        try:
            with open(target_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            ACTIVE_SESSION["user_id"] = data.get("uid") or data.get("user_id", "")
            ACTIVE_SESSION["user_email"] = data.get("email", "")
            ACTIVE_SESSION["user_name"] = data.get("name", "Trader")
            ACTIVE_SESSION["session_cookie"] = data.get("token") or data.get("session_cookie", "")
            ACTIVE_SESSION["auth_type"] = "saved_oauth"
            print(f"[PaperBull Auth] Loaded saved session for: {ACTIVE_SESSION['user_email']} ({ACTIVE_SESSION['user_id']})")
        except Exception as e:
            print(f"[PaperBull Auth Error] Could not load saved session: {e}")

def update_claude_desktop_config(user_id: str, email: str, session_token: Optional[str] = None) -> bool:
    """Helper to update Claude Desktop configuration file with active PaperBull account."""
    try:
        appdata = os.getenv("APPDATA")
        if not appdata:
            return False
        claude_config_path = os.path.join(appdata, "Claude", "claude_desktop_config.json")
        os.makedirs(os.path.dirname(claude_config_path), exist_ok=True)

        config = {}
        if os.path.exists(claude_config_path):
            try:
                with open(claude_config_path, "r", encoding="utf-8") as f:
                    config = json.load(f)
            except Exception:
                config = {}

        if "mcpServers" not in config:
            config["mcpServers"] = {}

        python_exe = os.path.abspath(os.path.join(os.path.dirname(__file__), ".venv", "Scripts", "python.exe"))
        if not os.path.exists(python_exe):
            python_exe = "python"

        server_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "server.py"))

        stockify_env = {
            "STOCKIFY_BASE_URL": BASE_URL,
            "STOCKIFY_USER_ID": str(user_id),
            "STOCKIFY_USER_EMAIL": str(email),
        }
        if session_token:
            stockify_env["STOCKIFY_SESSION_COOKIE"] = session_token

        config["mcpServers"]["stockify"] = {
            "command": python_exe,
            "args": [server_path, "--transport", "stdio"],
            "env": stockify_env,
        }

        with open(claude_config_path, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2)

        return True
    except Exception as e:
        print(f"[Claude Config Update Error] {e}")
        return False

def save_session(user_id: str, email: str, token: str = "", name: str = "Trader") -> bool:
    """Persist active session to .paperbull_session.json and update Claude Desktop config."""
    ACTIVE_SESSION["user_id"] = user_id
    ACTIVE_SESSION["user_email"] = email
    ACTIVE_SESSION["user_name"] = name
    ACTIVE_SESSION["session_cookie"] = token
    ACTIVE_SESSION["auth_type"] = "oauth"

    try:
        session_data = {
            "uid": user_id,
            "user_id": user_id,
            "email": email,
            "name": name,
            "token": token,
            "session_cookie": token,
            "saved_at": os.getenv("CURRENT_TIME", "")
        }
        
        target_path = SESSION_FILE_PATH
        try:
            with open(target_path, "w", encoding="utf-8") as f:
                json.dump(session_data, f, indent=2)
        except (PermissionError, OSError):
            target_path = "/tmp/.paperbull_session.json"
            with open(target_path, "w", encoding="utf-8") as f:
                json.dump(session_data, f, indent=2)

        update_claude_desktop_config(user_id=user_id, email=email, session_token=token)
        return True
    except Exception as e:
        print(f"[PaperBull Auth Warning] Session saved in-memory (disk write skipped: {e})")
        return True

def clear_saved_session() -> bool:
    """Clear saved session file and reset active session."""
    try:
        if os.path.exists(SESSION_FILE_PATH):
            os.remove(SESSION_FILE_PATH)
        ACTIVE_SESSION["user_id"] = ""
        ACTIVE_SESSION["user_email"] = ""
        ACTIVE_SESSION["user_name"] = "Trader"
        ACTIVE_SESSION["session_cookie"] = ""
        ACTIVE_SESSION["auth_type"] = "bypass"
        return True
    except Exception:
        return False

# Automatically load saved session on module import
load_saved_session()
