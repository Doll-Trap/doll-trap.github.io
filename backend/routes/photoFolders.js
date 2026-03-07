const express = require('express');
const { pool } = require('../config/database');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Get all custom photo folders
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT f.id, f.name, f.created_at, COUNT(p.id)::int AS photo_count
      FROM photo_folders f
      LEFT JOIN photos p ON p.folder_id = f.id
      GROUP BY f.id
      ORDER BY f.created_at DESC
    `);

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create custom photo folder (admin only)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Folder name is required' });
    }

    const normalizedName = name.trim();

    const result = await pool.query(
      'INSERT INTO photo_folders (name, created_by) VALUES ($1, $2) RETURNING *',
      [normalizedName, req.user.id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Folder already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});

// Delete folder (admin only) - photos become unassigned folder-wise
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM photo_folders WHERE id = $1 RETURNING *', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    res.json({ message: 'Folder deleted', folder: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
