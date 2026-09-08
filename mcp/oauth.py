"""
oauth.py — OAuth 2.0 Endpoints, RFC 8414 Metadata & Dynamic Client Registration for Claude Desktop & Web
"""

import json
import secrets
import time
import urllib.parse
from typing import Any, Dict
from starlette.requests import Request
from starlette.responses import HTMLResponse, JSONResponse

from config import MCP_HOST, MCP_PORT, firebase_initialized, firebase_auth
from session import ACTIVE_SESSION, save_session

OAUTH_CLIENTS: Dict[str, Any] = {}   # client_id -> client_info
OAUTH_CODES: Dict[str, Any] = {}     # code -> code_info
OAUTH_TOKENS: Dict[str, Any] = {}    # access_token -> user_session
OAUTH_REFRESH: Dict[str, Any] = {}   # refresh_token -> user_session

# ==============================================================================
# RFC 8414 OAuth 2.0 Authorization Server Metadata
# ==============================================================================

async def handle_oauth_metadata(request: Request):
    """RFC 8414 OAuth 2.0 Authorization Server Metadata"""
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or f"{MCP_HOST}:{MCP_PORT}"
    proto = request.headers.get("x-forwarded-proto") or request.url.scheme
    base = f"{proto}://{host}"

    return JSONResponse({
        "issuer": base,
        "authorization_endpoint": f"{base}/oauth/authorize",
        "token_endpoint": f"{base}/oauth/token",
        "registration_endpoint": f"{base}/oauth/register",
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        "code_challenge_methods_supported": ["S256", "plain"],
        "token_endpoint_auth_methods_supported": ["client_secret_post", "client_secret_basic", "none"],
        "scopes_supported": ["openid", "profile", "email", "paperbull:trade", "paperbull:read"]
    })


async def handle_protected_resource_metadata(request: Request):
    """RFC 9728 OAuth 2.0 Protected Resource Metadata (required by Claude Web & Desktop)"""
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or f"{MCP_HOST}:{MCP_PORT}"
    proto = request.headers.get("x-forwarded-proto") or request.url.scheme
    base = f"{proto}://{host}"

    return JSONResponse({
        "resource": f"{base}/mcp",
        "authorization_servers": [base],
        "scopes_supported": ["openid", "profile", "email", "paperbull:trade", "paperbull:read"],
        "bearer_methods_supported": ["header"],
        "resource_documentation": f"{base}/",
    })


async def handle_oauth_register(request: Request):
    """RFC 7591 Dynamic Client Registration (DCR)"""
    try:
        data = await request.json()
    except Exception:
        data = {}

    client_id = f"claude_{secrets.token_hex(8)}"
    client_secret = f"sec_{secrets.token_hex(16)}"
    redirect_uris = data.get("redirect_uris", [])
    client_name = data.get("client_name", "Claude Custom Connector")

    OAUTH_CLIENTS[client_id] = {
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uris": redirect_uris,
        "client_name": client_name,
        "created_at": time.time(),
    }

    return JSONResponse({
        "client_id": client_id,
        "client_secret": client_secret,
        "client_name": client_name,
        "redirect_uris": redirect_uris,
        "grant_types": ["authorization_code", "refresh_token"],
        "response_types": ["code"]
    }, status_code=201)


