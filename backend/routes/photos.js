const express = require('express');
const multer = require('multer');
const path = require('path');
const { pool } = require('../config/database');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    
    // Check mimetype or file extension
    const ext = file.originalname.toLowerCase().slice(-4);
    const hasValidMime = allowedMimes.includes(file.mimetype);
    const hasValidExt = allowedExtensions.some(e => file.originalname.toLowerCase().endsWith(e));
    
    if (hasValidMime || hasValidExt) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF, WebP allowed'));
    }
  }
});

// Get all photos
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM photos ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get photos for specific event
router.get('/event/:event_id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM photos WHERE event_id = $1 ORDER BY created_at DESC',
      [req.params.event_id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload photo (admin only)
router.post('/', authMiddleware, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { event_id, caption, member_tag } = req.body;
    const photo_url = `/uploads/${req.file.filename}`;

    const result = await pool.query(
      'INSERT INTO photos (event_id, photo_url, caption, member_tag, uploaded_by) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [event_id || null, photo_url, caption || null, member_tag || 'Group', req.user.id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update photo (admin only)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { caption, member_tag, event_id } = req.body;

    const result = await pool.query(
      'UPDATE photos SET caption = $1, member_tag = $2, event_id = $3 WHERE id = $4 RETURNING *',
      [caption || null, member_tag || 'Group', event_id || null, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete photo (admin only)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM photos WHERE id = $1 RETURNING *', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    res.json({ message: 'Photo deleted', photo: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
