ALTER TABLE operation_jobs
  DROP CONSTRAINT IF EXISTS operation_jobs_type_check;

ALTER TABLE operation_jobs
  ADD CONSTRAINT operation_jobs_type_check CHECK (type IN (
    'skill_import',
    'skill_publish',
    'skill_assign',
    'skill_sync',
    'agent_migration',
    'notification_in_app',
    'notification_email'
  ));

ALTER TABLE operation_jobs
  DROP CONSTRAINT IF EXISTS operation_jobs_status_check;

ALTER TABLE operation_jobs
  ADD CONSTRAINT operation_jobs_status_check CHECK (status IN (
    'queued',
    'running',
    'succeeded',
    'failed',
    'unsupported',
    'requires_manual_step',
    'cancelled'
  ));
