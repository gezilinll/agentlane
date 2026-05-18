ALTER TABLE notification_deliveries
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_in_app_read_at
  ON notification_deliveries(recipient_user_id, thread_id, read_at)
  WHERE channel = 'in_app';
