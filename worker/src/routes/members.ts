import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import { sign } from 'hono/jwt'
import { dbFirst, dbAll, dbRun, inClause } from '../db'
import { memberAuthMiddleware } from '../middleware/memberAuth'
import { authMiddleware } from '../middleware/auth'
import type { HonoEnv } from '../types'

export const membersRouter = new Hono<HonoEnv>()

function memberToken(m: Record<string, unknown>, secret: string) {
  return sign(
    { id: m.id, email: m.email, display_name: m.display_name, type: 'member', exp: Math.floor(Date.now() / 1000) + 30 * 86400 },
    secret, 'HS256',
  )
}

membersRouter.post('/register', async (c) => {
  try {
    const { display_name, email, password } = await c.req.json<any>()
    if (!display_name || !email || !password) return c.json({ error: 'Display name, email and password required' }, 400)
    if (password.length < 6) return c.json({ error: 'Password must be at least 6 characters' }, 400)

    const existing = await dbFirst(c.env.DB, 'SELECT id FROM members WHERE email=?', email)
    if (existing) return c.json({ error: 'Email already registered' }, 409)

    const hash = await bcrypt.hash(password, 8)
    const member = await dbFirst(c.env.DB,
      'INSERT INTO members (display_name,email,password_hash) VALUES (?,?,?) RETURNING id,display_name,email,created_at',
      display_name, email, hash,
    )
    const token = await memberToken(member!, c.env.JWT_SECRET)
    return c.json({ token, member }, 201)
  } catch (err: any) { return c.json({ error: err.message }, 500) }
})

membersRouter.post('/login', async (c) => {
  try {
    const { email, password } = await c.req.json<any>()
    if (!email || !password) return c.json({ error: 'Email and password required' }, 400)

    const member = await dbFirst(c.env.DB, 'SELECT * FROM members WHERE email=?', email)
    if (!member) return c.json({ error: 'Invalid email or password' }, 401)

    const match = await bcrypt.compare(password, member.password_hash as string)
    if (!match) return c.json({ error: 'Invalid email or password' }, 401)

    const token = await memberToken(member, c.env.JWT_SECRET)
    return c.json({ token, member: { id: member.id, display_name: member.display_name, email: member.email } })
  } catch (err: any) { return c.json({ error: err.message }, 500) }
})

membersRouter.get('/verify', memberAuthMiddleware, async (c) => {
  try {
    const me = c.get('member') as any
    const member = await dbFirst(c.env.DB, 'SELECT id,display_name,email,avatar_url,created_at FROM members WHERE id=?', me.id)
    if (!member) return c.json({ error: 'Member not found' }, 404)
    return c.json({ valid: true, member })
  } catch (err: any) { return c.json({ error: err.message }, 500) }
})

membersRouter.put('/profile', memberAuthMiddleware, async (c) => {
  try {
    const { display_name } = await c.req.json<any>()
    if (!display_name) return c.json({ error: 'Display name required' }, 400)
    const me = c.get('member') as any
    const row = await dbFirst(c.env.DB, 'UPDATE members SET display_name=? WHERE id=? RETURNING id,display_name,email', display_name, me.id)
    await dbRun(c.env.DB, 'UPDATE member_messages SET display_name=? WHERE member_id=?', display_name, me.id)
    const token = await memberToken(row!, c.env.JWT_SECRET)
    return c.json({ member: row, token })
  } catch (err: any) { return c.json({ error: err.message }, 500) }
})

