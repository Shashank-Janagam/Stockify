FROM node:20-alpine

# Install Chromium and required runtime libraries for Puppeteer on Alpine Linux
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application source code including proto and json files
COPY . .

# Expose HTTP REST and feed control port
EXPOSE 4141

# Run the Upstox Redis Feed microservice
CMD ["node", "services/upstox-feed/index.js"]
