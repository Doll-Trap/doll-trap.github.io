const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: {
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
        category VARCHAR(100) DEFAULT 'Live',
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add category column if it doesn't exist (migration for existing databases)
    try {
      await pool.query(`
        ALTER TABLE events ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'Live';
      `);
    } catch (e) {
      // Column might already exist, continue
    }

    // Photos table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS photos (
        id SERIAL PRIMARY KEY,
        event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
        photo_url VARCHAR(255) NOT NULL,
        caption TEXT,
        category VARCHAR(100) DEFAULT 'Performance',
        member_tag VARCHAR(100),
        uploaded_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Add category column if it doesn't exist (migration for existing databases)
    try {
      await pool.query(`
        ALTER TABLE photos ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'Performance';
      `);
    } catch (e) {
      // Column might already exist, continue
    }
    
    // Add member_tag column if it doesn't exist (migration for existing databases)
    try {
      await pool.query(`
        ALTER TABLE photos ADD COLUMN IF NOT EXISTS member_tag VARCHAR(100);
      `);
    } catch (e) {
      // Column might already exist, continue
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
