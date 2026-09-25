ALTER TABLE stateful_notifications
ADD COLUMN bulletin_key VARCHAR(100),
ADD COLUMN bulletin_triggered_at TIMESTAMPTZ;

CREATE UNIQUE INDEX idx_stateful_notifications_active_bulletin_key
ON stateful_notifications (galoy_user_id, bulletin_key)
WHERE bulletin_key IS NOT NULL AND acknowledged IS NOT TRUE;

CREATE INDEX idx_stateful_notifications_bulletin_key_latest
ON stateful_notifications (galoy_user_id, bulletin_key, created_at DESC)
WHERE bulletin_key IS NOT NULL;

CREATE TABLE stateful_notification_bulletin_closures (
  galoy_user_id VARCHAR NOT NULL,
  bulletin_key VARCHAR(100) NOT NULL,
  closed_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (galoy_user_id, bulletin_key)
);
