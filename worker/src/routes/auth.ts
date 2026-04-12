import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import { sign } from 'hono/jwt'
import { dbFirst, dbRun } from '../db'
import { authMiddleware } from '../middleware/auth'
import type { HonoEnv } from '../types'

export const authRouter = new Hono<HonoEnv>()

function adminToken(user: Record<string, unknown>, secret: string) {
  return sign(
    { id: user.id, username: user.username, role: user.role, exp: Math.floor(Date.now() / 1000) + 7 * 86400 },
    secret, 'HS256',
  )
}

authRouter.post('/register', async (c) => {
  try {
    const { username, password, email } = await c.req.json<any>()
    if (!username || !password) return c.json({ error: 'Username and password required' }, 400)
    if (password.length < 8) return c.json({ error: 'Password must be at least 8 characters' }, 400)

    const hash = await bcrypt.hash(password, 8)
    const user = await dbFirst(c.env.DB,
      'INSERT INTO users (username, password, email, role) VALUES (?,?,?,?) RETURNING id, username, email',
      username, hash, email ?? null, 'admin',
    )
    return c.json({ message: 'Admin created', user })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

authRouter.post('/login', async (c) => {
  try {
    const { username, password } = await c.req.json<any>()
    if (!username || !password) return c.json({ error: 'Username and password required' }, 400)

    const user = await dbFirst(c.env.DB, 'SELECT * FROM users WHERE username = ?', username)
    if (!user) return c.json({ error: 'Invalid credentials' }, 401)

    const match = await bcrypt.compare(password, user.password as string)
    if (!match) return c.json({ error: 'Invalid credentials' }, 401)

    const token = await adminToken(user, c.env.JWT_SECRET)
    return c.json({ token, user: { id: user.id, username: user.username, role: user.role } })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

authRouter.get('/verify', authMiddleware, async (c) => {
  return c.json({ valid: true, user: c.get('user') })
})

authRouter.post('/change-password', authMiddleware, async (c) => {
  try {
    const { currentPassword, newPassword } = await c.req.json<any>()
    if (!currentPassword || !newPassword) return c.json({ error: 'Current password and new password required' }, 400)
    if (newPassword.length < 8) return c.json({ error: 'New password must be at least 8 characters long' }, 400)

    const me = c.get('user') as any
    const row = await dbFirst(c.env.DB, 'SELECT password FROM users WHERE id = ?', me.id)
    if (!row) return c.json({ error: 'User not found' }, 404)

    const match = await bcrypt.compare(currentPassword, row.password as string)
    if (!match) return c.json({ error: 'Current password is incorrect' }, 400)

    const hash = await bcrypt.hash(newPassword, 8)
    await dbRun(c.env.DB, 'UPDATE users SET password = ? WHERE id = ?', hash, me.id)
    return c.json({ message: 'Password updated successfully' })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})
