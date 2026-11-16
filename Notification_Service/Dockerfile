FROM node:22-alpine

WORKDIR /app

# Copy Kafka-communication
COPY Kafka-communication ./Kafka-communication
RUN cd Kafka-communication && npm install --omit=dev

# Copy Notification_Service
COPY Notification_Service ./Notification_Service
WORKDIR /app/Notification_Service
RUN npm install --omit=dev

CMD ["node", "server.js"]
