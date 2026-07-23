FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application source code including proto and json files
COPY . .

# Expose the WebSocket port
EXPOSE 4141

# Run the websocket.js server
CMD ["node", "websocket.js"]
