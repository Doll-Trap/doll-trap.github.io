-- Cloudflare D1 schema (SQLite)
-- Run: npx wrangler d1 execute dolltrap-db --file=schema.sql

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  email TEXT UNIQUE,
  role TEXT DEFAULT 'admin',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  date DATETIME,
  end_time TEXT,
  location TEXT,
  image_url TEXT,
  event_category TEXT,
  kind TEXT NOT NULL DEFAULT 'event',
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER REFERENCES events(id),
  photo_url TEXT NOT NULL,
  caption TEXT,
  member_tag TEXT,
  uploaded_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT,
  event_id INTEGER REFERENCES events(id),
  thumbnail_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  display_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  avatar_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS member_saved_events (
  member_id INTEGER NOT NULL REFERENCES members(id),
  event_id INTEGER NOT NULL REFERENCES events(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (member_id, event_id)
);

CREATE TABLE IF NOT EXISTS member_saved_photos (
  member_id INTEGER NOT NULL REFERENCES members(id),
  photo_id INTEGER NOT NULL REFERENCES photos(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (member_id, photo_id)
);

CREATE TABLE IF NOT EXISTS member_checkins (
  member_id INTEGER NOT NULL REFERENCES members(id),
  event_id INTEGER NOT NULL REFERENCES events(id),
  checked_in_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (member_id, event_id)
);

CREATE TABLE IF NOT EXISTS member_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  idol_name TEXT NOT NULL,
  member_id INTEGER REFERENCES members(id),
  display_name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS member_cheers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  idol_name TEXT NOT NULL,
  session_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (idol_name, session_id)
);

CREATE TABLE IF NOT EXISTS game_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  points INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_user_id INTEGER REFERENCES game_users(id),
  item_id TEXT,
  quantity INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
