-- Add down migration script here

DROP INDEX IF EXISTS idx_msg_message_history_status;
DROP INDEX IF EXISTS idx_msg_message_history_msg_message_id;
DROP INDEX IF EXISTS idx_msg_messages_template_id;
DROP INDEX IF EXISTS idx_msg_messages_updated_at;
DROP INDEX IF EXISTS idx_msg_messages_status;
DROP INDEX IF EXISTS idx_msg_messages_username;
DROP INDEX IF EXISTS idx_msg_templates_name_language_code;

DROP TABLE IF EXISTS msg_message_history;
DROP TABLE IF EXISTS msg_messages;
DROP TABLE IF EXISTS msg_templates;
