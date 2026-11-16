/**
 * topics.js
 * Centralized Kafka Topic definitions for the Stockify ecosystem.
 */

export const TOPICS = {
  ORDERS_INCOMING: "orders.incoming",
  ORDERS_EXECUTED: "orders.executed",
  ORDERS_FAILED: "orders.failed",
};

export const PARTITION_COUNT = 1;
export const REPLICATION_FACTOR = 1;
