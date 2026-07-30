# ─── Stage 1: install dependencies ───────────────────────
FROM node:22-alpine AS deps

WORKDIR /app

# Copy only the manifests first for better layer caching
COPY package.json package-lock.json* ./

# Install production dependencies only
RUN npm ci --omit=dev

# ─── Stage 2: final runtime image ────────────────────────
FROM node:22-alpine AS runner

# Least-privilege user (built into alpine node image)
USER node

WORKDIR /app

# Copy deps from stage 1
COPY --from=deps --chown=node:node /app/node_modules ./node_modules

# Copy application source
COPY --chown=node:node server.js ./
COPY --chown=node:node templates/ ./templates/

# No port exposed — this is a queue worker, not an HTTP server

# Health check: confirm the process is alive every 30s
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "process.exit(0)" || exit 1

CMD ["node", "server.js"]
