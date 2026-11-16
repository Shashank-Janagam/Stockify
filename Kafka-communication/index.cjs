const path = require("path");
const { createRequire } = require("module");
require("dotenv").config();

let KafkaModule = null;
try {
  KafkaModule = require("kafkajs");
} catch (_) {
  try {
    const cwdReq = createRequire(path.join(process.cwd(), "package.json"));
    KafkaModule = cwdReq("kafkajs");
  } catch (err) {
    throw new Error(
      "Cannot find package 'kafkajs'. Please run 'npm install' in Kafka-communication or your application folder."
    );
  }
}
const { Kafka, logLevel } = KafkaModule;

const TOPICS = {
  ORDERS_INCOMING: "orders.incoming",
  ORDERS_EXECUTED: "orders.executed",
  ORDERS_FAILED: "orders.failed",
};

const PARTITION_COUNT = 1;
const REPLICATION_FACTOR = 1;

let kafkaInstance = null;
function getKafkaClient(clientId = "stockify-core") {
  if (!kafkaInstance) {
    const rawBrokers = process.env.KAFKA_BROKERS || "localhost:9092";
    const brokers = rawBrokers.split(",").map((b) => b.trim());
    kafkaInstance = new Kafka({
      clientId,
      brokers,
      logLevel: logLevel.WARN,
      retry: { initialRetryTime: 300, retries: 8 },
    });
    console.log(`[Kafka-Client CJS] Initialized client "${clientId}" pointing to: ${brokers.join(", ")}`);
  }
  return kafkaInstance;
}

let producer = null;
async function getKafkaProducer(clientId = "stockify-producer") {
  if (!producer) {
    const kafka = getKafkaClient(clientId);
    producer = kafka.producer({
      allowAutoTopicCreation: true,
      transactionTimeout: 30000,
    });
    await producer.connect();
    console.log(`[Kafka Producer CJS] ✅ Producer connected.`);
  }
  return producer;
}

async function sendOrder(orderPayload) {
  const p = await getKafkaProducer();
  const key = String(orderPayload.userId || orderPayload.userUid || "default");
  const value = JSON.stringify({
    ...orderPayload,
    timestamp: orderPayload.timestamp || new Date().toISOString(),
  });
  return await p.send({
    topic: TOPICS.ORDERS_INCOMING,
    messages: [{ key, value }],
  });
}

async function sendOrderExecuted(executedPayload) {
  const p = await getKafkaProducer();
  const key = String(executedPayload.userId || executedPayload.orderId || "default");
  const value = JSON.stringify({
    ...executedPayload,
    executedAt: executedPayload.executedAt || new Date().toISOString(),
  });
  return await p.send({
    topic: TOPICS.ORDERS_EXECUTED,
    messages: [{ key, value }],
  });
}

async function sendOrderFailed(failedPayload) {
  const p = await getKafkaProducer();
  const key = String(failedPayload.userId || failedPayload.orderId || "default");
  const value = JSON.stringify({
    ...failedPayload,
    failedAt: failedPayload.failedAt || new Date().toISOString(),
  });
  return await p.send({
    topic: TOPICS.ORDERS_FAILED,
    messages: [{ key, value }],
  });
}

async function disconnectProducer() {
  if (producer) {
    await producer.disconnect().catch(() => {});
    producer = null;
    console.log(`[Kafka Producer CJS] Disconnected.`);
  }
}

async function createKafkaConsumer({
  groupId,
  topics,
  onMessage,
  fromBeginning = false,
}) {
  const kafka = getKafkaClient(`${groupId}-client`);
  const consumer = kafka.consumer({
    groupId,
    sessionTimeout: 30000,
    heartbeatInterval: 3000,
    rebalanceTimeout: 60000,
  });

  await consumer.connect();
  console.log(`[Kafka Consumer CJS] ✅ Consumer "${groupId}" connected.`);

  for (const topic of topics) {
    await consumer.subscribe({ topic, fromBeginning });
    console.log(`[Kafka Consumer CJS] Subscribed "${groupId}" to topic "${topic}".`);
  }

  await consumer.run({
    autoCommit: true,
    eachMessage: async ({ topic, partition, message }) => {
      const rawValue = message.value?.toString();
      const rawKey = message.key?.toString();
      let payload = null;

      try {
        payload = rawValue ? JSON.parse(rawValue) : null;
      } catch (err) {
        payload = rawValue;
      }

      try {
        await onMessage({
          topic,
          partition,
          key: rawKey,
          payload,
          message,
        });
      } catch (err) {
        console.error(`[Kafka Consumer CJS] ❌ Error in onMessage handler for ${topic}:`, err);
      }
    },
  });

  return consumer;
}

module.exports = {
  TOPICS,
  PARTITION_COUNT,
  REPLICATION_FACTOR,
  getKafkaClient,
  getKafkaProducer,
  sendOrder,
  sendOrderExecuted,
  sendOrderFailed,
  disconnectProducer,
  createKafkaConsumer,
};
