FROM node:20-alpine

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
