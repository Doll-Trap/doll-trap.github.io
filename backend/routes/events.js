const express = require('express');
const multer = require('multer');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { pool } = require('../config/database');
const authMiddleware = require('../middleware/auth');

const posterUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif'];
    const hasValidMime = allowedMimes.includes(file.mimetype);
    const hasValidExt = allowedExtensions.some(e => file.originalname.toLowerCase().endsWith(e));
    if (hasValidMime || hasValidExt) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF, WebP allowed'));
    }
  }
});

const router = express.Router();

// Supabase client (module-level, reused across requests)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
let _supabaseClient = null;
function getSupabaseClient() {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase storage is not configured.');
  }
  if (!_supabaseClient) {
    _supabaseClient = createClient(supabaseUrl, supabaseKey);
  }
  return _supabaseClient;
}

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

  return `id, title, description, date, end_time, location, image_url, ${categoryExpression} AS event_category, ${categoryExpression} AS category, kind, created_by, created_at, updated_at`;
}

// Upload event poster (admin only)
router.post('/upload-poster', authMiddleware, posterUpload.single('poster'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const supabase = getSupabaseClient();
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const filename = `poster-${uniqueSuffix}${path.extname(req.file.originalname)}`;
    const filePath = `posters/${filename}`;

    const { error } = await supabase.storage
      .from('doll-trap')
      .upload(filePath, req.file.buffer, { contentType: req.file.mimetype, upsert: false });

    if (error) return res.status(500).json({ error: error.message });

    const { data: { publicUrl } } = supabase.storage.from('doll-trap').getPublicUrl(filePath);
    res.json({ url: publicUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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
    const { title, description, date, end_time, location, image_url, category, event_category, kind } = req.body;
    const resolvedKind = kind === 'album' ? 'album' : 'event';
    const resolvedCategory = event_category ?? category ?? (resolvedKind === 'event' ? 'Live' : null);

    if (!title) {
      return res.status(400).json({ error: 'Title required' });
    }

    if (resolvedKind === 'event' && !date) {
      return res.status(400).json({ error: 'Date required for events' });
    }

    const result = await pool.query(
      'INSERT INTO events (title, description, date, end_time, location, image_url, event_category, kind, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
      [title, description || null, date || null, end_time || null, location || null, image_url || null, resolvedCategory, resolvedKind, req.user.id]
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
    const { title, description, date, end_time, location, image_url, category, event_category, kind } = req.body;
    const resolvedKind = kind === 'album' ? 'album' : 'event';
    const resolvedCategory = event_category ?? category ?? (resolvedKind === 'event' ? 'Live' : null);

    if (!title) {
      return res.status(400).json({ error: 'Title required' });
    }

    if (resolvedKind === 'event' && !date) {
      return res.status(400).json({ error: 'Date required for events' });
    }

    const result = await pool.query(
      'UPDATE events SET title = $1, description = $2, date = $3, end_time = $4, location = $5, image_url = $6, event_category = $7, kind = $8, updated_at = CURRENT_TIMESTAMP WHERE id = $9 RETURNING *',
      [title, description || null, date || null, end_time || null, location || null, image_url || null, resolvedCategory, resolvedKind, req.params.id]
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
