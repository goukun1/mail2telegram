-- Bind every Telegram notification to the chat that received it, so the
-- reply-to-email command can only be triggered from the chat that actually
-- got the message (Telegram message ids are per-chat).
ALTER TABLE telegram_messages ADD COLUMN chat_id TEXT NOT NULL DEFAULT '';
