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
    const { display_name, email, password, email_updates } = await c.req.json<any>()
    if (!display_name || !email || !password) return c.json({ error: 'Display name, email and password required' }, 400)
    if (password.length < 6) return c.json({ error: 'Password must be at least 6 characters' }, 400)

    const existing = await dbFirst(c.env.DB, 'SELECT id FROM members WHERE LOWER(email)=LOWER(?)', email)
    if (existing) return c.json({ error: 'Email already registered' }, 409)

    const hash = await bcrypt.hash(password, 8)
    const member = await dbFirst(c.env.DB,
      'INSERT INTO members (display_name,email,password_hash,email_verified,email_updates) VALUES (?,?,?,1,?) RETURNING id,display_name,email,email_updates,created_at',
      display_name, email, hash, email_updates ? 1 : 0,
    )
    const token = await memberToken(member!, c.env.JWT_SECRET)
    return c.json({ token, member }, 201)
  } catch (err: any) { return c.json({ error: err.message }, 500) }
})

membersRouter.post('/login', async (c) => {
  try {
    const { email, password } = await c.req.json<any>()
    if (!email || !password) return c.json({ error: 'Email and password required' }, 400)

    const member = await dbFirst(c.env.DB, 'SELECT * FROM members WHERE LOWER(email)=LOWER(?)', email)
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
    const member = await dbFirst(c.env.DB, 'SELECT id,display_name,email,avatar_url,email_updates,created_at FROM members WHERE id=?', me.id)
    if (!member) return c.json({ error: 'Member not found' }, 404)
    return c.json({ valid: true, member })
  } catch (err: any) { return c.json({ error: err.message }, 500) }
})

membersRouter.put('/email-updates', memberAuthMiddleware, async (c) => {
  try {
    const { email_updates } = await c.req.json<any>()
    const me = c.get('member') as any
    await dbRun(c.env.DB, 'UPDATE members SET email_updates=? WHERE id=?', email_updates ? 1 : 0, me.id)
    return c.json({ email_updates: !!email_updates })
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

// ── Magic Link Auth ───────────────────────────────────────────

function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function sendEmail(apiKey: string, to: string, subject: string, html: string) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: { name: 'Doll Trap', email: 'dolltrapofficial@gmail.com' },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  })
  if (!res.ok) throw new Error(`Email send failed: ${await res.text()}`)
}

membersRouter.post('/magic/send', async (c) => {
  try {
    const { email, display_name, password, email_updates } = await c.req.json<any>()
    if (!email) return c.json({ error: 'Email required' }, 400)
    if (!display_name) return c.json({ error: 'Display name required' }, 400)
    if (!password || password.length < 6) return c.json({ error: 'Password must be at least 6 characters' }, 400)

    const existing = await dbFirst(c.env.DB, 'SELECT id FROM members WHERE LOWER(email)=LOWER(?)', email)
    if (existing) return c.json({ error: 'Email already registered' }, 409)

    const hash = await bcrypt.hash(password, 8)
    await dbRun(c.env.DB, 'DELETE FROM magic_tokens WHERE LOWER(email)=LOWER(?) AND purpose=?', email, 'verify')

    const token = generateToken()
    const expiresAt = Math.floor(Date.now() / 1000) + 15 * 60
    await dbRun(c.env.DB,
      'INSERT INTO magic_tokens (token, email, display_name, password_hash, email_updates, purpose, expires_at) VALUES (?,?,?,?,?,?,?)',
      token, email, display_name, hash, email_updates ? 1 : 0, 'verify', expiresAt,
    )

    const baseUrl = c.env.FRONTEND_URL || 'https://doll-trap.github.io'
    const verifyUrl = `https://api.dolltrap.workers.dev/api/members/magic/verify?token=${token}&return=${encodeURIComponent(baseUrl + '/portal.html')}`

    await sendEmail(c.env.BREVO_API_KEY, email, '🌸 Verify your Doll Trap account', `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#fff;border-radius:16px">
        <h2 style="color:#d946a6">Doll Trap</h2>
        <p style="color:#333;font-size:15px;line-height:1.6">Click the button below to verify your email and create your account.<br>This link expires in <strong>15 minutes</strong>.</p>
        <a href="${verifyUrl}" style="display:inline-block;margin:24px 0;padding:14px 28px;background:linear-gradient(135deg,#d946a6,#ec4899);color:#fff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:700">✉️ Verify Email</a>
        <p style="color:#888;font-size:12px">If you didn't request this, you can ignore this email.</p>
      </div>`
    )

    return c.json({ sent: true })
  } catch (err: any) { return c.json({ error: err.message }, 500) }
})

