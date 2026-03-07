const express = require('express');
const { pool } = require('../config/database');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

let legacyCategoryColumnExistsPromise;

async function hasLegacyCategoryColumn() {
  if (!legacyCategoryColumnExistsPromise) {
    legacyCategoryColumnExistsPromise = pool.query(`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'events' AND column_name = 'category'
      ) AS exists;
    `)
      .then(result => Boolean(result.rows[0]?.exists))
      .catch(() => false);
  }

  return legacyCategoryColumnExistsPromise;
}

async function syncLegacyEventCategories() {
  if (!(await hasLegacyCategoryColumn())) {
    return;
  }

  await pool.query(`
    UPDATE events
    SET event_category = category
    WHERE event_category IS NULL AND category IS NOT NULL;
  `);
}

async function getEventSelectFields() {
  const hasLegacyCategory = await hasLegacyCategoryColumn();
  const categoryExpression = hasLegacyCategory
    ? 'COALESCE(event_category, category)'
    : 'event_category';

  return `id, title, description, date, location, image_url, ${categoryExpression} AS event_category, ${categoryExpression} AS category, kind, created_by, created_at, updated_at`;
}

// Get all events
router.get('/', async (req, res) => {
  try {
    await syncLegacyEventCategories();
    const selectFields = await getEventSelectFields();
    const result = await pool.query(`
      SELECT ${selectFields}
      FROM events
      ORDER BY CASE WHEN kind = 'album' THEN 1 ELSE 0 END, date DESC NULLS LAST, created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single event
router.get('/:id', async (req, res) => {
  try {
    await syncLegacyEventCategories();
    const selectFields = await getEventSelectFields();
    const result = await pool.query(`SELECT ${selectFields} FROM events WHERE id = $1`, [req.params.id]);
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
    const { title, description, date, location, image_url, category, event_category, kind } = req.body;
    const resolvedKind = kind === 'album' ? 'album' : 'event';
    const resolvedCategory = event_category ?? category ?? (resolvedKind === 'event' ? 'Live' : null);

    if (!title) {
      return res.status(400).json({ error: 'Title required' });
    }

    if (resolvedKind === 'event' && !date) {
      return res.status(400).json({ error: 'Date required for events' });
    }

    const result = await pool.query(
      'INSERT INTO events (title, description, date, location, image_url, event_category, kind, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [title, description || null, date || null, location || null, image_url || null, resolvedCategory, resolvedKind, req.user.id]
    );

    result.rows[0].category = result.rows[0].event_category;

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update event (admin only)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { title, description, date, location, image_url, category, event_category, kind } = req.body;
    const resolvedKind = kind === 'album' ? 'album' : 'event';
    const resolvedCategory = event_category ?? category ?? (resolvedKind === 'event' ? 'Live' : null);

    if (!title) {
      return res.status(400).json({ error: 'Title required' });
    }

    if (resolvedKind === 'event' && !date) {
      return res.status(400).json({ error: 'Date required for events' });
    }

    const result = await pool.query(
      'UPDATE events SET title = $1, description = $2, date = $3, location = $4, image_url = $5, event_category = $6, kind = $7, updated_at = CURRENT_TIMESTAMP WHERE id = $8 RETURNING *',
      [title, description || null, date || null, location || null, image_url || null, resolvedCategory, resolvedKind, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    result.rows[0].category = result.rows[0].event_category;

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
