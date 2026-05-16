CREATE TABLE IF NOT EXISTS runtime_skill_discoveries (
  id text PRIMARY KEY,
  device_id text NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  source text NOT NULL,
  target_type text NOT NULL CHECK (target_type IN ('device', 'runtime', 'agent')),
  target_id text NOT NULL,
  target_name text,
  runtime_id text REFERENCES runtimes(id) ON DELETE SET NULL,
  agent_id text REFERENCES agents(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text NOT NULL,
  package_hash text NOT NULL,
  skill_path text NOT NULL,
  files jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_seen_at timestamptz,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS runtime_skill_discoveries_device_idx
  ON runtime_skill_discoveries (device_id);

CREATE INDEX IF NOT EXISTS runtime_skill_discoveries_target_idx
  ON runtime_skill_discoveries (target_type, target_id);
