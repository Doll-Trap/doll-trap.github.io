import { Hono } from 'hono'
import { createClient } from '@supabase/supabase-js'
import { dbFirst, dbAll, dbRun } from '../db'
import { authMiddleware } from '../middleware/auth'
import type { HonoEnv } from '../types'

export const eventsRouter = new Hono<HonoEnv>()

const SELECT_FIELDS = 'id, title, description, date, end_time, location, image_url, poster_urls, event_category, event_category AS category, link, kind, created_by, created_at, updated_at'

// Upload event poster (admin only)
eventsRouter.post('/upload-poster', authMiddleware, async (c) => {
  try {
    const formData = await c.req.formData()
    const file = formData.get('poster') as File | null
    if (!file) return c.json({ error: 'No file uploaded' }, 400)

    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif']
    const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif']
    if (!allowedMimes.includes(file.type) && !allowedExts.some(e => file.name.toLowerCase().endsWith(e)))
      return c.json({ error: 'Invalid file type' }, 400)
    if (file.size > 20 * 1024 * 1024) return c.json({ error: 'File too large (max 20MB)' }, 400)

    const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY)
    const ext = file.name.includes('.') ? '.' + file.name.split('.').pop() : ''
    const filePath = `posters/poster-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`
    const { error } = await supabase.storage.from('doll-trap').upload(filePath, await file.arrayBuffer(), { contentType: file.type, upsert: false })
    if (error) return c.json({ error: error.message }, 500)

    const { data: { publicUrl } } = supabase.storage.from('doll-trap').getPublicUrl(filePath)
    return c.json({ url: publicUrl })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

eventsRouter.get('/', async (c) => {
  try {
    const rows = await dbAll(c.env.DB,
      `SELECT ${SELECT_FIELDS} FROM events ORDER BY CASE WHEN kind='album' THEN 1 ELSE 0 END, date DESC NULLS LAST, created_at DESC`,
    )
    return c.json(rows)
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

eventsRouter.get('/:id', async (c) => {
  try {
    const row = await dbFirst(c.env.DB, `SELECT ${SELECT_FIELDS} FROM events WHERE id = ?`, c.req.param('id'))
    if (!row) return c.json({ error: 'Event not found' }, 404)
    return c.json(row)
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

eventsRouter.post('/', authMiddleware, async (c) => {
  try {
    const { title, description, date, end_time, location, image_url, poster_urls, category, event_category, link, kind } = await c.req.json<any>()
    const resolvedKind = kind === 'album' ? 'album' : 'event'
    const resolvedCategory = event_category ?? category ?? (resolvedKind === 'event' ? 'Live' : null)
    if (!title) return c.json({ error: 'Title required' }, 400)
    if (resolvedKind === 'event' && !date) return c.json({ error: 'Date required for events' }, 400)

    const me = c.get('user') as any
    const row = await dbFirst(c.env.DB,
      'INSERT INTO events (title,description,date,end_time,location,image_url,poster_urls,event_category,link,kind,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?) RETURNING *',
      title, description ?? null, date ?? null, end_time ?? null, location ?? null, image_url ?? null, poster_urls ?? null, resolvedCategory, link ?? null, resolvedKind, me.id,
    )
    return c.json(row, 201)
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

eventsRouter.put('/:id', authMiddleware, async (c) => {
  try {
    const { title, description, date, end_time, location, image_url, poster_urls, category, event_category, link, kind } = await c.req.json<any>()
    const resolvedKind = kind === 'album' ? 'album' : 'event'
    const resolvedCategory = event_category ?? category ?? (resolvedKind === 'event' ? 'Live' : null)
    if (!title) return c.json({ error: 'Title required' }, 400)
    if (resolvedKind === 'event' && !date) return c.json({ error: 'Date required for events' }, 400)

    const row = await dbFirst(c.env.DB,
      'UPDATE events SET title=?,description=?,date=?,end_time=?,location=?,image_url=?,poster_urls=?,event_category=?,link=?,kind=?,updated_at=CURRENT_TIMESTAMP WHERE id=? RETURNING *',
      title, description ?? null, date ?? null, end_time ?? null, location ?? null, image_url ?? null, poster_urls ?? null, resolvedCategory, link ?? null, resolvedKind, c.req.param('id'),
    )
    if (!row) return c.json({ error: 'Event not found' }, 404)
    return c.json(row)
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

eventsRouter.delete('/:id', authMiddleware, async (c) => {
  try {
    const row = await dbFirst(c.env.DB, 'DELETE FROM events WHERE id=? RETURNING *', c.req.param('id'))
    if (!row) return c.json({ error: 'Event not found' }, 404)
    return c.json({ message: 'Event deleted', event: row })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})
