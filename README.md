# Fluxstack Library

Fluxstack is a visual AI tools directory with moderated submissions, upvotes, smart filtering, and AI-style recommendations.

## Production Stack (Vercel)
- Frontend: Static `index.html` + `styles.css` + `app.js`
- API: Vercel Serverless Function at `api/[...route].js`
- Database: Postgres via `DATABASE_URL`
- Admin auth: `ADMIN_TOKEN` header check (`x-admin-token`)

## Key Features
- Visual tool cards with thumbnail support
- Optional demo video URL per tool
- Click-to-expand tool detail modal with media preview
- Public submission flow + admin moderation queue
- Admin direct publish form
- Semi-automatic metadata enrichment (`og:image`, `og:video`, title, description)

## Project Structure
- `index.html`, `styles.css`, `app.js`: UI
- `api/[...route].js`: API endpoints
- `lib/db.js`: Postgres pool wrapper
- `sql/001_init.sql`: base schema + seed data
- `sql/002_media_columns.sql`: migration for media fields on existing DBs
- `vercel.json`: routing config

## API Endpoints
- `GET /api/health`
- `GET /api/tools?query=&category=&limit=`
- `POST /api/tools` (admin direct publish)
- `POST /api/tools/enrich` (metadata suggestion from URL)
- `POST /api/tools/:id/vote`
- `GET /api/assistant?q=`
- `POST /api/submissions`
- `GET /api/submissions` (admin)
- `POST /api/submissions/:id/approve` (admin)
- `POST /api/submissions/:id/reject` (admin)

## Deploy on Vercel
1. Import the GitHub repo in Vercel.
2. Add environment variables:
   - `DATABASE_URL`
   - `ADMIN_TOKEN`
3. Create a Postgres database (Neon/Supabase/Railway/etc.).
4. For a fresh DB, run `sql/001_init.sql`.
5. For an existing DB already initialized before media fields, run `sql/002_media_columns.sql`.
6. Deploy/redeploy.

## Local Development
- Install deps: `npm install`
- Run with Vercel locally: `npm run dev`
- Set env vars in `.env.local`:
  - `DATABASE_URL=...`
  - `ADMIN_TOKEN=...`

## Notes
- API does schema safety checks (`add column if not exists`) at runtime to reduce migration breaks.
- Metadata enrichment is intentionally semi-automatic: it suggests media, then admin reviews before publishing.
