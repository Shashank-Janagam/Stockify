FROM node:20-alpine

WORKDIR /app

# Copy package manifests and install production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy initialization files
COPY . .

# Run Kafka initialization (creates 1-partition topics and verifies readiness)
CMD ["node", "init.js"]
