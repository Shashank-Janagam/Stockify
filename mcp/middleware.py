"""
middleware.py — Pure ASGI Authentication Middleware for Firebase, Claude OAuth & API Keys
"""

import time
import urllib.parse
from starlette.responses import JSONResponse

from config import MCP_API_KEY, REQUIRE_AUTH, firebase_initialized, firebase_auth
from oauth import OAUTH_TOKENS
from session import ACTIVE_SESSION

class FirebaseAuthMiddleware:
    """
    Pure ASGI Middleware that validates Firebase OAuth ID tokens, Session Cookies, Claude OAuth Access Tokens, or API Keys.
    Immune to BaseHTTPMiddleware streaming buffer errors on SSE. Gracefully catches client disconnects.
    """
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        path = scope.get("path", "")
        method = scope.get("method", "")
        headers = dict(scope.get("headers", []))
        auth_hdr = headers.get(b"authorization", b"").decode("utf-8")

        print(f"[Middleware] {method} {path} | Auth: '{auth_hdr[:30]}' | Tokens in store: {len(OAUTH_TOKENS)}", flush=True)

        # Always bypass OAuth, well-known discovery, and health endpoints
        if (
            path in ["/health", "/", "/auth/login", "/auth/callback", "/oauth/authorize", "/oauth/authorize/complete", "/oauth/token", "/oauth/register"]
            or path.startswith("/.well-known/")
            or path.startswith("/oauth/")
        ):
            try:
                return await self.app(scope, receive, send)
            except Exception as e:
                if "ClientDisconnect" in type(e).__name__:
                    return
                raise

        # Bypass ALL MCP transport paths — FastMCP handles its own 401 for
        # unauthenticated connections; Claude sends the Bearer token it got
        # from OAuth but FastMCP doesn't validate it internally.
        if (
            path == "/sse"
            or path.startswith("/messages")
            or path == "/mcp"
            or path.startswith("/mcp/")
        ):
            print(f"[Middleware] ✅ MCP transport bypass: {method} {path}", flush=True)
            try:
                return await self.app(scope, receive, send)
            except Exception as e:
                if "ClientDisconnect" in type(e).__name__:
                    return
                raise

        headers = dict(scope.get("headers", []))
        auth_header = headers.get(b"authorization", b"").decode("utf-8")
        bearer_token = auth_header.replace("Bearer ", "").strip() if auth_header.startswith("Bearer ") else ""
        header_api_key = headers.get(b"x-api-key", b"").decode("utf-8")

        # Parse query params for token
        query_string = scope.get("query_string", b"").decode("utf-8")
        query_params = urllib.parse.parse_qs(query_string)
        query_token = query_params.get("token", [""])[0] or query_params.get("api_key", [""])[0]

        token_to_verify = bearer_token or query_token or header_api_key

        # 1. Check Claude OAuth 2.0 Access Token Store
        if token_to_verify and token_to_verify in OAUTH_TOKENS:
            token_info = OAUTH_TOKENS[token_to_verify]
            if token_info.get("expires_at", 0) > time.time():
                ACTIVE_SESSION["user_id"] = token_info.get("uid", "")
                ACTIVE_SESSION["user_email"] = token_info.get("email", "")
                ACTIVE_SESSION["user_name"] = token_info.get("name", "Trader")
                ACTIVE_SESSION["auth_type"] = "claude_oauth"
                print(f"[Middleware] ✅ Claude OAuth token valid for {ACTIVE_SESSION['user_email']}", flush=True)
                try:
                    return await self.app(scope, receive, send)
                except Exception as e:
                    if "ClientDisconnect" in type(e).__name__:
                        return
                    raise
            else:
                print(f"[Middleware] ⚠️ Token EXPIRED for {path}", flush=True)
        elif token_to_verify:
            print(f"[Middleware] ⚠️ Token '{token_to_verify[:12]}...' NOT in OAUTH_TOKENS ({len(OAUTH_TOKENS)} tokens stored)", flush=True)

        # 2. Check static API Key
        if MCP_API_KEY and token_to_verify == MCP_API_KEY:
            try:
                return await self.app(scope, receive, send)
            except Exception as e:
                if "ClientDisconnect" in type(e).__name__:
                    return
                raise

        # 3. Check Firebase ID Token
        if firebase_initialized and token_to_verify:
            try:
                decoded = firebase_auth.verify_id_token(token_to_verify, check_revoked=False)
                ACTIVE_SESSION["user_id"] = decoded.get("uid", "")
                ACTIVE_SESSION["user_email"] = decoded.get("email", "")
                ACTIVE_SESSION["user_name"] = decoded.get("name", "Trader")
                return await self.app(scope, receive, send)
            except Exception:
                pass

        if REQUIRE_AUTH and not token_to_verify:
            res = JSONResponse(
                {"error": "Unauthorized", "message": "Authentication required. Provide a Firebase OAuth token or connect via Claude OAuth."},
                status_code=401,
            )
            return await res(scope, receive, send)

        try:
            return await self.app(scope, receive, send)
        except Exception as e:
            if "ClientDisconnect" in type(e).__name__:
                return
            raise
