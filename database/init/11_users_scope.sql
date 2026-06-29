ALTER TABLE users
ADD COLUMN IF NOT EXISTS scope VARCHAR(50) NOT NULL DEFAULT 'main';

ALTER TABLE users
DROP CONSTRAINT IF EXISTS chk_users_scope;

ALTER TABLE users
ADD CONSTRAINT chk_users_scope
CHECK (scope IN ('main', 'division', 'battery'));

ALTER TABLE users
DROP CONSTRAINT IF EXISTS chk_users_role;

ALTER TABLE users
ADD CONSTRAINT chk_users_role
CHECK (role IN ('admin', 'operator', 'observer'));