/**
 * index.js
 * Central entry point for Stockify Kafka Communication library.
 */

export { TOPICS, PARTITION_COUNT, REPLICATION_FACTOR } from "./topics.js";
export { getKafkaClient } from "./client.js";
export { initKafkaTopics } from "./admin.js";
export {
  getKafkaProducer,
  sendOrder,
  sendOrderExecuted,
  sendOrderFailed,
  disconnectProducer,
} from "./producer.js";
export { createKafkaConsumer } from "./consumer.js";
