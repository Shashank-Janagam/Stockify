-- Migration: Replay Session System
-- Run this ONCE against your PostgreSQL database.
-- Existing live tables (orders, trades, positions, wallet_accounts) are NOT modified.

-- ─────────────────────────────────────────────────────────────
-- 1. Create replay_sessions table
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS replay_sessions (
  id              SERIAL PRIMARY KEY,
  user_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol          TEXT NOT NULL,
  replay_date     DATE NOT NULL,
  interval_used   TEXT NOT NULL DEFAULT '1m',
  initial_capital NUMERIC(18,2) NOT NULL DEFAULT 100000,
  current_cash    NUMERIC(18,2) NOT NULL DEFAULT 100000,
  status          TEXT NOT NULL DEFAULT 'RUNNING',  -- RUNNING, COMPLETED, FAILED
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_replay_sessions_user ON replay_sessions(user_id);

-- ─────────────────────────────────────────────────────────────
-- 2. Add replay_session_id to existing sim tables
--    (Safe: uses IF NOT EXISTS via DO block)
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='sim_positions' AND column_name='replay_session_id'
  ) THEN
    ALTER TABLE sim_positions
      ADD COLUMN replay_session_id INT REFERENCES replay_sessions(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='sim_orders' AND column_name='replay_session_id'
  ) THEN
    ALTER TABLE sim_orders
      ADD COLUMN replay_session_id INT REFERENCES replay_sessions(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='sim_trades' AND column_name='replay_session_id'
  ) THEN
    ALTER TABLE sim_trades
      ADD COLUMN replay_session_id INT REFERENCES replay_sessions(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sim_trades_session    ON sim_trades(replay_session_id);
CREATE INDEX IF NOT EXISTS idx_sim_positions_session ON sim_positions(replay_session_id);
CREATE INDEX IF NOT EXISTS idx_sim_orders_session    ON sim_orders(replay_session_id);
