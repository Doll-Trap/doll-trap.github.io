import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { authRouter } from './routes/auth'
import { eventsRouter } from './routes/events'
import { photosRouter } from './routes/photos'
import { videosRouter } from './routes/videos'
import { membersRouter } from './routes/members'
import type { HonoEnv } from './types'

const app = new Hono<HonoEnv>()

app.use('*', cors({
  origin: (origin) => {
    if (!origin) return origin
    const allowed = ['https://doll-trap.github.io', 'https://dolltrap.github.io', 'https://dolltrap.com', 'https://www.dolltrap.com']
    if (allowed.includes(origin)) return origin
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin
    return null
  },
  credentials: true,
}))

app.get('/api/health', (c) => c.json({ status: 'Backend is running' }))

app.route('/api/auth', authRouter)
app.route('/api/events', eventsRouter)
app.route('/api/photos', photosRouter)
app.route('/api/videos', videosRouter)
app.route('/api/members', membersRouter)

export default app
