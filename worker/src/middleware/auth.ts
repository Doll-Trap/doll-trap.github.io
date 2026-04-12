import { Context, Next } from 'hono'
import { verify } from 'hono/jwt'
import type { HonoEnv } from '../types'

export async function authMiddleware(c: Context<HonoEnv>, next: Next) {
  const token = c.req.header('Authorization')?.split(' ')[1]
  if (!token) return c.json({ error: 'No token provided' }, 401)

  try {
    const decoded = await verify(token, c.env.JWT_SECRET, 'HS256')
    c.set('user', decoded as Record<string, unknown>)
    await next()
  } catch {
    return c.json({ error: 'Invalid token' }, 401)
  }
}
