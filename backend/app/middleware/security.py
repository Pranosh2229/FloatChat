"""
General-purpose request hardening, applied to every endpoint regardless of route — none of this
is specific to /query or /admin. Three independent middlewares, each doing one thing:

- SecurityHeadersMiddleware: standard response headers browsers use to reduce the blast radius of
  bugs elsewhere (XSS, clickjacking, MIME-sniffing), even though this API only ever returns JSON.
- RateLimitingMiddleware: a per-IP request budget, so one client (buggy retry loop, naive script)
  can't starve everyone else on a single shared demo instance.
- OriginCheckMiddleware: rejects a state-changing (non-GET) browser request whose `Origin` header
  isn't in the configured CORS allow-list. CORS already stops the *response* from being readable
  cross-origin, but a "simple request" (plain form POST, no preflight) still reaches the server and
  executes before CORS blocks anything — this closes that gap. Non-browser clients (curl, the test
  suite, server-to-server calls) never send an Origin header at all and are left untouched.

All three are in-memory and per-process — correct for this project's single-process deployment
(see main.py's lifespan comment on the same tradeoff for the database); a multi-instance deployment
would need a shared store (e.g. Redis, already an optional dependency) for the rate limiter instead.
"""

import time
from collections import defaultdict, deque

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.config import get_settings

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
}


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        for key, value in SECURITY_HEADERS.items():
            response.headers[key] = value
        return response


class RateLimitingMiddleware(BaseHTTPMiddleware):
    """Fixed-window-ish limiter: keeps each client IP's recent request timestamps in a deque and
    counts how many fall within the last 60s. Simple over a token bucket — this is a safety net
    for a demo deployment, not a billed API product, and doesn't need burst-smoothing precision."""

    def __init__(self, app) -> None:  # noqa: ANN001 — Starlette's own base signature
        super().__init__(app)
        self._requests: dict[str, deque[float]] = defaultdict(deque)

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.url.path == "/health":
            return await call_next(request)

        limit = get_settings().rate_limit_per_minute
        client_ip = request.client.host if request.client else "unknown"
        now = time.monotonic()
        window = self._requests[client_ip]
        while window and now - window[0] > 60:
            window.popleft()

        if len(window) >= limit:
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests — please slow down."},
                headers={"Retry-After": "60"},
            )

        window.append(now)
        return await call_next(request)


class OriginCheckMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        origin = request.headers.get("origin")
        if request.method not in ("GET", "HEAD", "OPTIONS") and origin is not None:
            if origin not in get_settings().cors_origins:
                return JSONResponse(status_code=403, content={"detail": "Origin not allowed."})
        return await call_next(request)
