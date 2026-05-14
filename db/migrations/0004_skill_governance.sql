CREATE TABLE IF NOT EXISTS resource_permissions (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  resource_type text NOT NULL CHECK (resource_type IN ('skill', 'device', 'runtime', 'agent')),
  resource_id text NOT NULL,
  subject_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission text NOT NULL CHECK (permission IN (
    'view',
    'edit',
    'publish',
    'archive',
    'manage_access',
    'manage_skills'
  )),
  granted_by_user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, resource_type, resource_id, subject_user_id, permission)
);

CREATE INDEX IF NOT EXISTS idx_resource_permissions_organization_id ON resource_permissions(organization_id);
CREATE INDEX IF NOT EXISTS idx_resource_permissions_subject_user_id ON resource_permissions(subject_user_id);
CREATE INDEX IF NOT EXISTS idx_resource_permissions_resource ON resource_permissions(resource_type, resource_id);

CREATE TABLE IF NOT EXISTS approval_requests (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN (
    'publish_skill',
    'assign_skill',
    'sync_skill',
    'archive_skill',
    'delete_skill'
  )),
  skill_id text REFERENCES skills(id) ON DELETE CASCADE,
  skill_version_id text REFERENCES skill_versions(id) ON DELETE RESTRICT,
  target_type text CHECK (target_type IN ('device', 'runtime', 'agent')),
  target_id text,
  risk_level text NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'blocked')),
  risk_summary text NOT NULL,
  requested_reason text,
  snapshot_hash text NOT NULL,
  requested_by_user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  required_role text NOT NULL DEFAULT 'admin' CHECK (required_role IN ('owner', 'admin')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_by_user_id text REFERENCES users(id) ON DELETE RESTRICT,
  resolution_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_approval_requests_organization_id ON approval_requests(organization_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_approval_requests_skill_id ON approval_requests(skill_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_target ON approval_requests(target_type, target_id);
