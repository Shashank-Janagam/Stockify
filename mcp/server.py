"""
Stockify MCP (Model Context Protocol) Server
-------------------------------------------
Modular, high-performance MCP server providing LLMs with real-time Indian stock market data,
portfolio management, order execution, news, AI behavioral analysis, and algorithmic backtesting.
"""

import argparse
import os
from typing import Any
import uvicorn
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse

from config import MCP_HOST, MCP_PORT, REQUIRE_AUTH, firebase_initialized, mcp
from middleware import FirebaseAuthMiddleware
from oauth import (
    handle_oauth_authorize_complete,
    handle_oauth_authorize_page,
    handle_oauth_callback,
    handle_oauth_login_page,
    handle_oauth_metadata,
    handle_oauth_register,
    handle_oauth_token,
)

# Import all MCP tool definitions, resources, and prompt templates
import tools
import resources
import prompts


# ==============================================================================
# Custom HTTP Endpoints (Health Check & Connector Discovery)
# ==============================================================================

@mcp.custom_route("/", methods=["GET", "HEAD"])
async def root_handler(request: Any) -> Any:
    """Root endpoint providing MCP server metadata and SSE endpoint location."""
    return JSONResponse({
        "status": "online",
        "name": "PaperBull / Stockify MCP Server",
        "protocol": "MCP (Model Context Protocol)",
        "sse_endpoint": "/sse",
        "messages_endpoint": "/messages/",
        "docs": "Connect to this server using SSE at /sse or stdio transport."
    })


@mcp.custom_route("/health", methods=["GET"])
async def health_handler(request: Any) -> Any:
    """Health check endpoint."""
    return JSONResponse({"status": "healthy", "service": "PaperBull MCP"})


# ==============================================================================
# Server Factory & Application Setup
# ==============================================================================

def create_app():
    """Build and configure the Starlette ASGI application for SSE and OAuth."""
    app = mcp.sse_app()

    # 1. Claude OAuth 2.0 Discovery Endpoints (RFC 8414 / OpenID Connect)
    app.add_route("/.well-known/oauth-authorization-server", handle_oauth_metadata, methods=["GET"])
    app.add_route("/.well-known/openid-configuration", handle_oauth_metadata, methods=["GET"])
    app.add_route("/oauth/register", handle_oauth_register, methods=["POST"])
    app.add_route("/oauth/authorize", handle_oauth_authorize_page, methods=["GET"])
    app.add_route("/oauth/authorize/complete", handle_oauth_authorize_complete, methods=["POST"])
    app.add_route("/oauth/token", handle_oauth_token, methods=["POST"])

    # 2. Browser Login Portal
    app.add_route("/auth/login", handle_oauth_login_page, methods=["GET"])
    app.add_route("/auth/callback", handle_oauth_callback, methods=["POST"])

    # 3. Middlewares (CORS & Authentication)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(FirebaseAuthMiddleware)

    return app


# ==============================================================================
# Server CLI Entry Point
# ==============================================================================

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Stockify MCP Server")
    parser.add_argument(
        "--transport",
        choices=["sse", "stdio", "streamable-http"],
        default=os.getenv("MCP_TRANSPORT", "sse"),
        help="Transport protocol to use (default: sse)",
    )
    parser.add_argument(
        "--host",
        default=MCP_HOST,
        help=f"Host address to bind to (default: {MCP_HOST})",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=MCP_PORT,
        help=f"Port to bind to (default: {MCP_PORT})",
    )
    parser.add_argument(
        "--ssl-keyfile",
        default=os.getenv("SSL_KEYFILE"),
        help="Path to SSL private key file for direct HTTPS",
    )
    parser.add_argument(
        "--ssl-certfile",
        default=os.getenv("SSL_CERTFILE"),
        help="Path to SSL certificate fullchain file for direct HTTPS",
    )
    args = parser.parse_args()

    if args.transport == "stdio":
        mcp.run(transport="stdio")
    else:
        app = create_app()

        has_ssl = bool(args.ssl_keyfile and args.ssl_certfile)
        proto = "https" if has_ssl else "http"

        print(f"Starting PaperBull MCP Server on {proto}://{args.host}:{args.port}")
        print(f"  - SSE Endpoint: {proto}://{args.host}:{args.port}/sse")
        print(f"  - OAuth Login Page: {proto}://localhost:{args.port}/auth/login")
        print(f"  - Health Check: {proto}://{args.host}:{args.port}/health")
        print(f"  - Firebase Auth: {'Configured & Ready' if firebase_initialized else 'Fallback mode (Dev bypass enabled)'}")
        print(f"  - Require Auth: {'Enforced (401 on invalid token)' if REQUIRE_AUTH else 'Optional (Bypass allowed)'}")

        uvicorn.run(
            app,
            host=args.host,
            port=args.port,
            ssl_keyfile=args.ssl_keyfile,
            ssl_certfile=args.ssl_certfile,
        )
