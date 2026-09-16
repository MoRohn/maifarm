-- Migration: Event Outbox Pattern with Dead Letter Queue
-- Purpose: Implement guaranteed event delivery with retry and DLQ support
-- Version: 044
-- Date: 2025-10-08

-- Event outbox table for guaranteed delivery
CREATE TABLE IF NOT EXISTS event_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name VARCHAR(255) NOT NULL,
  event_data JSONB NOT NULL,
  aggregate_id VARCHAR(255), -- Farm ID, Agent ID, etc.
  aggregate_type VARCHAR(100), -- 'farm', 'agent', 'harvest', etc.

  -- Delivery tracking
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, processing, delivered, failed
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  last_attempt_at TIMESTAMP,
  next_retry_at TIMESTAMP,

  -- Metadata
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  delivered_at TIMESTAMP,
  error_message TEXT,

  -- Priority and ordering
  priority INTEGER NOT NULL DEFAULT 5, -- 1=highest, 10=lowest
  sequence_number BIGSERIAL,

  -- Idempotency
  idempotency_key VARCHAR(255) UNIQUE,

  -- Routing
  target_room VARCHAR(255),
  target_user_id VARCHAR(255),

  CONSTRAINT chk_outbox_status CHECK (status IN ('pending', 'processing', 'delivered', 'failed'))
);

-- Dead letter queue for failed events
CREATE TABLE IF NOT EXISTS event_dead_letter_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_outbox_id UUID REFERENCES event_outbox(id),
  event_name VARCHAR(255) NOT NULL,
  event_data JSONB NOT NULL,
  aggregate_id VARCHAR(255),
  aggregate_type VARCHAR(100),

  -- Failure details
  attempts INTEGER NOT NULL,
  last_error TEXT NOT NULL,
  error_stack TEXT,
  failure_reason VARCHAR(255),

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  failed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Recovery
  recovered BOOLEAN NOT NULL DEFAULT FALSE,
  recovered_at TIMESTAMP,
  recovery_method VARCHAR(100) -- 'manual', 'automatic', 'reprocessed'
);

-- Event delivery log for auditing
CREATE TABLE IF NOT EXISTS event_delivery_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id UUID REFERENCES event_outbox(id),
  event_name VARCHAR(255) NOT NULL,

  -- Delivery details
  socket_id VARCHAR(255) NOT NULL,
  user_id VARCHAR(255),
  room VARCHAR(255),

  -- Status
  delivered BOOLEAN NOT NULL,
  acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  ack_timeout_ms INTEGER,

  -- Timing
  sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ack_received_at TIMESTAMP,
  latency_ms INTEGER,

  -- Error tracking
  error TEXT,
  retry_number INTEGER NOT NULL DEFAULT 0,

  -- Metadata
  event_id VARCHAR(255),
  sequence_number BIGINT
);

-- OpenTelemetry trace spans
CREATE TABLE IF NOT EXISTS telemetry_spans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id VARCHAR(32) NOT NULL,
  span_id VARCHAR(16) NOT NULL,
  parent_span_id VARCHAR(16),

  -- Span details
  name VARCHAR(255) NOT NULL,
  kind VARCHAR(50) NOT NULL, -- 'server', 'client', 'internal', etc.
  status_code VARCHAR(50) NOT NULL DEFAULT 'ok', -- 'ok', 'error', 'unset'

  -- Timing
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP,
  duration_ms INTEGER,

  -- Attributes
  attributes JSONB,

  -- Service info
  service_name VARCHAR(255) NOT NULL DEFAULT 'maifarm-api',
  service_version VARCHAR(50),

  -- Resource
  resource_attributes JSONB,

  -- Events
  events JSONB, -- Array of span events

  -- Links
  links JSONB, -- Array of span links

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT chk_span_status CHECK (status_code IN ('ok', 'error', 'unset')),
  CONSTRAINT chk_span_kind CHECK (kind IN ('server', 'client', 'producer', 'consumer', 'internal'))
);

-- Performance metrics aggregation
CREATE TABLE IF NOT EXISTS performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name VARCHAR(255) NOT NULL,
  metric_type VARCHAR(50) NOT NULL, -- 'counter', 'gauge', 'histogram', 'summary'

  -- Values
  value NUMERIC NOT NULL,
  unit VARCHAR(50), -- 'ms', 'bytes', 'count', etc.

  -- Dimensions/tags
  tags JSONB,

  -- Aggregation
  timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  aggregation_window VARCHAR(50), -- '1m', '5m', '15m', '1h', '1d'

  -- Statistics (for histograms)
  min_value NUMERIC,
  max_value NUMERIC,
  avg_value NUMERIC,
  p50_value NUMERIC,
  p95_value NUMERIC,
  p99_value NUMERIC,
  sample_count INTEGER,

  CONSTRAINT chk_metric_type CHECK (metric_type IN ('counter', 'gauge', 'histogram', 'summary'))
);

