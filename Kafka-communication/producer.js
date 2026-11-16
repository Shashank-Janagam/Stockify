import { getKafkaClient } from "./client.js";
import { TOPICS } from "./topics.js";

let producer = null;

export async function getKafkaProducer(clientId = "stockify-producer") {
  if (!producer) {
    const kafka = getKafkaClient(clientId);
    producer = kafka.producer({
      allowAutoTopicCreation: true,
      transactionTimeout: 30000,
    });
    await producer.connect();
    console.log(`[Kafka Producer] ✅ Producer connected.`);
  }
  return producer;
}

/**
 * Send an incoming BUY or SELL order to Kafka (orders.incoming).
 * Used by Stockify-Backend, StopLoss Engine, Intraday SquareOff, Aegis.
 */
export async function sendOrder(orderPayload) {
  const p = await getKafkaProducer();
  const key = String(orderPayload.userId || orderPayload.userUid || "default");
  const value = JSON.stringify({
    ...orderPayload,
    timestamp: orderPayload.timestamp || new Date().toISOString(),
  });

  const record = await p.send({
    topic: TOPICS.ORDERS_INCOMING,
    messages: [{ key, value }],
  });
  return record;
}

/**
 * Send an executed order event to Kafka (orders.executed).
 * Used by the Centralized OrderExecution service.
 */
export async function sendOrderExecuted(executedPayload) {
  const p = await getKafkaProducer();
  const key = String(executedPayload.userId || executedPayload.orderId || "default");
  const value = JSON.stringify({
    ...executedPayload,
    executedAt: executedPayload.executedAt || new Date().toISOString(),
  });

  const record = await p.send({
    topic: TOPICS.ORDERS_EXECUTED,
    messages: [{ key, value }],
  });
  return record;
}

/**
 * Send a failed order event to Kafka (orders.failed).
 * Used by the Centralized OrderExecution service.
 */
export async function sendOrderFailed(failedPayload) {
  const p = await getKafkaProducer();
  const key = String(failedPayload.userId || failedPayload.orderId || "default");
  const value = JSON.stringify({
    ...failedPayload,
    failedAt: failedPayload.failedAt || new Date().toISOString(),
  });

  const record = await p.send({
    topic: TOPICS.ORDERS_FAILED,
    messages: [{ key, value }],
  });
  return record;
}

/**
 * Disconnect producer gracefully
 */
export async function disconnectProducer() {
  if (producer) {
    await producer.disconnect().catch(() => {});
    producer = null;
    console.log(`[Kafka Producer] Disconnected.`);
  }
}