membersRouter.post('/change-password', memberAuthMiddleware, async (c) => {
  try {
    const { currentPassword, newPassword } = await c.req.json<any>()
    if (!currentPassword || !newPassword) return c.json({ error: 'Both passwords required' }, 400)
    if (newPassword.length < 6) return c.json({ error: 'New password must be at least 6 characters' }, 400)
    const me = c.get('member') as any
    const row = await dbFirst(c.env.DB, 'SELECT password_hash FROM members WHERE id=?', me.id)
    const match = await bcrypt.compare(currentPassword, row!.password_hash as string)
    if (!match) return c.json({ error: 'Current password is incorrect' }, 400)
    await dbRun(c.env.DB, 'UPDATE members SET password_hash=? WHERE id=?', await bcrypt.hash(newPassword, 8), me.id)
    return c.json({ message: 'Password updated' })
  } catch (err: any) { return c.json({ error: err.message }, 500) }
})

// ── Saved Events ──────────────────────────────────────────────
membersRouter.get('/saves/events', memberAuthMiddleware, async (c) => {
  try {
    const me = c.get('member') as any
    return c.json(await dbAll(c.env.DB,
      'SELECT e.id,e.title,e.date,e.location,e.image_url,e.event_category,e.kind,s.created_at AS saved_at FROM member_saved_events s JOIN events e ON s.event_id=e.id WHERE s.member_id=? ORDER BY s.created_at DESC',
      me.id,
    ))
  } catch (err: any) { return c.json({ error: err.message }, 500) }
})

membersRouter.post('/saves/events/:event_id', memberAuthMiddleware, async (c) => {
  try {
    const me = c.get('member') as any
    await dbRun(c.env.DB, 'INSERT INTO member_saved_events (member_id,event_id) VALUES (?,?) ON CONFLICT DO NOTHING', me.id, c.req.param('event_id'))
    return c.json({ saved: true })
  } catch (err: any) { return c.json({ error: err.message }, 500) }
})

membersRouter.delete('/saves/events/:event_id', memberAuthMiddleware, async (c) => {
  try {
    const me = c.get('member') as any
    await dbRun(c.env.DB, 'DELETE FROM member_saved_events WHERE member_id=? AND event_id=?', me.id, c.req.param('event_id'))
    return c.json({ saved: false })
  } catch (err: any) { return c.json({ error: err.message }, 500) }
})

// ── Saved Photos ──────────────────────────────────────────────
membersRouter.get('/saves/photos', memberAuthMiddleware, async (c) => {
  try {
    const me = c.get('member') as any
    return c.json(await dbAll(c.env.DB,
      'SELECT p.id,p.photo_url,p.caption,p.member_tag,p.event_id,e.title AS event_title,s.created_at AS saved_at FROM member_saved_photos s JOIN photos p ON s.photo_id=p.id LEFT JOIN events e ON p.event_id=e.id WHERE s.member_id=? ORDER BY s.created_at DESC',
      me.id,
    ))
  } catch (err: any) { return c.json({ error: err.message }, 500) }
})

membersRouter.post('/saves/photos/:photo_id', memberAuthMiddleware, async (c) => {
  try {
    const me = c.get('member') as any
    await dbRun(c.env.DB, 'INSERT INTO member_saved_photos (member_id,photo_id) VALUES (?,?) ON CONFLICT DO NOTHING', me.id, c.req.param('photo_id'))
    return c.json({ saved: true })
  } catch (err: any) { return c.json({ error: err.message }, 500) }
})

membersRouter.delete('/saves/photos/:photo_id', memberAuthMiddleware, async (c) => {
  try {
    const me = c.get('member') as any
    await dbRun(c.env.DB, 'DELETE FROM member_saved_photos WHERE member_id=? AND photo_id=?', me.id, c.req.param('photo_id'))
    return c.json({ saved: false })
  } catch (err: any) { return c.json({ error: err.message }, 500) }
})

// ── Check-ins ─────────────────────────────────────────────────
membersRouter.get('/checkins', memberAuthMiddleware, async (c) => {
  try {
    const me = c.get('member') as any
    return c.json(await dbAll(c.env.DB,
      'SELECT e.id,e.title,e.date,e.location,e.image_url,e.event_category,c.checked_in_at FROM member_checkins c JOIN events e ON c.event_id=e.id WHERE c.member_id=? ORDER BY e.date DESC NULLS LAST',
      me.id,
    ))
  } catch (err: any) { return c.json({ error: err.message }, 500) }
})

