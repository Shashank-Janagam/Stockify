import dotenv from "dotenv";
dotenv.config();

import {
  TOPICS,
  initKafkaTopics,
  createKafkaConsumer,
  sendOrderExecuted,
  sendOrderFailed,
  disconnectProducer,
} from "../Kafka-communication/index.js";

import { executeOrder } from "./services/orderExecutor.js";

const GROUP_ID = "order-execution-service-group";

async function startOrderExecutionService() {
  console.log(`=======================================================`);
  console.log(`🚀 Starting Centralized Order Execution Service`);
  console.log(`   Consumer Group : ${GROUP_ID}`);
  console.log(`   Listening Topic: ${TOPICS.ORDERS_INCOMING} (1 partition)`);
  console.log(`   Emits Topics   : ${TOPICS.ORDERS_EXECUTED}, ${TOPICS.ORDERS_FAILED}`);
  console.log(`=======================================================`);

  // 1. Initialize topics with 1 partition
  await initKafkaTopics();

  // 2. Start Kafka consumer for incoming orders
  let consumer = null;
  try {
    consumer = await createKafkaConsumer({
      groupId: GROUP_ID,
      topics: [TOPICS.ORDERS_INCOMING],
      fromBeginning: false,
      onMessage: async ({ topic, partition, key, payload }) => {
        if (!payload) return;

        console.log(`\n📥 [OrderExecution] Received ${payload.side} order for User: ${payload.userId || payload.userUid}, Symbol: ${payload.symbol}, Qty: ${payload.quantity}`);

        const result = await executeOrder(payload);

        if (result.success) {
          console.log(`📤 [OrderExecution] Emitting executed trade event to "${TOPICS.ORDERS_EXECUTED}"`);
          await sendOrderExecuted(result.data);
        } else {
          console.warn(`⚠️ [OrderExecution] Order execution rejected: ${result.message || result.error}`);
          console.log(`📤 [OrderExecution] Emitting failure event to "${TOPICS.ORDERS_FAILED}"`);
          await sendOrderFailed({
            ...payload,
            error: result.error,
            message: result.message,
            failedAt: new Date().toISOString(),
          });
        }
      },
    });

    console.log(`🎯 [OrderExecution] Actively listening for orders on ${TOPICS.ORDERS_INCOMING}...`);
  } catch (err) {
    console.error(`❌ [OrderExecution] Fatal startup error:`, err);
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async (signal) => {
    console.log(`\n🛑 [OrderExecution] Received ${signal}. Shutting down gracefully...`);
    try {
      if (consumer) await consumer.disconnect();
      await disconnectProducer();
    } catch (_) {}
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

startOrderExecutionService();
