FROM node:22

WORKDIR /app

# Copy Kafka-communication
COPY Kafka-communication ./Kafka-communication
RUN cd Kafka-communication && npm install --omit=dev

# Copy AlgoTrading
COPY AlgoTrading ./AlgoTrading
WORKDIR /app/AlgoTrading
RUN npm install --production

CMD ["node", "stoploss-engine/stoploss.js"]
