# Fluxstack Library

A modern AI tools directory with a real backend, moderation queue, upvotes, and AI-style guided discovery.

## Stack (Current)
- Frontend: Vanilla HTML/CSS/JS
- Backend: Node.js HTTP server (`server.js`)
- Persistence: JSON datastore (`data/db.json`)
- Auth (admin moderation): token via `x-admin-token`

## Features
- Visual card-based tool browsing
- Query + category filter with keyword-aware ranking
- AI Guide endpoint for use-case recommendations
- Upvotes persisted on server
- Public submission flow
- Admin moderation queue (approve/reject)

## Run
```bash
npm start
```
Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

### Dev mode
```bash
npm run dev
```

## Environment
- `PORT` (default `3000`)
- `HOST` (default `127.0.0.1`)
- `ADMIN_TOKEN` (default `change-me`)

Example:
```bash
ADMIN_TOKEN="my-secret-token" npm start
```

Use that token in the UI when opening **Admin Queue**.

## API Overview
- `GET /api/health`
- `GET /api/tools?query=&category=&limit=`
- `POST /api/tools/:id/vote`
- `GET /api/assistant?q=`
- `POST /api/submissions`
- `GET /api/submissions` (admin)
- `POST /api/submissions/:id/approve` (admin)
- `POST /api/submissions/:id/reject` (admin)

## Next production upgrades
1. Move data from JSON to Postgres.
2. Replace token auth with real admin/user auth and sessions.
3. Add embeddings-based semantic search and RAG assistant.
4. Add user accounts, private stacks, follows, and notifications.
