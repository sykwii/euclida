CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  login VARCHAR(100) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,

  full_name VARCHAR(255),
  role VARCHAR(50) NOT NULL DEFAULT 'operator',

  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);