// Run migration: node db/run_migration.js
import "dotenv/config";
import { readFileSync } from "fs";
import { db } from "./sql.js";

const sql = readFileSync(new URL("./migration_replay_sessions.sql", import.meta.url), "utf-8");

async function run() {
  try {
    await db.query(sql);
    console.log("✅ Migration applied: replay_sessions + sim table columns added.");
  } catch (err) {
    console.error("❌ Migration failed:", err.message);
  } finally {
    await db.end();
  }
}

run();
