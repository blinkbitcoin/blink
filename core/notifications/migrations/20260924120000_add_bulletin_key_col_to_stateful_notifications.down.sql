DROP TABLE IF EXISTS stateful_notification_bulletin_closures;

DROP INDEX IF EXISTS idx_stateful_notifications_bulletin_key_latest;
DROP INDEX IF EXISTS idx_stateful_notifications_active_bulletin_key;

ALTER TABLE stateful_notifications
DROP COLUMN IF EXISTS bulletin_triggered_at,
DROP COLUMN IF EXISTS bulletin_key;
