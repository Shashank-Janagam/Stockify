import { getKafkaClient } from "./client.js";
import { TOPICS, PARTITION_COUNT, REPLICATION_FACTOR } from "./topics.js";

/**
 * Initializes and creates Kafka topics with 1 partition if they don't already exist.
 */
export async function initKafkaTopics() {
  const kafka = getKafkaClient("stockify-admin");
  const admin = kafka.admin();

  try {
    await admin.connect();
    const existingTopics = await admin.listTopics();

    const topicsToCreate = Object.values(TOPICS)
      .filter((t) => !existingTopics.includes(t))
      .map((topic) => ({
        topic,
        numPartitions: PARTITION_COUNT,
        replicationFactor: REPLICATION_FACTOR,
      }));

    if (topicsToCreate.length > 0) {
      console.log(`[Kafka Admin] Creating topics (1 partition each):`, topicsToCreate.map((t) => t.topic));
      await admin.createTopics({
        topics: topicsToCreate,
        waitForLeaders: true,
      });
      console.log(`[Kafka Admin] ✅ Topics created successfully.`);
    } else {
      console.log(`[Kafka Admin] ✅ All required topics exist (${Object.values(TOPICS).join(", ")}).`);
    }
  } catch (err) {
    console.error(`[Kafka Admin] ❌ Error initializing topics:`, err.message);
  } finally {
    await admin.disconnect().catch(() => {});
  }
}
