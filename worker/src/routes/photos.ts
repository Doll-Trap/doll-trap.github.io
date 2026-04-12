import { Hono } from 'hono'
import { createClient } from '@supabase/supabase-js'
import { dbFirst, dbAll, dbRun } from '../db'
import { authMiddleware } from '../middleware/auth'
import type { HonoEnv } from '../types'

export const photosRouter = new Hono<HonoEnv>()
const BUCKET = 'doll-trap'

function extractStoragePath(url: string): string | null {
  try {
    const u = new URL(url)
    const marker = `/object/public/${BUCKET}/`
    const idx = u.pathname.indexOf(marker)
    return idx !== -1 ? u.pathname.slice(idx + marker.length) : null
  } catch { return null }
}

photosRouter.get('/', async (c) => {
  try {
    return c.json(await dbAll(c.env.DB, 'SELECT id,event_id,photo_url,caption,member_tag,uploaded_by,created_at FROM photos ORDER BY created_at DESC'))
  } catch (err: any) { return c.json({ error: err.message }, 500) }
})

photosRouter.get('/event/:event_id', async (c) => {
  try {
    return c.json(await dbAll(c.env.DB,
      'SELECT id,event_id,photo_url,caption,member_tag,uploaded_by,created_at FROM photos WHERE event_id=? ORDER BY created_at DESC',
      c.req.param('event_id'),
    ))
  } catch (err: any) { return c.json({ error: err.message }, 500) }
})

photosRouter.get('/member/:tag', async (c) => {
  try {
    return c.json(await dbAll(c.env.DB,
      'SELECT id,event_id,photo_url,caption,member_tag,created_at FROM photos WHERE LOWER(member_tag)=LOWER(?) ORDER BY created_at DESC LIMIT 12',
      c.req.param('tag'),
    ))
  } catch (err: any) { return c.json({ error: err.message }, 500) }
})

photosRouter.post('/', authMiddleware, async (c) => {
  try {
    const formData = await c.req.formData()
    const file = formData.get('photo') as File | null
    if (!file) return c.json({ error: 'No file uploaded' }, 400)

    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!allowed.includes(file.type) && !['.jpg','.jpeg','.png','.gif','.webp'].some(e => file.name.toLowerCase().endsWith(e)))
      return c.json({ error: 'Invalid file type' }, 400)
    if (file.size > 50 * 1024 * 1024) return c.json({ error: 'File too large (max 50MB)' }, 400)

    const event_id = formData.get('event_id') as string | null
    const caption = formData.get('caption') as string | null
    const member_tag = formData.get('member_tag') as string | null

    const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY)
    const ext = file.name.includes('.') ? '.' + file.name.split('.').pop() : ''
    const filePath = `photos/photo-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`

    const { error } = await supabase.storage.from(BUCKET).upload(filePath, await file.arrayBuffer(), { contentType: file.type, upsert: false })
    if (error) return c.json({ error: error.message }, 500)

    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(filePath)
    if (!publicUrl?.startsWith('http')) throw new Error('No valid public URL returned')

    const me = c.get('user') as any
    const row = await dbFirst(c.env.DB,
      'INSERT INTO photos (event_id,photo_url,caption,member_tag,uploaded_by) VALUES (?,?,?,?,?) RETURNING *',
      event_id ?? null, publicUrl, caption ?? null, member_tag ?? 'Group', me.id,
    )
    return c.json(row, 201)
  } catch (err: any) { return c.json({ error: err.message }, 500) }
})

photosRouter.put('/:id', authMiddleware, async (c) => {
  try {
    const { caption, member_tag, event_id } = await c.req.json<any>()
    const row = await dbFirst(c.env.DB,
      'UPDATE photos SET caption=?,member_tag=?,event_id=? WHERE id=? RETURNING *',
      caption ?? null, member_tag ?? 'Group', event_id ?? null, c.req.param('id'),
    )
    if (!row) return c.json({ error: 'Photo not found' }, 404)
    return c.json(row)
  } catch (err: any) { return c.json({ error: err.message }, 500) }
})

photosRouter.delete('/:id', authMiddleware, async (c) => {
  try {
    const row = await dbFirst(c.env.DB, 'DELETE FROM photos WHERE id=? RETURNING *', c.req.param('id'))
    if (!row) return c.json({ error: 'Photo not found' }, 404)

    const path = extractStoragePath(row.photo_url as string)
    if (path) {
      try {
        await createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY).storage.from(BUCKET).remove([path])
      } catch { /* best-effort */ }
    }
    return c.json({ message: 'Photo deleted', photo: row })
  } catch (err: any) { return c.json({ error: err.message }, 500) }
})
