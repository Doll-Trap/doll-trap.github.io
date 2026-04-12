const express = require('express');
const multer = require('multer');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { pool } = require('../config/database');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
let hasWarnedAboutLegacyUploads = false;
const STORAGE_BUCKET = 'doll-trap';
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

function getSupabaseClient() {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_KEY).');
  }
  return createClient(supabaseUrl, supabaseKey);
}

function isLegacyUpload(photoUrl) {
  return typeof photoUrl === 'string' && photoUrl.startsWith('/uploads/');
}

function decoratePhotoRows(rows) {
  const legacyCount = rows.filter(row => isLegacyUpload(row.photo_url)).length;
  if (legacyCount > 0 && !hasWarnedAboutLegacyUploads) {
    console.warn(`⚠️ Detected ${legacyCount} legacy photo(s) still pointing to /uploads. Run \`npm run migrate:legacy-photos\` to move them to Supabase Storage.`);
    hasWarnedAboutLegacyUploads = true;
  }
  return rows.map(row => ({ ...row, is_legacy_upload: isLegacyUpload(row.photo_url) }));
}

// Extract Supabase storage path from a public URL, e.g. "photos/photo-123.jpg"
function extractStoragePath(publicUrl) {
  if (!publicUrl || isLegacyUpload(publicUrl)) return null;
  try {
    const url = new URL(publicUrl);
    // Supabase public URLs: /storage/v1/object/public/<bucket>/<path>
    const marker = `/object/public/${STORAGE_BUCKET}/`;
    const idx = url.pathname.indexOf(marker);
    return idx !== -1 ? url.pathname.slice(idx + marker.length) : null;
  } catch {
    return null;
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (_req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
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
router.get('/', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.id, p.event_id, p.photo_url, p.caption, p.member_tag,
             p.uploaded_by, p.created_at
      FROM photos p
      ORDER BY p.created_at DESC
    `);
    res.json(decoratePhotoRows(result.rows));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get photos for specific event
router.get('/event/:event_id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.id, p.event_id, p.photo_url, p.caption, p.member_tag,
              p.uploaded_by, p.created_at
       FROM photos p
       WHERE p.event_id = $1
       ORDER BY p.created_at DESC`,
      [req.params.event_id]
    );
    res.json(decoratePhotoRows(result.rows));
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

    const supabase = getSupabaseClient();
    const { event_id, caption, member_tag } = req.body;
    const resolvedEventId = event_id || null;
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const filename = `photo-${uniqueSuffix}${path.extname(req.file.originalname)}`;
    const filePath = `photos/${filename}`;

    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, req.file.buffer, { contentType: req.file.mimetype, upsert: false });

    if (error) {
      console.error('Supabase upload error:', error);
      if (error.message && error.message.includes('not found')) {
        return res.status(500).json({ error: 'Storage bucket not found. Please create "doll-trap" bucket in Supabase.' });
      }
      return res.status(500).json({ error: error.message || 'Failed to upload file to storage' });
    }

    const { data: { publicUrl } } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);

    if (!publicUrl || !publicUrl.startsWith('http')) {
      throw new Error('Storage upload succeeded but no valid public URL was returned.');
    }

    const result = await pool.query(
      'INSERT INTO photos (event_id, photo_url, caption, member_tag, uploaded_by) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [resolvedEventId, publicUrl, caption || null, member_tag || 'Group', req.user.id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Photo upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update photo (admin only)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { caption, member_tag, event_id } = req.body;
    const resolvedEventId = event_id || null;

    const result = await pool.query(
      'UPDATE photos SET caption = $1, member_tag = $2, event_id = $3 WHERE id = $4 RETURNING *',
      [caption || null, member_tag || 'Group', resolvedEventId, req.params.id]
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

    const photo = result.rows[0];

    // Delete file from Supabase storage (best-effort, don't fail the request if this fails)
    const storagePath = extractStoragePath(photo.photo_url);
    if (storagePath) {
      try {
        const supabase = getSupabaseClient();
        await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
      } catch (storageError) {
        console.error('Failed to delete file from Supabase storage:', storageError.message);
      }
    }

    res.json({ message: 'Photo deleted', photo });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
