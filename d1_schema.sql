-- Cloudflare D1 Schema (SQLite) for Horus Leadership Meals
CREATE TABLE IF NOT EXISTS horus_app_state (
  id TEXT PRIMARY KEY,
  state_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  last_commit_message TEXT,
  updated_by TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS horus_commits_log (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  message TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_role TEXT NOT NULL,
  created_at TEXT NOT NULL
);
