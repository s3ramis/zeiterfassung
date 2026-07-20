CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  email_normalized text NOT NULL UNIQUE,
  display_name text NOT NULL,
  password_salt text NOT NULL,
  password_hash text NOT NULL,
  employee_name text NOT NULL,
  federal_state text NOT NULL DEFAULT 'DE-BY',
  annual_leave_days integer NOT NULL DEFAULT 30 CHECK (annual_leave_days >= 0),
  holiday_credit_mode text NOT NULL DEFAULT 'schedule' CHECK (holiday_credit_mode IN ('schedule', 'fixed8')),
  data_revision integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS time_events (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('CLOCK_IN', 'BREAK_START', 'BREAK_END', 'CLOCK_OUT')),
  occurred_at timestamptz NOT NULL,
  source text CHECK (source IS NULL OR source IN ('timer', 'manual')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS time_events_user_time_idx ON time_events(user_id, occurred_at);

CREATE TABLE IF NOT EXISTS absences (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  absence_type text NOT NULL CHECK (absence_type IN ('vacation', 'sick', 'overtime')),
  date_from date NOT NULL,
  date_to date NOT NULL,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL,
  CHECK (date_to >= date_from)
);
CREATE INDEX IF NOT EXISTS absences_user_range_idx ON absences(user_id, date_from, date_to);

CREATE TABLE IF NOT EXISTS work_plans (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  valid_from date NOT NULL,
  valid_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_to IS NULL OR valid_to >= valid_from)
);
CREATE INDEX IF NOT EXISTS work_plans_user_range_idx ON work_plans(user_id, valid_from, valid_to);

CREATE TABLE IF NOT EXISTS work_plan_days (
  work_plan_id uuid NOT NULL REFERENCES work_plans(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  minutes integer NOT NULL CHECK (minutes BETWEEN 0 AND 1440),
  PRIMARY KEY (work_plan_id, weekday)
);

CREATE TABLE IF NOT EXISTS daily_notes (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_date date NOT NULL,
  note text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, work_date)
);

CREATE TABLE IF NOT EXISTS holiday_cache (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cache_key text NOT NULL,
  loaded_at timestamptz NOT NULL,
  source text NOT NULL CHECK (source IN ('api', 'fallback')),
  holidays jsonb NOT NULL,
  PRIMARY KEY (user_id, cache_key)
);
