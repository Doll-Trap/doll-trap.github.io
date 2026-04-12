/**
 * seed-test-user.js
 * Creates a test member account for portal testing.
 * Run: node seed-test-user.js
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool, initDB } = require('./config/database');

const TEST_USER = {
  display_name: 'Test Fan',
  email: 'test@dolltrap.com',
  password: 'test1234'
};

(async () => {
  try {
    // Make sure all tables exist first
    await initDB();

    // Check if already exists
    const existing = await pool.query(
      'SELECT id, display_name, email FROM members WHERE email = $1',
      [TEST_USER.email]
    );

    if (existing.rows.length > 0) {
      const u = existing.rows[0];
      console.log('ℹ️  Test user already exists:');
      console.log(`   ID:    ${u.id}`);
      console.log(`   Name:  ${u.display_name}`);
      console.log(`   Email: ${u.email}`);
      console.log(`   Pass:  ${TEST_USER.password}  (unchanged)`);
      process.exit(0);
    }

    const hash = await bcrypt.hash(TEST_USER.password, 10);
    const result = await pool.query(
      `INSERT INTO members (display_name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, display_name, email, created_at`,
      [TEST_USER.display_name, TEST_USER.email, hash]
    );
    const member = result.rows[0];

    console.log('✅  Test member created successfully!');
    console.log('─────────────────────────────────────');
    console.log(`   ID:    ${member.id}`);
    console.log(`   Name:  ${member.display_name}`);
    console.log(`   Email: ${member.email}`);
    console.log(`   Pass:  ${TEST_USER.password}`);
    console.log('─────────────────────────────────────');
    console.log('Use these credentials on the portal login page.');
  } catch (err) {
    console.error('❌  Error:', err.message);
  } finally {
    await pool.end();
  }
})();
