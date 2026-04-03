-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  type VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  channels TEXT[] DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'pending',
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  delivered_at TIMESTAMP,
  metadata JSONB
);

-- Index for fetching notifications by user
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);

-- Composite index for unread count queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read);
