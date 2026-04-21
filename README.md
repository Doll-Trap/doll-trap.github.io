# Doll Trap — Seattle Underground Idol Group

Fan club website with admin panel for event and photo management.

**Stack:** GitHub Pages (frontend) · Cloudflare Workers + D1 (backend + database) · Supabase Storage (images)

Events and albums share the same `events` table, distinguished by `kind = 'event' | 'album'`. The calendar and home page only show `kind = 'event'`; the gallery and admin can also manage albums.

---

## Project Structure

```
dolltrap.github.io/
├── docs/                     # Frontend (GitHub Pages root)
│   ├── index.html            # Home page
│   ├── members.html          # Members profile page
│   ├── calendar.html         # Event calendar
│   ├── gallery.html          # Photo gallery / albums
│   ├── videos.html           # Videos page
│   ├── event.html            # Event detail page
│   ├── portal.html           # Member portal (login, saved events/photos)
│   ├── admin.html            # Admin panel
│   ├── style.css             # Global styles
│   ├── admin.css             # Admin panel styles
│   └── admin.js              # Admin panel logic
│
└── worker/                   # Cloudflare Worker (API)
    ├── src/
    │   ├── index.ts          # App entry point + CORS
    │   ├── db.ts             # D1 helpers (dbFirst, dbAll, dbRun)
    │   ├── types.ts          # HonoEnv, Bindings, Variables
    │   ├── routes/
    │   │   ├── auth.ts       # Admin authentication
    │   │   ├── events.ts     # Events + albums CRUD + poster upload
    │   │   ├── photos.ts     # Photo upload / update / delete
    │   │   ├── videos.ts     # Video CRUD
    │   │   └── members.ts    # Member accounts, saves, check-ins, messages
    │   └── middleware/
    │       ├── auth.ts       # Admin JWT middleware
    │       └── memberAuth.ts # Member JWT middleware
    ├── schema.sql            # D1 SQLite schema
    ├── wrangler.toml         # Cloudflare Worker config
    └── .dev.vars             # Local secrets (never committed)
```

---

## Local Development

### Prerequisites

- Node.js v18+
- Wrangler CLI: `npm install -g wrangler` (or use `npx wrangler`)
- A Cloudflare account with the Worker already deployed

### 1. Set up local secrets

Copy `.dev.vars.example` to `worker/.dev.vars` and fill in:

```bash
JWT_SECRET=any-local-secret
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

`DATABASE_URL` is no longer needed — the API uses Cloudflare D1.

### 2. Start the Worker locally (with remote D1)

```bash
cd worker && npx wrangler dev --remote
```

The `--remote` flag connects to the real D1 database on Cloudflare so you see live data. Without it, a local empty D1 is used.

Worker runs on **http://localhost:8787**.

### 3. Serve the frontend

In a second terminal:

```bash
cd docs && python3 -m http.server 3000
```

Open **http://localhost:3000/admin.html**. The frontend auto-detects `localhost` and points to `localhost:8787`.

### 4. Test it's running

```bash
curl http://localhost:8787/api/health
# → {"status":"Backend is running"}
```

---

## Cloudflare Secrets (production)

Set once via Wrangler — these are never stored in files:

```bash
cd worker
npx wrangler secret put JWT_SECRET
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

---

## Database

**Cloudflare D1** (SQLite) — bound as `DB` in the Worker.

- Database name: `dolltrap-db`
- Apply schema: `npx wrangler d1 execute dolltrap-db --file=schema.sql --remote`

### Schema summary

| Table | Purpose |
|-------|---------|
| `users` | Admin accounts |
| `events` | Events (`kind='event'`) and photo albums (`kind='album'`) |
| `photos` | Photos linked to events/albums, stored in Supabase Storage |
| `videos` | YouTube/video links |
| `members` | Public member accounts (separate from admins) |
| `member_saved_events` | Events saved by members |
| `member_saved_photos` | Photos saved by members |
| `member_checkins` | Event check-ins |
| `member_messages` | Fan messages per idol |
| `member_cheers` | Anonymous cheer counts per idol |

---

## API Endpoints

Base URL: `https://api.dolltrap.workers.dev/api`

### Admin auth — `/api/auth`
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/login` | — | Admin login → JWT |
| GET | `/verify` | Admin | Verify token |
| POST | `/change-password` | Admin | Change password |

### Events — `/api/events`
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | — | All events and albums |
| GET | `/:id` | — | Single event/album |
| POST | `/` | Admin | Create event or album |
| PUT | `/:id` | Admin | Update event or album |
| DELETE | `/:id` | Admin | Delete event or album |
| POST | `/upload-poster` | Admin | Upload poster to Supabase Storage |

### Photos — `/api/photos`
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | — | All photos |
| GET | `/event/:event_id` | — | Photos for a specific event |
| GET | `/member/:tag` | — | Photos tagged to a member |
| POST | `/` | Admin | Upload photo (auto-compressed to 1500px before upload) |
| PUT | `/:id` | Admin | Update caption / member tag / event link |
| DELETE | `/:id` | Admin | Delete photo + remove from Supabase Storage |

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
| GET | `/verify` | Member | Verify token + get profile |
| PUT | `/profile` | Member | Update display name (also updates all messages, returns new token) |
| POST | `/change-password` | Member | Change password |
| GET/POST/DELETE | `/saves/events/:id` | Member | Save / unsave events |
| GET/POST/DELETE | `/saves/photos/:id` | Member | Save / unsave photos |
| GET/POST/DELETE | `/checkins/:event_id` | Member | Check in / remove check-in |
| POST | `/my-status` | Member | Batch fetch save/check-in/saved-photo state |
| GET/POST | `/messages/:idol_name` | —/Member | Read / post fan messages |
| PUT/DELETE | `/messages/:id` | Member | Edit / delete own message |
| DELETE | `/messages/admin/:id` | Admin | Admin delete any message |
| GET/POST | `/cheers/:idol_name` | — | Get cheer count / toggle cheer |

---

## Deployment

**Frontend:** Push to `main` — GitHub Pages serves `docs/` automatically.

**Backend:** Deploy the Cloudflare Worker:

```bash
cd worker && npx wrangler deploy
```

---

## Production Checklist

- [x] CORS restricted to `dolltrap.github.io` and `localhost`
- [x] Images stored in Supabase Storage (persistent)
- [x] Database on Cloudflare D1 (no cold start)
- [x] Photo/poster uploads auto-compressed to 1500px before storage
- [x] Photo delete cleans up Supabase Storage file
- [x] Member display name change updates JWT + all past messages
- [ ] Change default admin passwords
- [ ] Strong `JWT_SECRET` in production
- [ ] Add rate limiting to auth endpoints

---

## Troubleshooting

**Photos show as broken locally:** Supabase image transform API requires Pro plan. The site falls back to original URLs automatically via `onerror`.

**Upload fails locally (internal error):** Check `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `worker/.dev.vars`, then restart `wrangler dev --remote`.

**Calendar/list empty:** Make sure dates are stored correctly. SQLite uses `YYYY-MM-DD HH:MM:SS` format; the frontend uses `substring(0, 10)` to extract the date key.

**CORS errors in browser:** Access the site from `localhost` or `dolltrap.github.io`, not `file://`.

---

*Property of Doll Trap. All rights reserved.*
