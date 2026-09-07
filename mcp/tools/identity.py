"""
tools/identity.py — System, Identity, Connection, and User Session MCP Tools
"""

import urllib.parse
import urllib.request
import webbrowser
from typing import Any, Dict, Optional

from client import _make_request
from config import BASE_URL, DEFAULT_USER_ID, MCP_PORT, firebase_auth, firebase_initialized, mcp
from session import (
    ACTIVE_SESSION,
    clear_saved_session,
    save_session,
    update_claude_desktop_config,
)

@mcp.tool()
def connect_paperbull() -> Dict[str, Any]:
    """Connect Claude Desktop to your PaperBull trading account via 1-click Google OAuth (just like Gmail connection)."""
    url = f"http://localhost:{MCP_PORT}/auth/login"
    opened = False
    try:
        webbrowser.open(url)
        opened = True
    except Exception:
        opened = False

    return {
        "status": "browser_opened" if opened else "ready",
        "login_url": url,
        "message": f"Opened Google sign-in at {url}. Sign in with your PaperBull Google account. Once signed in, Claude is automatically connected to your portfolio and live trading!",
    }


@mcp.tool()
def disconnect_paperbull() -> Dict[str, Any]:
    """Disconnect/Sign out of your PaperBull account and clear saved session credentials."""
    clear_saved_session()
    return {
        "status": "disconnected",
        "message": "PaperBull account disconnected and credentials cleared.",
    }


@mcp.tool()
def get_current_user() -> Dict[str, Any]:
    """Get the currently logged in / active PaperBull account profile, wallet balance, and session status."""
    profile = _make_request("/api/user/profile")
    balance = _make_request("/api/getBalance/getBalance")

    return {
        "active_session": {
            "user_id": ACTIVE_SESSION.get("user_id") or "Auto-resolved (ID 3)",
            "user_email": ACTIVE_SESSION.get("user_email") or "Auto-detected",
            "user_name": ACTIVE_SESSION.get("user_name", "Trader"),
            "auth_type": ACTIVE_SESSION.get("auth_type", "bypass"),
            "is_logged_in": bool(ACTIVE_SESSION.get("user_email") or ACTIVE_SESSION.get("user_id")),
            "has_session_cookie": bool(ACTIVE_SESSION.get("session_cookie")),
        },
        "profile": profile,
        "balance": balance,
    }


@mcp.tool()
def get_oauth_login_url() -> Dict[str, str]:
    """Get the PaperBull Google OAuth Web Login URL to link Claude Desktop in your browser."""
    url = f"http://localhost:{MCP_PORT}/auth/login"
    return {
        "url": url,
        "instructions": f"Open {url} in your browser and click 'Sign in with Google' to connect PaperBull to Claude Desktop.",
    }


@mcp.tool()
def login_with_oauth_token(link_or_token: str) -> Dict[str, Any]:
    """Authenticate and connect Claude to a PaperBull account by pasting the login link or Firebase OAuth token.

    Args:
        link_or_token: The full login link/URL (e.g. 'https://.../sse?token=...') or raw Firebase OAuth token.
    """
    input_str = link_or_token.strip()
    if not input_str:
        return {"error": "Please provide a valid login link or token."}

    clean_token = input_str
    if "token=" in input_str:
        try:
            parsed = urllib.parse.urlparse(input_str)
            query_params = urllib.parse.parse_qs(parsed.query or parsed.path)
            if "token" in query_params:
                clean_token = query_params["token"][0]
            else:
                clean_token = input_str.split("token=")[-1].split("&")[0].strip()
        except Exception:
            clean_token = input_str.split("token=")[-1].split("&")[0].strip()

    try:
        decoded = firebase_auth.verify_id_token(clean_token, check_revoked=False) if firebase_initialized else {}
    except Exception:
        try:
            decoded = firebase_auth.verify_session_cookie(clean_token, check_revoked=False) if firebase_initialized else {}
        except Exception as e:
            return {"error": f"Token verification failed: {str(e)}"}

    uid = decoded.get("uid", "custom_oauth_user")
    email = decoded.get("email", "")
    name = decoded.get("name", "Trader")

    save_session(user_id=uid, email=email, token=clean_token, name=name)

    profile = _make_request("/api/user/profile")
    balance = _make_request("/api/getBalance/getBalance")

    return {
        "status": "success",
        "message": f"✅ Successfully connected to PaperBull account: {email or uid}",
        "user": {"uid": uid, "email": email, "name": name},
        "profile": profile,
        "balance": balance,
    }


@mcp.tool()
def switch_user(
    user_id: Optional[str] = None,
    email: Optional[str] = None,
    session_cookie: Optional[str] = None,
) -> Dict[str, Any]:
    """Switch the active PaperBull account for Claude Desktop sessions.

    Args:
        user_id: User database ID (e.g. '1', '2', '3') or Firebase UID.
        email: User email address (e.g. 'user@example.com').
        session_cookie: Optional Firebase session cookie.
    """
    if not user_id and not email and not session_cookie:
        return {"error": "Please provide either user_id, email, or session_cookie to switch user."}

    if user_id:
        ACTIVE_SESSION["user_id"] = str(user_id).strip()
    if email:
        ACTIVE_SESSION["user_email"] = str(email).strip()
    if session_cookie:
        ACTIVE_SESSION["session_cookie"] = str(session_cookie).strip()
    ACTIVE_SESSION["auth_type"] = "manual_switch"

    if email or user_id:
        update_claude_desktop_config(user_id=ACTIVE_SESSION.get("user_id", ""), email=ACTIVE_SESSION.get("user_email", ""))

    profile = _make_request("/api/user/profile")
    balance = _make_request("/api/getBalance/getBalance")

    return {
        "status": "success",
        "message": f"Switched active user to: {email or user_id or 'Custom Session'}",
        "profile": profile,
        "balance": balance,
    }


@mcp.tool()
def list_available_users() -> Any:
    """List registered users from the PaperBull database so you can pick an account to switch to."""
    return _make_request("/api/user/list")


@mcp.tool()
def check_backend_status() -> Dict[str, Any]:
    """Check if the Stockify backend server is reachable on localhost:4000."""
    try:
        req = urllib.request.Request(f"{BASE_URL}/", headers={"Accept": "*/*"})
        with urllib.request.urlopen(req, timeout=4) as response:
            return {
                "status": "online",
                "code": response.status,
                "url": BASE_URL,
                "message": "Stockify backend is reachable.",
            }
    except urllib.error.HTTPError as e:
        return {
            "status": "online",
            "code": e.code,
            "url": BASE_URL,
            "message": "Stockify backend is online and responding.",
        }
    except Exception as e:
        return {
            "status": "offline",
            "url": BASE_URL,
            "message": f"Cannot connect to Stockify backend. Ensure `node server.js` is running on {BASE_URL}. Error: {str(e)}",
        }