membersRouter.get('/magic/verify', async (c) => {
  const token = c.req.query('token')
  const returnUrl = c.req.query('return') || 'https://doll-trap.github.io/portal.html'
  const fail = (msg: string) => Response.redirect(`${returnUrl}?authError=${encodeURIComponent(msg)}`, 302)

  if (!token) return fail('Missing token')
  try {
    const row = await dbFirst(c.env.DB, 'SELECT * FROM magic_tokens WHERE token=? AND purpose=?', token, 'verify')
    if (!row) return fail('Invalid or expired link')
    if (Number(row.expires_at) < Math.floor(Date.now() / 1000)) {
      await dbRun(c.env.DB, 'DELETE FROM magic_tokens WHERE token=?', token)
      return fail('Link expired — please request a new one')
    }
    await dbRun(c.env.DB, 'DELETE FROM magic_tokens WHERE token=?', token)

    const member = await dbFirst(c.env.DB,
      'INSERT INTO members (display_name,email,password_hash,email_verified,email_updates) VALUES (?,?,?,1,?) RETURNING id,display_name,email,email_updates,created_at',
      row.display_name, row.email, row.password_hash, Number(row.email_updates),
    )
    const jwt = await memberToken(member!, c.env.JWT_SECRET)
    return Response.redirect(`${returnUrl}?memberToken=${encodeURIComponent(jwt)}`, 302)
  } catch { return fail('Something went wrong') }
})

membersRouter.post('/forgot-password', async (c) => {
  try {
    const { email } = await c.req.json<any>()
    if (!email) return c.json({ error: 'Email required' }, 400)

    const member = await dbFirst(c.env.DB, 'SELECT id FROM members WHERE LOWER(email)=LOWER(?)', email)
    if (!member) return c.json({ sent: true }) // don't reveal if email exists

    await dbRun(c.env.DB, 'DELETE FROM magic_tokens WHERE LOWER(email)=LOWER(?) AND purpose=?', email, 'reset')

    const token = generateToken()
    const expiresAt = Math.floor(Date.now() / 1000) + 15 * 60
    await dbRun(c.env.DB,
      'INSERT INTO magic_tokens (token, email, purpose, expires_at) VALUES (?,?,?,?)',
      token, email, 'reset', expiresAt,
    )

    const baseUrl = c.env.FRONTEND_URL || 'https://doll-trap.github.io'
    const resetUrl = `https://api.dolltrap.workers.dev/api/members/reset-password/verify?token=${token}&return=${encodeURIComponent(baseUrl + '/portal.html')}`
    await sendEmail(c.env.BREVO_API_KEY, email, '🔑 Reset your Doll Trap password', `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#fff;border-radius:16px">
        <h2 style="color:#d946a6">Doll Trap</h2>
        <p style="color:#333;font-size:15px;line-height:1.6">Click the button below to reset your password. This link expires in <strong>15 minutes</strong>.</p>
        <a href="${resetUrl}" style="display:inline-block;margin:24px 0;padding:14px 28px;background:linear-gradient(135deg,#d946a6,#ec4899);color:#fff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:700">🔑 Reset Password</a>
        <p style="color:#888;font-size:12px">If you didn't request this, you can ignore this email.</p>
      </div>`
    )

    return c.json({ sent: true })
  } catch (err: any) { return c.json({ error: err.message }, 500) }
})

