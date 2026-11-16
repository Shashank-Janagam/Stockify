import { createRequire } from "module";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

let KafkaModule = null;
try {
  const localReq = createRequire(import.meta.url);
  KafkaModule = localReq("kafkajs");
} catch (_) {
  try {
    const cwdReq = createRequire(path.join(process.cwd(), "package.json"));
    KafkaModule = cwdReq("kafkajs");
  } catch (err) {
    throw new Error(
      "Cannot find package 'kafkajs'. Please run 'npm install' in Kafka-communication or your current application folder."
    );
  }
}

const { Kafka, logLevel } = KafkaModule;

let kafkaInstance = null;

export function getKafkaClient(clientId = "stockify-core") {
  if (!kafkaInstance) {
    const rawBrokers = process.env.KAFKA_BROKERS || "localhost:9092";
    const brokers = rawBrokers.split(",").map((b) => b.trim());

    kafkaInstance = new Kafka({
      clientId,
      brokers,
      logLevel: logLevel.WARN,
      retry: {
        initialRetryTime: 300,
        retries: 8,
      },
    });

    console.log(`[Kafka-Client] Initialized client "${clientId}" pointing to: ${brokers.join(", ")}`);
  }
  return kafkaInstance;
}
