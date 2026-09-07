# ─── Stage 1: Build Dependencies ──────────────────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /app

# Install system build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install wheels
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt


# ─── Stage 2: Final Lean Runtime Image ────────────────────────────────────────
FROM python:3.11-slim AS runner

WORKDIR /app

# Install runtime curl for health checks
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root application user for security
RUN groupadd -g 1001 mcpuser && \
    useradd -u 1001 -g mcpuser -m -s /bin/bash mcpuser

# Copy installed python packages from builder
COPY --from=builder /root/.local /home/mcpuser/.local
ENV PATH=/home/mcpuser/.local/bin:$PATH
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Copy application source code
COPY --chown=mcpuser:mcpuser . /app

# Switch to non-root user
USER mcpuser

# Default MCP server port (SSE transport)
EXPOSE 4142

# Health check using the /health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:4142/health || exit 1

# Start the FastMCP Starlette / SSE Server
CMD ["python", "server.py", "--host", "0.0.0.0", "--port", "4142", "--transport", "sse"]
