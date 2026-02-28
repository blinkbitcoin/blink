-- Add spending limits feature for API keys (rolling 24-hour window)
-- Limits are optional per API key and measured in satoshis
-- If no limit is configured for an API key, it has no spending restrictions (unlimited)

-- Table 1: Optional limit configuration per API key
CREATE TABLE api_key_limits (
  api_key_id UUID PRIMARY KEY REFERENCES identity_api_keys(id) ON DELETE CASCADE,
  daily_limit_sats BIGINT,
  weekly_limit_sats BIGINT,
  monthly_limit_sats BIGINT,
  annual_limit_sats BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT positive_daily_limit CHECK (daily_limit_sats IS NULL OR daily_limit_sats > 0),
  CONSTRAINT positive_weekly_limit CHECK (weekly_limit_sats IS NULL OR weekly_limit_sats > 0),
  CONSTRAINT positive_monthly_limit CHECK (monthly_limit_sats IS NULL OR monthly_limit_sats > 0),
  CONSTRAINT positive_annual_limit CHECK (annual_limit_sats IS NULL OR annual_limit_sats > 0),
  CONSTRAINT at_least_one_limit CHECK (
    daily_limit_sats IS NOT NULL OR
    weekly_limit_sats IS NOT NULL OR
    monthly_limit_sats IS NOT NULL OR
    annual_limit_sats IS NOT NULL
  )
);

COMMENT ON TABLE api_key_limits IS 'Optional spending limits per API key (rolling windows, in satoshis). If no row exists for an API key, it has no limit. Each limit is independent.';
COMMENT ON COLUMN api_key_limits.daily_limit_sats IS 'Maximum spending per rolling 24 hours in satoshis (e.g., 100000000 = 1 BTC)';
COMMENT ON COLUMN api_key_limits.weekly_limit_sats IS 'Maximum spending per rolling 7 days in satoshis';
COMMENT ON COLUMN api_key_limits.monthly_limit_sats IS 'Maximum spending per rolling 30 days in satoshis';
COMMENT ON COLUMN api_key_limits.annual_limit_sats IS 'Maximum spending per rolling 365 days in satoshis';

-- Table 2: Individual transaction records for rolling 24h calculation
CREATE TABLE api_key_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID NOT NULL REFERENCES identity_api_keys(id) ON DELETE CASCADE,
  amount_sats BIGINT NOT NULL,
  transaction_id VARCHAR,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT positive_amount CHECK (amount_sats > 0)
);

COMMENT ON TABLE api_key_transactions IS 'Individual transaction records for rolling window limit calculations. Records older than 400 days are periodically cleaned up.';
COMMENT ON COLUMN api_key_transactions.amount_sats IS 'Transaction amount in satoshis';
COMMENT ON COLUMN api_key_transactions.transaction_id IS 'Optional reference to the transaction ID from the main ledger';

-- Critical index for rolling window queries (WHERE created_at > NOW() - INTERVAL '24 hours')
CREATE INDEX idx_api_key_tx_window
  ON api_key_transactions(api_key_id, created_at DESC);

-- Index for cleanup job (delete transactions older than 48 hours)
-- Simple index on created_at for efficient cleanup queries
CREATE INDEX idx_api_key_tx_cleanup
  ON api_key_transactions(created_at);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at on api_key_limits
CREATE TRIGGER update_api_key_limits_updated_at
  BEFORE UPDATE ON api_key_limits
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
