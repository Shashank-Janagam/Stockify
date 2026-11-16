import { getKafkaClient } from "./client.js";

/**
 * Creates and starts a resilient Kafka consumer.
 * @param {object} options
 * @param {string} options.groupId - Unique consumer group ID
 * @param {string[]} options.topics - Array of topic names to subscribe to
 * @param {Function} options.onMessage - Async handler: async ({ topic, partition, message, payload, key })
 * @param {boolean} [options.fromBeginning=false]
 */
export async function createKafkaConsumer({
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
  console.log(`[Kafka Consumer] ✅ Consumer "${groupId}" connected.`);

  for (const topic of topics) {
    await consumer.subscribe({ topic, fromBeginning });
    console.log(`[Kafka Consumer] Subscribed "${groupId}" to topic "${topic}".`);
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
        console.warn(`[Kafka Consumer] Failed to parse JSON value on ${topic}:`, rawValue);
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
        console.error(`[Kafka Consumer] ❌ Error in onMessage handler for ${topic}:`, err);
        // Do not crash the entire consumer loop
      }
    },
  });

  return consumer;
}
