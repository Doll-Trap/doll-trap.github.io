const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_HOST === 'postgres' ? false : {
    rejectUnauthorized: false
  }
});

// Initialize database tables
const initDB = async () => {
  try {
    // Users table (for admin accounts)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        email VARCHAR(100) UNIQUE,
        role VARCHAR(50) DEFAULT 'admin',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Events table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        date TIMESTAMP,
        location VARCHAR(255),
        image_url VARCHAR(255),
        event_category VARCHAR(100),
        kind VARCHAR(20) NOT NULL DEFAULT 'event',
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add event_category column if it doesn't exist (migration for existing databases)
    try {
      await pool.query(`
        ALTER TABLE events ADD COLUMN IF NOT EXISTS event_category VARCHAR(100);
      `);
    } catch (e) {
      console.error('Migration: events.category ADD COLUMN failed, retrying:', e.message);
      try {
        await pool.query(`ALTER TABLE events ADD COLUMN category VARCHAR(100) DEFAULT 'Live';`);
      } catch (e2) {
        // Column already exists, safe to ignore
      }
    }

    try {
      await pool.query(`
        UPDATE events
        SET event_category = COALESCE(event_category, category)
        WHERE event_category IS NULL AND category IS NOT NULL;
      `);
    } catch (e) {
      // Legacy category column may not exist, safe to ignore
    }

    try {
      await pool.query(`
        ALTER TABLE events ADD COLUMN IF NOT EXISTS kind VARCHAR(20) DEFAULT 'event';
      `);
      await pool.query(`
        UPDATE events
        SET kind = 'album'
        WHERE date IS NULL OR LOWER(COALESCE(event_category, '')) = 'album';
      `);
      await pool.query(`
        UPDATE events
        SET kind = 'event'
        WHERE kind IS NULL OR kind NOT IN ('event', 'album');
      `);
      await pool.query(`
        ALTER TABLE events ALTER COLUMN kind SET DEFAULT 'event';
      `);
      await pool.query(`
        ALTER TABLE events ALTER COLUMN kind SET NOT NULL;
      `);
    } catch (e) {
      console.error('Migration: events.kind migration failed:', e.message);
    }

    // Photos table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS photos (
        id SERIAL PRIMARY KEY,
        event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
        photo_url TEXT NOT NULL,
        caption TEXT,
        member_tag VARCHAR(100),
        uploaded_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Migrate photo_url column from VARCHAR(255) to TEXT for long Supabase URLs
    try {
      await pool.query(`
        ALTER TABLE photos ALTER COLUMN photo_url TYPE TEXT;
      `);
    } catch (e) {
      // Column might already be TEXT, safe to ignore
    }

    // Remove photo_category column (migration)
    try {
      await pool.query(`
        ALTER TABLE photos DROP COLUMN IF EXISTS photo_category;
      `);
    } catch (e) {
      console.error('Migration: photos.photo_category DROP COLUMN failed:', e.message);
    }
    
    // Add member_tag column if it doesn't exist (migration for existing databases)
    try {
      await pool.query(`
        ALTER TABLE photos ADD COLUMN IF NOT EXISTS member_tag VARCHAR(100);
      `);
    } catch (e) {
      // Column might already exist, continue
    }

    // Remove old category column if it still exists (migration)
    try {
      await pool.query(`
        ALTER TABLE photos DROP COLUMN IF EXISTS category;
      `);
    } catch (e) {
      // Column might not exist, continue
    }

    try {
      await pool.query(`
        ALTER TABLE photos DROP COLUMN IF EXISTS folder_id;
      `);
    } catch (e) {
      console.error('Migration: photos.folder_id DROP COLUMN failed:', e.message);
    }

    try {
      await pool.query(`
        DROP TABLE IF EXISTS photo_folders;
      `);
    } catch (e) {
      console.error('Migration: photo_folders DROP TABLE failed:', e.message);
    }

    // Make date column nullable for albums (events without dates) - migration
    try {
      await pool.query(`
        ALTER TABLE events ALTER COLUMN date DROP NOT NULL;
      `);
    } catch (e) {
      console.error('Migration: events.date DROP NOT NULL failed:', e.message);
    }

    // Future: Game features tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS game_users (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        points INTEGER DEFAULT 0,
        level INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS inventory (
        id SERIAL PRIMARY KEY,
        game_user_id INTEGER REFERENCES game_users(id) ON DELETE CASCADE,
        item_id VARCHAR(100),
        quantity INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
  }
};

module.exports = { pool, initDB };
