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
  deeplink_action TEXT,
  deeplink_screen TEXT,
  external_url TEXT,
  status VARCHAR CHECK (
    status IN (
      'invited',
      'banner_clicked',
      'invitation_info_completed',
      'kyc_initiated',
      'kyc_passed',
      'card_info_submitted',
      'card_approved',
      'invite_withdrawn',
      'kyc_failed',
      'card_denied'
    )
  ),
  UNIQUE (name, language_code)
);

CREATE TABLE msg_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR NOT NULL,
  status VARCHAR NOT NULL DEFAULT 'invited' CHECK (
    status IN (
      'invited',
      'banner_clicked',
      'invitation_info_completed',
      'kyc_initiated',
      'kyc_passed',
      'card_info_submitted',
      'card_approved',
      'invite_withdrawn',
      'kyc_failed',
      'card_denied'
    )
  ),
  sent_by VARCHAR NOT NULL,
  template_id UUID REFERENCES msg_templates(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (username)
);

CREATE TABLE msg_message_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  msg_message_id UUID NOT NULL REFERENCES msg_messages(id) ON DELETE CASCADE,
  status VARCHAR NOT NULL CHECK (
    status IN (
      'invited',
      'banner_clicked',
      'invitation_info_completed',
      'kyc_initiated',
      'kyc_passed',
      'card_info_submitted',
      'card_approved',
      'invite_withdrawn',
      'kyc_failed',
      'card_denied'
    )
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_msg_templates_name_language_code
  ON msg_templates (name, language_code);

CREATE INDEX idx_msg_messages_username
  ON msg_messages (username);

CREATE INDEX idx_msg_messages_status
  ON msg_messages (status);

CREATE INDEX idx_msg_messages_updated_at
  ON msg_messages (updated_at);

CREATE INDEX idx_msg_messages_template_id
  ON msg_messages (template_id);

CREATE INDEX idx_msg_message_history_msg_message_id
  ON msg_message_history (msg_message_id);

CREATE INDEX idx_msg_message_history_status
  ON msg_message_history (status);