membersRouter.get('/reset-password/verify', async (c) => {
  const token = c.req.query('token')
  const returnUrl = c.req.query('return') || 'https://doll-trap.github.io/portal.html'
  const fail = (msg: string) => Response.redirect(`${returnUrl}?authError=${encodeURIComponent(msg)}`, 302)

  if (!token) return fail('Missing token')
  try {
    const row = await dbFirst(c.env.DB, 'SELECT * FROM magic_tokens WHERE token=? AND purpose=?', token, 'reset')
    if (!row) return fail('Invalid or expired reset link')
    if (Number(row.expires_at) < Math.floor(Date.now() / 1000)) {
      await dbRun(c.env.DB, 'DELETE FROM magic_tokens WHERE token=?', token)
      return fail('Reset link expired — please request a new one')
    }
    return Response.redirect(`${returnUrl}?resetToken=${encodeURIComponent(token)}`, 302)
  } catch { return fail('Something went wrong') }
})

membersRouter.post('/reset-password', async (c) => {
  try {
    const { token, password } = await c.req.json<any>()
    if (!token || !password) return c.json({ error: 'Token and password required' }, 400)
    if (password.length < 6) return c.json({ error: 'Password must be at least 6 characters' }, 400)

    const row = await dbFirst(c.env.DB, 'SELECT * FROM magic_tokens WHERE token=? AND purpose=?', token, 'reset')
    if (!row) return c.json({ error: 'Invalid or expired reset link' }, 400)
    if (Number(row.expires_at) < Math.floor(Date.now() / 1000)) {
      await dbRun(c.env.DB, 'DELETE FROM magic_tokens WHERE token=?', token)
      return c.json({ error: 'Reset link expired — please request a new one' }, 400)
    }

    await dbRun(c.env.DB, 'DELETE FROM magic_tokens WHERE token=?', token)
    const hash = await bcrypt.hash(password, 8)
    await dbRun(c.env.DB, 'UPDATE members SET password_hash=? WHERE LOWER(email)=LOWER(?)', hash, row.email)

    return c.json({ success: true })
  } catch (err: any) { return c.json({ error: err.message }, 500) }
})

// ── Google OAuth ──────────────────────────────────────────────

membersRouter.get('/auth/google', (c) => {
  const redirectUri = 'https://api.dolltrap.workers.dev/api/members/auth/google/callback'
  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    prompt: 'select_account',
  })
  return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`, 302)
})

membersRouter.get('/auth/google/callback', async (c) => {
  const returnUrl = (c.env.FRONTEND_URL || 'https://dolltrap.github.io/docs') + '/portal.html'
  const fail = (msg: string) => Response.redirect(`${returnUrl}?authError=${encodeURIComponent(msg)}`, 302)
  const code = c.req.query('code')
  if (!code) return fail('Google login cancelled')

  try {
    const redirectUri = 'https://api.dolltrap.workers.dev/api/members/auth/google/callback'
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, grant_type: 'authorization_code',
        client_id: c.env.GOOGLE_CLIENT_ID,
        client_secret: c.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
      }),
    })
    if (!tokenRes.ok) return fail('Google authentication failed')
    const tokens = await tokenRes.json() as any

    const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { 'Authorization': `Bearer ${tokens.access_token}` },
    })
    if (!userRes.ok) return fail('Failed to get Google user info')
    const gu = await userRes.json() as any
    if (!gu.email) return fail('No email returned from Google')

    let member = await dbFirst(c.env.DB, 'SELECT * FROM members WHERE LOWER(email)=LOWER(?)', gu.email)
    if (!member) {
      member = await dbFirst(c.env.DB,
        'INSERT INTO members (display_name,email,password_hash,email_verified,email_updates) VALUES (?,?,?,1,0) RETURNING id,display_name,email,email_updates,created_at',
        gu.name || gu.email.split('@')[0], gu.email, 'google_oauth',
      )
    } else if (!member.email_verified) {
      await dbRun(c.env.DB, 'UPDATE members SET email_verified=1 WHERE id=?', member.id)
    }

    const jwt = await memberToken(member!, c.env.JWT_SECRET)
    return Response.redirect(`${returnUrl}?memberToken=${encodeURIComponent(jwt)}`, 302)
  } catch (err: any) {
    return fail('Something went wrong')
  }
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
