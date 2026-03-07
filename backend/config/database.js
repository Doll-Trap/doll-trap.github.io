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
        date TIMESTAMP NOT NULL,
        location VARCHAR(255),
        image_url VARCHAR(255),
        event_category VARCHAR(100),
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

    // Photo folders table (for non-event albums)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS photo_folders (
        id SERIAL PRIMARY KEY,
        name VARCHAR(120) UNIQUE NOT NULL,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Photos table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS photos (
        id SERIAL PRIMARY KEY,
        event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
        folder_id INTEGER REFERENCES photo_folders(id) ON DELETE SET NULL,
        photo_url VARCHAR(255) NOT NULL,
        caption TEXT,
        member_tag VARCHAR(100),
        uploaded_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add folder_id column if it doesn't exist (migration for existing databases)
    try {
      await pool.query(`
        ALTER TABLE photos ADD COLUMN IF NOT EXISTS folder_id INTEGER REFERENCES photo_folders(id) ON DELETE SET NULL;
      `);
    } catch (e) {
      console.error('Migration: photos.folder_id ADD COLUMN failed:', e.message);
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

    // Create default "Others" folder if it doesn't exist
    try {
      const othersCheck = await pool.query(`SELECT id FROM photo_folders WHERE name = 'Others'`);
      if (othersCheck.rows.length === 0) {
        // Create without created_by to avoid foreign key issues
        await pool.query(`INSERT INTO photo_folders (name) VALUES ('Others')`);
        console.log('✅ Created default "Others" folder');
      } else {
        console.log('✅ "Others" folder already exists');
      }
    } catch (e) {
      console.error('Migration: Could not create default Others folder:', e.message);
    }

    // Assign photos without event_id or folder_id to Others folder
    try {
      const othersFolder = await pool.query(`SELECT id FROM photo_folders WHERE name = 'Others'`);
      if (othersFolder.rows.length > 0) {
        const othersFolderId = othersFolder.rows[0].id;
        const result = await pool.query(`
          UPDATE photos 
          SET folder_id = $1 
          WHERE event_id IS NULL AND folder_id IS NULL
        `, [othersFolderId]);
        console.log(`✅ Assigned ${result.rowCount} photos to Others folder`);
      }
    } catch (e) {
      console.error('Migration: Could not assign photos to Others folder:', e.message);
    }

    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
  }
};

module.exports = { pool, initDB };
