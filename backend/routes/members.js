const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const memberAuth = require('../middleware/memberAuth');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// ── Register ──────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { display_name, email, password } = req.body;
    if (!display_name || !email || !password)
      return res.status(400).json({ error: 'Display name, email and password required' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const existing = await pool.query('SELECT id FROM members WHERE email = $1', [email]);
    if (existing.rows.length > 0)
      return res.status(409).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO members (display_name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, display_name, email, created_at',
      [display_name, email, hash]
    );
    const member = result.rows[0];
    const token = jwt.sign({ id: member.id, email: member.email, display_name: member.display_name, type: 'member' }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.status(201).json({ token, member });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Login ─────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email and password required' });

    const result = await pool.query('SELECT * FROM members WHERE email = $1', [email]);
    if (result.rows.length === 0)
      return res.status(401).json({ error: 'Invalid email or password' });

    const member = result.rows[0];
    const match = await bcrypt.compare(password, member.password_hash);
    if (!match)
      return res.status(401).json({ error: 'Invalid email or password' });

    const token = jwt.sign({ id: member.id, email: member.email, display_name: member.display_name, type: 'member' }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, member: { id: member.id, display_name: member.display_name, email: member.email } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Verify ────────────────────────────────────────────────────
router.get('/verify', memberAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, display_name, email, avatar_url, created_at FROM members WHERE id = $1',
      [req.member.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Member not found' });
    res.json({ valid: true, member: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Update profile ────────────────────────────────────────────
router.put('/profile', memberAuth, async (req, res) => {
  try {
    const { display_name } = req.body;
    if (!display_name) return res.status(400).json({ error: 'Display name required' });
    const result = await pool.query(
      'UPDATE members SET display_name = $1 WHERE id = $2 RETURNING id, display_name, email',
      [display_name, req.member.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Change password ───────────────────────────────────────────
router.post('/change-password', memberAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Both passwords required' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
    const result = await pool.query('SELECT password_hash FROM members WHERE id = $1', [req.member.id]);
    const match = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!match) return res.status(400).json({ error: 'Current password is incorrect' });
    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE members SET password_hash = $1 WHERE id = $2', [hash, req.member.id]);
    res.json({ message: 'Password updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Saved Events ──────────────────────────────────────────────
router.get('/saves/events', memberAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT e.id, e.title, e.date, e.location, e.image_url, e.event_category, e.kind,
              s.created_at AS saved_at
       FROM member_saved_events s
       JOIN events e ON s.event_id = e.id
       WHERE s.member_id = $1
       ORDER BY s.created_at DESC`,
      [req.member.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/saves/events/:event_id', memberAuth, async (req, res) => {
  try {
    await pool.query(
      'INSERT INTO member_saved_events (member_id, event_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.member.id, req.params.event_id]
    );
    res.json({ saved: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/saves/events/:event_id', memberAuth, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM member_saved_events WHERE member_id = $1 AND event_id = $2',
      [req.member.id, req.params.event_id]
    );
    res.json({ saved: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Saved Photos ──────────────────────────────────────────────
router.get('/saves/photos', memberAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.id, p.photo_url, p.caption, p.member_tag, p.event_id,
              e.title AS event_title,
              s.created_at AS saved_at
       FROM member_saved_photos s
       JOIN photos p ON s.photo_id = p.id
       LEFT JOIN events e ON p.event_id = e.id
       WHERE s.member_id = $1
       ORDER BY s.created_at DESC`,
      [req.member.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/saves/photos/:photo_id', memberAuth, async (req, res) => {
  try {
    await pool.query(
      'INSERT INTO member_saved_photos (member_id, photo_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.member.id, req.params.photo_id]
    );
    res.json({ saved: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/saves/photos/:photo_id', memberAuth, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM member_saved_photos WHERE member_id = $1 AND photo_id = $2',
      [req.member.id, req.params.photo_id]
    );
    res.json({ saved: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Check-ins ─────────────────────────────────────────────────
router.get('/checkins', memberAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT e.id, e.title, e.date, e.location, e.image_url, e.event_category,
              c.checked_in_at
       FROM member_checkins c
       JOIN events e ON c.event_id = e.id
       WHERE c.member_id = $1
       ORDER BY e.date DESC NULLS LAST`,
      [req.member.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/checkins/:event_id', memberAuth, async (req, res) => {
  try {
    // Verify the event exists and has already started
    const eventResult = await pool.query(
      'SELECT date FROM events WHERE id = $1',
      [req.params.event_id]
    );
    if (eventResult.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }
    const eventDate = eventResult.rows[0].date;
    if (!eventDate || new Date(eventDate) > new Date()) {
      return res.status(400).json({ error: 'Check-in is only available after the event has started' });
    }

    await pool.query(
      'INSERT INTO member_checkins (member_id, event_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.member.id, req.params.event_id]
    );
    res.json({ checked_in: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/checkins/:event_id', memberAuth, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM member_checkins WHERE member_id = $1 AND event_id = $2',
      [req.member.id, req.params.event_id]
    );
    res.json({ checked_in: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Get my saved/checkin state for a batch of events ─────────
router.post('/my-status', memberAuth, async (req, res) => {
  try {
    const { event_ids, photo_ids } = req.body;
    const savedEvents = event_ids?.length
      ? (await pool.query('SELECT event_id FROM member_saved_events WHERE member_id=$1 AND event_id=ANY($2)', [req.member.id, event_ids])).rows.map(r => r.event_id)
      : [];
    const checkedEvents = event_ids?.length
      ? (await pool.query('SELECT event_id FROM member_checkins WHERE member_id=$1 AND event_id=ANY($2)', [req.member.id, event_ids])).rows.map(r => r.event_id)
      : [];
    const savedPhotos = photo_ids?.length
      ? (await pool.query('SELECT photo_id FROM member_saved_photos WHERE member_id=$1 AND photo_id=ANY($2)', [req.member.id, photo_ids])).rows.map(r => r.photo_id)
      : [];
    res.json({ savedEvents, checkedEvents, savedPhotos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Fan Messages ────────────────────────────────────────────
// GET /messages/mine  — own messages across all idols
router.get('/messages/mine', memberAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, idol_name, display_name, content, created_at FROM member_messages WHERE member_id = $1 ORDER BY created_at DESC',
      [req.member.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /messages/:id  — edit own message
router.put('/messages/:id', memberAuth, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'Message cannot be empty' });
    if (content.length > 300) return res.status(400).json({ error: 'Message too long (max 300 characters)' });
    const result = await pool.query(
      'UPDATE member_messages SET content = $1 WHERE id = $2 AND member_id = $3 RETURNING *',
      [content.trim(), req.params.id, req.member.id]
    );
    if (result.rows.length === 0) return res.status(403).json({ error: 'Not found or not yours' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/messages/:idol_name', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, idol_name, member_id, display_name, content, created_at FROM member_messages WHERE LOWER(idol_name) = LOWER($1) ORDER BY created_at DESC LIMIT 100',
      [req.params.idol_name]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/messages/:idol_name', memberAuth, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'Message cannot be empty' });
    if (content.length > 300) return res.status(400).json({ error: 'Message too long (max 300 characters)' });
    const result = await pool.query(
      'INSERT INTO member_messages (idol_name, member_id, display_name, content) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.params.idol_name, req.member.id, req.member.display_name, content.trim()]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/messages/:id', memberAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM member_messages WHERE id = $1 AND member_id = $2 RETURNING id',
      [req.params.id, req.member.id]
    );
    if (result.rows.length === 0) return res.status(403).json({ error: 'Not found or not yours' });
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: delete any message
router.delete('/messages/admin/:id', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM member_messages WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Message not found' });
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Cheers ───────────────────────────────────────────────────────────
// GET /cheers/:idol_name?session_id=xxx  →  { count, cheered }
router.get('/cheers/:idol_name', async (req, res) => {
  try {
    const { idol_name } = req.params;
    const { session_id } = req.query;
    const countRes = await pool.query(
      'SELECT COUNT(*) FROM member_cheers WHERE idol_name = $1',
      [idol_name]
    );
    const count = parseInt(countRes.rows[0].count, 10);
    let cheered = false;
    if (session_id) {
      const cheerRes = await pool.query(
        'SELECT 1 FROM member_cheers WHERE idol_name = $1 AND session_id = $2',
        [idol_name, session_id]
      );
      cheered = cheerRes.rows.length > 0;
    }
    res.json({ count, cheered });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /cheers/:idol_name  body: { session_id }  →  toggle cheer
router.post('/cheers/:idol_name', async (req, res) => {
  try {
    const { idol_name } = req.params;
    const { session_id } = req.body;
    if (!session_id) return res.status(400).json({ error: 'session_id required' });
    const existing = await pool.query(
      'SELECT id FROM member_cheers WHERE idol_name = $1 AND session_id = $2',
      [idol_name, session_id]
    );
    if (existing.rows.length > 0) {
      // Un-cheer
      await pool.query('DELETE FROM member_cheers WHERE idol_name = $1 AND session_id = $2', [idol_name, session_id]);
    } else {
      await pool.query('INSERT INTO member_cheers (idol_name, session_id) VALUES ($1, $2)', [idol_name, session_id]);
    }
    const countRes = await pool.query('SELECT COUNT(*) FROM member_cheers WHERE idol_name = $1', [idol_name]);
    res.json({ count: parseInt(countRes.rows[0].count, 10), cheered: existing.rows.length === 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
