const express = require('express');
const { pool } = require('../config/database');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Get all events
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, title, description, date, location, image_url, event_category, created_by, created_at, updated_at FROM events ORDER BY date DESC');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single event
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, title, description, date, location, image_url, event_category, created_by, created_at, updated_at FROM events WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create event (admin only)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { title, description, date, location, image_url, category, event_category } = req.body;
    const resolvedCategory = event_category ?? category ?? null;

    if (!title) {
      return res.status(400).json({ error: 'Title required' });
    }

    const result = await pool.query(
      'INSERT INTO events (title, description, date, location, image_url, event_category, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [title, description, date || null, location, image_url, resolvedCategory || 'Live', req.user.id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update event (admin only)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { title, description, date, location, image_url, category, event_category } = req.body;
    const resolvedCategory = event_category ?? category;

    const result = await pool.query(
      'UPDATE events SET title = COALESCE($1, title), description = COALESCE($2, description), date = COALESCE($3, date), location = COALESCE($4, location), image_url = COALESCE($5, image_url), event_category = COALESCE($6, event_category), updated_at = CURRENT_TIMESTAMP WHERE id = $7 RETURNING *',
      [title, description, date || null, location, image_url, resolvedCategory, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete event (admin only)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM events WHERE id = $1 RETURNING *', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    res.json({ message: 'Event deleted', event: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