-- Indexes for outbox pattern
CREATE INDEX IF NOT EXISTS idx_outbox_status_priority ON event_outbox(status, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_outbox_next_retry ON event_outbox(status, next_retry_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_outbox_aggregate ON event_outbox(aggregate_type, aggregate_id);
CREATE INDEX IF NOT EXISTS idx_outbox_sequence ON event_outbox(sequence_number);
CREATE INDEX IF NOT EXISTS idx_outbox_idempotency ON event_outbox(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Indexes for DLQ
CREATE INDEX IF NOT EXISTS idx_dlq_event_name ON event_dead_letter_queue(event_name);
CREATE INDEX IF NOT EXISTS idx_dlq_aggregate ON event_dead_letter_queue(aggregate_type, aggregate_id);
CREATE INDEX IF NOT EXISTS idx_dlq_recovered ON event_dead_letter_queue(recovered) WHERE NOT recovered;
CREATE INDEX IF NOT EXISTS idx_dlq_failed_at ON event_dead_letter_queue(failed_at);

-- Indexes for delivery log
CREATE INDEX IF NOT EXISTS idx_delivery_log_outbox ON event_delivery_log(outbox_id);
CREATE INDEX IF NOT EXISTS idx_delivery_log_event ON event_delivery_log(event_name, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_delivery_log_socket ON event_delivery_log(socket_id);
CREATE INDEX IF NOT EXISTS idx_delivery_log_user ON event_delivery_log(user_id) WHERE user_id IS NOT NULL;

-- Indexes for telemetry
CREATE INDEX IF NOT EXISTS idx_telemetry_trace ON telemetry_spans(trace_id, span_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_name ON telemetry_spans(name, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_service ON telemetry_spans(service_name, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_status ON telemetry_spans(status_code) WHERE status_code = 'error';

-- Indexes for performance metrics
CREATE INDEX IF NOT EXISTS idx_metrics_name_time ON performance_metrics(metric_name, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_tags ON performance_metrics USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_metrics_window ON performance_metrics(aggregation_window, timestamp DESC);

-- Function to move failed events to DLQ
CREATE OR REPLACE FUNCTION move_to_dlq()
RETURNS TRIGGER AS $$
BEGIN
  -- Only trigger when status changes to 'failed'
  IF NEW.status = 'failed' AND OLD.status != 'failed' THEN
    INSERT INTO event_dead_letter_queue (
      original_outbox_id,
      event_name,
      event_data,
      aggregate_id,
      aggregate_type,
      attempts,
      last_error,
      failure_reason
    ) VALUES (
      NEW.id,
      NEW.event_name,
      NEW.event_data,
      NEW.aggregate_id,
      NEW.aggregate_type,
      NEW.attempts,
      COALESCE(NEW.error_message, 'Unknown error'),
      'max_attempts_exceeded'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-move failed events to DLQ
DROP TRIGGER IF EXISTS trigger_move_to_dlq ON event_outbox;
CREATE TRIGGER trigger_move_to_dlq
  AFTER UPDATE ON event_outbox
  FOR EACH ROW
  EXECUTE FUNCTION move_to_dlq();

-- Function to clean up old delivered events
CREATE OR REPLACE FUNCTION cleanup_delivered_events(retention_days INTEGER DEFAULT 7)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM event_outbox
  WHERE status = 'delivered'
    AND delivered_at < CURRENT_TIMESTAMP - (retention_days || ' days')::INTERVAL;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to retry failed events from DLQ
CREATE OR REPLACE FUNCTION retry_dlq_event(dlq_id UUID)
RETURNS UUID AS $$
DECLARE
  new_outbox_id UUID;
BEGIN
  -- Insert back into outbox
  INSERT INTO event_outbox (
    event_name,
    event_data,
    aggregate_id,
    aggregate_type,
    target_room,
    status,
    attempts
  )
  SELECT
    event_name,
    event_data,
    aggregate_id,
    aggregate_type,
    NULL, -- Reset target room
    'pending',
    0 -- Reset attempts
  FROM event_dead_letter_queue
  WHERE id = dlq_id
  RETURNING id INTO new_outbox_id;

  -- Mark DLQ entry as recovered
  UPDATE event_dead_letter_queue
  SET recovered = TRUE,
      recovered_at = CURRENT_TIMESTAMP,
      recovery_method = 'manual'
  WHERE id = dlq_id;

  RETURN new_outbox_id;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON event_outbox TO maifarm;
GRANT SELECT, INSERT, UPDATE ON event_dead_letter_queue TO maifarm;
GRANT SELECT, INSERT ON event_delivery_log TO maifarm;
GRANT SELECT, INSERT ON telemetry_spans TO maifarm;
GRANT SELECT, INSERT, UPDATE ON performance_metrics TO maifarm;
GRANT USAGE ON SEQUENCE event_outbox_sequence_number_seq TO maifarm;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Migration 044: Event outbox, DLQ, and telemetry tables created successfully';
END $$;
