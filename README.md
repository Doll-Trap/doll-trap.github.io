# Doll Trap - Seattle Underground Idol Group

A cosplay idol performance group website with admin panel for event and photo management.

Events and albums share the same `events` table, distinguished by `kind = 'event' | 'album'`. The calendar and home page only show `kind = 'event'` records; the gallery and admin can also manage albums.

## Project Structure

```
dolltrap.github.io/
├── docs/                     # Frontend (GitHub Pages root)
│   ├── index.html            # Home page
│   ├── members.html          # Members profile page
│   ├── calendar.html         # Event calendar
│   ├── gallery.html          # Photo gallery / albums
│   ├── videos.html           # Videos page
│   ├── portal.html           # Member portal (login, saved events/photos)
│   ├── admin.html            # Admin panel
│   ├── style.css             # Global styles
│   ├── admin.css             # Admin panel styles
│   └── admin.js              # Admin panel logic
│
├── backend/                  # Node.js Express API
│   ├── server.js             # Entry point
│   ├── package.json
│   ├── Dockerfile
│   ├── config/
│   │   └── database.js       # PostgreSQL connection & auto-migration
│   ├── routes/
│   │   ├── auth.js           # Admin authentication
│   │   ├── events.js         # Events + albums CRUD + poster upload
│   │   ├── photos.js         # Photo upload / update / delete
│   │   ├── videos.js         # Video CRUD
│   │   └── members.js        # Member registration, login, saves, check-ins
│   ├── middleware/
│   │   ├── auth.js           # Admin JWT middleware
│   │   └── memberAuth.js     # Member JWT middleware
│   └── uploads/              # Legacy local upload path (unused, kept for reference)
│
├── docker-compose.yml        # Docker config (API only — DB is on Neon)
└── README.md
```

## Local Development

### Prerequisites
- Node.js v18+
- A `.env` file in `backend/` (copy from `.env.example`)

### Start the backend

```bash
cd backend
npm install
npm run dev
```

The server starts on **http://localhost:5001** (port 5001 — macOS reserves 5000 for AirPlay).

> If you changed `PORT` in `.env`, use that port instead.

### Test it's running

```bash
curl http://localhost:5001/api/health
# → {"status":"Backend is running"}
```

### Admin panel (local)

Open `docs/admin.html` in a browser. The admin panel auto-detects whether to use `localhost:5001` or the production Render URL based on the current hostname.

Login with any of the three admin accounts (password: `Admin123!`):
- `admin`
- `buzzly`
- `hitomi`

## Environment Variables

Copy `backend/.env.example` to `backend/.env` and fill in:

```bash
# Neon PostgreSQL (free tier, no auto-pause)
DB_HOST=<your-neon-host>
DB_PORT=5432
DB_NAME=neondb
DB_USER=neondb_owner
DB_PASSWORD=<your-neon-password>

# JWT
JWT_SECRET=<strong-random-string>

# Server
PORT=5001
NODE_ENV=development

# Supabase Storage (for image uploads — separate from the DB)
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

## Database

**PostgreSQL on [Neon](https://neon.tech)** (free tier, never auto-pauses).
**Images** are stored in **Supabase Storage** (unaffected by Neon migration).

Tables are created automatically on first startup via `initDB()` in `database.js`. No manual migrations needed.

### Schema summary

| Table | Purpose |
|-------|---------|
| `users` | Admin accounts |
| `events` | Events (`kind='event'`) and albums (`kind='album'`) |
| `photos` | Photos linked to events/albums, stored in Supabase Storage |
| `videos` | YouTube/video links |
| `members` | Public member accounts (separate from admins) |
| `member_saved_events` | Events saved by members |
| `member_saved_photos` | Photos saved by members |
| `member_checkins` | Event check-ins by members |
| `game_users` / `inventory` | Pre-built tables for future game features |

## API Endpoints

### Admin auth — `/api/auth`
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/login` | — | Admin login → JWT |
| POST | `/register` | — | Create admin account |
| GET | `/verify` | Admin | Verify token |
| POST | `/change-password` | Admin | Change password |

### Events — `/api/events`
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | — | All events and albums |
| GET | `/:id` | — | Single event/album |
| POST | `/` | Admin | Create event or album |
| PUT | `/:id` | Admin | Update event or album |
| DELETE | `/:id` | Admin | Delete event or album (cascades to photos) |
| POST | `/upload-poster` | Admin | Upload poster image to Supabase Storage |

### Photos — `/api/photos`
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | — | All photos |
| GET | `/event/:event_id` | — | Photos for a specific event |
| POST | `/` | Admin | Upload photo (multipart, max 50MB) |
| PUT | `/:id` | Admin | Update caption / member tag / event link |
| DELETE | `/:id` | Admin | Delete photo (also removes file from Supabase Storage) |

### Videos — `/api/videos`
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | — | All videos |
| GET | `/event/:event_id` | — | Videos for a specific event |
| POST | `/` | Admin | Add video |
| PUT | `/:id` | Admin | Update video |
| DELETE | `/:id` | Admin | Delete video |

### Members — `/api/members`
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/register` | — | Member sign-up |
| POST | `/login` | — | Member login → JWT |
| GET | `/verify` | Member | Verify member token |
| PUT | `/profile` | Member | Update display name |
| POST | `/change-password` | Member | Change password |
| GET | `/saves/events` | Member | Get saved events |
| POST | `/saves/events/:id` | Member | Save an event |
| DELETE | `/saves/events/:id` | Member | Unsave an event |
| GET | `/saves/photos` | Member | Get saved photos |
| POST | `/saves/photos/:id` | Member | Save a photo |
| DELETE | `/saves/photos/:id` | Member | Unsave a photo |
| GET | `/checkins` | Member | Get check-ins |
| POST | `/checkins/:event_id` | Member | Check in to event |
| DELETE | `/checkins/:event_id` | Member | Remove check-in |
| POST | `/my-status` | Member | Batch fetch save/check-in state |

## Docker (optional)

The `docker-compose.yml` runs only the API container. The DB is external (Neon).

```bash
# Start
docker-compose up -d

# Logs
docker-compose logs -f api

# Stop
docker-compose down

# Rebuild after code changes
docker-compose up -d --build
```

The container maps port `8000` → internal `5000`. Set `PORT=5000` in `.env` when running via Docker.

## Deployment

**Frontend:** Push to GitHub — GitHub Pages serves `docs/` automatically.

**Backend:** Deployed on [Render](https://render.com) as a Docker web service. Set all env vars from the table above in the Render dashboard.

## Production Checklist

- [x] CORS restricted to `dolltrap.github.io` and `localhost`
- [x] Images stored in Supabase Storage (survive deploys)
- [x] Database on Neon (no auto-pause on free tier)
- [x] Photo delete cleans up Supabase Storage file
- [x] Password validation on admin register (min 8 chars)
- [ ] Change default admin passwords from `Admin123!`
- [ ] Strong `JWT_SECRET` in production
- [ ] Add rate limiting to auth endpoints
- [ ] Set up monitoring / logging

## Troubleshooting

**Port 5000 in use (macOS AirPlay):** Use `PORT=5001` in `.env`.

**`ENOTFOUND` on startup:** Neon or Supabase host unreachable — check your `DB_HOST` in `.env`.

**Photo uploads failing:**
- Check `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set
- Verify the `doll-trap` bucket exists in Supabase Storage
- Max file size is 50MB; allowed types: JPEG, PNG, GIF, WebP

**CORS errors in browser:** Make sure you're accessing the admin panel from `localhost` or `dolltrap.github.io`.

---

*Property of Doll Trap. All rights reserved.*
