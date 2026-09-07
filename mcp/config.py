"""
config.py — Configuration, Environment Variables, Firebase Admin, and MCP instance
"""

import json
import os
from typing import Optional
from dotenv import load_dotenv

# Load environment variables from local .env file
load_dotenv()

from mcp.server.fastmcp import FastMCP

try:
    from mcp.server.fastmcp.server import TransportSecuritySettings
except (ImportError, ModuleNotFoundError, AttributeError):
    try:
        from mcp.server.fastmcp import TransportSecuritySettings
    except (ImportError, ModuleNotFoundError, AttributeError):
        TransportSecuritySettings = None

import firebase_admin
from firebase_admin import auth as firebase_auth, credentials as firebase_credentials

# Configuration settings
BASE_URL = os.getenv("STOCKIFY_BASE_URL", "http://localhost:4000").rstrip("/")
DEFAULT_USER_ID = os.getenv("STOCKIFY_USER_ID", "")
DEFAULT_USER_EMAIL = os.getenv("STOCKIFY_USER_EMAIL", "")
DEFAULT_SESSION_COOKIE = os.getenv("STOCKIFY_SESSION_COOKIE", "")
DEFAULT_TIMEOUT = int(os.getenv("STOCKIFY_TIMEOUT", "10"))
MCP_HOST = os.getenv("MCP_HOST", "0.0.0.0")
MCP_PORT = int(os.getenv("MCP_PORT", "4142"))
MCP_API_KEY = os.getenv("MCP_API_KEY", "")
REQUIRE_AUTH = os.getenv("REQUIRE_AUTH", "false").lower() in ("true", "1", "yes")

SESSION_FILE_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), ".paperbull_session.json"))

# Firebase Admin Initialization
firebase_initialized = False
firebase_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")

if firebase_json:
    try:
        service_account_info = json.loads(firebase_json)
        cred = firebase_credentials.Certificate(service_account_info)
        firebase_admin.initialize_app(cred)
        firebase_initialized = True
        print("[Firebase Info] Firebase Admin SDK successfully initialized.")
    except Exception as e:
        print(f"[Firebase Error] Failed to initialize Firebase from .env JSON: {e}")
else:
    print("[Firebase Info] No FIREBASE_SERVICE_ACCOUNT_JSON found in .env (running in bypass mode)")

# Initialize FastMCP Server with DNS rebinding protection disabled for ngrok/cloud domains
ts_settings = (
    TransportSecuritySettings(
        enable_dns_rebinding_protection=False,
        allowed_hosts=["*"],
        allowed_origins=["*"],
    )
    if TransportSecuritySettings
    else None
)

kwargs = {
    "host": MCP_HOST,
    "port": MCP_PORT,
}
if ts_settings is not None:
    kwargs["transport_security"] = ts_settings

try:
    mcp = FastMCP("PaperBull MCP Server", **kwargs)
except TypeError:
    try:
        mcp = FastMCP("PaperBull MCP Server", host=MCP_HOST, port=MCP_PORT)
    except TypeError:
        mcp = FastMCP("PaperBull MCP Server")

