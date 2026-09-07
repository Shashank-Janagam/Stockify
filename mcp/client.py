"""
client.py — HTTP Client for communicating with the Stockify backend with automatic authentication & timing
"""

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, Optional
from config import BASE_URL, DEFAULT_SESSION_COOKIE, DEFAULT_TIMEOUT, DEFAULT_USER_EMAIL, DEFAULT_USER_ID
from session import ACTIVE_SESSION

def _make_request(
    path: str,
    method: str = "GET",
    params: Optional[Dict[str, Any]] = None,
    body: Optional[Dict[str, Any]] = None,
    headers: Optional[Dict[str, str]] = None,
    session_cookie: Optional[str] = None,
    user_id: Optional[str] = None,
    user_email: Optional[str] = None,
    timeout: int = DEFAULT_TIMEOUT,
) -> Any:
    """Execute authenticated HTTP requests against the Stockify backend with latency logging."""
    url = f"{BASE_URL}{path}"
    if params:
        clean_params = {k: v for k, v in params.items() if v is not None}
        if clean_params:
            query_string = urllib.parse.urlencode(clean_params)
            url = f"{url}?{query_string}"

    data = None
    req_headers = {
        "Accept": "application/json",
    }

    # Attach real session cookie if provided, otherwise fallback to dev bypass
    cookie = session_cookie or ACTIVE_SESSION.get("session_cookie") or DEFAULT_SESSION_COOKIE
    uid = user_id or ACTIVE_SESSION.get("user_id") or DEFAULT_USER_ID
    email = user_email or ACTIVE_SESSION.get("user_email") or DEFAULT_USER_EMAIL

    # Always enable bypass auth for internal MCP -> Backend requests and forward user credentials
    req_headers["x-bypass-auth"] = "true"
    if uid:
        req_headers["x-user-id"] = str(uid)
    if email:
        req_headers["x-user-email"] = str(email)

    if cookie and not cookie.startswith("pb_access_") and not cookie.startswith("code_"):
        req_headers["Cookie"] = f"session={cookie.strip()}"

    if headers:
        req_headers.update(headers)

    if body is not None:
        data = json.dumps(body).encode("utf-8")
        req_headers["Content-Type"] = "application/json"

    req = urllib.request.Request(
        url, data=data, headers=req_headers, method=method
    )

    t_start = time.time()
    print(f"[MCP -> Backend] {method} {url} ...", flush=True)

    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            elapsed_ms = int((time.time() - t_start) * 1000)
            print(f"[MCP <- Backend] {method} {path} -> {response.status} ({elapsed_ms}ms)", flush=True)
            if response.status == 204:
                return {"status": "success", "message": "No content (204)"}
            res_data = response.read().decode("utf-8")
            if not res_data.strip():
                return {"status": "success", "data": None}
            return json.loads(res_data)
    except urllib.error.HTTPError as e:
        elapsed_ms = int((time.time() - t_start) * 1000)
        print(f"[MCP <- Backend Error] {method} {path} -> HTTP {e.code} ({elapsed_ms}ms): {e.reason}", flush=True)
        error_body = e.read().decode("utf-8") if e.fp else str(e)
        try:
            parsed_err = json.loads(error_body)
        except Exception:
            parsed_err = error_body
        return {
            "error": f"HTTP {e.code}: {e.reason}",
            "details": parsed_err,
            "url": url,
        }
    except urllib.error.URLError as e:
        elapsed_ms = int((time.time() - t_start) * 1000)
        print(f"[MCP <- Backend Error] {method} {path} -> Connection Failed ({elapsed_ms}ms): {e.reason}", flush=True)
        return {
            "error": "Failed to reach Stockify backend",
            "message": f"Make sure Stockify backend is running on {BASE_URL}. Reason: {e.reason}",
            "url": url,
        }
    except Exception as e:
        elapsed_ms = int((time.time() - t_start) * 1000)
        print(f"[MCP <- Backend Error] {method} {path} -> Unexpected Exception ({elapsed_ms}ms): {str(e)}", flush=True)
        return {"error": "Unexpected error", "message": str(e), "url": url}
