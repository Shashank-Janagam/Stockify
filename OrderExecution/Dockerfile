FROM node:20-alpine

WORKDIR /app

# Copy Kafka-communication library first
COPY Kafka-communication ./Kafka-communication
RUN cd Kafka-communication && npm install --omit=dev

# Copy OrderExecution service files
COPY OrderExecution ./OrderExecution
WORKDIR /app/OrderExecution
RUN npm install --omit=dev

CMD ["node", "server.js"]
