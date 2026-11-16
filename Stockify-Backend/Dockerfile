FROM node:22

WORKDIR /app

# Copy Kafka-communication
COPY Kafka-communication ./Kafka-communication
RUN cd Kafka-communication && npm install --omit=dev

# Copy Stockify-Backend
COPY Stockify-Backend ./Stockify-Backend
WORKDIR /app/Stockify-Backend
RUN npm install

EXPOSE 4000

CMD ["node", "server.js"]