membersRouter.post('/checkins/:event_id', memberAuthMiddleware, async (c) => {
  try {
    const me = c.get('member') as any
    const event = await dbFirst(c.env.DB, 'SELECT date FROM events WHERE id=?', c.req.param('event_id'))
    if (!event) return c.json({ error: 'Event not found' }, 404)
    if (!event.date || new Date(event.date as string) > new Date()) return c.json({ error: 'Check-in is only available after the event has started' }, 400)
    await dbRun(c.env.DB, 'INSERT INTO member_checkins (member_id,event_id) VALUES (?,?) ON CONFLICT DO NOTHING', me.id, c.req.param('event_id'))
    return c.json({ checked_in: true })
  } catch (err: any) { return c.json({ error: err.message }, 500) }
})

membersRouter.delete('/checkins/:event_id', memberAuthMiddleware, async (c) => {
  try {
    const me = c.get('member') as any
    await dbRun(c.env.DB, 'DELETE FROM member_checkins WHERE member_id=? AND event_id=?', me.id, c.req.param('event_id'))
    return c.json({ checked_in: false })
  } catch (err: any) { return c.json({ error: err.message }, 500) }
})

// ── Batch status (replaces PostgreSQL ANY($2) with dynamic IN) ─
membersRouter.post('/my-status', memberAuthMiddleware, async (c) => {
  try {
    const me = c.get('member') as any
    const { event_ids, photo_ids } = await c.req.json<any>()

    const savedEvents = event_ids?.length
      ? (await dbAll(c.env.DB, `SELECT event_id FROM member_saved_events WHERE member_id=? AND event_id IN (${inClause(event_ids)})`, me.id, ...event_ids)).map((r: any) => r.event_id)
      : []
    const checkedEvents = event_ids?.length
      ? (await dbAll(c.env.DB, `SELECT event_id FROM member_checkins WHERE member_id=? AND event_id IN (${inClause(event_ids)})`, me.id, ...event_ids)).map((r: any) => r.event_id)
      : []
    const savedPhotos = photo_ids?.length
      ? (await dbAll(c.env.DB, `SELECT photo_id FROM member_saved_photos WHERE member_id=? AND photo_id IN (${inClause(photo_ids)})`, me.id, ...photo_ids)).map((r: any) => r.photo_id)
      : []

    return c.json({ savedEvents, checkedEvents, savedPhotos })
  } catch (err: any) { return c.json({ error: err.message }, 500) }
})

// ── Fan Messages ──────────────────────────────────────────────
membersRouter.get('/messages/mine', memberAuthMiddleware, async (c) => {
  try {
    const me = c.get('member') as any
    return c.json(await dbAll(c.env.DB,
      'SELECT id,idol_name,display_name,content,created_at FROM member_messages WHERE member_id=? ORDER BY created_at DESC', me.id,
    ))
  } catch (err: any) { return c.json({ error: err.message }, 500) }
})

membersRouter.put('/messages/:id', memberAuthMiddleware, async (c) => {
  try {
    const { content } = await c.req.json<any>()
    if (!content?.trim()) return c.json({ error: 'Message cannot be empty' }, 400)
    if (content.length > 300) return c.json({ error: 'Message too long (max 300 characters)' }, 400)
    const me = c.get('member') as any
    const row = await dbFirst(c.env.DB,
      'UPDATE member_messages SET content=? WHERE id=? AND member_id=? RETURNING *',
      content.trim(), c.req.param('id'), me.id,
    )
    if (!row) return c.json({ error: 'Not found or not yours' }, 403)
    return c.json(row)
  } catch (err: any) { return c.json({ error: err.message }, 500) }
})

