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
    handle_protected_resource_metadata,
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
    """Build and configure the Starlette ASGI application for Streamable HTTP and OAuth."""
    from starlette.applications import Starlette
    from starlette.routing import Mount, Route

    # Use modern Streamable HTTP transport (replaces legacy SSE)
    # Claude.ai connector uses POST /mcp for all communication
    # Falls back to SSE app if mcp version < 1.3.0
    try:
        mcp_app = mcp.streamable_http_app()
        mcp_mount_path = "/mcp"
        print("[Transport] Using Streamable HTTP transport at /mcp", flush=True)
    except AttributeError:
        mcp_app = mcp.sse_app()
        mcp_mount_path = "/"
        print("[Transport] Fallback: Using legacy SSE transport at /sse", flush=True)

    # Build the top-level Starlette app.
    # IMPORTANT: Starlette matches routes IN ORDER — specific routes MUST come
    # before Mount(), otherwise Mount("/") swallows everything.
    app = Starlette(
        routes=[
            # Health & root endpoints (matched before mount)
            Route("/health", health_handler, methods=["GET"]),
            Route("/", root_handler, methods=["GET", "HEAD"]),

            # OAuth 2.0 Discovery Endpoints (RFC 8414, RFC 9728)
            Route("/.well-known/oauth-protected-resource", handle_protected_resource_metadata, methods=["GET"]),
            Route("/.well-known/oauth-protected-resource/mcp", handle_protected_resource_metadata, methods=["GET"]),
            Route("/.well-known/oauth-protected-resource/sse", handle_protected_resource_metadata, methods=["GET"]),
            Route("/.well-known/oauth-authorization-server", handle_oauth_metadata, methods=["GET"]),
            Route("/.well-known/openid-configuration", handle_oauth_metadata, methods=["GET"]),

            # OAuth 2.0 Endpoints
            Route("/oauth/register", handle_oauth_register, methods=["POST"]),
            Route("/oauth/authorize", handle_oauth_authorize_page, methods=["GET"]),
            Route("/oauth/authorize/complete", handle_oauth_authorize_complete, methods=["POST"]),
            Route("/oauth/token", handle_oauth_token, methods=["POST"]),

            # Browser Login Portal
            Route("/auth/login", handle_oauth_login_page, methods=["GET"]),
            Route("/auth/callback", handle_oauth_callback, methods=["POST"]),

            # MCP transport LAST — catches /mcp (streamable) or / (SSE fallback)
            Mount(mcp_mount_path, app=mcp_app),
        ]
    )

    # Middlewares — NOTE: in Starlette, last add_middleware() call is OUTERMOST (runs first)
    # Request flow: CORSMiddleware → FirebaseAuthMiddleware → app
    app.add_middleware(FirebaseAuthMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    return app


# ==============================================================================
# Server CLI Entry Point
# ==============================================================================

if __name__ == "__main__":
    import sys
    import traceback

    try:
        parser = argparse.ArgumentParser(description="Stockify MCP Server")
        parser.add_argument(
            "--transport",
            choices=["sse", "stdio", "streamable-http"],
            default=os.getenv("MCP_TRANSPORT", "sse"),
            help="Transport protocol to use (default: sse)",
        )
        parser.add_argument(
            "--host",
            default=os.getenv("MCP_HOST", MCP_HOST),
            help=f"Host address to bind to (default: {MCP_HOST})",
        )
        parser.add_argument(
            "--port",
            type=int,
            default=int(os.getenv("MCP_PORT", MCP_PORT)),
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
        args, _ = parser.parse_known_args()

        if args.transport == "stdio":
            mcp.run(transport="stdio")
        else:
            app = create_app()

            has_ssl = bool(args.ssl_keyfile and args.ssl_certfile)
            proto = "https" if has_ssl else "http"

            print(f"Starting PaperBull MCP Server on {proto}://{args.host}:{args.port}", flush=True)
            print(f"  - MCP Endpoint (Streamable HTTP): {proto}://{args.host}:{args.port}/mcp/", flush=True)
            print(f"  - OAuth Login Page: {proto}://localhost:{args.port}/auth/login", flush=True)
            print(f"  - Health Check: {proto}://{args.host}:{args.port}/health", flush=True)
            print(f"  - Firebase Auth: {'Configured & Ready' if firebase_initialized else 'Fallback mode (Dev bypass enabled)'}", flush=True)
            print(f"  - Require Auth: {'Enforced (401 on invalid token)' if REQUIRE_AUTH else 'Optional (Bypass allowed)'}", flush=True)

            uvicorn.run(
                app,
                host=args.host,
                port=args.port,
                ssl_keyfile=args.ssl_keyfile,
                ssl_certfile=args.ssl_certfile,
                log_level="info",
            )
    except Exception as e:
        print(f"[FATAL SERVER ERROR] {e}", file=sys.stderr, flush=True)
        traceback.print_exc()
        sys.exit(1)

