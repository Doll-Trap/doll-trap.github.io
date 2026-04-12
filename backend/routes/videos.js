const express = require('express');
const { pool } = require('../config/database');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// GET all videos (public)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT v.id, v.title, v.url, v.description, v.event_id, v.thumbnail_url, v.created_at,
             e.title AS event_title
      FROM videos v
      LEFT JOIN events e ON v.event_id = e.id
      ORDER BY v.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET videos by event (public)
router.get('/event/:event_id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, title, url, description, event_id, thumbnail_url, created_at
       FROM videos WHERE event_id = $1 ORDER BY created_at DESC`,
      [req.params.event_id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create video (admin only)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { title, url, description, event_id, thumbnail_url } = req.body;
    if (!title || !url) return res.status(400).json({ error: 'Title and URL are required' });

    const result = await pool.query(
      `INSERT INTO videos (title, url, description, event_id, thumbnail_url)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [title, url, description || null, event_id || null, thumbnail_url || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT update video (admin only)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { title, url, description, event_id, thumbnail_url } = req.body;
    if (!title || !url) return res.status(400).json({ error: 'Title and URL are required' });

    const result = await pool.query(
      `UPDATE videos SET title=$1, url=$2, description=$3, event_id=$4, thumbnail_url=$5
       WHERE id=$6 RETURNING *`,
      [title, url, description || null, event_id || null, thumbnail_url || null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Video not found' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE video (admin only)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM videos WHERE id=$1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Video not found' });
    res.json({ message: 'Video deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
