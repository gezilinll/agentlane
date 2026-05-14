CREATE TABLE IF NOT EXISTS skills (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  slug text NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  owner_user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  source jsonb NOT NULL DEFAULT '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_skills_organization_id ON skills(organization_id);
CREATE INDEX IF NOT EXISTS idx_skills_owner_user_id ON skills(owner_user_id);

CREATE TABLE IF NOT EXISTS skill_versions (
  id text PRIMARY KEY,
  skill_id text NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  version text NOT NULL,
  package_hash text NOT NULL,
  summary text,
  created_by_user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  published_by_user_id text REFERENCES users(id) ON DELETE RESTRICT,
  published_at timestamptz,
  validation_status text NOT NULL CHECK (validation_status IN ('passed', 'warning', 'blocked')),
  validation_result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (skill_id, version)
);

CREATE INDEX IF NOT EXISTS idx_skill_versions_skill_id_created_at ON skill_versions(skill_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_skill_versions_package_hash ON skill_versions(package_hash);

CREATE TABLE IF NOT EXISTS skill_files (
  id text PRIMARY KEY,
  skill_version_id text NOT NULL REFERENCES skill_versions(id) ON DELETE CASCADE,
  path text NOT NULL,
  content_hash text NOT NULL,
  size_bytes integer NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (skill_version_id, path)
);

CREATE INDEX IF NOT EXISTS idx_skill_files_skill_version_id ON skill_files(skill_version_id);

CREATE TABLE IF NOT EXISTS skill_assignments (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  skill_id text NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  skill_version_id text NOT NULL REFERENCES skill_versions(id) ON DELETE RESTRICT,
  target_type text NOT NULL CHECK (target_type IN ('device', 'runtime', 'agent')),
  target_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending_review' CHECK (status IN (
    'pending_review',
    'approved',
    'syncing',
    'synced',
    'failed',
    'unsupported',
    'disabled'
  )),
  created_by_user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approved_by_user_id text REFERENCES users(id) ON DELETE RESTRICT,
  last_sync_job_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, skill_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_skill_assignments_organization_id ON skill_assignments(organization_id);
CREATE INDEX IF NOT EXISTS idx_skill_assignments_target ON skill_assignments(target_type, target_id);

CREATE TABLE IF NOT EXISTS skill_sync_jobs (
  id text PRIMARY KEY,
  assignment_id text REFERENCES skill_assignments(id) ON DELETE SET NULL,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('sync', 'remove', 'verify')),
  target_type text NOT NULL CHECK (target_type IN ('device', 'runtime', 'agent')),
  target_id text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'unsupported')),
  command_id text,
  package_hash text,
  started_at timestamptz,
  finished_at timestamptz,
  error_summary text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_skill_sync_jobs_assignment_id ON skill_sync_jobs(assignment_id);
CREATE INDEX IF NOT EXISTS idx_skill_sync_jobs_organization_id ON skill_sync_jobs(organization_id);

ALTER TABLE skill_assignments
  ADD CONSTRAINT fk_skill_assignments_last_sync_job
  FOREIGN KEY (last_sync_job_id) REFERENCES skill_sync_jobs(id) ON DELETE SET NULL;
