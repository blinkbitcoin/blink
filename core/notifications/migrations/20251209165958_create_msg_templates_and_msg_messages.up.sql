-- Add up migration script here

CREATE TABLE msg_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  language_code VARCHAR NOT NULL,
  icon_name VARCHAR NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  should_send_push BOOLEAN NOT NULL DEFAULT FALSE,
  should_add_to_history BOOLEAN NOT NULL DEFAULT FALSE,
  should_add_to_bulletin BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (name, language_code)
);

CREATE TABLE msg_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR NOT NULL,
  status VARCHAR NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
  sent_by VARCHAR NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_msg_templates_name_language_code
  ON msg_templates (name, language_code);

CREATE INDEX idx_msg_messages_username
  ON msg_messages (username);

CREATE INDEX idx_msg_messages_status
  ON msg_messages (status);
