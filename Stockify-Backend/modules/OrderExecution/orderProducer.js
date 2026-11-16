import { getKafkaProducer, TOPICS } from "../../kafka/index.js";

let isConnected = false;

/**
 * Initializes and warms up the Kafka Producer on backend server startup.
 */
export async function initOrderProducer() {
  try {
    const producer = await getKafkaProducer("stockify-backend-producer");
    isConnected = true;
    console.log(`[OrderProducer] ✅ Kafka Producer initialized and connected (Target Topic: ${TOPICS.ORDERS_INCOMING})`);
    return producer;
  } catch (err) {
    console.error(`[OrderProducer] ⚠️ Kafka Producer initial connection warning:`, err.message);
    return null;
  }
}

/**
 * Publishes an order (BUY or SELL) into the Kafka incoming orders queue.
 *
 * @param {Object} order - Order payload
 * @param {number} order.orderId - Database order ID
 * @param {number} order.userId - PostgreSQL User ID
 * @param {string} order.userUid - Firebase UID
 * @param {string} order.symbol - Stock Ticker symbol
 * @param {'BUY'|'SELL'} order.side - Order side
 * @param {number} order.quantity - Share quantity
 * @param {'Delivery'|'Intraday'} order.productType - Product type
 * @param {string} [order.category='REGULAR'] - Category
 * @param {number} [order.executionPrice] - Price snapshot
 * @returns {Promise<Object>} Kafka send metadata
 */
export async function publishOrderToQueue(order) {
  if (!order || !order.side || !order.symbol || !order.quantity) {
    throw new Error("Invalid order payload for Kafka queue");
  }

  const producer = await getKafkaProducer("stockify-backend-producer");

  // Partitioning key: User ID guarantees strict sequential execution per user
  const partitionKey = String(order.userId || order.userUid || "default");

  const messagePayload = {
    orderId: order.orderId,
    userId: order.userId,
    userUid: order.userUid,
    symbol: order.symbol,
    side: order.side.toUpperCase(),
    quantity: Number(order.quantity),
    productType: order.productType === "Intraday" ? "Intraday" : "Delivery",
    category: order.category || "REGULAR",
    executionPrice: order.executionPrice ? Number(order.executionPrice) : null,
    source: "stockify-backend-web",
    createdAt: new Date().toISOString(),
  };

  const record = await producer.send({
    topic: TOPICS.ORDERS_INCOMING,
    messages: [
      {
        key: partitionKey,
        value: JSON.stringify(messagePayload),
        headers: {
          source: "stockify-backend",
          correlationId: `order-${order.orderId || Date.now()}`,
        },
      },
    ],
  });

  console.log(
    `[OrderProducer] 📤 Published ${messagePayload.side} #${messagePayload.orderId || ""} ` +
    `(${messagePayload.quantity} ${messagePayload.symbol}) to queue "${TOPICS.ORDERS_INCOMING}" [key=${partitionKey}]`
  );

  return record;
}

export { TOPICS };