// Admin delete — registered before /:id to avoid conflict
membersRouter.delete('/messages/admin/:id', authMiddleware, async (c) => {
  try {
    const row = await dbFirst(c.env.DB, 'DELETE FROM member_messages WHERE id=? RETURNING id', c.req.param('id'))
    if (!row) return c.json({ error: 'Message not found' }, 404)
    return c.json({ deleted: true })
  } catch (err: any) { return c.json({ error: err.message }, 500) }
})

membersRouter.delete('/messages/:id', memberAuthMiddleware, async (c) => {
  try {
    const me = c.get('member') as any
    const row = await dbFirst(c.env.DB, 'DELETE FROM member_messages WHERE id=? AND member_id=? RETURNING id', c.req.param('id'), me.id)
    if (!row) return c.json({ error: 'Not found or not yours' }, 403)
    return c.json({ deleted: true })
  } catch (err: any) { return c.json({ error: err.message }, 500) }
})

membersRouter.get('/messages/:idol_name', async (c) => {
  try {
    return c.json(await dbAll(c.env.DB,
      'SELECT id,idol_name,member_id,display_name,content,created_at FROM member_messages WHERE LOWER(idol_name)=LOWER(?) ORDER BY created_at DESC LIMIT 100',
      c.req.param('idol_name'),
    ))
  } catch (err: any) { return c.json({ error: err.message }, 500) }
})

membersRouter.post('/messages/:idol_name', memberAuthMiddleware, async (c) => {
  try {
    const { content } = await c.req.json<any>()
    if (!content?.trim()) return c.json({ error: 'Message cannot be empty' }, 400)
    if (content.length > 300) return c.json({ error: 'Message too long (max 300 characters)' }, 400)
    const me = c.get('member') as any
    const row = await dbFirst(c.env.DB,
      'INSERT INTO member_messages (idol_name,member_id,display_name,content) VALUES (?,?,?,?) RETURNING *',
      c.req.param('idol_name'), me.id, me.display_name, content.trim(),
    )
    return c.json(row, 201)
  } catch (err: any) { return c.json({ error: err.message }, 500) }
})

// ── Cheers ────────────────────────────────────────────────────
membersRouter.get('/cheers/:idol_name', async (c) => {
  try {
    const idol = c.req.param('idol_name')
    const session_id = c.req.query('session_id')
    const countRow = await dbFirst(c.env.DB, 'SELECT COUNT(*) AS cnt FROM member_cheers WHERE idol_name=?', idol)
    const count = Number(countRow?.cnt ?? 0)
    let cheered = false
    if (session_id) {
      const row = await dbFirst(c.env.DB, 'SELECT 1 FROM member_cheers WHERE idol_name=? AND session_id=?', idol, session_id)
      cheered = !!row
    }
    return c.json({ count, cheered })
  } catch (err: any) { return c.json({ error: err.message }, 500) }
})

membersRouter.post('/cheers/:idol_name', async (c) => {
  try {
    const idol = c.req.param('idol_name')
    const { session_id } = await c.req.json<any>()
    if (!session_id) return c.json({ error: 'session_id required' }, 400)

    const existing = await dbFirst(c.env.DB, 'SELECT id FROM member_cheers WHERE idol_name=? AND session_id=?', idol, session_id)
    if (existing) {
      await dbRun(c.env.DB, 'DELETE FROM member_cheers WHERE idol_name=? AND session_id=?', idol, session_id)
    } else {
      await dbRun(c.env.DB, 'INSERT INTO member_cheers (idol_name,session_id) VALUES (?,?)', idol, session_id)
    }
    const countRow = await dbFirst(c.env.DB, 'SELECT COUNT(*) AS cnt FROM member_cheers WHERE idol_name=?', idol)
    return c.json({ count: Number(countRow?.cnt ?? 0), cheered: !existing })
  } catch (err: any) { return c.json({ error: err.message }, 500) }
})