OAUTH_AUTHORIZE_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authorize Claude Desktop - PaperBull</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.8.0/firebase-auth-compat.js"></script>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --primary: #3b82f6;
      --success: #10b981;
      --border: #334155;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', sans-serif; }
    body {
      background: radial-gradient(circle at top, #1e293b, #0f172a);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 36px;
      max-width: 440px;
      width: 100%;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      text-align: center;
    }
    .badge {
      display: inline-block;
      background: rgba(59, 130, 246, 0.15);
      color: #60a5fa;
      padding: 5px 12px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 14px;
      border: 1px solid rgba(59, 130, 246, 0.3);
    }
    h1 { font-size: 22px; font-weight: 700; margin-bottom: 8px; }
    p { color: var(--text-muted); font-size: 13px; line-height: 1.5; margin-bottom: 22px; }
    .btn-google {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      background: #ffffff;
      color: #1e293b;
      font-weight: 600;
      font-size: 15px;
      border: none;
      border-radius: 10px;
      padding: 13px 20px;
      width: 100%;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .btn-google:hover { background: #f1f5f9; transform: translateY(-1px); }
    .status-box {
      margin-top: 20px;
      padding: 14px;
      border-radius: 10px;
      font-size: 13px;
      display: none;
      text-align: left;
    }
    .status-box.success {
      display: block;
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: #34d399;
    }
    .status-box.error {
      display: block;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #f87171;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">PaperBull 🤝 Claude Connector</div>
    <h1>Authorize Claude</h1>
    <p>Sign in with your Google account to grant Claude access to trade and view your PaperBull portfolio.</p>

    <button id="googleBtn" class="btn-google" onclick="signInWithGoogle()">
      <svg width="20" height="20" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"/>
        <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z"/>
        <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.03 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
        <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
      </svg>
      Sign in with Google
    </button>

    <div id="statusBox" class="status-box"></div>
  </div>

  <script>
    const firebaseConfig = {
      apiKey: "AIzaSyCcn4f3y-ZWT8_di5sV0pPB3m7Gonw6LbA",
      authDomain: "stockify-df381.firebaseapp.com",
      projectId: "stockify-df381",
      appId: "G-EPCEPPZXG6"
    };
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const provider = new firebase.auth.GoogleAuthProvider();

    const params = new URLSearchParams(window.location.search);
    const clientId = params.get('client_id') || '';
    const redirectUri = params.get('redirect_uri') || '';
    const state = params.get('state') || '';
    const codeChallenge = params.get('code_challenge') || '';
    const scope = params.get('scope') || 'openid profile email paperbull:trade paperbull:read';
    const resource = params.get('resource') || '';

    async function signInWithGoogle() {
      const btn = document.getElementById('googleBtn');
      const box = document.getElementById('statusBox');
      btn.disabled = true;
      btn.innerText = "Signing in...";

      try {
        const result = await auth.signInWithPopup(provider);
        const user = result.user;
        const idToken = await user.getIdToken();

        const res = await fetch("/oauth/authorize/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: idToken,
            client_id: clientId,
            redirect_uri: redirectUri,
            state: state,
            code_challenge: codeChallenge,
            scope: scope,
            resource: resource
          })
        });

        const data = await res.json();
        if (res.ok && data.redirect_url) {
          box.className = "status-box success";
          box.innerHTML = `<strong>✅ Authorized!</strong> Redirecting back to Claude...`;
          setTimeout(() => {
            window.location.href = data.redirect_url;
          }, 400);
        } else {
          throw new Error(data.message || "Authorization failed");
        }
      } catch (err) {
        box.className = "status-box error";
        box.innerHTML = `<strong>❌ Error:</strong> ${err.message}`;
        btn.disabled = false;
        btn.innerText = "Try Again with Google";
      }
    }
  </script>
</body>
</html>
"""

async def handle_oauth_authorize_page(request: Request):
    return HTMLResponse(OAUTH_AUTHORIZE_HTML)


async def handle_oauth_authorize_complete(request: Request):
    try:
        data = await request.json()
        token = data.get("token")
        client_id = data.get("client_id", "")
        redirect_uri = data.get("redirect_uri", "")
        state = data.get("state", "")
        code_challenge = data.get("code_challenge", "")

        if not token:
            print("[OAuth Authorize Error] Missing Firebase token in payload")
            return JSONResponse({"status": "error", "message": "Missing Firebase token"}, status_code=400)

        decoded = firebase_auth.verify_id_token(token, check_revoked=False) if firebase_initialized else {"uid": "oauth_user", "email": "user@paperbull.com"}
        uid = decoded.get("uid")
        email = decoded.get("email", "")
        name = decoded.get("name", "Trader")

        scope = data.get("scope") or "openid profile email paperbull:trade paperbull:read"
        resource = data.get("resource", "")
        # Create authorization code (expires in 10 minutes)
        code = f"code_{secrets.token_urlsafe(32)}"
        OAUTH_CODES[code] = {
            "uid": uid,
            "email": email,
            "name": name,
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "code_challenge": code_challenge,
            "scope": scope,
            "resource": resource,
            "expires_at": time.time() + 600,
        }

        # Build redirect URL back to Claude
        sep = "&" if "?" in redirect_uri else "?"
        redirect_url = f"{redirect_uri}{sep}code={code}&state={state}" if redirect_uri else f"/auth/login?code={code}"

        print(f"[OAuth Authorize Complete] ✅ Code generated for {email} ({uid}) -> Redirecting to: {redirect_url[:80]}...")

        return JSONResponse({
            "status": "success",
            "code": code,
            "redirect_url": redirect_url,
        })
    except Exception as e:
        print(f"[OAuth Authorize Exception] ❌ {e}")
        return JSONResponse({"status": "error", "message": str(e)}, status_code=400)


async def handle_oauth_token(request: Request):
    """RFC 6749 Token Endpoint (Exchanges code for access_token)"""
    import base64
    try:
        content_type = request.headers.get("content-type", "")
        if "application/json" in content_type:
            try:
                data = await request.json()
            except Exception:
                data = {}
        else:
            try:
                form = await request.form()
                data = dict(form)
            except Exception:
                body = await request.body()
                data = dict(urllib.parse.parse_qsl(body.decode("utf-8", errors="ignore")))

        # Also check query parameters as fallback
        for k, v in request.query_params.items():
            if k not in data:
                data[k] = v

        # Extract client credentials from Authorization header if present
        auth_header = request.headers.get("authorization", "")
        client_id = data.get("client_id", "")
        if auth_header.startswith("Basic "):
            try:
                decoded_b64 = base64.b64decode(auth_header[6:].strip()).decode("utf-8", errors="ignore")
                if ":" in decoded_b64:
                    client_id, _ = decoded_b64.split(":", 1)
            except Exception as e:
                print(f"[OAuth Token Warning] Failed to decode Basic Auth: {e}")

        grant_type = data.get("grant_type", "authorization_code")
        print(f"[OAuth Token Request] Grant type: '{grant_type}', code present: {bool(data.get('code'))}, client_id: '{client_id}'")

        if grant_type == "authorization_code":
            code = data.get("code", "").strip()
            if not code or code not in OAUTH_CODES:
                print(f"[OAuth Token Error] ❌ Invalid or expired authorization code: '{code}'. Active codes: {list(OAUTH_CODES.keys())}")
                return JSONResponse({"error": "invalid_grant", "error_description": "Invalid or expired authorization code"}, status_code=400)

            code_info = OAUTH_CODES.pop(code)
            if code_info["expires_at"] < time.time():
                print(f"[OAuth Token Error] ❌ Authorization code expired for {code_info.get('email')}")
                return JSONResponse({"error": "invalid_grant", "error_description": "Authorization code has expired"}, status_code=400)

            uid = code_info["uid"]
            email = code_info["email"]
            name = code_info["name"]
            scope = code_info.get("scope") or data.get("scope") or "openid profile email paperbull:trade paperbull:read"
            resource = code_info.get("resource") or data.get("resource") or ""

            access_token = f"pb_access_{secrets.token_urlsafe(32)}"
            refresh_token = f"pb_refresh_{secrets.token_urlsafe(32)}"

            OAUTH_TOKENS[access_token] = {
                "uid": uid,
                "email": email,
                "name": name,
                "client_id": client_id,
                "resource": resource,
                "expires_at": time.time() + 86400 * 30, # 30 days
            }

            OAUTH_REFRESH[refresh_token] = {
                "uid": uid,
                "email": email,
                "name": name,
                "client_id": client_id,
                "expires_at": time.time() + 86400 * 90, # 90 days
            }

            save_session(user_id=uid, email=email, token=access_token, name=name)
            print(f"[OAuth Token Success] 🚀 Access token for {email} | scopes: '{scope}' | resource: '{resource}'")

            token_response: Dict[str, Any] = {
                "access_token": access_token,
                "token_type": "bearer",
                "expires_in": 86400 * 30,
                "refresh_token": refresh_token,
                "scope": scope,
            }
            if resource:
                token_response["resource"] = resource

            return JSONResponse(token_response)

        elif grant_type == "refresh_token":
            refresh_token = data.get("refresh_token", "").strip()
            if not refresh_token or refresh_token not in OAUTH_REFRESH:
                print("[OAuth Token Error] ❌ Invalid refresh token")
                return JSONResponse({"error": "invalid_grant", "error_description": "Invalid refresh token"}, status_code=400)

            ref_info = OAUTH_REFRESH[refresh_token]
            if ref_info["expires_at"] < time.time():
                print("[OAuth Token Error] ❌ Refresh token expired")
                return JSONResponse({"error": "invalid_grant", "error_description": "Refresh token expired"}, status_code=400)

            new_access_token = f"pb_access_{secrets.token_urlsafe(32)}"
            OAUTH_TOKENS[new_access_token] = {
                "uid": ref_info["uid"],
                "email": ref_info["email"],
                "name": ref_info["name"],
                "client_id": client_id,
                "expires_at": time.time() + 86400 * 30,
            }

            print(f"[OAuth Token Success] 🔄 Refreshed access token for {ref_info['email']}")

            return JSONResponse({
                "access_token": new_access_token,
                "token_type": "Bearer",
                "expires_in": 86400 * 30,
                "scope": "paperbull:trade",
            })

        else:
            print(f"[OAuth Token Error] ❌ Unsupported grant type: {grant_type}")
            return JSONResponse({"error": "unsupported_grant_type"}, status_code=400)

    except Exception as e:
        print(f"[OAuth Token Exception] ❌ {e}")
        return JSONResponse({"error": "server_error", "error_description": str(e)}, status_code=500)


# ==============================================================================
# Browser Login Page & Handlers
# ==============================================================================

OAUTH_LOGIN_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Connect PaperBull to Claude Desktop</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.8.0/firebase-auth-compat.js"></script>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --primary: #3b82f6;
      --success: #10b981;
      --border: #334155;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', sans-serif; }
    body {
      background: radial-gradient(circle at top, #1e293b, #0f172a);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 40px;
      max-width: 480px;
      width: 100%;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      text-align: center;
    }
    .badge {
      display: inline-block;
      background: rgba(59, 130, 246, 0.15);
      color: #60a5fa;
      padding: 6px 14px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 16px;
      border: 1px solid rgba(59, 130, 246, 0.3);
    }
    h1 { font-size: 24px; font-weight: 700; margin-bottom: 8px; }
    p { color: var(--text-muted); font-size: 14px; line-height: 1.5; margin-bottom: 24px; }
    .btn-google {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      background: #ffffff;
      color: #1e293b;
      font-weight: 600;
      font-size: 15px;
      border: none;
      border-radius: 10px;
      padding: 14px 20px;
      width: 100%;
      cursor: pointer;
      transition: all 0.2s ease;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }
    .btn-google:hover { background: #f1f5f9; transform: translateY(-1px); }
    .btn-google:active { transform: translateY(0); }
    .status-box {
      margin-top: 24px;
      padding: 16px;
      border-radius: 10px;
      font-size: 13px;
      display: none;
      text-align: left;
    }
    .status-box.success {
      display: block;
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: #34d399;
    }
    .status-box.error {
      display: block;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #f87171;
    }
    .btn-copy {
      background: #334155;
      color: #f8fafc;
      border: 1px solid #475569;
      border-radius: 6px;
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      margin-top: 8px;
      transition: background 0.2s;
    }
    .btn-copy:hover { background: #475569; }
    .config-code {
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 6px;
      padding: 10px;
      font-family: monospace;
      font-size: 11px;
      color: #38bdf8;
      overflow-x: auto;
      margin-top: 8px;
      white-space: pre;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">PaperBull 🤝 Claude Desktop</div>
    <h1>Connect PaperBull Account</h1>
    <p>Sign in with your Google account to authorize Claude Desktop to trade on your PaperBull portfolio.</p>

    <button id="googleBtn" class="btn-google" onclick="signInWithGoogle()">
      <svg width="20" height="20" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"/>
        <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z"/>
        <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.03 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
        <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
      </svg>
      Sign in with Google
    </button>

    <div id="statusBox" class="status-box"></div>
  </div>

  <script>
    const firebaseConfig = {
      apiKey: "AIzaSyCcn4f3y-ZWT8_di5sV0pPB3m7Gonw6LbA",
      authDomain: "stockify-df381.firebaseapp.com",
      projectId: "stockify-df381",
      appId: "G-EPCEPPZXG6"
    };
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const provider = new firebase.auth.GoogleAuthProvider();

    let clientConfigJSON = "";

    async function signInWithGoogle() {
      const btn = document.getElementById('googleBtn');
      const box = document.getElementById('statusBox');
      btn.disabled = true;
      btn.innerText = "Signing in...";

      try {
        const result = await auth.signInWithPopup(provider);
        const user = result.user;
        const idToken = await user.getIdToken();

        const res = await fetch("/auth/callback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: idToken })
        });

        const data = await res.json();
        if (res.ok && data.status === "success") {
          const sseUrl = window.location.origin + "/sse?token=" + idToken;
          const remoteConfig = {
            mcpServers: {
              paperbull: {
                command: "npx",
                args: ["-y", "mcp-remote", sseUrl]
              }
            }
          };
          clientConfigJSON = JSON.stringify(remoteConfig, null, 2);

          box.className = "status-box success";
          box.innerHTML = `
            <strong>✅ PaperBull Account Connected!</strong><br><br>
            Signed in as: <b>${user.email}</b> (${user.displayName || 'Trader'})<br><br>
            <b>Option 1: Paste Link in Claude Desktop Chat (Easiest)</b><br>
            Copy this link and paste it into Claude:
            <div class="token-preview" id="linkText">${sseUrl}</div>
            <button class="btn-copy" onclick="copyLink()">📋 Copy Connection Link</button>
            <br><br>
            <b>Option 2: Claude Desktop Config File</b><br>
            <pre class="config-code">${clientConfigJSON}</pre>
            <button class="btn-copy" onclick="copyConfig()">📋 Copy Full Config JSON</button>
          `;
          btn.style.display = "none";
        } else {
          throw new Error(data.message || "Failed to link session");
        }
      } catch (err) {
        box.className = "status-box error";
        box.innerHTML = `<strong>❌ Connection Failed</strong><br>${err.message}`;
        btn.disabled = false;
        btn.innerHTML = `Try Again with Google`;
      }
    }

    function copyLink() {
      const link = document.getElementById('linkText').innerText;
      navigator.clipboard.writeText(link).then(() => {
        alert("Connection link copied! Now paste it directly in Claude Desktop chat.");
      });
    }

    function copyConfig() {
      navigator.clipboard.writeText(clientConfigJSON).then(() => {
        alert("Claude Desktop configuration copied to clipboard!");
      });
    }
  </script>
</body>
</html>
"""

async def handle_oauth_login_page(request: Request):
    return HTMLResponse(OAUTH_LOGIN_HTML)


async def handle_oauth_callback(request: Request):
    try:
        data = await request.json()
        token = data.get("token")
        if not token:
            return JSONResponse({"status": "error", "message": "Missing OAuth token"}, status_code=400)

        decoded = firebase_auth.verify_id_token(token, check_revoked=False) if firebase_initialized else {"uid": "oauth_user", "email": "user@paperbull.com"}
        uid = decoded.get("uid")
        email = decoded.get("email", "")
        name = decoded.get("name", "Trader")

        save_session(user_id=uid, email=email, token=token, name=name)

        return JSONResponse({
            "status": "success",
            "message": f"Connected to PaperBull as {email} ({uid})",
            "user": {
                "uid": uid,
                "email": email,
                "name": name,
            }
        })
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=401)
