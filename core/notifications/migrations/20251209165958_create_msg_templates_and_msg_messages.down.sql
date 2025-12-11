-- Add down migration script here

DROP INDEX IF EXISTS idx_msg_messages_status;
DROP INDEX IF EXISTS idx_msg_messages_username;
DROP INDEX IF EXISTS idx_msg_templates_name_language_code;

DROP TABLE IF EXISTS msg_messages;
DROP TABLE IF EXISTS msg_templates;
