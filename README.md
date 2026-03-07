# 🎀 Doll Trap - Seattle Underground Idol Group

A cosplay idol performance group website with admin panel for event and photo management.

Events and albums now share the same `events` table. Records are distinguished with `kind = 'event' | 'album'` so the calendar/home pages only show real events, while the gallery/admin can also manage albums.

## 📁 Project Structure

```
dolltrap.github.io/
├── docs/                     # Frontend website files (GitHub Pages root)
│   ├── index.html            # Home page
│   ├── members.html          # Members profile page
│   ├── calendar.html         # Event calendar
│   ├── gallery.html          # Photo gallery / albums
│   ├── admin.html            # Admin panel (events, albums, photo uploads)
│   ├── style.css             # Global site styles
│   └── admin.css             # Admin panel styles
│
├── backend/                  # Node.js Express API server
│   ├── server.js            # Main server file
│   ├── package.json         # Dependencies
│   ├── Dockerfile           # Docker image configuration
│   ├── config/
│   │   └── database.js      # PostgreSQL connection & setup / migrations
│   ├── routes/
│   │   ├── auth.js          # Admin authentication
│   │   ├── events.js        # Event + album CRUD operations
│   │   └── photos.js        # Photo upload and update operations
│   ├── middleware/
│   │   └── auth.js          # JWT verification middleware
│   └── uploads/             # Local upload mount path (legacy / optional)
│
├── docker-compose.yml        # Docker Compose configuration (PostgreSQL + API)
├── images/                   # Static images
│   ├── xama/                 # XAMA event photos
│   └── SpFes/                # Spring Festival event photos
│
└── README.md                 # This file
```

## 🚀 Quick Start

### Frontend (GitHub Pages)
The frontend files are in the `docs/` folder. They are static HTML/CSS/JS files served by GitHub Pages.

**To use as GitHub Pages:**
1. Push the repository with `docs/` enabled for GitHub Pages
2. They will be served as a static site at `https://yourusername.github.io`

### Backend Setup (with Docker)

#### Prerequisites
- **Docker** - [Download](https://www.docker.com/products/docker-desktop)
- **Docker Compose** - Included with Docker Desktop

#### Quick Start with Docker

1. **Setup environment variables:**
   ```bash
   cp .env.example .env
   ```

2. **Edit `.env` with your settings (optional):**
   ```
   DB_PASSWORD=your_secure_password_here
   JWT_SECRET=your_super_secret_key_change_this_in_production
   NODE_ENV=development
   ```

3. **Start the entire stack (PostgreSQL + API):**
   ```bash
   docker-compose up -d
   ```

   The backend API runs on `http://localhost:5000`
   The database runs on `localhost:5432`

4. **View logs:**
   ```bash
   docker-compose logs -f api
   ```

5. **Stop the stack:**
   ```bash
   docker-compose down
   ```

#### Create First Admin Account

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "your_password",
    "email": "admin@doll-trap.com"
  }'
```

#### Local Development (without Docker)

If you prefer to run locally without Docker:

1. **Prerequisites:**
   - Node.js (v16+) - [Download](https://nodejs.org/)
   - PostgreSQL (v12+) - [Download](https://www.postgresql.org/download/)

2. **Navigate to backend directory:**
   ```bash
   cd backend
   ```

3. **Install dependencies:**
   ```bash
   npm install
   ```

4. **Setup environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your local database credentials
   ```

5. **Create PostgreSQL database:**
   ```bash
   createdb doll_trap
   ```

6. **Start the server:**
   ```bash
   npm start
   ```
   Server runs on `http://localhost:5000`

   For development with auto-reload:
   ```bash
   npm run dev
   ```

## 🎯 Admin Panel

Access the admin panel at `/admin.html` (when running locally).

**Features:**
- 🔐 Secure login with JWT tokens
- 📅 Create, edit, and delete events
- 🗂️ Create albums stored in the same `events` table
- 📸 Upload photos with drag-and-drop
- 🏷️ Associate photos with events or albums
- 👤 Tag photos by member
- 🗑️ Manage events and photos

## 📡 API Endpoints

### Authentication
- `POST /api/auth/login` - Admin login
- `POST /api/auth/register` - Create admin account

### Events
- `GET /api/events` - Get all events and albums
- `GET /api/events/:id` - Get single event/album
- `POST /api/events` - Create event or album (auth required)
- `PUT /api/events/:id` - Update event or album (auth required)
- `DELETE /api/events/:id` - Delete event or album (auth required)

### Photos
- `GET /api/photos` - Get all photos
- `GET /api/photos/event/:event_id` - Get photos for specific event
- `POST /api/photos` - Upload photo (auth required, multipart/form-data)
- `PUT /api/photos/:id` - Update photo metadata / linked event (auth required)
- `DELETE /api/photos/:id` - Delete photo (auth required)

## 🗄️ Database Schema

