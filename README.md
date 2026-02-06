# Fluxstack Library

Fluxstack is a visual AI tools directory with moderated submissions, upvotes, smart filtering, and AI-style recommendations.

## Production Stack (Vercel)
- Frontend: Static `index.html` + `styles.css` + `app.js`
- API: Vercel Serverless Function at `api/[...route].js`
- Database: Postgres via `DATABASE_URL`
- Admin auth: `ADMIN_TOKEN` header check (`x-admin-token`)

## Project Structure
- `index.html`, `styles.css`, `app.js`: UI
- `api/[...route].js`: API endpoints
- `lib/db.js`: Postgres pool wrapper
- `sql/001_init.sql`: schema + seed data
- `vercel.json`: routing and function runtime config

## API Endpoints
- `GET /api/health`
- `GET /api/tools?query=&category=&limit=`
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
3. Create a Postgres database (Vercel Postgres, Neon, Supabase, or Railway Postgres).
4. Run `sql/001_init.sql` against that database.
5. Deploy.

## Local Development
- Install deps: `npm install`
- Run with Vercel locally: `npm run dev`
- Set env vars in `.env.local`:
  - `DATABASE_URL=...`
  - `ADMIN_TOKEN=...`

## Notes
- `data/db.json` and `server.js` were removed from runtime path.
- Persistence is now database-backed and Vercel-compatible.
