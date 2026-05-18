ALTER TABLE operations DROP CONSTRAINT IF EXISTS operations_type_check;
ALTER TABLE operations ADD CONSTRAINT operations_type_check CHECK (type IN (
  'device_refresh',
  'agent_skill_probe',
  'notification_delivery'
));

CREATE TABLE IF NOT EXISTS agent_skill_probe_snapshots (
  id text PRIMARY KEY,
  device_id text NOT NULL,
  runtime_id text NOT NULL,
  agent_id text NOT NULL,
  status text NOT NULL CHECK (status IN (
    'unknown',
    'requested',
    'succeeded',
    'unsupported',
    'failed',
    'device_disconnected'
  )),
  observed_at timestamptz,
  probed_at timestamptz,
  operation_id text REFERENCES operations(id) ON DELETE SET NULL,
  command_id text,
  error_summary text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_skill_probe_snapshots_agent_id
  ON agent_skill_probe_snapshots(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_skill_probe_snapshots_device_id
  ON agent_skill_probe_snapshots(device_id);
CREATE INDEX IF NOT EXISTS idx_agent_skill_probe_snapshots_status
  ON agent_skill_probe_snapshots(status);