### Users Table
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  email VARCHAR(100) UNIQUE,
  role VARCHAR(50) DEFAULT 'admin',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```

### Events Table
```sql
CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
   date TIMESTAMP,
  location VARCHAR(255),
  image_url VARCHAR(255),
   event_category VARCHAR(100),
   kind VARCHAR(20) NOT NULL DEFAULT 'event',
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```

- `kind = 'event'` records appear on the home page and calendar
- `kind = 'album'` records are hidden from calendar/home and used by the gallery/admin

### Photos Table
```sql
CREATE TABLE photos (
  id SERIAL PRIMARY KEY,
  event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
  photo_url VARCHAR(255) NOT NULL,
  caption TEXT,
   member_tag VARCHAR(100),
  uploaded_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```

### Future: Game Features (Pre-built tables)
```sql
CREATE TABLE game_users (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  points INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)

CREATE TABLE inventory (
  id SERIAL PRIMARY KEY,
  game_user_id INTEGER REFERENCES game_users(id),
  item_id VARCHAR(100),
  quantity INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```

## 🔧 Configuration

### Database Connection
Edit `backend/config/database.js` to customize database setup.

### Upload Settings
Edit `backend/routes/photos.js` to modify:
- File size limits (default: 50MB)
- Allowed file types (JPEG, PNG, GIF, WebP)
- Supabase Storage upload behavior

For all new uploads, the backend writes the file to Supabase Storage first and then stores the returned public URL in the `photos` table. This means new images do not depend on the Render instance staying awake or keeping a local `uploads/` folder.

Required env vars for reliable new uploads:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

`SUPABASE_KEY` can still be used as a fallback, but `SUPABASE_SERVICE_ROLE_KEY` is recommended for server-side uploads.

### Legacy Photo Migration
If old records still point to `/uploads/...`, migrate them to Supabase Storage so they survive deploys and restarts:

```bash
cd backend
npm run migrate:legacy-photos
```

To preview what would be migrated without changing anything:

```bash
cd backend
node scripts/migrate-legacy-photos.js --dry-run
```

### CORS Settings
Edit `backend/server.js` to configure CORS for different domains in production.

## 📚 Future Expansion

The backend structure is designed for easy expansion:

**Ready for addition:**
- User profiles & authentication
- Points/levels system
- In-app purchases (buying items/upgrades)
- Inventory management
- Leaderboards
- Social features (comments, likes)

All necessary database tables for game features are pre-created.

## 🚢 Deployment

### Frontend (GitHub Pages)
- Push the repository with `docs/` configured as the Pages source
- No additional setup needed

### Backend Deployment (Docker)

**Deploy to Cloud Services:**

Since the backend is containerized with Docker, you can easily deploy to:

**Railway.app (Recommended - Free tier available):**
1. Push code to GitHub
2. Connect repository to Railway
3. Add PostgreSQL addon
4. Set environment variables from `.env.example`
5. Deploy automatically

**Render.com (Free tier available):**
1. Push code to GitHub
2. Create new Web Service
3. Connect GitHub repository
4. Add PostgreSQL service
5. Set environment variables
6. Deploy

**AWS ECS/EC2:**
```bash
# Build and push to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <your-ecr-uri>
docker build -t doll-trap-backend .
docker tag doll-trap-backend:latest <your-ecr-uri>/doll-trap-backend:latest
docker push <your-ecr-uri>/doll-trap-backend:latest
```

**Docker Swarm or Kubernetes:**
```bash
# Using Docker Swarm
docker stack deploy -c docker-compose.yml doll-trap

# Using Kubernetes
kubectl apply -f k8s-manifest.yaml
```

**Local Docker Deployment:**
```bash
# Build image
docker build -t doll-trap-backend ./backend

# Run with external PostgreSQL
docker run -p 5000:5000 \
  -e DB_HOST=your-db-host \
  -e DB_PASSWORD=your-password \
  -e JWT_SECRET=your-secret \
  doll-trap-backend
```

## 🔐 Production Checklist

- [ ] Change `JWT_SECRET` to a strong random string
- [ ] Set `NODE_ENV=production`
- [ ] Configure CORS for production domain
- [ ] Setup HTTPS/SSL certificate
- [ ] Configure database backups
- [x] Use cloud storage for uploads (Supabase Storage)
- [ ] Setup monitoring and logging
- [ ] Add rate limiting
- [ ] Implement input validation

## 🐛 Troubleshooting

### Docker Issues

**Docker containers won't start:**
```bash
# Check Docker status
docker ps -a
docker logs doll-trap-api
docker logs doll-trap-db

# Restart everything
docker-compose down
docker-compose up -d
```

**Port already in use:**
```bash
# Kill process using port 5000
lsof -i :5000
kill -9 <PID>

# Or use different port in .env
# Change PORT=5000 to PORT=3000
docker-compose down
docker-compose up -d
```

**Database connection failed:**
```bash
# Ensure postgres is running and healthy
docker-compose ps

# Check database logs
docker logs doll-trap-db

# Verify .env settings match docker-compose.yml
cat .env
```

**Rebuild image after code changes:**
```bash
docker-compose down
docker-compose up -d --build
```

### Local Development Issues

### Cannot connect to PostgreSQL
```bash
# Check if PostgreSQL is running
brew services list  # macOS
psql -U postgres   # Test connection
```

### Port 5000 already in use
```bash
# Find and kill process using port 5000
lsof -i :5000
kill -9 <PID>
```

### CORS errors in admin panel
- Ensure backend is running on http://localhost:5000
- Check CORS configuration in server.js
- Browser must be on same origin or CORS must be enabled

### File uploads failing
- Check Supabase environment variables are set correctly
- Verify the `doll-trap` storage bucket exists
- Verify file size is under 50MB limit
- Check file type is allowed (JPEG, PNG, GIF, WebP)

## 📝 License

This project is property of Doll Trap. All rights reserved.

## 👥 Contact

For questions or feature requests, contact the admin panel.

---

**Made with 💗 for Doll Trap**