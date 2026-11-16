import dotenv from "dotenv";
dotenv.config();

import { getKafkaClient } from "./client.js";
import { TOPICS, PARTITION_COUNT, REPLICATION_FACTOR } from "./topics.js";

async function initializeKafkaWithRetry() {
  const brokers = process.env.KAFKA_BROKERS || "localhost:9092";
  console.log("=======================================================");
  console.log("🚀 Stockify Kafka Initialization");
  console.log(`   Target Brokers : ${brokers}`);
  console.log(`   Partition Count: ${PARTITION_COUNT}`);
  console.log(`   Target Topics  : ${Object.values(TOPICS).join(", ")}`);
  console.log("=======================================================");

  const kafka = getKafkaClient("stockify-kafka-init");
  const admin = kafka.admin();

  const maxAttempts = 30;
  let attempt = 0;
  let connected = false;

  while (attempt < maxAttempts && !connected) {
    attempt++;
    try {
      console.log(`[Kafka-Init] Attempt ${attempt}/${maxAttempts}: Connecting to Kafka broker (${brokers})...`);
      await admin.connect();
      connected = true;
      console.log(`[Kafka-Init] ✅ Connected to Kafka admin successfully!`);
    } catch (err) {
      console.warn(`[Kafka-Init] ⏳ Broker not ready yet (${err.message}). Retrying in 2s...`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  if (!connected) {
    console.error(`[Kafka-Init] ❌ Fatal: Unable to connect to Kafka broker after ${maxAttempts} attempts.`);
    process.exit(1);
  }

  try {
    const existingTopics = await admin.listTopics();
    console.log(`[Kafka-Init] Current topics in cluster:`, existingTopics);

    const topicsToCreate = Object.values(TOPICS)
      .filter((t) => !existingTopics.includes(t))
      .map((topic) => ({
        topic,
        numPartitions: PARTITION_COUNT,
        replicationFactor: REPLICATION_FACTOR,
      }));

    if (topicsToCreate.length > 0) {
      console.log(`[Kafka-Init] 🔨 Creating missing topics (1 partition each):`, topicsToCreate.map((t) => t.topic));
      await admin.createTopics({
        topics: topicsToCreate,
        waitForLeaders: true,
      });
      console.log(`[Kafka-Init] ✅ Successfully created topics:`, topicsToCreate.map((t) => t.topic).join(", "));
    } else {
      console.log(`[Kafka-Init] ✅ All required topics already exist.`);
    }

    // Verify metadata
    const metadata = await admin.fetchTopicMetadata({ topics: Object.values(TOPICS) });
    console.log(`[Kafka-Init] 📋 Verified Topic Metadata:`);
    metadata.topics.forEach((t) => {
      console.log(`   - Topic "${t.name}": ${t.partitions.length} partition(s)`);
    });

    console.log("=======================================================");
    console.log("🎉 Kafka initialization completed successfully!");
    console.log("=======================================================");
  } catch (err) {
    console.error(`[Kafka-Init] ❌ Error configuring topics:`, err.message);
    process.exit(1);
  } finally {
    await admin.disconnect().catch(() => {});
  }

  process.exit(0);
}

initializeKafkaWithRetry();
