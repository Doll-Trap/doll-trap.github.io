import { Hono } from 'hono'
import { dbFirst, dbAll } from '../db'
import { authMiddleware } from '../middleware/auth'
import type { HonoEnv } from '../types'

export const videosRouter = new Hono<HonoEnv>()

videosRouter.get('/', async (c) => {
  try {
    return c.json(await dbAll(c.env.DB,
      'SELECT v.id,v.title,v.url,v.description,v.event_id,v.thumbnail_url,v.created_at,e.title AS event_title FROM videos v LEFT JOIN events e ON v.event_id=e.id ORDER BY v.created_at DESC',
    ))
  } catch (err: any) { return c.json({ error: err.message }, 500) }
})

videosRouter.get('/event/:event_id', async (c) => {
  try {
    return c.json(await dbAll(c.env.DB,
      'SELECT id,title,url,description,event_id,thumbnail_url,created_at FROM videos WHERE event_id=? ORDER BY created_at DESC',
      c.req.param('event_id'),
    ))
  } catch (err: any) { return c.json({ error: err.message }, 500) }
})

videosRouter.post('/', authMiddleware, async (c) => {
  try {
    const { title, url, description, event_id, thumbnail_url } = await c.req.json<any>()
    if (!title || !url) return c.json({ error: 'Title and URL are required' }, 400)
    const row = await dbFirst(c.env.DB,
      'INSERT INTO videos (title,url,description,event_id,thumbnail_url) VALUES (?,?,?,?,?) RETURNING *',
      title, url, description ?? null, event_id ?? null, thumbnail_url ?? null,
    )
    return c.json(row, 201)
  } catch (err: any) { return c.json({ error: err.message }, 500) }
})

videosRouter.put('/:id', authMiddleware, async (c) => {
  try {
    const { title, url, description, event_id, thumbnail_url } = await c.req.json<any>()
    if (!title || !url) return c.json({ error: 'Title and URL are required' }, 400)
    const row = await dbFirst(c.env.DB,
      'UPDATE videos SET title=?,url=?,description=?,event_id=?,thumbnail_url=? WHERE id=? RETURNING *',
      title, url, description ?? null, event_id ?? null, thumbnail_url ?? null, c.req.param('id'),
    )
    if (!row) return c.json({ error: 'Video not found' }, 404)
    return c.json(row)
  } catch (err: any) { return c.json({ error: err.message }, 500) }
})

videosRouter.delete('/:id', authMiddleware, async (c) => {
  try {
    const row = await dbFirst(c.env.DB, 'DELETE FROM videos WHERE id=? RETURNING id', c.req.param('id'))
    if (!row) return c.json({ error: 'Video not found' }, 404)
    return c.json({ message: 'Video deleted' })
  } catch (err: any) { return c.json({ error: err.message }, 500) }
})
